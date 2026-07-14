import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Store, User, Phone, MapPin, Mail,
  Image as ImageIcon, FileCheck, Navigation,
  Loader2, QrCode, CheckCircle2, Lock, ArrowLeft
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock";
import CategorieDynamique from "../components/CategorieDynamique";
import {
  cleanPhone, generatePatternPassword,
  validateFileSize, openWhatsApp, authErrorMessage,
} from "../mamboUtils";
import "react-toastify/dist/ReactToastify.css";

const CLOUDINARY_PRESET = "mambo_upload"; // preset Unsigned créé dans Cloudinary Settings > Upload
const CLOUDINARY_CLOUD  = "dh157ll3x";

// --- CLOUDINARY ---
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

// --- Écriture Firestore avec retry ---
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

// --- COMPOSANTS UI ---
const FormGroup = ({ icon, children }) => (
  <div className="vendeur-input-group">
    <div className="input-icon-box">{icon}</div>
    {children}
  </div>
);

const UploadCard = ({ id, preview, label, icon, onChange }) => (
  <div className="vendeur-upload-item">
    <input type="file" id={id} hidden onChange={onChange} accept="image/*" />
    <label htmlFor={id} className={`vendeur-drop-zone ${preview ? "active" : ""}`}>
      {preview
        ? <img src={preview} alt="Preview" />
        : <div className="placeholder-content">{icon}<span>{label}</span></div>}
    </label>
  </div>
);

