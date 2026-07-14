const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const vision = require("@google-cloud/vision");
const { Storage } = require("@google-cloud/storage");

admin.initializeApp();

const db = admin.firestore();
const storage = new Storage();
const visionClient = new vision.ImageAnnotatorClient();

const BUCKET_NAME = "TON_BUCKET.appspot.com";

/* =========================
   UTILS
========================= */

async function hashImage(bucketName, filePath) {
  const file = storage.bucket(bucketName).file(filePath);
  const [buffer] = await file.download();
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function fingerprintText(text) {
  return crypto
    .createHash("md5")
    .update(text.replace(/\s+/g, " ").trim())
    .digest("hex");
}

function normalize(value) {
  return value.toString().toLowerCase().replace(/\s+/g, "");
}

function validateReceipt(text, amount, date, phone) {
  let score = 0;
  const reasons = [];

  const t = normalize(text);

  if (t.includes(normalize(amount))) score++;
  else reasons.push("Montant absent");

  if (t.includes(normalize(phone))) score++;
  else reasons.push("Téléphone absent");

  if (t.includes(normalize(date))) score++;
  else reasons.push("Date absente");

  if (score >= 2) {
    return {
      status: "VERIFIED",
      details: "Reçu valide",
    };
  }

  return {
    status: "REJECTED",
    details: reasons.join(" | "),
  };
}

/* =========================
   CLOUD FUNCTION
========================= */

exports.verifierRecu = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentification requise"
    );
  }

  const { transactionId } = data;
  if (!transactionId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "transactionId manquant"
    );
  }

  const txRef = db.collection("pending_deposits").doc(transactionId);
  const txSnap = await txRef.get();

  if (!txSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Transaction inconnue"
    );
  }

  const { amount, date, livreurId, receiptPath } = txSnap.data();

  if (!amount || !date || !livreurId || !receiptPath) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Transaction incomplète"
    );
  }

  const livreurSnap = await db.collection("livreurs").doc(livreurId).get();

  if (!livreurSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Livreur introuvable"
    );
  }

  const { phone } = livreurSnap.data();

  const receiptHash = await hashImage(BUCKET_NAME, receiptPath);

  const hashSnap = await db
    .collection("used_receipts")
    .doc(receiptHash)
    .get();

  if (hashSnap.exists) {
    await txRef.update({
      iaStatus: "REJECTED",
      iaDetails: "Reçu déjà utilisé (image identique)",
      iaCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: false, fraud: true };
  }

  const gcsUri = `gs://${BUCKET_NAME}/${receiptPath}`;

  const [ocrResult] = await visionClient.annotateImage({
    image: { source: { imageUri: gcsUri } },
    features: [{ type: "TEXT_DETECTION" }],
  });

  const fullText =
    ocrResult.fullTextAnnotation?.text?.toLowerCase() || "";

  const businessKey = `${amount}|${date}|${phone}`;

  const logicDup = await db
    .collection("used_receipts")
    .where("businessKey", "==", businessKey)
    .limit(1)
    .get();

  if (!logicDup.empty) {
    await txRef.update({
      iaStatus: "REJECTED",
      iaDetails: "Reçu déjà utilisé (données identiques)",
      iaCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: false, fraud: true };
  }

  const validation = validateReceipt(
    fullText,
    amount,
    date,
    phone
  );

  await txRef.update({
    iaStatus: validation.status,
    iaDetails: validation.details,
    iaText: fullText.substring(0, 4000),
    iaCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (validation.status === "VERIFIED") {
    await db.collection("used_receipts").doc(receiptHash).set({
      receiptHash,
      businessKey,
      textFingerprint: fingerprintText(fullText),
      transactionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    success: true,
    status: validation.status,
    details: validation.details,
  };
});
