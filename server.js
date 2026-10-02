import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import pino from "pino";
import qrcode from "qrcode-terminal";

// Configuration de dotenv
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ═══════════════════════════════════════════════════════════════════
// SERVEUR EXPRESS & PROTECTION RATE LIMITING
// ═══════════════════════════════════════════════════════════════════
const app = express();
const PORT = process.env.PORT || 10000;

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Origine non autorisée par CORS : ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "12mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Trop de requêtes effectuées depuis cette adresse IP, veuillez réessayer plus tard.",
  },
});

app.use(limiter);

app.get("/", (req, res) => {
  res
    .status(200)
    .send("🤖 Bot WhatsApp & Service de Recharge Mambo opérationnel !");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// POST /api/verify-cni — Placez la route ICI, AVANT app.listen
// ═══════════════════════════════════════════════════════════════════
const CNI_MATCH_THRESHOLD = 0.55;

app.post("/api/verify-cni", async (req, res) => {
  try {
    const { imageBase64, expectedName } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ ok: false, error: "Image manquante ou invalide." });
    }
    if (!expectedName || typeof expectedName !== "string" || !expectedName.trim()) {
      return res.status(400).json({ ok: false, error: "Nom attendu manquant." });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const result = await verifyCniWithGemini({ imageBase64: cleanBase64, expectedName });

    const reasons = [];
    if (!result.isIdDocument) {
      reasons.push("L'image fournie ne ressemble pas à une pièce d'identité lisible.");
    } else if (result.score < CNI_MATCH_THRESHOLD) {
      reasons.push(
        `Le nom sur la pièce (« ${result.fullName || "illisible"} ») ne correspond pas suffisamment au nom saisi (« ${expectedName} »).`
      );
    }

    const ok = result.isIdDocument && result.score >= CNI_MATCH_THRESHOLD;

    return res.status(200).json({
      ok,
      fullName: result.fullName,
      cniNumber: result.cniNumber,
      expiry: result.expiry,
      score: result.score,
      reasons,
    });
  } catch (err) {
    console.error("Erreur /api/verify-cni :", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Erreur serveur lors de la vérification de la CNI.",
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DÉMARRAGE DU SERVEUR (Toujours après la définition des routes)
// ═══════════════════════════════════════════════════════════════════
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Serveur HTTP démarré sur le port ${PORT}`);
  setTimeout(() => {
    connectToWhatsApp();
  }, 3000);
});

// ═══════════════════════════════════════════════════════════════════════
// FIREBASE ADMIN & SECRETS
// ═══════════════════════════════════════════════════════════════════════
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const ocrApiKey = process.env.OCR_SPACE_API_KEY;
const LEGACY_MERCHANT_NAME = process.env.LEGACY_MERCHANT_NAME || "LEGACY";

const missingEnv = [];
if (!projectId) missingEnv.push("FIREBASE_PROJECT_ID");
if (!clientEmail) missingEnv.push("FIREBASE_CLIENT_EMAIL");
if (!rawPrivateKey) missingEnv.push("FIREBASE_PRIVATE_KEY");
if (!ocrApiKey) missingEnv.push("OCR_SPACE_API_KEY");

if (missingEnv.length > 0) {
  console.error(
    `❌ ERREUR CRITIQUE DE SÉCURITÉ : Les variables d'environnement suivantes sont manquantes : ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

function cleanPrivateKey(key) {
  if (!key) return "";
  let formattedKey = key.trim();

  if (
    (formattedKey.startsWith('"') && formattedKey.endsWith('"')) ||
    (formattedKey.startsWith("'") && formattedKey.endsWith("'"))
  ) {
    formattedKey = formattedKey.slice(1, -1);
  }

  if (!formattedKey.includes("-----BEGIN PRIVATE KEY-----") && /^[A-Za-z0-9+/=]+$/.test(formattedKey)) {
    try {
      formattedKey = Buffer.from(formattedKey, 'base64').toString('utf8');
    } catch (e) { }
  }

  formattedKey = formattedKey
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\r\n/g, "\n");

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
// FONCTION UTILITAIRE : LOG & ENVOI WHATSAPP
// ═══════════════════════════════════════════════════════════════════
async function safeSendMessage(sock, jid, content) {
  try {
    console.log(`[WHATSAPP SEND] 📤 Envoi vers ${jid} | Contenu :`, typeof content === 'string' ? content : JSON.stringify(content));
    const res = await sock.sendMessage(jid, content);
    console.log(`[WHATSAPP SEND SUCCESS] ✅ Message bien transmis à ${jid}`);
    return res;
  } catch (err) {
    console.error(`[WHATSAPP SEND ERROR] ❌ Échec envoi vers ${jid} :`, err.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════
// FONCTION UTILITAIRE : NOTIFICATIONS IN-APP
// ═══════════════════════════════════════════════════════════════════
async function sendInAppNotification({ userId, title, body, type, courseId, orderId }) {
  if (!userId) return;
  try {
    await db.collection("inAppMessages").add({
      receiverId: userId,
      title: title || "Mambo Information",
      body: body || "",
      type: type || "system_notification",
      courseId: courseId || null,
      orderId: orderId || null,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[IN-APP NOTIF] 📨 Message enregistré pour l'utilisateur ${userId} | Type : ${type}`);
  } catch (e) {
    console.warn("[IN-APP NOTIF ERROR] Erreur enregistrement messagerie:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TÉLÉPHONES / JID
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

  if (digits.length === 6) return [digits];

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
      `225${baseWithoutZero}`,
      `225${withZero}`,
      digits,
    ])
  ).slice(0, 10);
}

function toLocalCiPhone(raw) {
  let d = sanitizePhoneNumber(raw);
  if (!d) return "";
  if (d.length === 10 && d.startsWith("0")) return d;
  if (d.length === 9) return "0" + d;
  if (d.length >= 8 && d.length <= 10) return d.startsWith("0") ? d : "0" + d;
  return d;
}

// ═══════════════════════════════════════════════════════════════════
// PASS GRATUIT
// ═══════════════════════════════════════════════════════════════════
const PASS_FREE_PRICES = {
  abidjan: { h12: 2000, h24: 5000 },
  externe: { h12: 500, h24: 1000 },
};

function isLivreurExterne(userData) {
  const role = String(userData?.role || "").toLowerCase();
  const zone = String(
    userData?.zone || userData?.sectorZone || "abidjan"
  ).toLowerCase();
  if (role.includes("externe") || role.includes("livreur-")) return true;
  if (zone && zone !== "abidjan") return true;
  return false;
}

function matchPassFreeAmount(amount, userData) {
  const n = Number(amount) || 0;
  const prices = isLivreurExterne(userData)
    ? PASS_FREE_PRICES.externe
    : PASS_FREE_PRICES.abidjan;
  if (n === prices.h12) return { hours: 12, amount: n };
  if (n === prices.h24) return { hours: 24, amount: n };
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// SÉCURITÉ : FRAÎCHEUR DES REÇUS WAVE
// ═══════════════════════════════════════════════════════════════════
function verifyReceiptFreshness(dateStr, maxAgeMinutes = 15) {
  if (!dateStr) {
    return {
      isValid: false,
      error: "Impossible de déterminer l'horodatage du reçu. Veuillez soumettre une capture plus claire.",
    };
  }

  const receiptDate = new Date(dateStr);

  if (isNaN(receiptDate.getTime())) {
    const customRegex = /(\d{2})\/(\d{2})\/(\d{4})[^\d]*(\d{2}):(\d{2})/;
    const match = dateStr.match(customRegex);

    if (match) {
      const [, day, month, year, hours, minutes] = match;
      receiptDate.setFullYear(parseInt(year), parseInt(month) - 1, parseInt(day));
      receiptDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      return {
        isValid: false,
        error: "Format de date non reconnu sur le reçu. Contrôle de sécurité impossible.",
      };
    }
  }

  const now = new Date();
  const diffMs = now.getTime() - receiptDate.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes < -2) {
    return {
      isValid: false,
      error: "Anomalie détectée : L'horodatage du reçu est dans le futur.",
    };
  }

  if (diffMinutes > maxAgeMinutes) {
    return {
      isValid: false,
      error: `Reçu trop ancien (${Math.round(diffMinutes)} minutes). Un reçu Wave valide doit dater de moins de ${maxAgeMinutes} minutes pour être accepté.`,
    };
  }

  return {
    isValid: true,
    receiptTimestamp: receiptDate,
  };
}

// ═══════════════════════════════════════════════════════════════════
// VÉRIFICATION CNI (Gemini Vision)
// ═══════════════════════════════════════════════════════════════════
function normalizeNameForMatch(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function nameMatchScore(expected, extracted) {
  const a = normalizeNameForMatch(expected);
  const b = normalizeNameForMatch(extracted);
  if (!a || !b) return 0;

  const directDist = levenshtein(a, b);
  const directScore = 1 - directDist / Math.max(a.length, b.length);

  const aWords = a.split(" ").filter(Boolean).sort().join(" ");
  const bWords = b.split(" ").filter(Boolean).sort().join(" ");
  const sortedDist = levenshtein(aWords, bWords);
  const sortedScore = 1 - sortedDist / Math.max(aWords.length, bWords.length, 1);

  return Math.max(directScore, sortedScore, 0);
}

async function verifyCniWithGemini({ imageBase64, expectedName }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY manquante côté serveur.");
  }

  const prompt = `Tu analyses la photo d'une pièce d'identité ivoirienne (CNI, attestation d'identité,
ou passeport). Réponds UNIQUEMENT avec un objet JSON strictly valide, sans texte autour, au format :
{"fullName": "NOM PRENOM(S) tels que lus sur le document", "cniNumber": "numéro du document ou chaîne vide",
"expiry": "date d'expiration au format lu ou chaîne vide", "isIdDocument": true|false}.
Si l'image n'est pas une pièce d'identité lisible, mets "isIdDocument": false et les autres champs à "".`;

  // ✅ CODE CORRIGÉ (Modèle à jour)
  // Remplacez gemini-2.5-flash par gemini-3.8-flash (ou le modèle ciblé)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Gemini a répondu ${response.status} : ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Réponse Gemini illisible (aucun JSON détecté).");
    parsed = JSON.parse(match[0]);
  }

  const fullName = (parsed.fullName || "").trim();
  const cniNumber = (parsed.cniNumber || "").trim();
  const expiry = (parsed.expiry || "").trim();
  const isIdDocument = parsed.isIdDocument !== false && !!fullName;

  const score = isIdDocument ? nameMatchScore(expectedName, fullName) : 0;

  return { fullName, cniNumber, expiry, isIdDocument, score };
}

// ═══════════════════════════════════════════════════════════════════
// OCR WAVE (OCR.space)
// ═══════════════════════════════════════════════════════════════════
async function callOCRSpaceVerification({
  apiKey,
  base64Image,
  merchantAttendu,
  montantAttendu,
}) {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "Clé API OCR.space manquante ou indéfinie dans process.env.OCR_SPACE_API_KEY"
    );
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

  if (
    ocrResult.OCRExitCode !== 1 ||
    !ocrResult.ParsedResults ||
    ocrResult.ParsedResults.length === 0
  ) {
    throw new Error(
      `Échec OCR.space : ${ocrResult.ErrorMessage || "Erreur inconnue"}`
    );
  }

  const rawText = ocrResult.ParsedResults[0].ParsedText || "";

  const isWaveReceipt =
    /Reçu\s*de\s*Transaction/i.test(rawText) || /Wave/i.test(rawText);
  const hasApercuAndDetails =
    /Aperçu/i.test(rawText) && /Détails/i.test(rawText);

  const txMatch = rawText.match(/T_[A-Z0-9]+/i);
  const transactionId = txMatch ? txMatch[0].trim() : "";

  const amountMatch = rawText.match(/(\d[\d\s]*)\s*F(?:CFA)?/i);
  let detectedAmount = 0;
  if (amountMatch) {
    detectedAmount = parseInt(amountMatch[1].replace(/\s+/g, ""), 10);
  }

  const phoneMatch = rawText.match(
    /(?:\+?225\s*)?(0[156789](?:\s*\d){8})/i
  );
  const buyerPhone = phoneMatch ? sanitizePhoneNumber(phoneMatch[0]) : "";

  const passationMatch = rawText.match(/\b\d{6}\b/);
  const codePassation = passationMatch ? passationMatch[0] : "";

  const isStatusCompleted =
    /Effectué/i.test(rawText) ||
    /Succès/i.test(rawText) ||
    /Payé/i.test(rawText);

  const dateMatch = rawText.match(/(\d{2}\/\d{2}\/\d{4}[^\d]*\d{2}:\d{2})/);
  const extractedDateStr = dateMatch ? dateMatch[1] : "";
  const freshnessCheck = verifyReceiptFreshness(extractedDateStr, 15);
  const isDateRecent = freshnessCheck.isValid;

  const cleanRawText = rawText.toLowerCase().replace(/\s+/g, "");
  const cleanMerchant = String(merchantAttendu || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const isMerchantCorrect = cleanMerchant
    ? cleanRawText.includes(cleanMerchant)
    : true;

  const isAmountCorrect = montantAttendu
    ? detectedAmount === Number(montantAttendu)
    : detectedAmount > 0;

  const isValid = Boolean(
    transactionId &&
    detectedAmount > 0 &&
    isWaveReceipt &&
    isStatusCompleted &&
    isMerchantCorrect &&
    isDateRecent
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
      isDateRecent,
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

async function creditSoldeLivreurAtomique({
  userId,
  amount,
  transactionId,
  userName,
}) {
  const payRef = db.collection("paiements_verifies").doc(transactionId);
  const userRef = db.collection("users").doc(userId);

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (paySnap.exists) throw new DuplicateTransactionError();

    tx.set(payRef, {
      userId,
      userName: userName || "Utilisateur",
      merchantName: LEGACY_MERCHANT_NAME,
      montant: amount,
      transactionId,
      type: "recharge_solde",
      source: "whatsapp_baileys_render",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(userRef, {
      solde: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function activatePassFreeAtomique({
  userId,
  hours,
  amount,
  transactionId,
  userName,
}) {
  const payRef = db.collection("paiements_verifies").doc(transactionId);
  const userRef = db.collection("users").doc(userId);
  const ms = hours * 60 * 60 * 1000;

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (paySnap.exists) throw new DuplicateTransactionError();

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error("USER_NOT_FOUND");

    const current = userSnap.data();
    let base = Date.now();
    if (current.passFreeUntil?.toDate) {
      const until = current.passFreeUntil.toDate().getTime();
      if (until > base) base = until;
    }

    const passFreeUntil = admin.firestore.Timestamp.fromDate(
      new Date(base + ms)
    );

    tx.set(payRef, {
      userId,
      userName: userName || "Livreur",
      merchantName: LEGACY_MERCHANT_NAME,
      montant: amount,
      transactionId,
      type: "pass_free",
      passHours: hours,
      source: "whatsapp_baileys_render",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(userRef, {
      passFreeUntil,
      passFreeLastAmount: amount,
      passFreeLastHours: hours,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function processClientSupermarketPaymentAtomique({
  clientId,
  clientName,
  amount,
  transactionId,
  courseId,
  orderId,
  merchantNameUsed,
}) {
  const payRef = db.collection("paiements_verifies").doc(transactionId);
  const clientRef = db.collection("users").doc(clientId);

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (paySnap.exists) throw new DuplicateTransactionError();

    tx.set(payRef, {
      clientId,
      clientName: clientName || "Client",
      merchantName: merchantNameUsed || LEGACY_MERCHANT_NAME,
      montant: amount,
      transactionId,
      type: "paiement_supermarche_articles",
      courseId: courseId || null,
      orderId: orderId || null,
      source: "whatsapp_baileys_render",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(clientRef, {
      dernierPaiementArticles: transactionId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (courseId) {
      const courseRef = db.collection("courses").doc(courseId);
      tx.update(courseRef, {
        paymentStatus: "payment_validated",
        paymentTransactionId: transactionId,
        status: "paye_ia_valide",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (orderId) {
      const orderRef = db.collection("orders").doc(orderId);
      tx.update(orderRef, {
        status: "paye_ia_valide",
        paymentValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentTransactionId: transactionId,
        inAppMessage: "✅ Paiement des articles validé par l'IA ! Votre commande est en cours de préparation / prise en charge.",
        inAppMessageRead: false,
        inAppMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}

async function processClientCommissionPaymentAtomique({
  clientId,
  clientName,
  amount,
  transactionId,
  courseId,
  assignedLivreurId,
  orderId,
  merchantNameUsed,
}) {
  const payRef = db.collection("paiements_verifies").doc(transactionId);

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (paySnap.exists) throw new DuplicateTransactionError();

    tx.set(payRef, {
      clientId,
      clientName: clientName || "Client",
      merchantName: merchantNameUsed || LEGACY_MERCHANT_NAME,
      montant: amount,
      transactionId,
      type: "paiement_commission_livraison",
      assignedLivreurId: assignedLivreurId || null,
      courseId: courseId || null,
      orderId: orderId || null,
      source: "whatsapp_baileys_render",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (courseId) {
      const courseRef = db.collection("courses").doc(courseId);
      tx.update(courseRef, {
        commissionPaid: true,
        commissionTransactionId: transactionId,
        paymentStatus: "payment_validated",
        status: "ready_for_pickup",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (assignedLivreurId) {
      const livreurRef = db.collection("users").doc(assignedLivreurId);
      tx.update(livreurRef, {
        solde: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (orderId) {
      const orderRef = db.collection("orders").doc(orderId);
      tx.update(orderRef, {
        commissionPaid: true,
        commissionPaidAt: admin.firestore.FieldValue.serverTimestamp(),
        inAppMessage: "✅ Commission validée avec succès ! Vous pouvez maintenant remettre le colis au livreur en toute sécurité. Passation autorisée.",
        inAppMessageRead: false,
        inAppMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// COMMISSION → WhatsApp + in-app
// ═══════════════════════════════════════════════════════════════════
async function resolveCommissionRecipients(data) {
  let clientPhone =
    toLocalCiPhone(data.thirdPartyPhone) ||
    toLocalCiPhone(data.clientPhone) ||
    toLocalCiPhone(data.telephoneClient) ||
    "";
  let clientName =
    data.thirdPartyName || data.clientName || data.nomClient || "Client";
  let clientUserId = null;
  let resolvedCoursierId =
    data.assignedCoursierId || data.coursierId || null;
  const linkedOrderId = data.orderId || data.linkedOrderId || null;

  if (linkedOrderId) {
    try {
      const orderSnap = await db.collection("orders").doc(linkedOrderId).get();
      if (orderSnap.exists) {
        const od = orderSnap.data();
        clientUserId = od.clientId || od.userId || null;
        if (!clientPhone) {
          clientPhone = toLocalCiPhone(
            od.clientPhone || od.telephoneClient || od.telephone || ""
          );
        }
        clientName =
          clientName || od.clientName || od.nomClient || "Client";
        if (!resolvedCoursierId) resolvedCoursierId = od.coursierId || null;
      }
    } catch (e) {
      console.warn("[commission] lookup order:", e.message);
    }
  }

  if (!clientUserId && data.clientId) {
    try {
      const u = await db.collection("users").doc(data.clientId).get();
      if (u.exists && (u.data().role || "client") === "client") {
        clientUserId = data.clientId;
        if (!clientPhone) {
          clientPhone = toLocalCiPhone(
            u.data().telephone || u.data().phone || ""
          );
        }
      }
    } catch (_) { }
  }

  if (!clientUserId && clientPhone) {
    try {
      const variants = getPhoneVariants(clientPhone);
      if (variants.length > 0) {
        const snap = await db
          .collection("users")
          .where("telephone", "in", variants.slice(0, 10))
          .limit(1)
          .get();
        if (!snap.empty) clientUserId = snap.docs[0].id;
      }
    } catch (_) { }
  }

  return {
    clientPhone,
    clientName,
    clientUserId,
    resolvedCoursierId,
    linkedOrderId,
  };
}

async function notifyClientPayCommission(sock, { courseRef, data, source }) {
  if (data.commissionWhatsAppSent === true) return;

  const {
    clientPhone,
    clientName,
    clientUserId,
    resolvedCoursierId,
    linkedOrderId,
  } = await resolveCommissionRecipients(data);

  if (!clientPhone) {
    console.warn(
      `[commission] Pas de téléphone client (${source}) course=${courseRef?.id}`
    );
    return;
  }

  const hasCoursier = !!resolvedCoursierId;

  const isVendorCommerceType = (t) => {
    const s = String(t || "").toLowerCase();
    return (
      s.includes("boutique") ||
      s.includes("resto") ||
      s.includes("fastfood") ||
      s.includes("sante") ||
      s.includes("particulier") ||
      s.includes("immobilier") ||
      s.includes("vehicule") ||
      s.includes("en_ligne")
    );
  };

  let isBoutique = !!(
    data.isTiersOrder ||
    data.fromVendeur ||
    data.vendeurId ||
    data.vendorId ||
    data.isBoutiqueOrder ||
    isVendorCommerceType(data.type) ||
    isVendorCommerceType(data.courseMode)
  );

  if (!isBoutique && linkedOrderId) {
    try {
      const os = await db.collection("orders").doc(linkedOrderId).get();
      if (os.exists) {
        const od = os.data();
        const t = String(od.type || od.categorie || "").toLowerCase();
        if (
          isVendorCommerceType(t) ||
          od.vendeurId ||
          od.vendorId ||
          od.isTiersOrder
        ) {
          isBoutique = true;
        }
        if (!isBoutique && Array.isArray(od.items)) {
          isBoutique = od.items.some(
            (it) =>
              isVendorCommerceType(it.type) ||
              isVendorCommerceType(it.categorie)
          );
        }
      }
    } catch (_) { }
  }

  let waveDisplay = "";
  let waveRawForLink = "";
  let payCommissionUrl = "";

  const appBase = (
    process.env.APP_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    "https://livraison-moto.web.app"
  ).replace(/\/$/, "");

  if (hasCoursier) {
    try {
      const coursierSnap = await db
        .collection("users")
        .doc(resolvedCoursierId)
        .get();
      if (coursierSnap.exists) {
        const cd = coursierSnap.data();
        waveRawForLink =
          cd.waveMerchantUrl ||
          cd.waveMerchant ||
          cd.waveLink ||
          cd.telephone ||
          cd.phone ||
          "";
        if (waveRawForLink) {
          waveDisplay =
            toLocalCiPhone(waveRawForLink) ||
            sanitizePhoneNumber(waveRawForLink) ||
            waveRawForLink;
        }
      }
    } catch (_) { }

    const payQs = new URLSearchParams();
    if (linkedOrderId) payQs.set("orderId", linkedOrderId);
    if (courseRef?.id) payQs.set("courseId", courseRef.id);
    if (waveRawForLink && !/^https?:\/\//i.test(String(waveRawForLink))) {
      payQs.set(
        "wave",
        toLocalCiPhone(waveRawForLink) || sanitizePhoneNumber(waveRawForLink)
      );
    }
    payCommissionUrl = `${appBase}/payer-commission?${payQs.toString()}`;
  }

  let bodyText;
  let inAppTitle;
  let inAppBody;
  let orderInAppMessage = null;
  let messageType = "arrival_notice";
  let shouldSetOrderCommissionStatus = false;

  if (hasCoursier) {
    messageType = "commission_request";
    shouldSetOrderCommissionStatus = true;
    const waveHint = waveDisplay
      ? `\n\n💳 Commission *500 F* — Wave coursier : *${waveDisplay}*`
      : "";

    bodyText =
      `📦 *VOS ACHATS SONT PRÊTS*\n\n` +
      `Bonjour ${clientName},\n` +
      `Le livreur est arrivé au point de ramassage.\n\n` +
      `Pour finaliser en toute transparence, veuillez régler la *commission de 500 F* au coursier :\n\n` +
      `👉 *Payer en 1 clic :*\n${payCommissionUrl}` +
      waveHint +
      `\n\n⚠️ *IMPORTANT :* N'oubliez pas d'enregistrer notre contact d'assistance pour confirmer votre paiement par contrôle du reçu complet depuis l'interface Wave.\n\nPuis renvoyez ici le *reçu Wave complet* pour rassurer notre système et autoriser la passation sécurisée.`;

    inAppTitle = "Commission 500 F — Achats prêts & sécurisés";
    inAppBody =
      `Vos achats sont prêts. Payez 500 F au coursier` +
      (payCommissionUrl ? ` via ${payCommissionUrl}` : "") +
      (waveDisplay ? ` (Wave : ${waveDisplay})` : "") +
      ` et enregistrez notre contact d'assistance, puis envoyez le reçu complet à l'assistance pour débloquer la passation.`;
    orderInAppMessage =
      `📦 Vos achats sont prêts en toute transparence ! Payez la commission 500 F` +
      (waveDisplay ? ` au ${waveDisplay}` : " au coursier") +
      `, enregistrez notre contact d'assistance et envoyez le reçu Wave complet.`;
  } else if (isBoutique) {
    messageType = "boutique_cash_notice";
    bodyText =
      `🛒 *LIVRAISON BOUTIQUE — LIVREUR ARRIVÉ*\n\n` +
      `Bonjour ${clientName},\n` +
      `Votre livreur est arrivé.\n\n` +
      `Préparez *1000 F* (prix fixe) à remettre au livreur à la réception de votre colis en toute confiance.\n\n` +
      `Merci de vous tenir prêt.`;

    inAppTitle = "Livreur arrivé — 1000 F à prévoir";
    inAppBody =
      "Votre livreur boutique est arrivé. Préparez 1000 F (prix fixe) à lui remettre à la réception de votre colis.";
    orderInAppMessage =
      "🛒 Livreur arrivé ! Préparez 1000 F (prix fixe) à remettre au livreur à la réception.";
  } else {
    messageType = "arrival_notice";
    bodyText =
      `📦 *LIVREUR ARRIVÉ*\n\n` +
      `Bonjour ${clientName},\n` +
      `Votre livreur est à votre niveau.\n\n` +
      `Veuillez lui remettre votre colis en toute sécurité.\n` +
      `Aucune commission supplémentaire à payer.`;

    inAppTitle = "Livreur arrivé";
    inAppBody =
      "Votre livreur est à votre niveau. Veuillez lui remettre votre colis. Aucune commission à payer.";
    orderInAppMessage =
      "📦 Livreur arrivé — remettez-lui votre colis en toute sérénité. Aucune commission.";
  }

  try {
    const jid = `225${clientPhone}@s.whatsapp.net`;
    await safeSendMessage(sock, jid, { text: bodyText });
  } catch (waErr) {
    console.warn("[commission] WA send:", waErr.message);
  }

  if (clientUserId) {
    await sendInAppNotification({
      userId: clientUserId,
      title: inAppTitle,
      body: inAppBody,
      type: messageType,
      courseId: courseRef?.id || null,
      orderId: linkedOrderId || null,
    });
  }

  if (linkedOrderId && orderInAppMessage) {
    try {
      const orderUpdate = {
        inAppMessage: orderInAppMessage,
        inAppMessageRead: false,
        inAppMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (shouldSetOrderCommissionStatus) {
        orderUpdate.status = "en_attente_commission";
        orderUpdate.commissionNotifiedAt =
          admin.firestore.FieldValue.serverTimestamp();
      }
      await db.collection("orders").doc(linkedOrderId).update(orderUpdate);
    } catch (e) {
      console.warn("[commission] order update:", e.message);
    }
  }

  if (courseRef?.id) {
    try {
      await db.collection("courses").doc(courseRef.id).update({
        commissionWhatsAppSent: true,
        commissionNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn("[commission] course flag:", e.message);
    }
  }
}

function startCommissionWatcher(sock) {
  db.collection("courses")
    .where("commissionRequested", "==", true)
    .onSnapshot(
      (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== "added" && change.type !== "modified") return;
          const data = change.doc.data();
          if (data.commissionWhatsAppSent === true) return;
          if (!data.commissionRequested) return;
          try {
            await notifyClientPayCommission(sock, {
              courseRef: change.doc,
              data,
              source: "watcher",
            });
          } catch (err) {
            console.error("[commission watcher]", err.message);
          }
        });
      },
      (err) => console.error("[commission watcher] snapshot error:", err)
    );
}

// ═══════════════════════════════════════════════════════════════════
// WHATSAPP (Baileys)
// ═══════════════════════════════════════════════════════════════════
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  let version;
  try {
    const v = await fetchLatestWaWebVersion();
    version = v.version;
  } catch (_) {
    version = undefined;
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("📱 Scannez ce QR Code avec WhatsApp :");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = code === DisconnectReason.loggedOut;

      console.log("Connexion fermée. LoggedOut:", isLoggedOut, "code:", code);

      if (isLoggedOut) {
        console.log("🧹 Session expirée ou déconnectée. Nettoyage de auth_info_baileys...");
        const authPath = path.resolve(process.cwd(), "auth_info_baileys");
        if (fs.existsSync(authPath)) {
          fs.rmSync(authPath, { recursive: true, force: true });
        }
        console.log("🔄 Génération d'une nouvelle session et affichage du QR code...");
        setTimeout(() => connectToWhatsApp(), 2000);
      } else {
        console.log("🔄 Tentative de reconnexion dans 5 secondes...");
        setTimeout(() => connectToWhatsApp(), 5000);
      }
    } else if (connection === "open") {
      console.log("✅ WhatsApp connecté avec succès !");
      startCommissionWatcher(sock);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.endsWith("@g.us")) continue;

      const rawSenderNumber = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      const isImage =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ?.imageMessage;

      console.log(`[WHATSAPP RECEIVE] 📥 Message reçu de ${rawSenderNumber} (JID: ${remoteJid}) | Texte : "${text}" | Image présente : ${!!isImage}`);

      const phoneVariants = getPhoneVariants(rawSenderNumber);
      if (phoneVariants.length === 0) {
        continue;
      }

      const userCheckSnap = await db
        .collection("users")
        .where("telephone", "in", phoneVariants)
        .limit(1)
        .get();

      if (userCheckSnap.empty) {
        console.log(`🚫 Message ignoré : le numéro ${rawSenderNumber} n'est pas enregistré dans l'application.`);
        continue;
      }

      const textLower = text.trim().toLowerCase();

      if (text && !isImage) {
        if (
          textLower === "aide" ||
          textLower === "help" ||
          textLower === "menu"
        ) {
          await safeSendMessage(sock, remoteJid, {
            text:
              "🤖 *Assistance Mambo — Transparence & Sécurité*\n\n" +
              "• Veuillez enregistrer notre contact d'assistance pour confirmer votre paiement par contrôle du reçu complet depuis l'interface Wave.\n" +
              "• Envoyez ensuite une *capture du reçu Wave complet* pour valider un paiement, une recharge ou un Pass Gratuit en toute transparence.\n" +
              "• Coursier : *achats_termines* puis *assigner 07XXXXXXXX*\n" +
              "• Livreur : *fin_course* pour clôturer.\n\n" +
              "Pass Gratuit livreur (Wave exact) :\n" +
              "— Abidjan : *2000 F* (12h) ou *5000 F* (24h)\n" +
              "— Externe : *500 F* (12h) ou *1000 F* (24h)",
          });
          continue;
        }

        if (textLower === "achats_termines" || textLower === "achats termines") {
          const coursierPhoneVariants = getPhoneVariants(rawSenderNumber);
          if (coursierPhoneVariants.length === 0) continue;

          const coursierSnap = await db
            .collection("users")
            .where("telephone", "in", coursierPhoneVariants)
            .limit(1)
            .get();

          if (!coursierSnap.empty) {
            const coursierId = coursierSnap.docs[0].id;
            const courseSnap = await db
              .collection("courses")
              .where("assignedCoursierId", "==", coursierId)
              .where("status", "in", [
                "shopping",
                "en_courses",
                "coursier_assigned",
                "accepted",
              ])
              .limit(1)
              .get();

            if (!courseSnap.empty) {
              const courseDoc = courseSnap.docs[0];
              await db.collection("courses").doc(courseDoc.id).update({
                status: "shopping_completed_waiting_livreur",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              await safeSendMessage(sock, remoteJid, {
                text:
                  "✅ *Achats terminés avec succès*\n\n" +
                  "Étape enregistrée. Pour assigner un livreur et rassurer le client :\n*assigner <numéro>* (ex: assigner 0708001122)",
              });

              await sendInAppNotification({
                userId: coursierId,
                title: "Achats validés",
                body: "Vos achats ont bien été enregistrés. Veuillez maintenant assigner un livreur.",
                type: "shopping_completed",
                courseId: courseDoc.id,
              });

            } else {
              await safeSendMessage(sock, remoteJid, {
                text: "⚠ Aucune course active trouvée pour vous (coursier).",
              });
            }
          }
          continue;
        }

        if (textLower.startsWith("assigner ")) {
          const targetPhoneRaw = text.split(" ")[1]?.trim();
          if (!targetPhoneRaw) {
            await safeSendMessage(sock, remoteJid, {
              text: "⚠️ Format : assigner <numéro du livreur>",
            });
            continue;
          }

          const coursierPhoneVariants = getPhoneVariants(rawSenderNumber);
          if (coursierPhoneVariants.length === 0) continue;

          const coursierSnap = await db
            .collection("users")
            .where("telephone", "in", coursierPhoneVariants)
            .limit(1)
            .get();

          if (coursierSnap.empty) {
            await safeSendMessage(sock, remoteJid, {
              text: "⚠️ Utilisateur non reconnu.",
            });
            continue;
          }

          const coursierId = coursierSnap.docs[0].id;
          const courseSnap = await db
            .collection("courses")
            .where("assignedCoursierId", "==", coursierId)
            .where("status", "==", "shopping_completed_waiting_livreur")
            .limit(1)
            .get();

          if (courseSnap.empty) {
            await safeSendMessage(sock, remoteJid, {
              text: "⚠️ Aucune course en attente d'assignation livreur.",
            });
            continue;
          }

          const livreurPhoneVariants = getPhoneVariants(targetPhoneRaw);
          if (livreurPhoneVariants.length === 0) {
            await safeSendMessage(sock, remoteJid, {
              text: "⚠ Numéro de livreur invalide.",
            });
            continue;
          }

          const livreurSnap = await db
            .collection("users")
            .where("telephone", "in", livreurPhoneVariants)
            .where("role", "in", ["livreur", "livreur-externe"])
            .limit(1)
            .get();

          if (livreurSnap.empty) {
            await safeSendMessage(sock, remoteJid, {
              text: "⚠️ Aucun livreur trouvé avec ce numéro.",
            });
            continue;
          }

          const livreurDoc = livreurSnap.docs[0];
          const livreurId = livreurDoc.id;
          const livreurData = livreurDoc.data();
          const courseDoc = courseSnap.docs[0];
          const courseData = courseDoc.data();
          const linkedOrderId = courseData.linkedOrderId || courseData.orderId || null;

          await db.collection("courses").doc(courseDoc.id).update({
            assignedLivreurId: livreurId,
            status: "livreur_assigned",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await safeSendMessage(sock, remoteJid, {
            text: `✅ Livreur *${livreurData.prenom || livreurData.nom || ""}* assigné avec succès. Transparence totale assurée.`,
          });
          await sendInAppNotification({
            userId: coursierId,
            title: "Livreur assigné",
            body: `Le livreur ${livreurData.prenom || livreurData.nom || ""} a été assigné à votre course.`,
            type: "driver_assigned",
            courseId: courseDoc.id,
            orderId: linkedOrderId,
          });

          const livreurPhone = sanitizePhoneNumber(livreurData.telephone);
          if (livreurPhone) {
            await safeSendMessage(sock, `225${livreurPhone}@s.whatsapp.net`, {
              text: `📦 *NOUVELLE MISSION ASSIGNÉE*\n\nUn coursier vous a assigné une livraison. Ouvrez l'application pour consulter les détails et rassurer le client.`,
            });
            await sendInAppNotification({
              userId: livreurId,
              title: "Nouvelle mission de livraison",
              body: "Vous avez été assigné à une nouvelle livraison. Consultez les détails dans l'application.",
              type: "mission_assigned",
              courseId: courseDoc.id,
              orderId: linkedOrderId,
            });
          }

          if (courseData.clientId) {
            try {
              const clientDoc = await db
                .collection("users")
                .doc(courseData.clientId)
                .get();
              if (clientDoc.exists) {
                const clientData = clientDoc.data();
                const clientPhone = sanitizePhoneNumber(clientData.telephone);

                const clientMsgText = `🚴 *LIVREUR EN ROUTE*\n\nUn livreur (${livreurData.prenom || livreurData.nom || "Mambo"}) vient de vous être assigné et se dirige vers le point de ramassage en toute transparence.`;

                if (clientPhone) {
                  await safeSendMessage(sock, `225${clientPhone}@s.whatsapp.net`, {
                    text: clientMsgText,
                  });
                }

                await sendInAppNotification({
                  userId: courseData.clientId,
                  title: "Livreur assigné",
                  body: "Un livreur a été assigné à votre commande et prend en charge votre colis.",
                  type: "driver_assigned_client",
                  courseId: courseDoc.id,
                  orderId: linkedOrderId,
                });

                if (linkedOrderId) {
                  await db.collection("orders").doc(linkedOrderId).update({
                    inAppMessage: "🚴 Un livreur a été assigné à votre commande et se dirige vers le point de ramassage.",
                    inAppMessageRead: false,
                    inAppMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  });
                }
              }
            } catch (e) {
              console.warn("Erreur notification client assignation:", e.message);
            }
          }
          continue;
        }

        if (
          textLower.startsWith("fin_course") ||
          textLower.startsWith("course_terminee") ||
          textLower.startsWith("livraison_terminee")
        ) {
          const livreurPhoneVariants = getPhoneVariants(rawSenderNumber);
          if (livreurPhoneVariants.length === 0) continue;

          const livreurSnap = await db
            .collection("users")
            .where("telephone", "in", livreurPhoneVariants)
            .limit(1)
            .get();

          if (!livreurSnap.empty) {
            const livreurId = livreurSnap.docs[0].id;
            const courseSnap = await db
              .collection("courses")
              .where("assignedLivreurId", "==", livreurId)
              .where("status", "in", [
                "picked_up_in_transit",
                "ready_for_pickup",
                "in_transit",
                "arrived_at_pickup",
              ])
              .limit(1)
              .get();

            if (!courseSnap.empty) {
              const courseDoc = courseSnap.docs[0];
              const courseData = courseDoc.data();

              let isPaidOrValidated = false;
              if (courseData.paymentStatus === "payment_validated" || courseData.status === "paye_ia_valide" || courseData.commissionPaid === true) {
                isPaidOrValidated = true;
              } else if (courseData.linkedOrderId || courseData.orderId) {
                const ordId = courseData.linkedOrderId || courseData.orderId;
                try {
                  const ordSnap = await db.collection("orders").doc(ordId).get();
                  if (ordSnap.exists) {
                    const od = ordSnap.data();
                    if (od.status === "paye_ia_valide" || od.status === "livre" || od.commissionPaid === true || od.paymentStatus === "payment_validated") {
                      isPaidOrValidated = true;
                    }
                  }
                } catch (e) {
                  console.warn("Vérification ordre orderId pour fin_course:", e.message);
                }
              }

              if (!isPaidOrValidated) {
                console.warn(`[SÉCURITÉ PASSATION] ⛔ Tentative de fin de course refusée pour le livreur ${livreurId} : le vendeur n'a pas été payé / reçu non validé.`);
                await safeSendMessage(sock, remoteJid, {
                  text: "❌ *SÉCURITÉ PASSATION DE COLIS BLOQUÉE*\n\nImpossible de terminer la course : le paiement du vendeur n'a pas encore été validé ou confirmé par le reçu Wave.\n\nVeuillez vous assurer que le paiement a été effectué et validé par l'assistance via le contrôle du reçu Wave complet.",
                });
                continue;
              }

              const clientId = courseData.clientId;
              const linkedOrderId = courseData.linkedOrderId || courseData.orderId || null;

              await db.collection("courses").doc(courseDoc.id).update({
                status: "completed",
                closedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              if (linkedOrderId) {
                try {
                  await db
                    .collection("orders")
                    .doc(linkedOrderId)
                    .update({
                      status: "livre",
                      inAppMessage: "🎉 Votre colis a été livré avec succès. Merci d'avoir fait confiance à Mambo !",
                      inAppMessageRead: false,
                      inAppMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                      closedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                } catch (e) {
                  console.warn("Clôture order:", e.message);
                }
              }

              if (clientId) {
                try {
                  const clientDoc = await db
                    .collection("users")
                    .doc(clientId)
                    .get();
                  if (clientDoc.exists) {
                    const clientData = clientDoc.data();
                    const clientPhone = sanitizePhoneNumber(clientData.telephone);

                    if (clientPhone) {
                      await safeSendMessage(
                        sock,
                        `225${clientPhone}@s.whatsapp.net`,
                        {
                          text: `🎉 *LIVRAISON TERMINÉE ET SÉCURISÉE*\n\nVotre colis a été livré avec succès. Merci d'avoir utilisé Mambo !`,
                        }
                      );
                    }

                    await sendInAppNotification({
                      userId: clientId,
                      title: "Livraison terminée",
                      body: "Votre course a été clôturée avec succès. Merci d'avoir utilisé Mambo.",
                      type: "delivery_completed",
                      courseId: courseDoc.id,
                      orderId: linkedOrderId,
                    });
                  }
                } catch (_) { }
              }

              await safeSendMessage(sock, remoteJid, {
                text: "✅ *Livraison clôturée avec succès.*\n\nPassation validée en toute transparence. Bon travail !",
              });
              await sendInAppNotification({
                userId: livreurId,
                title: "Course terminée",
                body: "La livraison a été clôturée avec succès dans le système.",
                type: "course_closed",
                courseId: courseDoc.id,
                orderId: linkedOrderId,
              });

            } else {
              await safeSendMessage(sock, remoteJid, {
                text: "⚠️ Aucune course active trouvée pour vous.",
              });
            }
          }
          continue;
        }

        const isPrepopulatedMessage =
          text.includes("Nouvelle commande") ||
          text.includes("Demande de livraison") ||
          text.includes("Paiement") ||
          text.includes("Course") ||
          text.includes("Recharge");

        if (isPrepopulatedMessage) {
          await safeSendMessage(sock, remoteJid, {
            text:
              "👋 Bonjour !\n\n" +
              "Pour valider votre paiement en toute transparence et rassurer notre système, veuillez d'abord enregistrer notre contact d'assistance, puis envoyez la *capture du reçu Wave complet*.",
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
        console.error("❌ Téléchargement média:", downloadErr);
        await safeSendMessage(sock, remoteJid, {
          text: "⚠️ Impossible de lire la capture. Enregistrez notre contact d'assistance et renvoyez le reçu Wave complet pour rassurer l'assistance.",
        });
        continue;
      }

      console.log("📩 Reçu WhatsApp — OCR en cours...");
      try {
        let merchantAttendu = LEGACY_MERCHANT_NAME;

        let targetPhoneSearchInit = rawSenderNumber;
        const variantsForSearchInit = getPhoneVariants(targetPhoneSearchInit);
        let senderSnapInit = { empty: true };
        if (variantsForSearchInit.length > 0) {
          senderSnapInit = await db
            .collection("users")
            .where("telephone", "in", variantsForSearchInit)
            .limit(1)
            .get();
        }

        if (!senderSnapInit.empty) {
          const senderDataInit = senderSnapInit.docs[0].data();
          const senderIdInit = senderSnapInit.docs[0].id;
          const userRoleInit = senderDataInit.role || "client";

          if (userRoleInit === "client") {
            try {
              const activeCourseSnap = await db
                .collection("courses")
                .where("clientId", "==", senderIdInit)
                .where("status", "in", [
                  "pending", "accepted", "en_attente_paiement",
                  "arrived_at_pickup", "ready_for_pickup", "in_transit",
                  "offering", "livreur_assigned"
                ])
                .limit(1)
                .get();

              if (!activeCourseSnap.empty) {
                const courseData = activeCourseSnap.docs[0].data();
                const assignedCoursierId = courseData.assignedCoursierId || courseData.coursierId;
                if (assignedCoursierId) {
                  const coursierDoc = await db.collection("users").doc(assignedCoursierId).get();
                  if (coursierDoc.exists) {
                    const cd = coursierDoc.data();
                    merchantAttendu = cd.waveMerchantName || cd.waveMerchant || cd.waveLink || cd.nom || LEGACY_MERCHANT_NAME;
                  }
                }
              }
            } catch (e) {
              console.warn("Erreur dynamique marchand coursier:", e.message);
            }
          }
        }

        const dataIA = await callOCRSpaceVerification({
          apiKey: process.env.OCR_SPACE_API_KEY,
          base64Image,
          merchantAttendu,
          montantAttendu: null,
        });

        if (!dataIA.isValid || !dataIA.checklist.isDateRecent) {
          await safeSendMessage(sock, remoteJid, {
            text: "⚠️ *Reçu rejeté par sécurité* : invalide, trop ancien ou mauvais marchand. Veuillez enregistrer notre contact d'assistance et envoyer un reçu Wave complet et récent.",
          });
          continue;
        }

        let targetPhoneSearch = rawSenderNumber;
        const isLid =
          rawSenderNumber.length > 12 && !rawSenderNumber.startsWith("225");
        if (isLid && dataIA.buyerPhone) {
          targetPhoneSearch = dataIA.buyerPhone;
        }

        const variantsForSearch = getPhoneVariants(targetPhoneSearch);
        let senderSnap = { empty: true };

        if (variantsForSearch.length > 0) {
          senderSnap = await db
            .collection("users")
            .where("telephone", "in", variantsForSearch)
            .limit(1)
            .get();
        }

        if (senderSnap.empty && dataIA.codePassation) {
          senderSnap = await db
            .collection("users")
            .where("codePassation", "==", dataIA.codePassation)
            .limit(1)
            .get();
        }

        if (senderSnap.empty) {
          for (const variant of variantsForSearch) {
            const userDocById = await db.collection("users").doc(variant).get();
            if (userDocById.exists) {
              senderSnap = { empty: false, docs: [userDocById] };
              break;
            }
          }
        }

        if (senderSnap.empty) {
          console.log(`❌ Aucun user pour [${targetPhoneSearch}]`);
          await safeSendMessage(sock, remoteJid, {
            text: "⚠️ Votre numéro WhatsApp ne correspond à aucun compte enregistré dans l'application.",
          });
          continue;
        }

        const senderData = senderSnap.docs[0].data();
        const senderId = senderSnap.docs[0].id;
        const userRole = senderData.role || "client";

        const isLivreurOrCoursier = [
          "livreur",
          "livreur-externe",
          "coursier",
          "rayonniste",
        ].includes(userRole);
        const isClient = userRole === "client";

        if (!isLivreurOrCoursier && !isClient) {
          await safeSendMessage(sock, remoteJid, {
            text: "⚠️ Canal réservé aux utilisateurs enregistrés.",
          });
          continue;
        }

        let isVerified = false;
        if (dataIA.buyerPhone && dataIA.buyerPhone.trim() !== "") {
          const extractedVariants = getPhoneVariants(dataIA.buyerPhone);
          const userPhoneVariants = getPhoneVariants(senderData.telephone);
          isVerified = extractedVariants.some((v) =>
            userPhoneVariants.includes(v)
          );
        }
        if (!isVerified && dataIA.codePassation && senderData.codePassation) {
          isVerified = dataIA.codePassation === senderData.codePassation;
        }

        if (!isVerified) {
          await safeSendMessage(sock, remoteJid, {
            text: "⚠️ Le numéro ou le code du reçu Wave ne correspond pas à votre profil.",
          });
          continue;
        }

        const montantRecu = Number(dataIA.detectedAmount || 0);

        try {
          if (isLivreurOrCoursier) {
            const passMatch = matchPassFreeAmount(montantRecu, senderData);

            if (passMatch) {
              await activatePassFreeAtomique({
                userId: senderId,
                hours: passMatch.hours,
                amount: passMatch.amount,
                transactionId: dataIA.transactionId,
                userName:
                  senderData.prenom ||
                  senderData.nom ||
                  senderData.nomComplet ||
                  "Livreur",
              });

              const zoneLabel = isLivreurExterne(senderData)
                ? "zone externe"
                : "Abidjan";

              await safeSendMessage(sock, remoteJid, {
                text:
                  `✅ *PASS GRATUIT ACTIVÉ AVEC SUCCÈS*\n\n` +
                  `Durée : *${passMatch.hours} h*\n` +
                  `Montant : *${passMatch.amount.toLocaleString()} F* (${zoneLabel})\n\n` +
                  `Paiement validé par l'IA en toute transparence. Vous pouvez accepter des courses sans commission.`,
              });

              await sendInAppNotification({
                userId: senderId,
                title: "Pass Gratuit activé",
                body: `Votre Pass Gratuit de ${passMatch.hours}h a été activé suite à la validation de votre reçu Wave.`,
                type: "pass_free_activated",
              });

            } else {
              await creditSoldeLivreurAtomique({
                userId: senderId,
                amount: montantRecu,
                transactionId: dataIA.transactionId,
                userName:
                  senderData.prenom ||
                  senderData.nom ||
                  senderData.nomComplet ||
                  "Utilisateur",
              });

              await safeSendMessage(sock, remoteJid, {
                text: `💰 *Recharge validée en toute transparence !* Votre solde a été crédité de ${montantRecu} F.`,
              });

              await sendInAppNotification({
                userId: senderId,
                title: "Recharge de solde validée",
                body: `Votre compte a été crédité de ${montantRecu} F après vérification du reçu Wave par l'IA.`,
                type: "balance_recharged",
              });
            }
          } else if (isClient) {
            const isCommissionPayment = montantRecu === 500;

            let courseId = null;
            let orderId = null;
            let assignedCoursierId = null;
            let assignedLivreurId = null;

            const ACTIVE_COURSE_STATUSES = [
              "pending",
              "accepted",
              "en_attente_paiement",
              "arrived_at_pickup",
              "ready_for_pickup",
              "in_transit",
              "offering",
              "livreur_assigned",
            ];

            let targetCourseDoc = null;

            const courseSnap = await db
              .collection("courses")
              .where("clientId", "==", senderId)
              .where("status", "in", ACTIVE_COURSE_STATUSES)
              .limit(1)
              .get();
            if (!courseSnap.empty) targetCourseDoc = courseSnap.docs[0];

            if (!targetCourseDoc) {
              const phoneFields = [
                "telephoneClient",
                "clientPhone",
                "thirdPartyPhone",
              ];
              for (const field of phoneFields) {
                try {
                  const clientPhoneVars = getPhoneVariants(senderData.telephone);
                  if (clientPhoneVars.length === 0) continue;

                  const alt = await db
                    .collection("courses")
                    .where(field, "in", clientPhoneVars)
                    .limit(15)
                    .get();
                  const match = alt.docs.find((d) =>
                    ACTIVE_COURSE_STATUSES.includes(d.data().status)
                  );
                  if (match) {
                    targetCourseDoc = match;
                    break;
                  }
                } catch (qErr) {
                  console.warn(`[lookup course ${field}]`, qErr.message);
                }
              }
            }

            if (targetCourseDoc) {
              const courseData = targetCourseDoc.data();
              courseId = targetCourseDoc.id;
              assignedCoursierId =
                courseData.assignedCoursierId || courseData.coursierId || null;
              assignedLivreurId =
                courseData.assignedLivreurId ||
                courseData.livreurId ||
                courseData.driverId ||
                null;
              orderId =
                courseData.orderId || courseData.linkedOrderId || null;
            }

            if (!orderId) {
              const orderSnap = await db
                .collection("orders")
                .where("clientId", "==", senderId)
                .where("status", "in", [
                  "en_attente_paiement",
                  "pending",
                  "en_attente_coursier",
                  "en_preparation",
                  "en_attente_commission",
                  "paye_ia_valide",
                ])
                .limit(1)
                .get();

              if (!orderSnap.empty) {
                orderId = orderSnap.docs[0].id;
                const od = orderSnap.docs[0].data();
                if (!assignedCoursierId)
                  assignedCoursierId = od.coursierId || null;
              }
            }

            if (orderId && !assignedCoursierId) {
              try {
                const orderDoc = await db
                  .collection("orders")
                  .doc(orderId)
                  .get();
                if (orderDoc.exists) {
                  assignedCoursierId = orderDoc.data().coursierId || null;
                }
              } catch (e) {
                console.warn("Lookup order coursierId:", e.message);
              }
            }

            if (isCommissionPayment) {
              if (!assignedLivreurId && !courseId) {
                await safeSendMessage(sock, remoteJid, {
                  text: "⚠️ Aucun livreur assigné pour le moment. Vous serez notifié en toute transparence dès qu'un livreur sera en route.",
                });
                continue;
              }

              await processClientCommissionPaymentAtomique({
                clientId: senderId,
                clientName:
                  senderData.nom || senderData.nomComplet || "Client",
                amount: montantRecu,
                transactionId: dataIA.transactionId,
                courseId,
                assignedLivreurId,
                orderId,
                merchantNameUsed: merchantAttendu,
              });

              await safeSendMessage(sock, remoteJid, {
                text: `✅ *COMMISSION VALIDÉE AVEC SUCCÈS*\n\nVotre reçu Wave de 500 F a été vérifié et validé par l'IA (contrôle du reçu complet).\n\nLe livreur peut récupérer votre colis et démarrer la livraison en toute sérénité.`,
              });

              await sendInAppNotification({
                userId: senderId,
                title: "Commission validée",
                body: "Votre paiement de commission de 500 F a été validé. La livraison est autorisée.",
                type: "commission_validated",
                courseId,
                orderId,
              });

              if (assignedLivreurId) {
                try {
                  const livreurDoc = await db
                    .collection("users")
                    .doc(assignedLivreurId)
                    .get();
                  if (livreurDoc.exists) {
                    const livreurPhone = sanitizePhoneNumber(
                      livreurDoc.data().telephone
                    );
                    if (livreurPhone) {
                      await safeSendMessage(
                        sock,
                        `225${livreurPhone}@s.whatsapp.net`,
                        {
                          text: `✅ *COMMISSION CLIENT VALIDÉE*\n\nLe reçu du client a été validé par l'IA. Vous pouvez récupérer le colis et démarrer la livraison.`,
                        }
                      );
                    }
                    await sendInAppNotification({
                      userId: assignedLivreurId,
                      title: "Commission client validée",
                      body: "Le paiement de la commission a été validé. Vous pouvez procéder à la récupération du colis.",
                      type: "commission_validated_driver",
                      courseId,
                      orderId,
                    });
                  }
                } catch (_) { }
              }

              if (assignedCoursierId) {
                try {
                  const coursierDoc = await db
                    .collection("users")
                    .doc(assignedCoursierId)
                    .get();
                  if (coursierDoc.exists) {
                    const coursierPhone = sanitizePhoneNumber(
                      coursierDoc.data().telephone
                    );
                    if (coursierPhone) {
                      await safeSendMessage(
                        sock,
                        `225${coursierPhone}@s.whatsapp.net`,
                        {
                          text: `✅ *COMMISSION VALIDÉE*\n\nPassation colis autorisée en toute transparence avec le livreur.`,
                        }
                      );
                    }
                    await sendInAppNotification({
                      userId: assignedCoursierId,
                      title: "Commission validée — Passation autorisée",
                      body: "La commission a été validée par l'IA. Passation de colis autorisée.",
                      type: "commission_validated_coursier",
                      courseId,
                      orderId,
                    });
                  }
                } catch (_) { }
              }
            } else {
              await processClientSupermarketPaymentAtomique({
                clientId: senderId,
                clientName:
                  senderData.nom || senderData.nomComplet || "Client",
                amount: montantRecu,
                transactionId: dataIA.transactionId,
                courseId,
                orderId,
                merchantNameUsed: merchantAttendu,
              });

              await safeSendMessage(sock, remoteJid, {
                text: `✅ *PAIEMENT ARTICLES VALIDÉ (${montantRecu} F)*\n\nVotre reçu a été vérifié et validé par l'IA avec succès suite au contrôle du reçu complet.\n\nUn coursier prend en charge vos achats en toute transparence.`,
              });

              await sendInAppNotification({
                userId: senderId,
                title: "Paiement articles validé",
                body: `Votre paiement de ${montantRecu} F a été validé. Un coursier prend en charge votre commande.`,
                type: "payment_validated",
                courseId,
                orderId,
              });

              if (assignedCoursierId) {
                try {
                  const coursierDoc = await db
                    .collection("users")
                    .doc(assignedCoursierId)
                    .get();
                  if (coursierDoc.exists) {
                    const coursierPhone = sanitizePhoneNumber(
                      coursierDoc.data().telephone
                    );
                    if (coursierPhone) {
                      await safeSendMessage(
                        sock,
                        `225${coursierPhone}@s.whatsapp.net`,
                        {
                          text: `💰 *PAIEMENT ARTICLES VALIDÉ* (${montantRecu} F)\n\nLe paiement du client a été validé. Commande disponible pour les achats.`,
                        }
                      );
                    }
                    await sendInAppNotification({
                      userId: assignedCoursierId,
                      title: "Paiement articles validé",
                      body: `Le paiement de ${montantRecu} F a été validé par l'IA. Vous pouvez procéder aux achats.`,
                      type: "payment_validated_coursier",
                      courseId,
                      orderId,
                    });
                  }
                } catch (_) { }
              }
            }
          }
        } catch (dbErr) {
          if (
            dbErr instanceof DuplicateTransactionError ||
            dbErr.code === "DUPLICATE_TRANSACTION"
          ) {
            await safeSendMessage(sock, remoteJid, {
              text: "⚠️ *Sécurité anti-fraude* : Ce reçu Wave a déjà été utilisé pour une transaction précédente.",
            });
          } else {
            console.error("❌ Erreur BDD:", dbErr);
            await safeSendMessage(sock, remoteJid, {
              text: "⚠ Erreur technique lors de l'enregistrement du reçu. Veuillez réessayer.",
            });
          }
        }
      } catch (ocrErr) {
        console.error("❌ Erreur OCR:", ocrErr);
        await safeSendMessage(sock, remoteJid, {
          text: "⚠ Erreur d'analyse du reçu. Assurez-vous d'avoir enregistré notre contact d'assistance, puis renvoyez une image plus nette et complète du reçu Wave pour rassurer le système.",
        });
      }
    }
  });
}