import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import admin from "firebase-admin";
import fs from "fs";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Firebase init adaptatif (Local & Render)
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Sur Render : lecture depuis la variable d'environnement sécurisée
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // En local : lecture du fichier physique local
    serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------- UTILS ----------------
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Générateur de code numérique sécurisé à 6 chiffres
 */
function generateSecureCode(length = 6) {
    let code = "";
    while (code.length < length) {
        const byte = crypto.randomBytes(1)[0];
        if (byte < 250) {
            code += (byte % 10).toString();
        }
    }
    return code;
}

// ---------------- AUTOMATION LOGIC ----------------
async function findAndAssignLivreur(orderId, orderData) {
    console.log(`🤖 Recherche auto pour la commande : ${orderId}`);
    
    // 1. Chercher les livreurs en ligne et DISPONIBLES
    const snap = await db.collectionGroup("profile")
        .where("isAvailable", "==", true)
        .where("lastSeen", ">", new Date(Date.now() - 1000 * 60 * 5)) // Vu il y a moins de 5 min
        .get();

    let candidates = [];
    snap.forEach(doc => {
        const data = doc.data();
        const uid = doc.ref.parent.parent.id;
        if (data.currentPos) {
            const dist = getDistance(orderData.lat, orderData.lng, data.currentPos[0], data.currentPos[1]);
            candidates.push({ id: uid, ...data, dist });
        }
    });

    // 2. Trier par proximité
    candidates.sort((a, b) => a.dist - b.dist);

    if (candidates.length > 0) {
        const bestLivreur = candidates[0];
        console.log(`🎯 Proposé au livreur : ${bestLivreur.id} (${bestLivreur.dist.toFixed(2)} km)`);

        // 3. Update Firestore
        await db.collection("livraisons").doc(orderId).update({
            assignedLivreurId: bestLivreur.id,
            status: "pending"
        });

        // 4. Envoyer via Socket
        io.to(bestLivreur.id).emit("newOrder", { ...orderData, id: orderId });
    } else {
        console.log("⚠️ Aucun livreur dispo. Nouvelle tentative dans 10s...");
        setTimeout(() => findAndAssignLivreur(orderId, orderData), 10000);
    }
}

// ---------------- SOCKET ----------------
io.on("connection", (socket) => {
    socket.on("join", (room) => socket.join(room));

    socket.on("livreurMove", (data) => {
        io.to("admin_room").emit("livreurPosition", data);
        io.to(`track_${data.orderId}`).emit("livreurPosition", data);
    });

    // Quand le livreur accepte, on verrouille
    socket.on("orderAccepted", async ({ orderId, livreurId }) => {
        await db.collection("livraisons").doc(orderId).update({ status: "accepted" });
        io.to(`track_${orderId}`).emit("orderStatus", "accepted");
    });
});

