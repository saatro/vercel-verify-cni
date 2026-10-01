import dotenv from "dotenv";
dotenv.config();

import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

import qrcode from "qrcode-terminal";
import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ═══════════════════════════════════════════════════════════════════
// INITIALISATION FIREBASE ADMIN
// ═══════════════════════════════════════════════════════════════════
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ ERREUR : Les variables d'environnement Firebase sont manquantes.");
  console.error("Vérifie que ton fichier .env contient FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════
// INITIALISATION DE WHATSAPP CLIENT
// ═══════════════════════════════════════════════════════════════════
const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  // Affiche le QR code dans le terminal pour lier votre WhatsApp
  qrcode.generate(qr, { small: true });
  console.log("📲 Scannez ce QR Code avec votre WhatsApp pour connecter le bot.");
});

client.on("ready", () => {
  console.log("✅ Le bot WhatsApp est prêt et connecté !");
  
  // Démarrer l'écoute de Firebase une fois que WhatsApp est prêt
  ecouterCommandesFirebase();
});

client.initialize();

// ═══════════════════════════════════════════════════════════════════
// ÉCOUTE DES COMMANDES FIREBASE ET NOTIFICATION WHATSAPP
// ═══════════════════════════════════════════════════════════════════
const db = admin.firestore();

function ecouterCommandesFirebase() {
  console.log("👀 Écoute des nouvelles commandes dans Firestore...");

  // On écoute les commandes créées ou en attente pour notifier le coursier
  db.collection("orders")
    .where("statut", "in", ["paye_ia_valide", "en_attente_coursier"])
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const orderData = change.doc.data();
          const orderId = change.doc.id;
          
          console.log(`📦 Nouvelle commande détectée : #${orderId}`);

          // Numéro WhatsApp du coursier cible (à adapter selon votre base de données)
          // Format attendu par whatsapp-web.js : "225XXXXXXXX@c.us"
          const numeroCoursier = orderData.numeroCoursier || "22500000000@c.us"; 

          const message = `🔔 *Nouvelle course disponible !*\n\n` +
                          `Réf : #${orderId.slice(-6)}\n` +
                          `Supermarché : ${orderData.supermarche || orderData.nomBoutique || "Central"}\n` +
                          `Connectez-vous à l'Espace Coursier pour l'accepter.`;

          try {
            await client.sendMessage(numeroCoursier, message);
            console.log(`📨 Notification WhatsApp envoyée pour la commande #${orderId}`);
          } catch (err) {
            console.error("❌ Erreur lors de l'envoi du message WhatsApp :", err);
          }
        }
      });
    }, (error) => {
      console.error("Erreur lors de l'écoute Firestore :", error);
    });
}