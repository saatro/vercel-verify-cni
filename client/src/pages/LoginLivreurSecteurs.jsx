import React, { useState, useMemo } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock";
import { Lock, LogIn, ChevronRight, Phone, Loader2, ArrowLeft, MapPin } from "lucide-react";
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
  alepe: { name: "Alépé", role: "livreur-externe", isRural: true, bg: alepeIllustration },
  azaguie: { name: "Azaguié", role: "livreur-externe", isRural: true, bg: azaguieIllustration },
  agboville: { name: "Agboville", role: "livreur-externe", isRural: true, bg: agbovilleIllustration },
  adzope: { name: "Adzopé", role: "livreur-externe", isRural: true, bg: adzopeIllustration },
  dabou: { name: "Dabou", role: "livreur-externe", isRural: true, bg: dabouIllustration },
  jacqueville: { name: "Jacqueville", role: "livreur-externe", isRural: true, bg: jacquevilleIllustration }
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

    let phone = cleanPhone(telephone);
    if (phone.length === 10 && !phone.startsWith("225")) {
      phone = "225" + phone;
    }

    if (phone.length !== 13) return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    if (pattern.length < 3) return toast.error("Schéma de sécurité trop court.");

    setLoading(true);

    try {
      // 1. Lecture directe et sécurisée de l'index public par ID de document (le téléphone)
      const indexDocRef = doc(db, "phoneIndex", phone);
      const indexSnap = await getDoc(indexDocRef);

      if (!indexSnap.exists()) {
        setLoading(false);
        return toast.error("Aucun compte associé à ce numéro de téléphone.");
      }

      const indexData = indexSnap.data();
      const technicalEmail = indexData.email; // Récupère l'e-mail technique stocké dans l'index
      const userRole = indexData.role?.toLowerCase().trim();

      // 2. Vérification du rôle attendu pour cette zone
      if (userRole !== currentSector.role && userRole !== "admin") {
        setLoading(false);
        return toast.error(`Accès refusé : Votre compte n'est pas enregistré pour la zone ${currentSector.name}.`);
      }

      // 3. Pour les zones rurales, vérifier la zone précise
      if (currentSector.isRural && userRole !== "admin") {
        const userZone = (indexData.sectorZone || indexData.zone || "").toLowerCase().trim();
        if (userZone !== selectedSectorKey) {
          setLoading(false);
          return toast.error(`Ce compte est enregistré pour une autre zone que ${currentSector.name}.`);
        }
      }

      // 4. Vérification locale du schéma saisi par rapport à l'index enregistré
      const inputPatternString = pattern.join("-");
      if (indexData.mamboLockPattern && indexData.mamboLockPattern !== inputPatternString) {
        setLoading(false);
        return toast.error("Code schéma incorrect pour ce numéro.");
      }

      const technicalPassword = generatePatternPassword(pattern, phone);

      // 5. Authentification Firebase Auth finale via l'e-mail technique
      await signInWithEmailAndPassword(auth, technicalEmail, technicalPassword);

      // 6. Redirection selon le rôle réel du compte
      if (userRole === "livreur") {
        navigate("/livreur-home", { replace: true });
      } else {
        const finalZone = indexData.sectorZone || indexData.zone || selectedSectorKey;
        navigate(`/livreur-secteur/${finalZone}`, { replace: true });
      }

    } catch (error) {
      console.error("Login Error:", error);
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        toast.error("Schéma incorrect ou identifiants invalides.");
      } else if (error.code === "auth/user-not-found") {
        toast.error("Aucun compte associé à cet e-mail technique.");
      } else {
        toast.error(error.message || "Échec de la connexion. Vérifiez vos accès.");
      }
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
          <Link to={`/register-livreur/${selectedSectorKey}`} className="switch-auth-btn">REJOINDRE LA FLOTTE <ChevronRight size={16} /></Link>
        </footer>
      </div>
    </div>
  );
}