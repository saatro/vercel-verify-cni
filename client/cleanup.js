import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function cleanBadDocs() {
  console.log("🚀 Début de la suppression des documents orphelins dans 'users'...\n");
  
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  
  let batch = db.batch();
  let countInBatch = 0;
  let totalDeleted = 0;

  for (const doc of snapshot.docs) {
    const docId = doc.id;
    
    // Cibler uniquement les IDs générés automatiquement (longueur != 28)
    if (docId.length !== 28) {
      console.log(`🗑️ Suppression programmée : ${docId}`);
      batch.delete(doc.ref);
      countInBatch++;
      totalDeleted++;

      // Firestore limite les BATCH à 500 opérations max
      if (countInBatch === 450) {
        await batch.commit();
        batch = db.batch();
        countInBatch = 0;
      }
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  console.log(`\n✅ Nettoyage terminé avec succès. Total supprimé : ${totalDeleted}`);
}

cleanBadDocs().catch(console.error);