/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback } from "react";
import { 
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { Loader2, ArrowLeft, Smartphone, Lock, RefreshCcw } from "lucide-react";
import MamboLock from "../components/MamboLock";
import { cleanPhone, buildEmail, generatePatternPassword } from "../mamboUtils";
import "react-toastify/dist/ReactToastify.css";
import "./LoginMarketplace.css";
import logoImg from "../assets/MAMBO PREMIUM.png";

export default function LoginMarketplace() {
  const [activeTab, setActiveTab] = useState("schema"); // "schema" ou "google"
  const [phone, setPhone] = useState("");
  const [pattern, setPattern] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // --- LOGIQUE DE NAVIGATION COMMUNE ---
  const processUserNavigation = useCallback(async (user) => {
    if (!user) return;
    try {
      console.log("🔍 Récupération du profil Firestore pour l'UID :", user.uid);
      await user.getIdToken(true);

      const userDocRef = doc(db, "users", user.uid);
      let userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        const altDoc = await getDoc(doc(db, "user", user.uid));
        if (altDoc.exists()) {
          userDoc = altDoc;
        }
      }

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const role = userData.role?.toLowerCase().trim() || "client";
        console.log("Rôle utilisateur détecté :", role);
        
        const routes = {
          admin: "/admin-home",
          livreur: "/marketplace-full",
          vendeur: "/vendeur-dashboard",
          client: "/marketplace-full",
          guess: "/marketplace-full"
        };

        toast.success(`Heureux de vous revoir !`);
        navigate(routes[role] || "/marketplace-full", { replace: true });
      } else {
        console.warn("⚠️ Document Firestore introuvable. Création automatique du profil client par défaut...");
        
        const defaultData = {
          uid: user.uid,
          telephone: phone || "",
          role: "client",
          createdAt: serverTimestamp()
        };
        
        await setDoc(userDocRef, defaultData, { merge: true });
        console.log("✅ Profil client initialisé avec succès dans Firestore.");
        
        toast.success("Profil initialisé avec succès !");
        navigate("/marketplace-full", { replace: true });
      }
    } catch (err) {
      console.error("❌ Erreur de récupération Firestore:", err);
      toast.error("Problème lors de la récupération de votre profil.");
      setLoading(false);
      setSubmitting(false);
    }
  }, [navigate, phone]);

  // --- SURVEILLANCE DE LA SESSION AUTOMATIQUE ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("⚡ Session active détectée pour :", user.email || user.uid);
        await processUserNavigation(user);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [processUserNavigation]);

  // --- OPTION 1 : CONNEXION SCHÉMA ---
  const handleLogin = async (e) => {
    e.preventDefault();
    if (submitting) return;

    let cleanTelephone = cleanPhone(phone);
    if (cleanTelephone.length === 10 && !cleanTelephone.startsWith("225")) {
      cleanTelephone = "225" + cleanTelephone;
    }

    console.log("📱 Tentative de connexion avec le téléphone :", cleanTelephone);

    if (cleanTelephone.length !== 13 || pattern.length < 3) {
      return toast.error("Vérifiez votre numéro à 10 chiffres et votre schéma.");
    }

    setSubmitting(true);
    // Utilisation stricte du domaine technique correct aligné avec PageInscriptionClient.js[cite: 7]
    const technicalEmail = `${cleanTelephone}@livraison-moto.firebaseapp.com`;
    const technicalPassword = generatePatternPassword(pattern, cleanTelephone);

    try {
      console.log("🔑 Authentification Firebase avec l'e-mail technique :", technicalEmail);
      const res = await signInWithEmailAndPassword(auth, technicalEmail, technicalPassword);
      console.log("✅ Connexion Firebase réussie. UID :", res.user.uid);
      await processUserNavigation(res.user);
    } catch (error) {
      console.warn("⚠️ Erreur Firebase Auth rencontrée, code :", error.code);

      if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
        try {
          console.log("🛠️ Compte introuvable. Création automatique du compte technique de secours...");
          const signUpRes = await createUserWithEmailAndPassword(auth, technicalEmail, technicalPassword);
          console.log("✅ Compte de secours créé avec succès. UID :", signUpRes.user.uid);
          await processUserNavigation(signUpRes.user);
        } catch (signUpError) {
          console.error("❌ Échec de l'inscription automatique de secours :", signUpError);
          setSubmitting(false);
          if (signUpError.code === "auth/email-already-in-use") {
            toast.error("Ce numéro est associé à un autre mot de passe / schéma.");
          } else {
            toast.error("Erreur d'initialisation du schéma de sécurité.");
          }
        }
      } else {
        setSubmitting(false);
        if (error.code === "auth/wrong-password") {
          toast.error("Schéma d'accès incorrect pour ce numéro.");
        } else if (error.code === "auth/network-request-failed") {
          toast.error("Problème de connexion réseau. Veuillez réessayer.");
        } else {
          toast.error(`Erreur d'authentification : ${error.code}`);
        }
      }
    }
  };

  // --- OPTION 2 : CONNEXION GOOGLE ---
  const handleGoogleLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await processUserNavigation(result.user);
      }
    } catch (error) {
      console.error("❌ Erreur Google Popup:", error);
      setSubmitting(false);
      if (error.code !== "auth/popup-closed-by-user") {
        toast.error("La connexion Google a échoué.");
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
        <Loader2 className="animate-spin text-violet-500" size={40} />
      </div>
    );
  }

  return (
    <div className="login-container">
      <ToastContainer theme="dark" position="top-center" autoClose={3000} limit={1}/>
      
      <button 
        onClick={() => navigate("/")} 
        className="back-btn"
        type="button"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="login-card">
        <header className="login-header">
          <div className="login-logo-wrapper">
            <img src={logoImg} alt="Mambo" className="login-brand-logo" />
            <span className="login-brand-subtext">PREMIUM</span>
          </div>
          <p>Accédez à votre espace shopping</p>
        </header>

        {/* 🔀 SÉLECTEUR D'ONGLETS SÉCURISÉ */}
        <div className="auth-tabs-marketplace">
          <button 
            type="button" 
            className={`tab-btn-market ${activeTab === "schema" ? "active" : ""}`}
            onClick={() => !submitting && setActiveTab("schema")}
          >
            Schéma de sécurité
          </button>
          <button 
            type="button" 
            className={`tab-btn-market ${activeTab === "google" ? "active" : ""}`}
            onClick={() => !submitting && setActiveTab("google")}
          >
            Compte Google
          </button>
        </div>

        {/* CONTENU DYNAMIQUE SELON L'ONGLET SÉLECTIONNÉ */}
        {activeTab === "schema" ? (
          <form onSubmit={handleLogin} className="login-form animate-fade-in">
            {/* Champ Téléphone */}
            <div className="input-group">
              <Smartphone className="input-icon" size={20} />
              <input 
                type="tel" 
                placeholder="Numéro WhatsApp (ex: 07xxxxxxxx)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            {/* Zone du Schéma */}
            <div className="market-pattern-section">
              <div className="market-pattern-label">
                <Lock size={13} /> DESSINEZ VOTRE SCHÉMA
              </div>
              <div className="market-pattern-wrapper">
                <MamboLock onChange={(val) => setPattern(val)} size={200} />
              </div>
            </div>

            <button 
              type="submit" 
              className="login-submit-btn" 
              disabled={submitting || pattern.length < 3 || !phone}
            >
              {submitting ? <RefreshCcw className="animate-spin" size={18} /> : "SE CONNECTER"}
            </button>
          </form>
        ) : (
          <div className="google-tab-content-market animate-fade-in">
            <p className="google-notice-market">
              Connectez-vous instantanément avec votre compte Google pour retrouver vos paniers et commandes.
            </p>
            <button 
              type="button" 
              onClick={handleGoogleLogin} 
              className="google-btn-marketplace"
              disabled={submitting}
            >
              {submitting ? (
                <RefreshCcw className="animate-spin" size={18} />
              ) : (
                <>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style={{ width: '20px' }} />
                  <span>Continuer avec Google</span>
                </>
              )}
            </button>
          </div>
        )}

        <footer className="login-footer">
          <p>
            Nouveau sur MAMBO ? 
            <Link to="/inscription-client">
              Créer un compte
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}