import React, { useState, useMemo } from "react";
import { auth, db } from "../firebase";
import { 
  signInWithEmailAndPassword, 
  signOut 
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock";
import { 
  Lock, LogIn, ChevronRight, 
  Phone, Loader2, ArrowLeft, MapPin 
} from "lucide-react";
import { cleanPhone, generatePatternPassword } from "../mamboUtils";
import "./ClientHome.css";

// --- ASSETS ---

import abidjanIllustration from "../assets/abidjan-illustration.jpg";
import alepeIllustration from "../assets/alepe-illustration.jpg";
import azaguieIllustration from "../assets/azaguie-illustration.jpg";
import agbovilleIllustration from "../assets/agboville-illustration.jpg";
import adzopeIllustration from "../assets/adzope-illustration.jpg";
import dabouIllustration from "../assets/dabou-illustration.jpg";
import jacquevilleIllustration from "../assets/jacqueville-illustration.jpg";

const SECTORS_LOGIN_CONFIG = {
  abidjan: { name: "Abidjan", role: "livreur", isRural: false, bg: abidjanIllustration },
  alepe: { name: "Alépé", role: "livreur-alepe", isRural: true, bg: alepeIllustration },
  azaguie: { name: "Azaguié", role: "livreur-azaguie", isRural: true, bg: azaguieIllustration },
  agboville: { name: "Agboville", role: "livreur-agboville", isRural: true, bg: agbovilleIllustration },
  adzope: { name: "Adzopé", role: "livreur-adzope", isRural: true, bg: adzopeIllustration },
  dabou: { name: "Dabou", role: "livreur-dabou", isRural: true, bg: dabouIllustration },
  jacqueville: { name: "Jacqueville", role: "livreur-jacqueville", isRural: true, bg: jacquevilleIllustration }
};

export default function LoginLivreurSecteurs() {
  const navigate = useNavigate();
  const [selectedSectorKey, setSelectedSectorKey] = useState("abidjan");
  const [telephone, setTelephone] = useState("+225");
  const [pattern, setPattern] = useState([]);
  const [loading, setLoading] = useState(false);

  const currentSector = useMemo(() => {
    return SECTORS_LOGIN_CONFIG[selectedSectorKey] || SECTORS_LOGIN_CONFIG.abidjan;
  }, [selectedSectorKey]);

  const handlePatternLogin = async (e) => {
    e.preventDefault();
    if (loading) return;

    const phone = cleanPhone(telephone);
    if (phone.length !== 10) return toast.error("Numéro WhatsApp invalide.");
    if (pattern.length < 3) return toast.error("Schéma de sécurité trop court.");

    setLoading(true);

    try {
      // 1. Recherche du compte par téléphone dans Firestore (évite les erreurs de format d'e-mail)
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("telephone", "==", phone));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setLoading(false);
        return toast.error("Aucun compte associé à ce numéro de téléphone.");
      }

      // 2. Récupération des données du compte existant
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      // 3. Vérification de la cohérence de la zone ou du rôle
      if (userData.role?.toLowerCase() !== currentSector.role && userData.role?.toLowerCase() !== "admin") {
        setLoading(false);
        return toast.error(`Accès refusé : Votre compte n'est pas enregistré pour la zone ${currentSector.name}.`);
      }

      // 4. Extraction de l'email enregistré (ex: "0564028263@mambo.livreur")
      const technicalEmail = userData.email;
      const technicalPassword = generatePatternPassword(pattern, phone);

      // 5. Authentification Firebase Auth finale
      await signInWithEmailAndPassword(auth, technicalEmail, technicalPassword);
      
      navigate("/livreur-home", { replace: true });
    } catch (error) {
      console.error("Login Error:", error);
      toast.error("Code schéma incorrect pour ce numéro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-sans auth-wrapper pro-theme" style={{ backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url(${currentSector.bg})`, backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '100vh' }}>
      <ToastContainer theme="dark" />
      <button className="back-btn-float" onClick={() => navigate("/")} type="button"><ArrowLeft size={22} /></button>

      <div className="auth-container">
        <header className="auth-header">
         <h1>Mambo {currentSector.name}</h1>
        </header>

        <div className="input-field" style={{ marginBottom: '1.2rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', display: 'flex', alignItems: 'center', padding: '0 0.75rem' }}>
          <MapPin size={18} style={{ color: '#94a3b8', marginRight: '0.5rem' }} />
          <select value={selectedSectorKey} onChange={(e) => { setSelectedSectorKey(e.target.value); setPattern([]); }} style={{ width: '100%', padding: '0.75rem 0', background: 'transparent', border: 'none', color: '#fff', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}>
            {Object.entries(SECTORS_LOGIN_CONFIG).map(([key, value]) => (
              <option key={key} value={key} style={{ background: '#1e293b', color: '#fff' }}>Zone : {value.name}</option>
            ))}
          </select>
        </div>

        <form onSubmit={handlePatternLogin} className="auth-form">
          <div className="input-field"><Phone size={18} className="icon" /><input type="tel" placeholder="Numéro WhatsApp" value={telephone} onChange={(e) => setTelephone(e.target.value)} required /></div>
          <div className="pattern-login-section">
            <div className="lock-title"><Lock size={14} /> DÉVERROUILLER SESSION</div>
            <div className="lock-wrapper"><MamboLock onChange={(val) => setPattern(val)} loading={loading} size={180} /></div>
          </div>
          <button type="submit" className="login-btn pro-btn" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <>DÉMARRER <LogIn size={18} /></>}</button>
        </form>

        <footer className="auth-footer-links">
          <Link to="/register-livreur/:zone" className="switch-auth-btn">REJOINDRE LA FLOTTE <ChevronRight size={16} /></Link>
        </footer>
      </div>
    </div>
  );
}