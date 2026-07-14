const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const crypto = require("crypto");

admin.initializeApp();

const geminiKey = defineSecret("GEMINI_API_KEY");
const waToken = defineSecret("WHATSAPP_TOKEN");
// Secret d'app Meta/WhatsApp — nécessaire pour vérifier que les POST du
// webhook viennent vraiment de Meta et pas d'un tiers qui a deviné l'URL.
const metaAppSecret = defineSecret("META_APP_SECRET");

const ADMIN_MERCHANT_NAME = "Paiement LEGACY";

// ═══════════════════════════════════════════════════════════════════
// VÉRIFICATION GEMINI (partagée par le webhook et les fonctions callable)
// ═══════════════════════════════════════════════════════════════════
async function callGeminiVerification({ apiKey, base64Image, merchantAttendu, montantAttendu }) {
  const now = new Date();
  const h12 = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Abidjan" });
  const todayDate = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Africa/Abidjan" });

  const amountLine = montantAttendu
    ? `Montant attendu : ${montantAttendu}F (exact)`
    : "Montant : accepte toute valeur positive raisonnable (pas de montant fixe attendu)";

  const prompt = `Tu es un expert en vérification de reçus de paiement Wave Côte d'Ivoire.
Analyse l'image (écran de confirmation ou reçu détaillé) et réponds UNIQUEMENT avec un JSON.

INFOS DE RÉFÉRENCE :
- Marchand attendu : ${merchantAttendu}
- ${amountLine}
- Date du jour : ${todayDate}
- Heure actuelle : ${h12}

INSTRUCTIONS :
1. REJETTE strictement si c'est une liste d'historique (vue Bleue) plutôt qu'un reçu individuel.
2. Vérifie que le marchand correspond à "${merchantAttendu}".
3. ${montantAttendu ? `Vérifie que le montant est exactement ${montantAttendu}F.` : "Extrais le montant réel, sans contrainte de valeur fixe."}
4. Vérifie que le statut est "Effectué"/confirmé.
5. Vérifie que la date est celle d'aujourd'hui (${todayDate}).
6. Récupère l'ID de transaction (commence généralement par "T_").

Réponds EXCLUSIVEMENT avec ce JSON :
{
  "isValid": boolean,
  "transactionId": "string",
  "detectedAmount": number,
  "checklist": {
    "isWaveReceipt": boolean,
    "isMerchantCorrect": boolean,
    "isAmountCorrect": boolean,
    "isDateRecent": boolean,
    "isStatusCompleted": boolean
  }
}`;

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent({
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.0 },
  });

  const parsed = JSON.parse(result.response.text());
  if (!parsed.transactionId || typeof parsed.transactionId !== "string") {
    throw new Error("Réponse IA invalide : transactionId manquant.");
  }
  // On normalise l'ID pour que la déduplication (utilisée comme ID de
  // document) soit stable même si l'IA renvoie des espaces parasites.
  parsed.transactionId = parsed.transactionId.replace(/\s+/g, "");
  return parsed;
}

// ═══════════════════════════════════════════════════════════════════
// ANTI-DOUBLON + CRÉDIT ATOMIQUES
// Le transactionId sert d'ID de document : deux écritures concurrentes
// pour le même reçu se disputent le MÊME document, donc Firestore les
// sérialise et la deuxième échoue proprement — plus de race condition
// entre "vérifier que ça n'existe pas" et "créer le document".
// ═══════════════════════════════════════════════════════════════════
class DuplicateTransactionError extends Error {
  constructor() {
    super("DUPLICATE_TRANSACTION");
    this.code = "DUPLICATE_TRANSACTION";
  }
}

