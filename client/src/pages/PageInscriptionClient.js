import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock"; 
import {
  User, Phone, Camera, Loader2, ShieldCheck, Mail,
  CheckCircle2, Image as ImageIcon, Lock, ArrowLeft, CreditCard
} from "lucide-react"; 
import {
  cleanPhone, authErrorMessage, generatePatternPassword, openWhatsApp
} from "../mamboUtils";
import "react-toastify/dist/ReactToastify.css";
import "./PageInscriptionClient.css";

const CLOUDINARY_PRESET = "mambo_upload";
const CLOUDINARY_CLOUD   = "dh157ll3x";

const uploadToCloudinary = async (file) => {
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error(`Fichier invalide (reçu : ${typeof file})`);
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error(`"${file.name}" dépasse 8 Mo.`);
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: "POST", body: formData }
  );
  const responseText = await res.text();
  if (!res.ok) {
    let msg = "Échec du téléversement.";
    try { msg = JSON.parse(responseText)?.error?.message || msg; } catch {}
    throw new Error(`Cloudinary ${res.status}: ${msg}`);
  }
  return JSON.parse(responseText).secure_url;
};

const setDocWithRetry = async (ref, payload, maxRetries = 5) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await setDoc(ref, payload);
      return;
    } catch (err) {
      const isPermission = err.code === "permission-denied" || err.code === "firestore/permission-denied";
      if (isPermission && attempt < maxRetries) {
        if (auth.currentUser) await auth.currentUser.getIdToken(true);
        await new Promise(res => setTimeout(res, attempt * 1000));
      } else {
        throw err;
      }
    }
  }
};