export default function VendeurSignup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [locating, setLocating] = useState(false);
  const [assistanceSaved, setAssistanceSaved] = useState(false);
  const [pattern, setPattern] = useState([]);
  const [categorie, setCategorie] = useState("boutique");

  // ✅ shopImages contient des objets { file: File, preview: string }
  const [shopImages, setShopImages] = useState([]);

  const [form, setForm] = useState({
    nomComplet: "", nomBoutique: "", enseigne: "",
    telephone: "", email: "", adresse: "", lat: null, lng: null
  });
  const [files, setFiles] = useState({ logo: null, cni: null, waveQr: null });
  const [previews, setPreviews] = useState({ logo: null, cni: null, waveQr: null });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const handleNomCompletChange = (e) =>
    setForm({ ...form, nomComplet: e.target.value.toUpperCase() });

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateFileSize(file);
    if (err) return toast.error(err);
    setFiles(p => ({ ...p, [type]: file }));
    setPreviews(p => ({ ...p, [type]: URL.createObjectURL(file) }));
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) return toast.error("GPS non supporté");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(p => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setLocating(false);
        toast.success("GPS OK !");
      },
      () => { setLocating(false); toast.error("Activez votre GPS."); },
      { enableHighAccuracy: true }
    );
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    const phone = cleanPhone(form.telephone);
    const cleanEmail = form.email.trim().toLowerCase();

    if (phone.length !== 10)       return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    if (!cleanEmail.includes("@") || cleanEmail.length < 5) return toast.error("Adresse email invalide.");
    if (pattern.length < 3)       return toast.error("Schéma de sécurité trop court (3 points min).");
    if (!form.lat)                 return toast.error("Position GPS requise.");
    if (!files.cni || !files.waveQr) return toast.error("CNI et QR Wave obligatoires.");
    if (!assistanceSaved)          return toast.warning("Enregistrez le contact assistance.");

    // ✅ Extraire les vrais File objects depuis shopImages
    const shopFiles = shopImages
      .map(item => item?.file)
      .filter(f => f instanceof File && f.size > 0);

    if (shopFiles.length === 0) {
      return toast.error("Ajoutez la photo de votre commerce.");
    }

    setLoading(true);

    try {
      // ÉTAPE 1 : Uploads Cloudinary (avant création du compte)
      setLoadingStep("Téléversement de la photo du commerce...");
      const shopURLs = await Promise.all(shopFiles.map(f => uploadToCloudinary(f)));

      setLoadingStep("Téléversement des documents officiels...");
      const logoURL   = files.logo ? await uploadToCloudinary(files.logo) : "";
      const cniURL    = await uploadToCloudinary(files.cni);
      const waveQrURL = await uploadToCloudinary(files.waveQr);

      // ÉTAPE 2 : Création compte Firebase Auth (l'unicité de l'email technique bloque nativement les doublons)
      setLoadingStep("Création du compte...");
      const emailTechnique = `${phone}@livraison-moto.firebaseapp.com`;
      const motDePasse = generatePatternPassword(pattern, phone);
      const { user } = await createUserWithEmailAndPassword(auth, emailTechnique, motDePasse);

      // ÉTAPE 3 : Forcer propagation du token
      setLoadingStep("Sécurisation du compte...");
      await user.getIdToken(true);
      await new Promise(res => setTimeout(res, 1000));

      // ÉTAPE 4 : Écriture Firestore avec retry
      setLoadingStep("Enregistrement de la boutique...");
      const payload = {
        uid: user.uid,
        nomComplet: form.nomComplet.toUpperCase().trim(),
        nomBoutique: form.nomBoutique.trim(),
        enseigne: form.enseigne.trim() || form.nomBoutique.trim(),
        telephone: phone,
        email: emailTechnique,
        emailPersonnel: cleanEmail,
        adresse: form.adresse.trim(),
        geoloc: { lat: form.lat, lng: form.lng },
        categorie,
        shopPhotos: shopURLs,
        photoURL: logoURL,
        cniURL,
        waveQrURL,
        role: "vendeur",
        isActive: true,
        isVerified: true,
        solde: 0,
        method: "pattern",
        mamboLockPattern: pattern.join("-"),
        createdAt: serverTimestamp()
      };

      await setDocWithRetry(doc(db, "users", user.uid), payload);

      setLoadingStep("");
      
      setTimeout(() => navigate("/vendeur-dashboard"), 2000);

    } catch (err) {
      console.error("Erreur inscription vendeur :", err.code, err.message);
      setLoadingStep("");
      if (err.code === "auth/email-already-in-use") {
        toast.error("Ce numéro de téléphone est déjà enregistré.");
      } else if (err.code === "permission-denied") {
        toast.error("Erreur d'autorisation base de données. Réessayez.");
      } else {
        toast.error(err.message || authErrorMessage(err.code) || "Erreur lors de l'inscription.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vendeur-page-container">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      <button onClick={() => navigate(-1)} className="vendeur-back-btn" type="button">
        <ArrowLeft size={20} />
      </button>

      <div className="vendeur-scroll-box">
        <header className="vendeur-header">
          <div className="vendeur-icon"><Store size={35} color="white" /></div>
          <h1>Devenir Vendeur</h1>
          <p>INSCRIPTION SÉCURISÉE MAMBO</p>
        </header>

        <form onSubmit={handleSignup} className="vendeur-form">

          <div className="section-title-premium">TYPE DE COMMERCE</div>
          <CategorieDynamique mode="selection" categorie={categorie} onSelect={(id) => { setCategorie(id); setShopImages([]); }} />

          <div className="section-title-premium">PHOTO DU COMMERCE</div>
          <CategorieDynamique
            mode="photos-only"
            categorie={categorie}
            images={shopImages}
            setImages={setShopImages}
            maxPhotos={1}
          />

          <div className="section-title-premium">DOCUMENTS OFFICIELS</div>
          <div className="vendeur-grid-uploads">
            <UploadCard id="l" label="Logo"    icon={<ImageIcon />}            preview={previews.logo}   onChange={e => handleFileChange(e, "logo")} />
            <UploadCard id="c" label="Ma CNI"  icon={<FileCheck />}            preview={previews.cni}    onChange={e => handleFileChange(e, "cni")} />
            <UploadCard id="q" label="Wave QR" icon={<QrCode color="#1c93e4"/>} preview={previews.waveQr} onChange={e => handleFileChange(e, "waveQr")} />
          </div>

          <div className="section-title-premium">INFORMATIONS GÉNÉRALES</div>
          <FormGroup icon={<User size={18} />}>
            <input type="text" placeholder="NOM COMPLET (CNI)" value={form.nomComplet} onChange={handleNomCompletChange} required />
          </FormGroup>
          <FormGroup icon={<Store size={18} />}>
            <input type="text" placeholder="Nom de la boutique" value={form.nomBoutique} onChange={e => setForm({ ...form, nomBoutique: e.target.value })} required />
          </FormGroup>
          <FormGroup icon={<Mail size={18} />}>
            <input type="email" placeholder="Adresse email personnelle" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </FormGroup>
          <FormGroup icon={<Phone size={18} />}>
            <input type="tel" placeholder="Numéro whatsapp (Ex: 0707070707)" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} required />
          </FormGroup>

          <div className="vendeur-row-gps">
            <FormGroup icon={<MapPin size={18} />}>
              <input type="text" placeholder="Adresse physique" value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} required />
            </FormGroup>
            <button type="button" onClick={handleGetLocation} className={`vendeur-gps-btn ${form.lat ? "done" : ""}`}>
              {locating ? <Loader2 className="animate-spin" size={20} /> : <Navigation size={20} />}
            </button>
          </div>

          <div className="pattern-security-box">
            <div className="pattern-header"><Lock size={14} /> DÉFINISSEZ VOTRE SCHÉMA D'ACCÈS</div>
            <div className="lock-wrapper">
              <MamboLock onChange={(val) => setPattern(val)} size={240} />
            </div>
          </div>

          <div className={`vendeur-assistance ${assistanceSaved ? "saved" : ""}`}>
            <p>L'enregistrement du contact assistance est requis pour valider votre compte et authentifier les transactions de paiement par reçu Wave.</p>
            <button
              type="button"
              className="btn-wa-vendeur"
              onClick={() => { openWhatsApp("Vendeur MAMBO : Enregistrement Assistance"); setAssistanceSaved(true); }}
            >
              {assistanceSaved
                ? <><CheckCircle2 size={16} /> CONTACT ASSISTANCE ENREGISTRÉ</>
                : "ENREGISTRER LE CONTACT ASSISTANCE"}
            </button>
          </div>

          {loading && loadingStep && (
            <div className="loading-step-indicator">
              <Loader2 className="animate-spin" size={16} />
              <span>{loadingStep}</span>
            </div>
          )}

          <button
            type="submit"
            className="vendeur-btn-main"
            disabled={loading || !assistanceSaved || pattern.length < 3}
          >
            {loading ? <Loader2 className="animate-spin" size={22} /> : "VALIDER MON INSCRIPTION"}
          </button>

        </form>
      </div>

      <style>{`
        .vendeur-page-container { height: 100vh; background: #0f172a; display: flex; justify-content: center; padding: 10px; overflow: hidden; position: relative; }
        .vendeur-back-btn { position: absolute; top: 25px; left: 20px; z-index: 100; background: rgba(77,55,66,0.8); border: 1px solid rgba(88,33,55,1); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: #fff; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s, transform 0.2s; }
        .vendeur-back-btn:hover { background: rgba(255,255,255,0.2); transform: translateX(-2px); }
        .vendeur-scroll-box { width: 100%; max-width: 440px; background: white; border-radius: 30px; padding: 20px; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
        .vendeur-header { text-align: center; margin-bottom: 20px; }
        .vendeur-header h1 { font-size: 22px; font-weight: 900; color: #1e293b; margin: 10px 0 2px; }
        .vendeur-header p { font-size: 11px; font-weight: 700; color: #10b981; letter-spacing: 1px; }
        .vendeur-icon { background: #10b981; width: 55px; height: 55px; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
        .section-title-premium { font-size: 11px; font-weight: 800; color: #94a3b8; margin: 25px 0 12px; letter-spacing: 1px; text-transform: uppercase; }
        .vendeur-grid-uploads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        .vendeur-drop-zone { height: 90px; background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 16px; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; transition: 0.3s; }
        .vendeur-drop-zone.active { border-color: #10b981; background: #f0fdf4; border-style: solid; }
        .placeholder-content { display: flex; flex-direction: column; align-items: center; color: #94a3b8; gap: 4px; }
        .placeholder-content span { font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .vendeur-drop-zone img { width: 100%; height: 100%; object-fit: cover; }
        .vendeur-input-group { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; display: flex; align-items: center; padding: 0 15px; margin-bottom: 10px; }
        .input-icon-box { color: #94a3b8; margin-right: 12px; display: flex; }
        .vendeur-input-group input { width: 100%; border: none; background: transparent; padding: 14px 0; font-weight: 600; font-size: 14px; color: #1e293b; outline: none; }
        .vendeur-row-gps { display: flex; gap: 10px; }
        .vendeur-gps-btn { width: 55px; height: 50px; background: #f1f5f9; border: none; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #64748b; cursor: pointer; flex-shrink: 0; }
        .vendeur-gps-btn.done { background: #10b981; color: white; }
        .pattern-security-box { background: #f8fafc; border-radius: 25px; padding: 20px; text-align: center; margin: 20px 0; border: 1.5px solid #e2e8f0; }
        .pattern-header { font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .lock-wrapper { background: white; border-radius: 20px; padding: 10px; display: inline-block; box-shadow: 0 5px 15px rgba(0,0,0,0.05); touch-action: none; }
        .vendeur-assistance { background: #fff9f9; border: 1.5px dashed #ef4444; border-radius: 20px; padding: 15px; text-align: center; margin-bottom: 20px; }
        .vendeur-assistance p { font-size: 11px; color: #ef4444; font-weight: 600; margin-bottom: 12px; line-height: 1.4; }
        .btn-wa-vendeur { width: 100%; padding: 12px; background: #25d366; color: white; border: none; border-radius: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .vendeur-assistance.saved { border-color: #10b981; background: #f0fdf4; }
        .vendeur-assistance.saved p { color: #10b981; }
        .vendeur-assistance.saved .btn-wa-vendeur { background: #10b981; }
        .loading-step-indicator { display: flex; align-items: center; justify-content: center; gap: 8px; background: #f0fdf4; border: 1px solid #10b981; border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px; font-weight: 700; color: #10b981; }
        .vendeur-btn-main { width: 100%; padding: 18px; background: #10b981; color: white; border: none; border-radius: 18px; font-size: 16px; font-weight: 900; cursor: pointer; }
        .vendeur-btn-main:disabled { background: #cbd5e1; cursor: not-allowed; }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 500px) { .vendeur-back-btn { top: 15px; left: 15px; width: 38px; height: 38px; } }
      `}</style>
    </div>
  );
}