const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc } = require("firebase/firestore");

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: "demo-project",
    firestore: {
      rules: `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            function isAdmin() {
              return request.auth != null && request.auth.uid == "FWOQ9S4Lxqfc2cBoTsa4m6J6j8p2";
            }

            // Règle: Les clients peuvent lire/écrire leur propre profil.
            match /clients/{clientId} {
              allow read, write: if isAdmin() || (request.auth != null && request.auth.uid == clientId);
            }

            // ⭐ Règle SÉCURISÉE pour les Livreurs : 
            match /livreurs/{livreurId} {
              allow read: if isAdmin() || (request.auth != null && request.auth.uid == livreurId);
              
              // Autorise l'écriture par l'Admin ou par le Livreur lui-même SANS toucher au solde de jetons
              allow update: if isAdmin() || (
                request.auth != null &&
                request.auth.uid == livreurId &&
                // Le solde de jetons ne doit pas être présent ou être inchangé
                (!('tokens_balance' in request.resource.data) || request.resource.data.tokens_balance == resource.data.tokens_balance)
              );
              allow create, delete: if isAdmin();
            }
            
            // Règle: Les livraisons et les dépôts en attente sont gérés par l'Admin (pour les transactions)
            match /livraisons/{livraisonId} {
              // Admin write. Read for Admin, Livreur, or Client (si leurs IDs sont dans le doc)
              allow read: if isAdmin() || (request.auth != null && request.auth.uid == resource.data.livreurId) || (request.auth != null && request.auth.uid == resource.data.clientId);
              allow write: if isAdmin();
            }

            match /pending_deposits/{depositId} {
              allow read, write: if isAdmin();
            }

            // Règle générale : Tout le reste est Admin-only
            match /{document=**} {
              allow read, write: if isAdmin();
            }
          }
        }
      `,
    },
  });

  // -------------------------------------------------------------
  // Préparation des contextes de test
  // -------------------------------------------------------------
  const adminCtx = testEnv.authenticatedContext("FWOQ9S4Lxqfc2cBoTsa4m6J6j8p2");
  const clientCtx = testEnv.authenticatedContext("client123");
  const livreurCtx = testEnv.authenticatedContext("livreur456");
  const anonCtx = testEnv.unauthenticatedContext();

  // -------------------------------------------------------------
  // Cas de Test 1 : Admin (Test de base)
  // -------------------------------------------------------------
  await setDoc(doc(adminCtx.firestore(), "clients/testClient"), { name: "ok" });
  console.log("✅ Admin peut écrire/lire partout");

  // -------------------------------------------------------------
  // Cas de Test 2 : Client sur son propre doc
  // -------------------------------------------------------------
  await setDoc(doc(clientCtx.firestore(), "clients/client123"), { name: "ok" });
  console.log("✅ Client peut écrire/lire son propre doc");

  // -------------------------------------------------------------
  // Cas de Test 3 : Client sur un autre doc
  // -------------------------------------------------------------
  try {
    await setDoc(doc(clientCtx.firestore(), "clients/otherClient"), { name: "fail" });
    console.log("❌ Client ne devrait pas écrire dans un autre doc");
  } catch {
    console.log("✅ Refusé comme prévu (client sur autre doc)");
  }

  // -------------------------------------------------------------
  // Cas de Test 4 : Livreur sur son propre doc (Création)
  // -------------------------------------------------------------
  // L'admin doit créer le doc pour définir le solde initial
  await setDoc(doc(adminCtx.firestore(), "livreurs/livreur456"), {
    name: "Livreur Test",
    tokens_balance: 100
  });
  console.log("✅ Admin a créé le doc du Livreur");

  // -------------------------------------------------------------
  // Cas de Test 5 : Livreur sur son propre doc (Mise à jour sans toucher aux tokens)
  // -------------------------------------------------------------
  await setDoc(doc(livreurCtx.firestore(), "livreurs/livreur456"), { name: "Livreur Renommé" }, { merge: true });
  console.log("✅ Livreur peut mettre à jour son propre nom");

  // -------------------------------------------------------------
  // ⭐ Cas de Test 6 : Livreur tente de modifier son solde de jetons (DOIT ÉCHOUER)
  // -------------------------------------------------------------
  try {
    await setDoc(doc(livreurCtx.firestore(), "livreurs/livreur456"), { tokens_balance: 9999 }, { merge: true });
    console.log("❌ Livreur NE DEVRAIT PAS pouvoir modifier son solde de jetons");
  } catch {
    console.log("✅ Refusé comme prévu (Livreur ne peut pas modifier tokens_balance)");
  }

  // -------------------------------------------------------------
  // Cas de Test 7 : Livreur sur un autre doc (DOIT ÉCHOUER)
  // -------------------------------------------------------------
  try {
    await setDoc(doc(livreurCtx.firestore(), "livreurs/otherLivreur"), { name: "fail" });
    console.log("❌ Livreur ne devrait pas écrire dans un autre doc");
  } catch {
    console.log("✅ Refusé comme prévu (livreur sur autre doc)");
  }

  // -------------------------------------------------------------
  // Cas de Test 8 : Non connecté (DOIT ÉCHOUER)
  // -------------------------------------------------------------
  try {
    await getDoc(doc(anonCtx.firestore(), "clients/client123"));
    console.log("❌ Non connecté ne devrait pas lire");
  } catch {
    console.log("✅ Refusé comme prévu (non connecté)");
  }

  await testEnv.cleanup();
})();