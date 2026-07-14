import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { User, Camera, FileText, Loader2, Zap, ArrowLeft, ClipboardCheck, Mail, Lock, CheckCircle2 } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock";
import { cleanPhone, generatePatternPassword, openWhatsApp } from "../mamboUtils";
import "react-toastify/dist/ReactToastify.css";

const SUPERMARCHES = ["Prima Center", "Carrefour", "Casino", "Socofrais", "Playce", "Jumbo", "Cap Sud"];
const CLOUDINARY_PRESET = "mambo_upload";
const CLOUDINARY_CLOUD   = "dh157ll3x";

// --- TÉLÉVERSEMENT CLOUDINARY ALIGNÉ ---
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

// --- ÉCRITURE FIRESTORE AVEC RETRY ALIGNÉE ---
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

export default function PageInscriptionCoursierPro() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [formData, setFormData] = useState({ 
    nomComplet: "", 
    telephone: "", 
    email: "", 
    choixSupermarches: [] 
  });
  const [files, setFiles] = useState({ photo: null, cni: null });
  const [previews, setPreviews] = useState({ photo: null, cni: null });
  const [pattern, setPattern] = useState([]);
  const [assistanceSaved, setAssistanceSaved] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const validateEmail = (email) => {
    return String(email).toLowerCase().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    setFiles(prev => ({ ...prev, [type]: file }));
    setPreviews(prev => ({ ...prev, [type]: URL.createObjectURL(file) }));
  };

  const handleFinalSubmit = async (e) => {
    if (e) e.preventDefault();
    const phoneClean = cleanPhone(formData.telephone);
    const cleanEmail = formData.email.trim().toLowerCase();

    if (formData.nomComplet.trim().length < 5) return toast.error("Veuillez entrer votre nom complet (minimum 5 caractères).");
    if (phoneClean.length !== 10) return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    if (!validateEmail(cleanEmail)) return toast.error("Adresse email invalide.");
    if (formData.choixSupermarches.length === 0) return toast.error("Sélectionnez au moins une zone de service.");
    if (!files.photo || !files.cni) return toast.error("Photo de profil et CNI obligatoires.");
    if (pattern.length < 3) return toast.error("Schéma de sécurité trop court (3 points min).");
    if (!assistanceSaved) return toast.warning("Veuillez d'abord enregistrer le contact Assistance.");

    setLoading(true);

    try {
      // ÉTAPE 1 : Vérification doublon préventive
      try {
        const q = query(collection(db, "users"), where("telephone", "==", phoneClean));
        const snap = await getDocs(q);
        if (!snap.empty) { 
          setLoading(false); 
          return toast.error("Ce numéro de téléphone est déjà associé à un compte."); 
        }
      } catch (readErr) {
        console.warn("Vérification doublon indisponible :", readErr.code);
      }

      // ÉTAPE 2 : Téléversements Cloudinary ordonnés
      setLoadingStep("Téléversement de la photo de profil...");
      const photoURL = await uploadToCloudinary(files.photo);

      setLoadingStep("Téléversement de la pièce CNI...");
      const cniURL = await uploadToCloudinary(files.cni);

      // ÉTAPE 3 : Création de l'authentification technique avec le domaine opérationnel
      setLoadingStep("Création du profil professionnel...");
      const technicalEmail = `${phoneClean}@livraison-moto.firebaseapp.com`;
      const passwordTechnique = generatePatternPassword(pattern, phoneClean);
      const { user } = await createUserWithEmailAndPassword(auth, technicalEmail, passwordTechnique);

      // ÉTAPE 4 : Élimination de la latence de session (Force Token Update)
      setLoadingStep("Sécurisation des accès...");
      await user.getIdToken(true);
      await new Promise(res => setTimeout(res, 1000));

      // ÉTAPE 5 : Synchronisation base de données avec Retry
      setLoadingStep("Validation finale du compte...");
      const payload = {
        uid: user.uid,
        nomComplet: formData.nomComplet.trim().toUpperCase(),
        telephone: phoneClean,
        email: technicalEmail,
        emailPersonnel: cleanEmail,
        role: "coursier",
        status: "actif",
        isActive: true,
        isVerified: false,
        contactSaved: true,
        supermarches: formData.choixSupermarches,
        photoURL,
        cniURL,
        adresse: "COCODY",
        method: "pattern",
        mamboLockPattern: pattern.join("-"),
        createdAt: serverTimestamp()
      };

      await setDocWithRetry(doc(db, "users", user.uid), payload);

      setLoadingStep("");
      toast.success("Votre compte Coursier Pro a été configuré !");
      setTimeout(() => navigate("/"), 2000);

    } catch (err) {
      console.error("Erreur Inscription Coursier Pro :", err.code, err.message);
      setLoadingStep("");
      if (err.code === "auth/email-already-in-use") {
        toast.error("Ce numéro WhatsApp est déjà enregistré.");
      } else if (err.code === "permission-denied") {
        toast.error("Erreur de droits Firestore. Réessayez la soumission.");
      } else {
        toast.error("Échec lors de la création. Veuillez vérifier vos fichiers.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="premium-container">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      <div className="premium-header">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={24}/></button>
        <h1>REJOINDRE L'ÉQUIPE MAMBO</h1>
        <p><ClipboardCheck size={12}/> Inscription Coursier Partenaire</p>
      </div>

      <div className="premium-scroll-zone">
        <form onSubmit={handleFinalSubmit}>
          <section className="glass-card">
            <div className="card-header"><User size={16}/><span>IDENTITÉ</span></div>
            <input className="pro-input" placeholder="NOM ET PRÉNOMS" value={formData.nomComplet} onChange={e => setFormData({...formData, nomComplet: e.target.value.toUpperCase()})} required />
            <input className="pro-input" type="tel" placeholder="TÉLÉPHONE WHATSAPP" value={formData.telephone} onChange={e => setFormData({...formData, telephone: e.target.value})} required />
            <div className="input-wrap">
              <Mail size={16} className="input-icon"/>
              <input className="pro-input" type="email" placeholder="ADRESSE EMAIL" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
            </div>

            <div className="upload-grid">
              <div className="box" onClick={() => document.getElementById('photo-pro-file').click()}>
                {previews.photo ? <img src={previews.photo} alt="Profil" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <Camera size={24}/>}
                <input id="photo-pro-file" type="file" hidden accept="image/*" onChange={e => handleFileChange(e, "photo")} />
              </div>
              <div className="box" onClick={() => document.getElementById('cni-pro-file').click()}>
                {previews.cni ? <img src={previews.cni} alt="CNI" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <FileText size={24}/>}
                <input id="cni-pro-file" type="file" hidden accept="image/*" onChange={e => handleFileChange(e, "cni")} />
              </div>
            </div>
          </section>

          <section className="glass-card">
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <span>ZONES DE SERVICE</span>
              <span>{formData.choixSupermarches.length} / 3 SÉLECTIONNÉS</span>
            </div>
            <div className="chips-grid">
              {SUPERMARCHES.map(s => (
                <div key={s} className={`chip ${formData.choixSupermarches.includes(s) ? 'active' : ''}`}
                  onClick={() => formData.choixSupermarches.length < 3 || formData.choixSupermarches.includes(s) 
                    ? setFormData({...formData, choixSupermarches: formData.choixSupermarches.includes(s) ? formData.choixSupermarches.filter(x=>x!==s) : [...formData.choixSupermarches, s]})
                    : null}>
                  {s}
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={16}/><span><Lock size={12} style={{ display: 'inline', marginRight: '4px' }}/>SCHÉMA D'ACCÈS (3 points min)</span></div>
            <div className="lock-wrap" style={{ touchAction: 'none' }}><MamboLock onChange={setPattern} size={180}/></div>
          </section>

          {/* --- MODULE ASSISTANCE FORCÉE STYLE PREMIUM --- */}
          <section className="glass-card" style={{ border: assistanceSaved ? "1px dashed #10b981" : "1px dashed #ef4444", background: assistanceSaved ? "rgba(16, 185, 129, 0.05)" : "rgba(239, 68, 68, 0.03)" }}>
            <div className="card-header" style={{ color: assistanceSaved ? "#10b981" : "#ef4444" }}>
              <span>CONFIRMATION ASSISTANCE OBLIGATOIRE</span>
            </div>
            <p style={{ fontSize: "11px", color: assistanceSaved ? "#a7f3d0" : "#fca5a5", margin: "0 0 15px 0", fontWeight: "600", lineHeight: "1.4" }}>
              L'enregistrement du contact assistance est requis pour valider votre intégration de coursier et confirmer vos accès aux contrôles des reçus.
            </p>
            <button
              type="button"
              className="btn-wa-vendeur"
              style={{
                width: "100%", padding: "12px", background: assistanceSaved ? "#10b981" : "#25d366",
                color: "white", border: "none", borderRadius: "12px", fontWeight: "800",
                fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: "8px", boxShadow: "0 4px 12px rgba(37, 211, 102, 0.2)"
              }}
              onClick={() => { openWhatsApp("Coursier Pro MAMBO : Enregistrement Assistance"); setAssistanceSaved(true); }}
            >
              {assistanceSaved ? (
                <>
                  <CheckCircle2 size={16} /> CONTACT ASSISTANCE ENREGISTRÉ
                </>
              ) : (
                "ENREGISTRER LE CONTACT ASSISTANCE"
              )}
            </button>
          </section>

          {loading && loadingStep && (
            <div className="loading-step-indicator" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '12px', padding: '12px', margin: '15px 0', fontSize: '12px', fontWeight: '700', color: '#10b981' }}>
              <Loader2 className="animate-spin" size={16} />
              <span>{loadingStep}</span>
            </div>
          )}

          <button 
            type="submit" 
            className="btn-sticky" 
            disabled={loading || !assistanceSaved || pattern.length < 3}
            style={(!assistanceSaved || loading) ? { backgroundColor: "#cbd5e1", color: "#64748b", cursor: "not-allowed" } : {}}
          >
            {loading ? <Loader2 className="animate-spin" size={20}/> : "FINALISER MON COMPTE"}
          </button>
        </form>
      </div>

      <style>{`
        .premium-container { height: 100vh; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; overflow: hidden; position: relative; }
        .premium-header { padding: 40px 20px 20px; text-align: center; position: relative; }
        .back-btn { position: absolute; left: 20px; top: 40px; background: none; border: none; color: white; cursor: pointer; }
        .premium-header h1 { font-size: 13px; margin: 0; }
        .premium-scroll-zone { flex: 1; overflow-y: auto; padding: 0 20px 100px; }
        .glass-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 20px; margin-bottom: 20px; transition: all 0.3s ease; }
        .card-header { color: #cbd5e1; font-size: 10px; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .pro-input { width: 100%; padding: 10px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; color: #ffffff; margin-bottom: 10px; box-sizing: border-box; font-weight: 600; font-size: 14px; }
        .input-wrap { position: relative; display: flex; align-items: center; }
        .input-icon { position: absolute; left: 10px; color: #64748b; }
        .pro-input { padding-left: 35px; }
        .upload-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
        .box { height: 100px; border: 1px dashed #475569; border-radius: 15px; display: flex; align-items: center; justify-content: center; color: #94a3b8; overflow: hidden; cursor: pointer; }
        .chips-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .chip { padding: 12px; background: #1e293b; color: #e2e8f0; border-radius: 12px; font-size: 12px; cursor: pointer; text-align: center; border: 1px solid transparent; transition: 0.3s; }
        .chip.active { background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; font-weight: 600; }
        .btn-sticky { position: absolute; bottom: 20px; left: 20px; right: 20px; padding: 18px; background: #10b981; border: none; border-radius: 15px; color: white; font-weight: 900; cursor: pointer; width: calc(100% - 40px); transition: all 0.3s ease; }
        .lock-wrap { display: flex; justify-content: center; }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}