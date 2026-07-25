import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import "dotenv/config";

// Charger les variables .env immédiatement
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestWaWebVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import express from "express";
import admin from "firebase-admin";
import pino from "pino";

// ═══════════════════════════════════════════════════════════════════
// SERVEUR EXPRESS POUR BINDING DU PORT RENDER (HEALTHCHECK)
// ═══════════════════════════════════════════════════════════════════
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("🤖 Bot WhatsApp & Service de Recharge Mambo opérationnel !");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Serveur HTTP démarré sur le port ${PORT}`);
  setTimeout(() => {
    connectToWhatsApp();
  }, 3000);
});

// ═══════════════════════════════════════════════════════════════════
// INITIALISATION FIREBASE ADMIN & CONSTANTES
// ═══════════════════════════════════════════════════════════════════
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

const LEGACY_MERCHANT_NAME = process.env.LEGACY_MERCHANT_NAME || "LEGACY";

if (!projectId || !clientEmail || !rawPrivateKey) {
  console.error("❌ ERREUR CRITIQUE : Des variables Firebase sont manquantes dans process.env !");
  process.exit(1);
}

function cleanPrivateKey(key) {
  if (!key) return "";
  let formattedKey = key;

  if ((formattedKey.startsWith('"') && formattedKey.endsWith('"')) ||
      (formattedKey.startsWith("'") && formattedKey.endsWith("'"))) {
    formattedKey = formattedKey.slice(1, -1);
  }

  formattedKey = formattedKey.replace(/\\n/g, "\n");
  formattedKey = formattedKey.replace(/\r\n/g, "\n");

  if (!formattedKey.includes("-----BEGIN PRIVATE KEY-----")) {
    formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}`;
  }
  if (!formattedKey.includes("-----END PRIVATE KEY-----")) {
    formattedKey = `${formattedKey}\n-----END PRIVATE KEY-----`;
  }

  return formattedKey.trim();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: cleanPrivateKey(rawPrivateKey),
    }),
  });
}

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════
// HELPER : NETTOYAGE ET VARIANTES DU NUMÉRO DE TÉLÉPHONE / JID
// ═══════════════════════════════════════════════════════════════════
function sanitizePhoneNumber(rawInput) {
  if (!rawInput) return "";
  let digits = String(rawInput).replace(/[^0-9]/g, "");

  if (digits.startsWith("225") && digits.length >= 12) {
    digits = digits.slice(3);
  }

  return digits;
}