async function creditSoldeLivreurAtomique(db, { userId, amount, transactionId, userName }) {
  const payRef = db.collection("paiements_verifies").doc(transactionId);
  const userRef = db.collection("users").doc(userId);

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (paySnap.exists) throw new DuplicateTransactionError();

    tx.set(payRef, {
      userId,
      userName: userName || "Livreur",
      merchantName: ADMIN_MERCHANT_NAME,
      montant: amount,
      transactionId,
      source: "whatsapp_webhook",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(userRef, {
      solde: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function validerPaiementCourseAtomique(db, { courseRef, vendeurId, livreurId, marchandAttendu, montant, transactionId }) {
  const payRef = db.collection("paiements_vendeur_verifies").doc(transactionId);

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (paySnap.exists) throw new DuplicateTransactionError();

    tx.set(payRef, {
      courseId: courseRef.id,
      vendeurId,
      livreurId: livreurId || null,
      merchantName: marchandAttendu,
      montant,
      transactionId,
      source: "whatsapp_webhook",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(courseRef, {
      vendeurPaymentVerified: true,
      vendeurPaymentAmount: montant,
      vendeurPaymentTxId: transactionId,
      vendeurPaymentVerifiedVia: "whatsapp_webhook",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// VÉRIFICATION DE SIGNATURE WHATSAPP/META
// Sans ça, n'importe qui connaissant l'URL du webhook peut poster un
// faux payload et déclencher un crédit de compte ou une validation de
// paiement. Meta signe chaque requête avec le secret de l'app.
// ═══════════════════════════════════════════════════════════════════
function isValidMetaSignature(req, appSecret) {
  const signatureHeader = req.get("x-hub-signature-256");
  if (!signatureHeader || !req.rawBody) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK WHATSAPP — corrigé
// ═══════════════════════════════════════════════════════════════════
exports.whatsappWebhook = onRequest(
  { region: "us-central1", timeoutSeconds: 300, secrets: [geminiKey, waToken, metaAppSecret] },
  async (req, res) => {
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      if (mode === "subscribe" && token === "LIVRAISON_MOTO_SECRET_2026") {
        return res.status(200).send(challenge);
      }
      return res.status(403).send("Forbidden");
    }

    if (req.method !== "POST") return res.sendStatus(405);

    // Bloque tout POST qui n'est pas signé par Meta avant de toucher
    // à quoi que ce soit (Firestore, crédit, etc.).
    if (!isValidMetaSignature(req, metaAppSecret.value())) {
      console.warn("⚠️ Signature webhook invalide — requête rejetée.");
      return res.sendStatus(401);
    }

    try {
      const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (message?.type !== "image") return res.sendStatus(200);

      const db = admin.firestore();
      const from = message.from;
      const fromLocal = from.replace(/^225/, ""); // à ajuster si le préfixe stocké diffère
      const WHATSAPP_TOKEN = waToken.value();

      const mediaResponse = await axios.get(`https://graph.facebook.com/v18.0/${message.image.id}`, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      });
      const imageRes = await axios.get(mediaResponse.data.url, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        responseType: "arraybuffer",
      });
      const base64Image = Buffer.from(imageRes.data).toString("base64");
      const apiKey = geminiKey.value();

      // ── ÉTAPE 1 : QUI ENVOIE ? ──
      const senderSnap = await db.collection("users").where("telephone", "==", fromLocal).limit(1).get();
      const senderData = senderSnap.empty ? null : senderSnap.docs[0].data();
      const senderId = senderSnap.empty ? null : senderSnap.docs[0].id;
      const isLivreur = senderData && ["livreur", "livreur-externe"].includes(senderData.role);

      // ══════════════════════════════════════════
      // BRANCHE A : RECHARGE LIVREUR
      // ══════════════════════════════════════════
      if (isLivreur) {
        const dataIA = await callGeminiVerification({
          apiKey, base64Image,
          merchantAttendu: ADMIN_MERCHANT_NAME,
          montantAttendu: null,
        });

        if (!dataIA.isValid || !dataIA.checklist.isDateRecent) {
          await db.collection("notifications_queue").add({
            toUserId: senderId,
            title: "⚠️ Reçu de recharge rejeté",
            body: !dataIA.checklist.isMerchantCorrect
              ? "Le reçu n'est pas adressé au bon marchand."
              : !dataIA.checklist.isDateRecent
              ? "Ce reçu est trop ancien."
              : "Reçu illisible ou invalide.",
            data: { type: "RECHARGE_REJECTED" },
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return res.status(200).send("Recharge rejetée");
        }

        const montantCredite = Number(dataIA.detectedAmount || 0);

        try {
          await creditSoldeLivreurAtomique(db, {
            userId: senderId,
            amount: montantCredite,
            transactionId: dataIA.transactionId,
            userName: senderData.prenom || senderData.nom || "Livreur",
          });
        } catch (e) {
          if (e.code === "DUPLICATE_TRANSACTION") {
            await db.collection("notifications_queue").add({
              toUserId: senderId,
              title: "⚠️ Reçu déjà utilisé",
              body: "Ce reçu Wave a déjà servi pour une précédente recharge.",
              data: { type: "RECHARGE_REJECTED" },
              status: "pending",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return res.status(200).send("Doublon recharge");
          }
          throw e;
        }

        await db.collection("notifications_queue").add({
          toUserId: senderId,
          title: "💰 Recharge validée",
          body: `Votre solde a été crédité de ${montantCredite} F.`,
          data: { type: "RECHARGE_SUCCESS" },
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.status(200).send("Recharge livreur traitée");
      }

      // ══════════════════════════════════════════
      // BRANCHE B : PAIEMENT CLIENT → VENDEUR (course tiers)
      // ══════════════════════════════════════════
      const courseSnap = await db.collection("courses")
        .where("clientPhone", "==", fromLocal)
        .where("status", "==", "in_transit")
        .where("vendeurId", "!=", null)
        .limit(1).get();

      if (courseSnap.empty) {
        return res.status(200).send("Aucune recharge ni course en attente pour ce numéro");
      }

      const courseDoc = courseSnap.docs[0];
      const courseData = courseDoc.data();
      const montantAttendu = Number(courseData.montantArticles || 0);
      const vendeurId = courseData.vendeurId;
      const livreurId = courseData.assignedLivreurId || courseData.livreurId;

      if (!montantAttendu || !vendeurId) {
        return res.status(200).send("Course incomplète (montant ou vendeur manquant)");
      }

      const vendeurSnap = await db.collection("users").doc(vendeurId).get();
      const vendeurData = vendeurSnap.exists ? vendeurSnap.data() : {};
      const marchandAttendu = vendeurData.nomComplet || vendeurData.nomBoutique || "le vendeur";

      const dataIA = await callGeminiVerification({
        apiKey, base64Image,
        merchantAttendu: marchandAttendu,
        montantAttendu,
      });

      if (dataIA.isValid && dataIA.checklist.isAmountCorrect && dataIA.checklist.isDateRecent) {
        try {
          await validerPaiementCourseAtomique(db, {
            courseRef: courseDoc.ref,
            vendeurId,
            livreurId,
            marchandAttendu,
            montant: montantAttendu,
            transactionId: dataIA.transactionId,
          });
        } catch (e) {
          if (e.code === "DUPLICATE_TRANSACTION") {
            return res.status(200).send("Transaction déjà utilisée");
          }
          throw e;
        }

        if (livreurId) {
          await db.collection("notifications_queue").add({
            toUserId: livreurId,
            title: "💰 Paiement Validé",
            body: `Le client a réglé ${montantAttendu}F à ${marchandAttendu}. Vous pouvez remettre le colis.`,
            data: { courseId: courseDoc.id, type: "PAYMENT_SUCCESS" },
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } else {
        const motifs = [];
        if (!dataIA.checklist.isMerchantCorrect) motifs.push("Marchand incorrect.");
        if (!dataIA.checklist.isAmountCorrect) motifs.push(`Montant incorrect (attendu ${montantAttendu}F).`);
        if (!dataIA.checklist.isDateRecent) motifs.push("Reçu trop ancien.");
        if (!dataIA.checklist.isStatusCompleted) motifs.push("Transaction non confirmée.");
        const errorMsg = motifs.length ? motifs.join(" ") : "Reçu illisible.";

        if (livreurId) {
          await db.collection("notifications_queue").add({
            toUserId: livreurId,
            title: "⚠️ Reçu Rejeté",
            body: `Course #${courseDoc.id.slice(-6)} : ${errorMsg}`,
            data: { courseId: courseDoc.id, type: "PAYMENT_REJECTED" },
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        await courseDoc.ref.update({
          vendeurPaymentVerificationFailed: true,
          vendeurPaymentFailReason: errorMsg,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("❌ Erreur critique Webhook WhatsApp:", error);
      res.sendStatus(500);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// NOUVEAU : callable pour le paiement panier client (CartPage.jsx)
// Remplace l'appel Gemini fait depuis le navigateur. Le montant attendu
// est relu depuis la commande côté serveur — jamais depuis le client.
// ═══════════════════════════════════════════════════════════════════
exports.verifyWaveReceipt = onCall({ secrets: [geminiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connexion requise.");
  const uid = request.auth.uid;
  const { orderId, base64Image, imageUrl } = request.data || {};
  if (!orderId || !base64Image) {
    throw new HttpsError("invalid-argument", "orderId et image requis.");
  }

  const db = admin.firestore();
  const orderRef = db.collection("orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError("not-found", "Commande introuvable.");

  const order = orderSnap.data();
  if (order.userId !== uid) throw new HttpsError("permission-denied", "Cette commande ne vous appartient pas.");
  if (order.status === "paye_ia_valide") throw new HttpsError("failed-precondition", "Commande déjà payée.");

  const montantAttendu = Number(order.amount || 0);
  if (!montantAttendu) throw new HttpsError("failed-precondition", "Montant de commande invalide.");

  const dataIA = await callGeminiVerification({
    apiKey: geminiKey.value(),
    base64Image,
    merchantAttendu: ADMIN_MERCHANT_NAME,
    montantAttendu,
  });

  if (!dataIA.isValid || !dataIA.checklist.isAmountCorrect || !dataIA.checklist.isDateRecent) {
    const motifs = [];
    if (!dataIA.checklist.isMerchantCorrect) motifs.push("Reçu non adressé au bon marchand.");
    if (!dataIA.checklist.isAmountCorrect) motifs.push(`Montant incorrect (attendu ${montantAttendu}F).`);
    if (!dataIA.checklist.isDateRecent) motifs.push("Reçu trop ancien.");
    throw new HttpsError("failed-precondition", motifs.join(" ") || "Reçu invalide ou illisible.");
  }

  const payRef = db.collection("paiements_verifies").doc(dataIA.transactionId);

  try {
    await db.runTransaction(async (tx) => {
      const paySnap = await tx.get(payRef);
      if (paySnap.exists) throw new DuplicateTransactionError();

      tx.set(payRef, {
        userId: uid,
        userName: order.clientName || "Client",
        merchantName: ADMIN_MERCHANT_NAME,
        montant: montantAttendu,
        transactionId: dataIA.transactionId,
        imageUrl: imageUrl || null,
        source: "app_checkout",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(orderRef, {
        status: "paye_ia_valide",
        transactionId: dataIA.transactionId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    if (e.code === "DUPLICATE_TRANSACTION") {
      throw new HttpsError("already-exists", "Ce reçu Wave a déjà été utilisé.");
    }
    throw e;
  }

  // Notifications vendeurs — déplacées côté serveur, déclenchées
  // uniquement après confirmation réelle du paiement.
  const vendorMap = {};
  for (const item of order.items || []) {
    if (!item.vendorId) continue;
    if (!vendorMap[item.vendorId]) vendorMap[item.vendorId] = [];
    vendorMap[item.vendorId].push(item);
  }
  await Promise.all(Object.entries(vendorMap).map(([vendorId, items]) => {
    const listText = items.map((i) => `• ${i.nom} x${i.quantity}`).join("\n");
    return db.collection("notifications_queue").add({
      toUserId: vendorId,
      title: "🛒 Nouvelle commande !",
      body: `Commande #${order.orderId} — ${montantAttendu}F\n${listText}`,
      data: { orderId, type: "NEW_ORDER" },
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }));

  return { success: true, transactionId: dataIA.transactionId, amount: montantAttendu };
});

// ═══════════════════════════════════════════════════════════════════
// NOUVEAU : callable pour les recharges depuis l'app (useWaveScan.js)
// Couvre solde / jetons / pass. Remplace l'appel Gemini + le crédit
// faits directement depuis le navigateur.
// ═══════════════════════════════════════════════════════════════════
exports.verifyWaveTopUp = onCall({ secrets: [geminiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connexion requise.");
  const uid = request.auth.uid;
  const { base64Image, mode, allowedAmounts, imageUrl } = request.data || {};
  if (!base64Image) throw new HttpsError("invalid-argument", "Image requise.");

  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "Profil introuvable.");
  const userData = userSnap.data();

  const montantUnique = Array.isArray(allowedAmounts) && allowedAmounts.length === 1 ? allowedAmounts[0] : null;

  const dataIA = await callGeminiVerification({
    apiKey: geminiKey.value(),
    base64Image,
    merchantAttendu: ADMIN_MERCHANT_NAME,
    montantAttendu: montantUnique,
  });

  if (!dataIA.isValid || !dataIA.checklist.isDateRecent) {
    throw new HttpsError("failed-precondition", "Reçu invalide, illisible ou trop ancien.");
  }

  const detectedAmount = Number(dataIA.detectedAmount || 0);
  if (Array.isArray(allowedAmounts) && allowedAmounts.length && !allowedAmounts.includes(detectedAmount)) {
    throw new HttpsError("failed-precondition", "Montant non autorisé pour cette opération.");
  }

  const resolvedMode = !mode || mode === "auto"
    ? (userData.role === "livreur" ? "jetons" : "solde")
    : mode;

  const payRef = db.collection("paiements_verifies").doc(dataIA.transactionId);

  try {
    await db.runTransaction(async (tx) => {
      const paySnap = await tx.get(payRef);
      if (paySnap.exists) throw new DuplicateTransactionError();

      tx.set(payRef, {
        userId: uid,
        userName: userData.nomComplet || userData.nom || "Utilisateur",
        merchantName: ADMIN_MERCHANT_NAME,
        montant: detectedAmount,
        transactionId: dataIA.transactionId,
        imageUrl: imageUrl || null,
        source: "app_topup",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (resolvedMode === "pass") {
        const hours = detectedAmount >= 10000 ? 24 : 12;
        const expireAt = new Date(Date.now() + hours * 3600 * 1000);
        tx.update(userRef, {
          passExpireAt: admin.firestore.Timestamp.fromDate(expireAt),
          lastTransactionId: dataIA.transactionId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const field = resolvedMode === "jetons" ? "soldeJetons" : "solde";
        tx.update(userRef, {
          [field]: admin.firestore.FieldValue.increment(detectedAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (e) {
    if (e.code === "DUPLICATE_TRANSACTION") {
      throw new HttpsError("already-exists", "Ce reçu Wave a déjà été utilisé.");
    }
    throw e;
  }

  return { success: true, transactionId: dataIA.transactionId, amount: detectedAmount, mode: resolvedMode };
});

// ═══════════════════════════════════════════════════════════════════
// CAS SUPERMARCHÉ : PASSATION COURSIER ➔ LIVREUR (SANS AVANCE DE FRAIS)
// ═══════════════════════════════════════════════════════════════════

/**
 * Le Livreur scanne le code du Coursier pour récupérer le colis du supermarché.
 * La passation ne peut être validée QUE si le paiement direct du client au supermarché
 * a été validé par le Webhook WhatsApp via le reçu Wave.
 */
exports.validateCoursierToLivreurHandoff = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connexion requise.");
  const uid = request.auth.uid; // ID du Livreur qui scanne le code

  const { courseId, enteredCode } = request.data || {};
  if (!courseId || !enteredCode) {
    throw new HttpsError("invalid-argument", "courseId et code requis.");
  }

  const db = admin.firestore();
  const courseRef = db.collection("courses").doc(courseId);

  try {
    await db.runTransaction(async (tx) => {
      const courseSnap = await tx.get(courseRef);
      if (!courseSnap.exists) throw new Error("NOT_FOUND");

      const course = courseSnap.data();

      // 1. Seul le livreur assigné à la livraison peut valider cette étape
      if (course.assignedLivreurId !== uid && course.livreurId !== uid) {
        throw new Error("UNAUTHORIZED_LIVREUR");
      }

      // 2. Vérification que le paiement Wave direct au supermarché a bien été validé par l'IA
      // (Ce champ 'supermarchePaymentVerified' est mis à true par ton webhook WhatsApp à la réception du reçu Wave du client)
      if (!course.supermarchePaymentVerified) {
        throw new Error("WAITING_FOR_SUPERMARCHE_PAYMENT");
      }

      // 3. Validation du code de passation fourni par le Coursier au Livreur
      if (course.pickupCode !== enteredCode) {
        throw new Error("INVALID_PICKUP_CODE");
      }

      // Le livreur prend possession des articles, la commande part en livraison
      tx.update(courseRef, {
        status: "in_transit",
        handoffValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: "Passation validée. Le livreur a récupéré les courses." };

  } catch (error) {
    if (error.message === "NOT_FOUND") throw new HttpsError("not-found", "Course introuvable.");
    if (error.message === "UNAUTHORIZED_LIVREUR") throw new HttpsError("permission-denied", "Vous n'êtes pas le livreur assigné à cette commande.");
    if (error.message === "WAITING_FOR_SUPERMARCHE_PAYMENT") {
      throw new HttpsError("failed-precondition", "Le paiement Wave du supermarché n'a pas encore été validé par le reçu sur WhatsApp.");
    }
    if (error.message === "INVALID_PICKUP_CODE") throw new HttpsError("failed-precondition", "Code de passation incorrect.");
    throw new HttpsError("internal", error.message);
  }
});