import admin from "firebase-admin";
import fs from "fs";

// 1. Initialisation (utilise ton fichier serviceAccountKey.json)
const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function cleanBadDocs() {
  console.log("Starting cleanup of collection 'users'...");
  
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  
  let deletedCount = 0;

  for (const doc of snapshot.docs) {
    const docId = doc.id;
    
    // Un UID Firebase valide fait généralement 28 caractères.
    // Les documents générés par addDoc() font environ 20 caractères.
    // On cible les IDs qui ne sont pas des UIDs (longueur != 28)
    if (docId.length !== 28) {
      console.log(`🗑️ Deleting orphan document: ${docId}`);
      await usersRef.doc(docId).delete();
      deletedCount++;
    }
  }

  console.log(`✅ Cleanup finished. Total deleted: ${deletedCount}`);
}

cleanBadDocs().catch(console.error);