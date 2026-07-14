import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        project_id: process.env.FIREBASE_PROJECT_ID,
        // Correction automatique des sauts de ligne pour la clé privée
        private_key: process.env.FIREBASE_PRIVATE_KEY ? 
                     process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") : 
                     undefined,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    console.log("✅ Firebase Admin initialisé avec succès pour Mambo");
  } catch (error) {
    console.error("❌ Erreur d'initialisation Firebase Admin:", error.message);
  }
}

// Exports pour utilisation dans tes API / Cloud Functions
export const adminDb = admin.firestore();
export const adminStorage = admin.storage();
export const adminAuth = admin.auth(); // Ajouté pour la gestion des comptes