export default function PageInscriptionClient() {
  const navigate = useNavigate();
  const location = useLocation();
  const googleData = location.state || {};
  const isGoogleAuth = !!googleData.uid;

  const [nomComplet, setNomComplet] = useState(googleData.displayName ? googleData.displayName.toUpperCase().trim() : "");
  const [telephone, setTelephone] = useState("");
  const [emailSaisi, setEmailSaisi] = useState(googleData.email || "");
  const [pattern, setPattern] = useState([]); 
  const [assistanceSaved, setAssistanceSaved] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(googleData.photoURL || null);
  const [cniFile, setCniFile] = useState(null); 
  const [cniPreview, setCniPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    
    let phone = cleanPhone(telephone);
    if (phone.length === 10 && !phone.startsWith("225")) {
      phone = "225" + phone;
    }

    const cleanNom = nomComplet.trim().toUpperCase();
    const cleanEmail = emailSaisi.trim().toLowerCase();
    
    if (cleanNom.length < 5) return toast.error("Nom complet invalide (5 caractères minimum).");
    if (phone.length !== 13) return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    if (!cleanEmail) return toast.error("L'adresse email est obligatoire pour valider votre compte.");
    if (!isGoogleAuth && pattern.length < 3) return toast.error("Schéma de sécurité trop court (3 points min).");
    if (!cniFile) return toast.error("La photo de votre CNI est obligatoire pour certifier le compte.");
    if (!assistanceSaved) return toast.warning("Veuillez d'abord enregistrer le contact Assistance.");

    setLoading(true);
    
    try {
      try {
        const q = query(collection(db, "users"), where("telephone", "==", phone));
        const snap = await getDocs(q);
        if (!snap.empty) { 
          setLoading(false); 
          return toast.error("Ce numéro est déjà associé à un compte existant."); 
        }
      } catch (readErr) {
        console.warn("Vérification doublon contournée :", readErr.code);
      }

      let finalPhotoURL = googleData.photoURL || "";
      let finalCniURL = "";

      if (photoFile) {
        setLoadingStep("Téléversement de la photo de profil...");
        finalPhotoURL = await uploadToCloudinary(photoFile);
      }
      
      setLoadingStep("Téléversement de la pièce d'identité...");
      finalCniURL = await uploadToCloudinary(cniFile);

      setLoadingStep("Création de vos accès sécurisés...");
      let user = null;
      const technicalEmail = `${phone}@livraison-moto.firebaseapp.com`;

      if (!isGoogleAuth) {
        const technicalPassword = generatePatternPassword(pattern, phone);
        const userCredential = await createUserWithEmailAndPassword(auth, technicalEmail, technicalPassword);
        user = userCredential.user;
      } else {
        user = auth.currentUser;
      }

      setLoadingStep("Mise à jour du profil utilisateur...");
      await updateProfile(user, { displayName: cleanNom, photoURL: finalPhotoURL });
      
      await user.getIdToken(true);
      await new Promise(res => setTimeout(res, 1000));

      setLoadingStep("Finalisation de l'espace client...");
      
      const finalEmail = technicalEmail; 
      const finalEmailPersonnel = isGoogleAuth ? (googleData.email || user.email) : cleanEmail;

      const finalData = {
        uid: user.uid,
        role: "client",
        nom: cleanNom,
        telephone: phone,
        email: finalEmail, 
        emailPersonnel: finalEmailPersonnel, 
        photoURL: finalPhotoURL,
        cniURL: finalCniURL,
        contactSaved: true,
        method: isGoogleAuth ? "google" : "pattern",
        mamboLockPattern: isGoogleAuth ? "" : pattern.join("-"),
        isCertified: !!finalCniURL,
        isActive: true, 
        solde: 0,
        createdAt: serverTimestamp(),
      };

      await setDocWithRetry(doc(db, "users", user.uid), finalData);

      setLoadingStep("");
      toast.success("Votre compte client a été créé avec succès !");
      setTimeout(() => navigate("/client-home"), 1500);

    } catch (err) {
      console.error("Erreur Inscription Client:", err.code, err.message);
      setLoadingStep("");
      if (err.code === "auth/email-already-in-use") {
        toast.error("Ce numéro de téléphone possède déjà un compte.");
      } else if (err.code === "permission-denied") {
        toast.error("Erreur de synchronisation Firestore. Veuillez réessayer.");
      } else {
        toast.error(authErrorMessage(err.code) || "Une erreur est survenue lors de la création.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      <button type="button" className="back-btn-float" onClick={() => navigate("/login-client")}>
        <ArrowLeft size={22} />
      </button>

      <div className="auth-container">
        <header className="auth-header">
          <div className="logo-circle"><ShieldCheck size={28} color="#10b981" /></div>
          <h1>Espace Client</h1>
        </header>

        <form onSubmit={handleRegister} className="auth-form">
          <div className="upload-section-client" onClick={() => document.getElementById("picInput").click()}>
            <div className={`placeholder-card circular ${photoPreview ? 'has-image' : ''}`}>
              {photoPreview ? <img src={photoPreview} alt="Profil" /> : <ImageIcon size={24} color="#94a3b8" />}
              <div className="upload-badge"><Camera size={12} /></div>
            </div>
            <input id="picInput" type="file" accept="image/*" hidden onChange={(e) => {
               const file = e.target.files[0];
               if(file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
            }} />
          </div>

          <div className="input-field">
            <User size={18} className="icon" />
            <input type="text" placeholder="NOM ET PRÉNOMS (CNI)" value={nomComplet} onChange={(e) => setNomComplet(e.target.value.toUpperCase())} required />
          </div>

          <div className="input-field">
            <Phone size={18} className="icon" />
            <input type="tel" placeholder="NUMÉRO WHATSAPP (Ex: 0707070707)" value={telephone} onChange={(e) => setTelephone(e.target.value)} required />
          </div>

          <div className="input-field">
            <Mail size={18} className="icon" />
            <input 
              type="email" 
              placeholder={isGoogleAuth ? "ADRESSE EMAIL GOOGLE" : "ADRESSE EMAIL"} 
              value={emailSaisi} 
              onChange={(e) => setEmailSaisi(e.target.value)} 
              disabled={isGoogleAuth} 
              required
              style={isGoogleAuth ? { opacity: 0.7, cursor: "not-allowed" } : {}}
            />
          </div>

          <div className="cni-upload-box" onClick={() => document.getElementById("cniInput").click()}>
            {cniPreview ? <div className="cni-preview"><img src={cniPreview} alt="CNI" /></div> : 
            <div className="cni-placeholder"><CreditCard size={30} color="#10b981" /><span>PHOTO DE LA CNI</span></div>}
            <input id="cniInput" type="file" accept="image/*" hidden onChange={(e) => {
               const file = e.target.files[0];
               if(file) { setCniFile(file); setCniPreview(URL.createObjectURL(file)); }
            }} />
          </div>

          {!isGoogleAuth && (
            <div className="pattern-login-section">
              <div className="lock-title"><Lock size={14} /> DÉFINISSEZ VOTRE SCHÉMA D'ACCÈS</div>
              <div style={{ display: "flex", justifyContent: "center", touchAction: "none" }}>
                <MamboLock onChange={(val) => setPattern(val)} loading={loading} size={180} />
              </div>
            </div>
          )}

          <div className={`vendeur-assistance ${assistanceSaved ? "saved" : ""}`} style={{ marginTop: "20px" }}>
            <p style={{ margin: "0 0 12px 0" }}>
              L'enregistrement du contact assistance est obligatoire afin de valider votre inscription et de confirmer vos paiements via le contrôle complet du reçu depuis l'interface Wave.
            </p>
            <button
              type="button"
              className="btn-wa-vendeur"
              onClick={() => { openWhatsApp("Client MAMBO : Enregistrement Assistance"); setAssistanceSaved(true); }}
            >
              {assistanceSaved ? (
                <>
                  <CheckCircle2 size={16} /> CONTACT ASSISTANCE ENREGISTRÉ
                </>
              ) : (
                "ENREGISTRER LE CONTACT ASSISTANCE"
              )}
            </button>
          </div>

          {loading && loadingStep && (
            <div className="loading-step-indicator" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '12px', padding: '12px', margin: '15px 0', fontSize: '12px', fontWeight: '700', color: '#10b981' }}>
              <Loader2 className="animate-spin" size={16} />
              <span>{loadingStep}</span>
            </div>
          )}

          <button 
            type="submit" 
            className="login-btn" 
            disabled={loading || !assistanceSaved || (!isGoogleAuth && pattern.length < 3)}
            style={(!assistanceSaved || loading) ? { backgroundColor: "#cbd5e1", opacity: 0.6, cursor: "not-allowed", backgroundImage: "none" } : {}}
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : "CONFIRMER L'INSCRIPTION"}
          </button>
        </form>
      </div>
    </div>
  );
}