// ---------------- API RECEIVE ORDER ----------------
app.post("/api/orders", async (req, res) => {
    const orderData = req.body;
    const orderRef = await db.collection("livraisons").add({
        ...orderData,
        status: "searching",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Lancer l'algorithme d'assignation automatique
    findAndAssignLivreur(orderRef.id, orderData);
    
    res.json({ success: true, orderId: orderRef.id });
});

// ═══════════════════════════════════════════════════════════════════
// NOUVEAU : SYSTÈME DE QR CODE / CODES UNIQUES & HANDOFF SÉCURISÉ
// ═══════════════════════════════════════════════════════════════════

/**
 * Middleware optionnel de validation du token utilisateur Firebase Auth.
 * Permet de s'assurer que seuls les utilisateurs authentifiés accèdent aux APIs sensibles.
 */
async function authenticateFirebaseUser(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Authentification requise." });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(403).json({ error: "Token d'authentification invalide ou expiré." });
    }
}

/**
 * Initialise les codes de validation uniques (Pickup & Delivery)
 * Cette route est à appeler lors de la création d'une course ou lors de l'attribution d'un livreur.
 */
app.post("/api/courses/initialize-verification-codes", authenticateFirebaseUser, async (req, res) => {
    const { courseId } = req.body;
    if (!courseId) {
        return res.status(400).json({ error: "courseId requis." });
    }

    try {
        const courseRef = db.collection("livraisons").doc(courseId);
        const courseSnap = await courseRef.get();

        if (!courseSnap.exists) {
            return res.status(404).json({ error: "Livraison introuvable." });
        }

        const pickupCode = generateSecureCode(6);
        const deliveryCode = generateSecureCode(6);

        await courseRef.update({
            pickupCode: pickupCode,
            deliveryCode: deliveryCode,
            verificationInitialized: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, pickupCode, deliveryCode });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * CAS SUPERMARCHÉ : Passation physique (Handoff) Coursier ➔ Livreur
 * Le Livreur scanne le code détenu par le Coursier pour récupérer la livraison.
 * Bloqué si le paiement du supermarché n'a pas été validé au préalable par le webhook WhatsApp.
 */
app.post("/api/courses/validate-coursier-handoff", authenticateFirebaseUser, async (req, res) => {
    const { courseId, enteredCode } = req.body;
    if (!courseId || !enteredCode) {
        return res.status(400).json({ error: "courseId et code requis." });
    }

    const courseRef = db.collection("livraisons").doc(courseId);

    try {
        await db.runTransaction(async (tx) => {
            const courseSnap = await tx.get(courseRef);
            if (!courseSnap.exists) throw new Error("NOT_FOUND");

            const course = courseSnap.data();

            // 1. S'assurer que le livreur authentifié est bien celui assigné à la livraison
            if (course.assignedLivreurId !== req.user.uid && course.livreurId !== req.user.uid) {
                throw new Error("UNAUTHORIZED_LIVREUR");
            }

            // 2. Vérification que le paiement Wave direct au supermarché a bien été vérifié par l'IA
            // (Le champ 'supermarchePaymentVerified' est mis à true par ton webhook WhatsApp)
            if (!course.supermarchePaymentVerified) {
                throw new Error("WAITING_FOR_SUPERMARCHE_PAYMENT");
            }

            // 3. Validation du code de passation (pickupCode)
            if (course.pickupCode !== enteredCode) {
                throw new Error("INVALID_PICKUP_CODE");
            }

            // Validation de la passation physique et départ en transit
            tx.update(courseRef, {
                status: "in_transit",
                handoffValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // Notification Socket pour actualiser en temps réel les écrans de suivi
        io.to(`track_${courseId}`).emit("orderStatus", "in_transit");

        return res.status(200).json({ success: true, message: "Passation validée. Colis en transit." });

    } catch (error) {
        if (error.message === "NOT_FOUND") return res.status(404).json({ error: "Livraison introuvable." });
        if (error.message === "UNAUTHORIZED_LIVREUR") return res.status(403).json({ error: "Accès refusé. Vous n'êtes pas assigné à cette course." });
        if (error.message === "WAITING_FOR_SUPERMARCHE_PAYMENT") {
            return res.status(400).json({ error: "Le paiement Wave du supermarché n'a pas encore été validé par le reçu complet sur WhatsApp." });
        }
        if (error.message === "INVALID_PICKUP_CODE") return res.status(400).json({ error: "Code de passation incorrect." });
        return res.status(500).json({ error: error.message });
    }
});

/**
 * LIVRAISON FINALE : Validation finale Client ➔ Livreur
 * Le livreur saisit le code de livraison donné par le client pour marquer la course comme livrée.
 */
app.post("/api/courses/validate-delivery", authenticateFirebaseUser, async (req, res) => {
    const { courseId, enteredCode } = req.body;
    if (!courseId || !enteredCode) {
        return res.status(400).json({ error: "courseId et code requis." });
    }

    const courseRef = db.collection("livraisons").doc(courseId);

    try {
        await db.runTransaction(async (tx) => {
            const courseSnap = await tx.get(courseRef);
            if (!courseSnap.exists) throw new Error("NOT_FOUND");

            const course = courseSnap.data();

            if (course.assignedLivreurId !== req.user.uid && course.livreurId !== req.user.uid) {
                throw new Error("UNAUTHORIZED_LIVREUR");
            }

            if (course.deliveryCode !== enteredCode) {
                throw new Error("INVALID_DELIVERY_CODE");
            }

            // Clôture définitive de la course
            tx.update(courseRef, {
                status: "delivered",
                deliveryValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        io.to(`track_${courseId}`).emit("orderStatus", "delivered");

        return res.status(200).json({ success: true, message: "Livraison finalisée avec succès." });

    } catch (error) {
        if (error.message === "NOT_FOUND") return res.status(404).json({ error: "Livraison introuvable." });
        if (error.message === "UNAUTHORIZED_LIVREUR") return res.status(403).json({ error: "Vous n'êtes pas le livreur assigné à cette livraison." });
        if (error.message === "INVALID_DELIVERY_CODE") return res.status(400).json({ error: "Le code de livraison client est invalide." });
        return res.status(500).json({ error: error.message });
    }
});

server.listen(5000, () => console.log("🚀 Serveur Auto-Assign démarré"));