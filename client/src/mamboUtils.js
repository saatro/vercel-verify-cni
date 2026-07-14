// ─────────────────────────────────────────────────────────────
//  mamboUtils.js – Architecture de Sécurité & Utilitaires MAMBO
// ─────────────────────────────────────────────────────────────
import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
// Import de votre utilitaire Cloudinary
import { uploadToCloudinary } from "./utils/cloudinary";

// ═══════════════════════════════════════════════
//  CONSTANTES & CONFIGURATION
// ═══════════════════════════════════════════════

export const ADMIN_WAVE = "2250778073456";

export const MAMBO_DOMAINS = {
  client:   "mambo.client",
  coursier: "mambo.coursier",
  livreur:  "mambo.pro",
  vendeur:  "mambo.store",
};

// ═══════════════════════════════════════════════
//  LOGIQUE DU PATTERN LOCK (SCHÉMA)
// ═══════════════════════════════════════════════

export const generatePatternPassword = (pattern, phone) => {
  if (!pattern || pattern.length < 3) return null;
  
  const clean = cleanPhone(phone);
  const patternString = pattern.join("");
  
  return `MB_${patternString}_${clean.slice(-3)}`;
};

// ═══════════════════════════════════════════════
//  TÉLÉPHONE & EMAIL TECHNIQUE
// ═══════════════════════════════════════════════

export const cleanPhone = (phone = "") => {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("225")) cleaned = cleaned.substring(3);
  return cleaned.slice(-10);
};

export const buildEmail = (email = "", phone = "", role = "client") => {
  const trimmed = email?.trim().toLowerCase();
  if (trimmed && trimmed.includes("@") && !trimmed.endsWith(".mambo.client")) {
    return trimmed;
  }
  return `${cleanPhone(phone)}@${MAMBO_DOMAINS[role] || MAMBO_DOMAINS.client}`;
};

export const phoneToEmail = (phone, role = "client") => buildEmail("", phone, role);

// ═══════════════════════════════════════════════
//  AUTHENTIFICATION & SÉCURITÉ
// ═══════════════════════════════════════════════

export const authErrorMessage = (code = "") => {
  const map = {
    "auth/email-already-in-use":   "Ce numéro est déjà enregistré.",
    "auth/invalid-email":          "Format d'identifiant invalide.",
    "auth/weak-password":          "Schéma trop simple. Reliez plus de points.",
    "auth/wrong-password":         "Schéma ou numéro incorrect.",
    "auth/user-not-found":         "Aucun compte trouvé pour ce numéro.",
    "auth/too-many-requests":      "Trop de tentatives. Réessayez plus tard.",
    "auth/network-request-failed": "Erreur réseau. Vérifiez votre connexion.",
  };
  return map[code] || "Erreur de connexion. Vérifiez vos informations.";
};

export const mamboSignIn = async (email, password, expectedRole) => {
  await setPersistence(auth, browserLocalPersistence);
  
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  const snap = await getDoc(doc(db, "users", user.uid));
  
  if (!snap.exists()) {
    await signOut(auth);
    throw Object.assign(new Error("Compte introuvable."), { code: "mambo/not-found" });
  }

  const data = snap.data();
  const role = data.role?.toLowerCase();

  if (role !== "admin" && role !== expectedRole) {
    await signOut(auth);
    throw Object.assign(
      new Error(`Accès refusé : Ce compte n'est pas un compte ${expectedRole}.`),
      { code: "mambo/wrong-role" }
    );
  }

  return { user, data };
};

// ═══════════════════════════════════════════════
//  GESTION DES FICHIERS (CLOUD-BASED)
// ═══════════════════════════════════════════════

/**
 * Upload un fichier vers Cloudinary
 * @param {File} file 
 * @returns {Promise<string>} URL de l'image
 */
export const uploadFile = async (file) => {
  if (!file) return "";
  try {
    // Utilisation de votre utilitaire Cloudinary centralisé
    const secureUrl = await uploadToCloudinary(file);
    return secureUrl;
  } catch (error) {
    console.error("Upload Error:", error);
    throw new Error("Impossible d'envoyer l'image.");
  }
};

export const validateFileSize = (file, maxMb = 5) => {
  if (file && file.size > maxMb * 1024 * 1024)
    return `Fichier trop lourd (max ${maxMb} Mo)`;
  return null;
};

// ═══════════════════════════════════════════════
//  COMMUNICATION & VALIDATION
// ═══════════════════════════════════════════════

export const openWhatsApp = (message) => {
  const url = `https://wa.me/${ADMIN_WAVE}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
};

export const isPlaqueValide = (plaque = "") => {
  const ancien  = /^[0-9]{4}[A-Z]{2}[0-9]{2}$/;
  const nouveau = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
  return ancien.test(plaque.toUpperCase()) || nouveau.test(plaque.toUpperCase());
};