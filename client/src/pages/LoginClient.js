import React, { useState } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock";
import { Phone, Lock, Loader2, ArrowLeft, Shield } from "lucide-react";
import { cleanPhone, authErrorMessage, generatePatternPassword } from "../mamboUtils";
import "./LoginClient.css";

export default function LoginClient() {
  const navigate = useNavigate();
  
  // Gestion du mode de connexion : 'pattern' ou 'google'
  const [loginMethod, setLoginMethod] = useState("pattern");
  const [loading, setLoading] = useState(false);

  // Formulaire Schéma
  const [telephone, setTelephone] = useState("");
  const [pattern, setPattern] = useState([]);

  // Logique globale de routage et vérification du profil Firestore
  const verifyAndRedirect = async (user) => {
    let userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      userDoc = await getDoc(doc(db, "user", user.uid));
    }
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      if (userData.role === "client") {
        setTimeout(() => navigate("/client-home"), 1200);
      } else {
        console.warn("⚠️ Rôle invalide pour cet espace :", userData.role);
        toast.error("Ce compte n'est pas un compte client.");
        auth.signOut();
      }
    } else {
      // Si connecté avec Auth (Google ou Schéma) mais profil inexistant dans Firestore
      console.warn("⚠️ Données Firestore introuvables.");
      toast.warn("Finalisation de votre profil requise.");
      setTimeout(() => navigate("/inscription-client", { 
        state: { 
          uid: user.uid, 
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        } 
      }), 1500);
    }
  };

  // 1. Connexion / Auto-création par Schéma
  const handlePatternLogin = async (e) => {
    e.preventDefault();
    
    // Harmonisation complète avec l'indicateur pays 225 comme à l'inscription
    let phone = cleanPhone(telephone);
    if (phone.length === 10 && !phone.startsWith("225")) {
      phone = "225" + phone;
    }

    if (phone.length !== 13) {
      return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    }
    if (pattern.length < 3) {
      return toast.error("Schéma trop court.");
    }

    setLoading(true);

    try {
      const technicalEmail = `${phone}@livraison-moto.firebaseapp.com`;
      const technicalPassword = generatePatternPassword(pattern, phone);

      let userCredential;
      try {
        // Tentative de connexion standard
        userCredential = await signInWithEmailAndPassword(auth, technicalEmail, technicalPassword);
      } catch (signInErr) {
        // Si le compte n'existe pas, on le crée automatiquement pour fluidifier l'accès
        if (signInErr.code === "auth/user-not-found") {
          userCredential = await createUserWithEmailAndPassword(auth, technicalEmail, technicalPassword);
          
          // Initialisation minimale dans Firestore si absent
          await setDoc(doc(db, "users", userCredential.user.uid), {
            telephone: phone,
            role: "client",
            createdAt: serverTimestamp()
          }, { merge: true });

          toast.success("Compte initialisé avec succès !");
        } else {
          throw signInErr;
        }
      }

      await verifyAndRedirect(userCredential.user);

    } catch (err) {
      console.error("Erreur Connexion Schéma :", err);
      if (err.code === "auth/internal-error" || err.message?.includes("503")) {
        toast.error("Le serveur est temporairement saturé. Veuillez réessayer.");
      } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        toast.error("Schéma incorrect.");
      } else {
        toast.error(authErrorMessage(err.code));
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Connexion Alternative par Google
  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    
    try {
      const result = await signInWithPopup(auth, provider);
      await verifyAndRedirect(result.user);
    } catch (err) {
      console.error("Erreur Connexion Google :", err);
      if (err.code === "auth/internal-error" || err.message?.includes("503")) {
        toast.error("Le serveur est temporairement indisponible.");
      } else if (err.code !== "auth/popup-closed-by-user") {
        toast.error("Échec de la connexion avec Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      
      <button className="back-btn-float" onClick={() => navigate("/")}>
        <ArrowLeft size={22} />
      </button>

      <div className="auth-container">
        <header className="auth-header">
          <div className="logo-circle">
            <Shield size={28} color="#10b981" />
          </div>
          <h1>Espace Client</h1>
          <p>Choisissez votre mode de connexion</p>
        </header>

        {/* Onglets professionnels Schéma / Google */}
        <div className="auth-tabs">
          <button 
            type="button"
            className={`tab-btn ${loginMethod === "pattern" ? "active" : ""}`}
            onClick={() => { setLoginMethod("pattern"); setPattern([]); }}
          >
            <Lock size={16} /> Schéma
          </button>
          <button 
            type="button"
            className={`tab-btn ${loginMethod === "google" ? "active" : ""}`}
            onClick={() => setLoginMethod("google")}
          >
            <svg className="google-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Google
          </button>
        </div>

        {loginMethod === "pattern" ? (
          /* --- ENTRÉE FORMULAIRE SCHÉMA --- */
          <form onSubmit={handlePatternLogin} className="auth-form">
            <div className="input-field">
              <Phone size={18} className="icon" />
              <input 
                type="tel" 
                placeholder="NUMÉRO WHATSAPP" 
                value={telephone} 
                onChange={(e) => setTelephone(e.target.value)} 
                required 
              />
            </div>

            <div className="pattern-login-section">
              <div className="lock-title">
                <Lock size={14} /> DESSINEZ VOTRE SCHÉMA
              </div>
              <div className="lock-wrapper">
                <MamboLock 
                  onChange={(val) => setPattern(val)} 
                  loading={loading} 
                  size={150} 
                />
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={24} /> : "SE CONNECTER"}
            </button>
          </form>
        ) : (
          /* --- ENTRÉE BOUTON GOOGLE --- */
          <div className="google-login-container">
            <p className="google-notice">
              Connectez-vous instantanément en toute sécurité à l'aide de votre compte Google.
            </p>
            <button 
              type="button" 
              className="google-action-btn" 
              onClick={handleGoogleLogin} 
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={22} />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="22" height="22">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  Continuer avec Google
                </>
              )}
            </button>
          </div>
        )}

        <div className="auth-footer-links" style={{ marginTop: "20px" }}>
          <p>Pas encore de compte ?</p>
          <button 
            type="button" 
            className="switch-auth-btn" 
            onClick={() => navigate("/inscription-client")}
          >
            Créer un compte client
          </button>
        </div>
      </div>
    </div>
  );
}