import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { initializeFirestore, clearIndexedDbPersistence } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAUXDW7BnDcbjhXVIvvCOpU7jkgD3aGnUc",
  authDomain: "livraison-moto.firebaseapp.com",
  projectId: "livraison-moto",
  storageBucket: "livraison-moto.firebasestorage.app",
  messagingSenderId: "534110018801",
  appId: "1:534110018801:web:6a9684490997ce74f39d50"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
auth.settings.appVerificationDisabledForTesting = true; 

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

// Purge des opérations en attente corrompues
clearIndexedDbPersistence(db).catch((err) => {
  console.warn("Restauration du cache Firestore terminée ou ignorée :", err.message);
});

export const functions = getFunctions(app);
export const messaging = null; 

export const getFirebaseMessaging = async () => {
  try {
    const supported = await isSupported();
    if (supported) return getMessaging(app);
    return null;
  } catch (err) {
    console.warn("FCM non supporté");
    return null;
  }
};

setPersistence(auth, browserLocalPersistence)
  .catch((error) => console.error("Erreur de persistance auth:", error));

export default app;