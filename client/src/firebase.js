import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";

// Configuration statique pour éviter les problèmes de chargement des variables d'environnement
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

// Désactivation de la vérification reCAPTCHA pour les tests avec numéros de téléphone
auth.settings.appVerificationDisabledForTesting = true; 

export const db = getFirestore(app);

// Messaging initialisé par défaut à null
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

// Configuration de la persistance pour rester connecté après rafraîchissement
setPersistence(auth, browserLocalPersistence)
  .catch((error) => console.error("Erreur de persistance auth:", error));

export default app;