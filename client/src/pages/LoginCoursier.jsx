import React, { useState } from "react";
import { auth, db } from "../firebase";
import { 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock";
import { 
  Lock, ChevronRight, 
  Phone, RefreshCcw, ArrowLeft, Package 
} from "lucide-react";
import { cleanPhone, generatePatternPassword } from "../mamboUtils";
import "react-toastify/dist/ReactToastify.css";

export default function LoginCoursier() {
  const [activeTab, setActiveTab] = useState("schema"); // "schema" ou "google"
  const [telephone, setTelephone] = useState("");
  const [pattern, setPattern] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // --- 🛡️ LOGIQUE COMMUNE ET HARMONISÉE DE VÉRIFICATION ---
  const verifyCoursierRole = async (user) => {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) {
      await signOut(auth);
      throw new Error("Compte inexistant. Veuillez vous inscrire.");
    }
    
    const userData = userSnap.data();
    if (userData.role?.toLowerCase() !== "coursier") {
      await signOut(auth);
      throw new Error("Accès refusé. Cet espace est réservé aux coursiers.");
    }
    return userData;
  };

  // --- 🌐 OPTION 1 : CONNEXION VIA GOOGLE ---
  const handleGoogleLogin = async () => {
    if (loading) return;
    const provider = new GoogleAuthProvider();
    
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, provider);
      const userData = await verifyCoursierRole(res.user);
      toast.success(`Ravi de vous revoir, ${userData.nomComplet || 'Coursier'} !`);
      navigate("/espace-coursier");
    } catch (error) {
      toast.error(error.message || "Erreur lors de la connexion Google.");
    } finally {
      setLoading(false);
    }
  };

  // --- 🔐 OPTION 2 : CONNEXION VIA SCHÉMA (EMAIL TECHNIQUE CORRECT) ---
  const handlePatternLogin = async (e) => {
     e.preventDefault();
     const phone = cleanPhone(telephone);
 
     if (phone.length < 10) {
       return toast.error("Numéro WhatsApp invalide.");
     }
     if (pattern.length < 3) {
       return toast.error("Schéma trop court.");
     }
 
     setLoading(true);
 
     try {
       // Utilisation du domaine technique Firebase officiel configuré
       const technicalEmail = `${phone}@livraison-moto.firebaseapp.com`;
       const technicalPassword = generatePatternPassword(pattern, phone);
 
       const userCredential = await signInWithEmailAndPassword(auth, technicalEmail, technicalPassword);
       const userData = await verifyCoursierRole(userCredential.user);
       
       toast.success(`Ravi de vous revoir, ${userData.nomComplet || 'Coursier'} !`);
       navigate("/espace-coursier");
 
     } catch (err) {
       console.error("Erreur Connexion Schéma :", err);
       if (err.code === "auth/internal-error" || err.message?.includes("503")) {
         toast.error("Le serveur est temporairement saturé. Veuillez réessayer.");
       } else if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
         toast.error("Aucun compte associé à ce numéro ou identifiants invalides.");
       } else if (err.code === "auth/wrong-password") {
         toast.error("Schéma incorrect.");
       } else {
         toast.error("Échec de l'authentification. Veuillez vérifier vos accès.");
       }
     } finally {
       setLoading(false);
     }
   };

  return (
    <div className="mambo-auth-page">
      <ToastContainer theme="dark" limit={1} position="top-center" />
      
      <button className="back-btn-float" type="button" onClick={() => navigate("/")}>
        <ArrowLeft size={22} />
      </button>

      <div className="auth-card-coursier">
        <header>
          <div className="icon-badge-mambo">
            <Package size={32} color="#10b981" />
          </div>
          <h1>MAMBO Coursier</h1>
          <p>AUTHENTIFICATION PARTENAIRE</p>
        </header>

        {/* 🔀 SÉLECTEUR D'ONGLETS HARMONISÉ */}
        <div className="auth-tabs">
          <button 
            type="button" 
            className={`tab-btn ${activeTab === "schema" ? "active" : ""}`}
            onClick={() => setActiveTab("schema")}
          >
            Schéma de sécurité
          </button>
          <button 
            type="button" 
            className={`tab-btn ${activeTab === "google" ? "active" : ""}`}
            onClick={() => setActiveTab("google")}
          >
            Compte Google
          </button>
        </div>

        {/* CONTENU DYNAMIQUE SELON L'ONGLET SÉLECTIONNÉ */}
        {activeTab === "schema" ? (
          <form onSubmit={handlePatternLogin} className="auth-form animate-fade-in">
            <div className="input-group-mambo">
              <Phone size={15} className="icon-left" />
              <input
                type="tel"
                placeholder="Numéro WhatsApp (ex: 07xxxxxxxx)"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                required
              />
            </div>

            <div className="pattern-container-box">
              <div className="pattern-label">
                <Lock size={14} /> DESSINEZ VOTRE SCHÉMA DE SÉCURITÉ
              </div>
              <div className="force-pattern-visibility">
                <MamboLock 
                  onChange={(val) => setPattern(val)} 
                  size={180} 
                />
              </div>
            </div>

            <button type="submit" className="btn-submit-coursier" disabled={loading || pattern.length < 3}>
              {loading ? <RefreshCcw className="animate-spin" /> : "DÉMARRER LE SERVICE"}
            </button>
          </form>
        ) : (
          <div className="google-tab-content animate-fade-in">
            <p className="google-notice">
              Utilisez votre compte Google professionnel associé à votre profil coursier MAMBO.
            </p>
            <button 
              type="button" 
              onClick={handleGoogleLogin} 
              className="google-btn-coursier-large"
              disabled={loading}
            >
              <img 
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                alt="Google logo" 
                className="google-icon-fix-large" 
              />
              <span>Se connecter avec Google</span>
            </button>
          </div>
        )}

        <footer className="auth-footer-coursier">
          <p>Nouveau partenaire ?</p>
          <Link to="/inscription-coursier" className="link-green-bold">
            REJOINDRE LA FLOTTE <ChevronRight size={13} />
          </Link>
        </footer>
      </div>

      <style>{`
        .mambo-auth-page { 
          min-height: 100vh;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center; 
          padding: 10px;
          font-family: 'Inter', sans-serif; 
        }
             
        .auth-card-coursier { 
          width: 100%; 
          max-width: 420px;
          background: white;
          border-radius: 32px;
          padding: 21px 21px;
          box-shadow: 0 25px 50px rgba(0,0,0,0.1);
          text-align: center; 
        }
           
        .icon-badge-mambo { 
          background: #ffffff; 
          width: 55px; 
          height: 55px; 
          border-radius: 20px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          margin: 0 auto 8px; 
          border: 1px solid #e2e8f0;
        }
        
        h1 { font-size: 17px; font-weight: 700; color: #1e293b; margin: 0; }
        p { font-size: 10px; color: #94a3b8; font-weight: 600; letter-spacing: 0.8px; margin-top: 5px; }

        /* DESIGN DES ONGLETS */
        .auth-tabs {
          display: flex;
          background: #f1f5f9;
          border-radius: 14px;
          padding: 4px;
          margin: 17px 0;
        }
        .tab-btn {
          flex: 1;
          padding: 5px 5px;
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          background: transparent;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .tab-btn.active {
          background: white;
          color: #1e293b;
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }

        .input-group-mambo { position: relative; margin-bottom: 12px; }
        .input-group-mambo .icon-left { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .input-group-mambo input { width: 100%; padding: 8px 8px 8px 34px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 18px; font-weight: 600; font-size: 12px; }

        .pattern-container-box { background: #f8fafc; border-radius: 24px; padding: 5px; border: 1.5px solid #e2e8f0; margin-bottom: 15px; }
        .pattern-label { font-size: 8px; font-weight: 600; color: #64748b; margin-bottom: 13px; display: flex; align-items: center; justify-content: center; gap: 3px; }
        .force-pattern-visibility { background: white; border-radius: 20px; padding: 8px; display: inline-block; box-shadow: 0 4px 10px rgba(0,0,0,0.03); }
        .force-pattern-visibility svg circle { fill: #1e293b !important; r: 6 !important; opacity: 1 !important; }
        .force-pattern-visibility svg line { stroke: #f8d302 !important; stroke-width: 5 !important; }

        .btn-submit-coursier { 
          width: 100%; padding: 10px; background: #10b981; color: white; border: none; border-radius: 18px; 
          font-weight: 800; cursor: pointer; box-shadow: 0 10px 20px rgba(16, 185, 129, 0.2);
        }
        .btn-submit-coursier:disabled { background: #cbd5e1; box-shadow: none; cursor: not-allowed; }

        /* CONTENU DU CONTENEUR GOOGLE DÉDIÉ */
        .google-tab-content {
          padding: 15px 0;
        }
        .google-notice {
          font-size: 12px;
          color: #64748b;
          line-height: 1.5;
          margin-bottom: 25px;
          letter-spacing: 0px;
          text-transform: none;
        }
        .google-btn-coursier-large {
          width: 100%; height: 48px; background: white; border: 2px solid #e2e8f0; border-radius: 18px;
          display: flex; align-items: center; justify-content: center; gap: 12px; font-weight: 700; cursor: pointer; color: #334155;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          transition: background 0.2s ease;
        }
        .google-btn-coursier-large:hover { background: #f8fafc; }
        .google-icon-fix-large { width: 24px; height: 21px; object-fit: contain; }

        .auth-footer-coursier { margin-top: 20px; padding-top: 10px; border-top: 1px solid #f1f5f9; }
        .link-green-bold { color: #10b981; font-weight: 800; text-decoration: none; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 5px; margin-top: 5px; }
        .back-btn-float { position: absolute; top: 20px; left: 20px; background: #1e293b; border: none; padding: 10px; border-radius: 50%; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        
        /* DES ANIMATIONS FLUIDES */
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}