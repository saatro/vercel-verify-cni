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