function getPhoneVariants(from) {
  if (!from) return [];
  const digits = String(from).replace(/[^0-9]/g, "");
  if (!digits) return [];

  if (digits.length === 6) {
    return [digits];
  }

  let local10 = "";
  if (digits.startsWith("225") && digits.length >= 12) {
    local10 = digits.slice(3);
  } else if (digits.length === 10) {
    local10 = digits;
  } else if (digits.length === 9) {
    local10 = "0" + digits;
  } else {
    local10 = digits;
  }

  const baseWithoutZero = local10.startsWith("0") ? local10.slice(1) : local10;
  const withZero = local10.startsWith("0") ? local10 : "0" + local10;

  return Array.from(
    new Set([
      withZero,
      baseWithoutZero,
      `225${withZero}`,
      `225${baseWithoutZero}`,
      `+225${withZero}`,
      `+225${baseWithoutZero}`,
      digits
    ])
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANALYSE DE REÇU WAVE AVEC OCR.SPACE API + REGEX
// ═══════════════════════════════════════════════════════════════════
async function callOCRSpaceVerification({ apiKey, base64Image, merchantAttendu, montantAttendu }) {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Clé API OCR.space manquante ou indéfinie dans process.env.OCR_SPACE_API_KEY");
  }

  const formData = new FormData();
  formData.append("apikey", apiKey.trim());
  formData.append("base64Image", `data:image/jpeg;base64,${base64Image}`);
  formData.append("language", "fre");
  formData.append("isOverlayRequired", "false");
  formData.append("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: formData,
  });

  const ocrResult = await response.json();

  if (ocrResult.OCRExitCode !== 1 || !ocrResult.ParsedResults || ocrResult.ParsedResults.length === 0) {
    throw new Error(`Échec de la reconnaissance OCR.space : ${ocrResult.ErrorMessage || "Erreur inconnue"}`);
  }

  const rawText = ocrResult.ParsedResults[0].ParsedText || "";

  const isWaveReceipt = /Reçu\s*de\s*Transaction/i.test(rawText) || /Wave/i.test(rawText);
  const hasApercuAndDetails = /Aperçu/i.test(rawText) && /Détails/i.test(rawText);

  const txMatch = rawText.match(/T_[A-Z0-9]+/i);
  const transactionId = txMatch ? txMatch[0].trim() : "";

  const amountMatch = rawText.match(/(\d[\d\s]*)\s*F(?:CFA)?/i);
  let detectedAmount = 0;
  if (amountMatch) {
    detectedAmount = parseInt(amountMatch[1].replace(/\s+/g, ""), 10);
  }

  const phoneMatch = rawText.match(/(?:\+?225\s*)?(0[156789](?:\s*\d){8})/i);
  const buyerPhone = phoneMatch ? sanitizePhoneNumber(phoneMatch[0]) : "";

  const passationMatch = rawText.match(/\b\d{6}\b/);
  const codePassation = passationMatch ? passationMatch[0] : "";

  const isStatusCompleted = /Effectué/i.test(rawText) || /Succès/i.test(rawText) || /Payé/i.test(rawText);
  
  const cleanRawText = rawText.toLowerCase().replace(/\s+/g, "");
  const cleanMerchant = merchantAttendu.toLowerCase().replace(/\s+/g, "");
  const isMerchantCorrect = cleanRawText.includes(cleanMerchant);

  const isAmountCorrect = montantAttendu ? detectedAmount === Number(montantAttendu) : detectedAmount > 0;

  const isValid = Boolean(
    transactionId &&
    detectedAmount > 0 &&
    isWaveReceipt &&
    isStatusCompleted &&
    isMerchantCorrect
  );

  return {
    isValid,
    transactionId,
    detectedAmount,
    buyerName: "",
    buyerPhone,
    codePassation,
    checklist: {
      isWaveReceipt,
      hasApercuAndDetails,
      isMerchantCorrect,
      isAmountCorrect,
      isDateRecent: true,
      isStatusCompleted,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// TRANSACTIONS ATOMIQUES FIRESTORE
// ═══════════════════════════════════════════════════════════════════
class DuplicateTransactionError extends Error {
  constructor() {
    super("DUPLICATE_TRANSACTION");
    this.code = "DUPLICATE_TRANSACTION";
  }
}

async function creditSoldeLivreurAtomique({ userId, amount, transactionId, userName }) {
  const payRef = db.collection("paiements_verifies").doc(transactionId);
  const userRef = db.collection("users").doc(userId);

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (paySnap.exists) throw new DuplicateTransactionError();

    tx.set(payRef, {
      userId,
      userName: userName || "Livreur",
      merchantName: LEGACY_MERCHANT_NAME,
      montant: amount,
      transactionId,
      source: "whatsapp_baileys_render",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(userRef, {
      solde: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// INITIALISATION CLIENT WHATSAPP (BAILEYS)
// ═══════════════════════════════════════════════════════════════════
let isPairingRequested = false;

async function connectToWhatsApp() {
  // Format strict du téléphone sans '+' ni espaces pour Baileys
  const rawAssistance = process.env.ASSISTANCE_PHONE || "2250778073456";
  const ASSISTANCE_PHONE = rawAssistance.replace(/[^0-9]/g, "");

  const authFolder = ".baileys_auth";
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestWaWebVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Demande du Pairing Code UNIQUEMENT lorsqu'un QR Code est généré (preuve que le socket est prêt)
    if (qr && !sock.authState.creds.registered && !isPairingRequested) {
      isPairingRequested = true;
      try {
        console.log(`📱 Demande du code pour le numéro : ${ASSISTANCE_PHONE}`);
        const code = await sock.requestPairingCode(ASSISTANCE_PHONE);
        console.log(`\n════════════════════════════════════════════`);
        console.log(`🔑 CODE D'APPAIRAGE WHATSAPP : ${code}`);
        console.log(`════════════════════════════════════════════\n`);
      } catch (err) {
        console.error("❌ Erreur génération Pairing Code :", err?.message || err);
        isPairingRequested = false;
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      console.log(`❌ Connexion fermée (Code: ${statusCode}). Reconnexion : ${!isLoggedOut}`);

      isPairingRequested = false;

      if (isLoggedOut) {
        console.log("🧹 Nettoyage de la session corrompue...");
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
        } catch (e) {
          console.error("Erreur nettoyage dossier auth :", e);
        }
        setTimeout(() => connectToWhatsApp(), 5000);
      } else {
        setTimeout(() => connectToWhatsApp(), 5000);
      }
    } else if (connection === "open") {
      isPairingRequested = false;
      console.log("✅ Client WhatsApp (Baileys) connecté et prêt !");
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ÉCOUTEUR PRINCIPAL DE MESSAGES
  // ═══════════════════════════════════════════════════════════════════
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;

      if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) continue;

      const participantJid = msg.key.participant || remoteJid;
      const rawJid = participantJid.split("@")[0];
      const rawSenderNumber = rawJid.includes(":") ? rawJid.split(":")[0] : rawJid;

      const textMessage =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        "";

      const isImage = !!msg.message?.imageMessage;

      if (!isImage && textMessage.trim() !== "") {
        const text = textMessage.trim();
        const isPrepopulatedMessage =
          text.includes("Nouvelle commande") ||
          text.includes("Demande de livraison") ||
          text.includes("Paiement") ||
          text.includes("Course") ||
          text.includes("Recharge");

        if (isPrepopulatedMessage) {
          await sock.sendMessage(remoteJid, {
            text:
              "👋 Bonjour !\n\n" +
              "Pour effectuer votre recharge de solde, veuillez enregistrer notre contact d'assistance dans votre répertoire, puis nous envoyer la capture d'écran du reçu complet depuis votre interface Wave.",
          });
          continue;
        }
      }

      if (!isImage) continue;

      let base64Image = null;

      try {
        const buffer = await downloadMediaMessage(
          msg,
          "buffer",
          {},
          {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage,
          }
        );
        base64Image = buffer.toString("base64");
      } catch (downloadErr) {
        console.error("❌ Échec du téléchargement du média :", downloadErr);
        await sock.sendMessage(remoteJid, {
          text:
            "⚠️ Impossible de lire la capture d'écran reçue.\n\n" +
            "Veuillez enregistrer le contact d'assistance dans votre répertoire puis renvoyer le reçu complet depuis l'interface Wave.",
        });
        continue;
      }

      console.log(`📩 Reçu reçu de WhatsApp - Analyse par OCR.space API en cours...`);
      try {
        const dataIA = await callOCRSpaceVerification({
          apiKey: process.env.OCR_SPACE_API_KEY,
          base64Image,
          merchantAttendu: LEGACY_MERCHANT_NAME,
          montantAttendu: null,
        });

        if (!dataIA.isValid || !dataIA.checklist.isDateRecent) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Reçu de recharge rejeté : Reçu invalide, trop ancien ou non adressé au marchand de recharge.",
          });
          continue;
        }

        let targetPhoneSearch = rawSenderNumber;
        const isLid = rawSenderNumber.length > 12 && !rawSenderNumber.startsWith("225");

        if (isLid && dataIA.buyerPhone) {
          targetPhoneSearch = dataIA.buyerPhone;
        }

        const phoneVariants = getPhoneVariants(targetPhoneSearch);

        let senderSnap = await db
          .collection("users")
          .where("telephone", "in", phoneVariants)
          .limit(1)
          .get();

        if (senderSnap.empty && dataIA.codePassation) {
          senderSnap = await db
            .collection("users")
            .where("codePassation", "==", dataIA.codePassation)
            .limit(1)
            .get();
        }

        if (senderSnap.empty) {
          for (const variant of phoneVariants) {
            const userDocById = await db.collection("users").doc(variant).get();
            if (userDocById.exists) {
              senderSnap = { empty: false, docs: [userDocById] };
              break;
            }
          }
        }

        if (senderSnap.empty) {
          console.log(`❌ Rejet : Aucun livreur trouvé en BDD pour la recherche [${targetPhoneSearch}]`);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Votre numéro WhatsApp ne correspond à aucun compte livreur enregistré.",
          });
          continue;
        }

        const senderData = senderSnap.docs[0].data();
        const senderId = senderSnap.docs[0].id;
        const isLivreur =
          senderData && ["livreur", "livreur-externe"].includes(senderData.role);

        if (!isLivreur) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Ce canal est réservé exclusivement aux recharges de solde pour les livreurs.",
          });
          continue;
        }

        let isVerified = false;

        if (dataIA.buyerPhone && dataIA.buyerPhone.trim() !== "") {
          const extractedVariants = getPhoneVariants(dataIA.buyerPhone);
          const livreurPhoneVariants = getPhoneVariants(senderData.telephone);
          isVerified = extractedVariants.some(variant => livreurPhoneVariants.includes(variant));
        }

        if (!isVerified && dataIA.codePassation && senderData.codePassation) {
          isVerified = dataIA.codePassation === senderData.codePassation;
        }

        if (!isVerified) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Le numéro ou le code de passation figurant sur le reçu ne correspond pas à votre compte livreur.",
          });
          continue;
        }

        const montantCredite = Number(dataIA.detectedAmount || 0);
        try {
          await creditSoldeLivreurAtomique({
            userId: senderId,
            amount: montantCredite,
            transactionId: dataIA.transactionId,
            userName: senderData.prenom || senderData.nom || senderData.nomComplet || "Livreur",
          });
          await sock.sendMessage(remoteJid, {
            text: `💰 Recharge validée ! Votre solde a été crédité de ${montantCredite} F.`,
          });
        } catch (e) {
          if (e.code === "DUPLICATE_TRANSACTION") {
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Ce reçu Wave a déjà été utilisé pour une précédente recharge.",
            });
          } else {
            console.error("Erreur lors de la recharge atomique :", e);
          }
        }
      } catch (error) {
        console.error("❌ Erreur lors du traitement du message :", error);
      }
    }
  });
}