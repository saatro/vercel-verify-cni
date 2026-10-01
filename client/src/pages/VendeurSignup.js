import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Store, User, Phone, MapPin, Mail,
  Image as ImageIcon, FileCheck, Navigation,
  Loader2, QrCode, CheckCircle2, Lock, ArrowLeft, Globe
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import MamboLock from "../components/MamboLock";
import CategorieDynamique from "../components/CategorieDynamique";
import {
  cleanPhone, generatePatternPassword,
  validateFileSize, openWhatsApp, authErrorMessage,
} from "../mamboUtils";
import "react-toastify/dist/ReactToastify.css";

const CLOUDINARY_PRESET = "mambo_upload";
const CLOUDINARY_CLOUD  = "dh157ll3x";

// Endpoint Render pour la vérification CNI par OCR
const VERCEL_CNI_VERIFY_URL = "https://mambo-5bt2.onrender.com/api/verify-cni";

const isProCat = (c) => {
  const s = String(c || "").toLowerCase().trim();
  const allowedProCats = ["supermarche", "supermarché", "boutique", "resto", "restaurant", "fastfood", "fast-food", "sante", "santé"];
  return allowedProCats.includes(s);
};

const isValidRccmFormat = (value) => {
  const v = String(value || "").toUpperCase().replace(/\s+/g, "");
  return (
    /^CI-[A-Z]{2,4}-\d{2}-\d{4}-[A-Z0-9]{2,4}-\d{4,6}$/.test(v) ||
    /^CI-[A-Z]{2,4}-\d{4}-[A-Z0-9]{2,4}-\d{4,6}$/.test(v)
  );
};

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
      const isPermission =
        err.code === "permission-denied" || err.code === "firestore/permission-denied";
      if (isPermission && attempt < maxRetries) {
        if (auth.currentUser) await auth.currentUser.getIdToken(true);
        await new Promise((res) => setTimeout(res, attempt * 1000));
      } else {
        throw err;
      }
    }
  }
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verifyCniWithServer({ file, expectedName, onStatus }) {
  onStatus?.("Préparation de l'image de la CNI...");
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const imageBase64 = btoa(binary);

  onStatus?.("Analyse OCR sur le serveur...");

  let res;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetchWithTimeout(
        VERCEL_CNI_VERIFY_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64, expectedName }),
        },
        60000
      );
      break;
    } catch (err) {
      const isLastAttempt = attempt === maxAttempts;
      console.warn(`verify-cni tentative ${attempt}/${maxAttempts} échouée :`, err);
      if (isLastAttempt) {
        if (err.name === "AbortError") {
          throw new Error("Le serveur met trop de temps à répondre (Timeout). Réessayez.");
        }
        throw new Error("Impossible de joindre le serveur pour la vérification CNI. Réessayez.");
      }
      onStatus?.("Nouvelle tentative de vérification...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    throw new Error("Réponse OCR invalide ou indisponible. Réessayez.");
  }

  if (!res.ok || data.verified === false) {
    let errorMsg = "CNI non validée par OCR.";
    
    if (typeof data.error === "string") {
      errorMsg = data.error;
    } else if (data.error && typeof data.error.message === "string") {
      errorMsg = data.error.message;
    } else if (Array.isArray(data.reasons) && data.reasons.length > 0) {
      errorMsg = data.reasons.join(" · ");
    }

    throw new Error(errorMsg);
  }
  return data;
}

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
  const [shopImages, setShopImages] = useState([]);

  const [form, setForm] = useState({
    nomComplet: "",
    nomBoutique: "",
    enseigne: "",
    telephone: "",
    email: "",
    adresse: "",
    zoneGeographique: "Abidjan",
    lat: null,
    lng: null,
    raisonSociale: "",
    rccmNumber: "",
    iduNumber: "",
  });

  const [files, setFiles] = useState({
    logo: null,
    cni: null,
    waveQr: null,
    rccmDoc: null,
  });
  const [previews, setPreviews] = useState({
    logo: null,
    cni: null,
    waveQr: null,
    rccmDoc: null,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleNomCompletChange = (e) =>
    setForm({ ...form, nomComplet: e.target.value.toUpperCase() });

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateFileSize(file);
    if (err) return toast.error(err);
    setFiles((p) => ({ ...p, [type]: file }));
    setPreviews((p) => ({ ...p, [type]: URL.createObjectURL(file) }));
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) return toast.error("GPS non supporté");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((p) => ({
          ...p,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
        setLocating(false);
        toast.success("GPS OK !");
      },
      () => {
        setLocating(false);
        toast.error("Activez votre GPS.");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    const phone = cleanPhone(form.telephone);
    const cleanEmail = form.email.trim().toLowerCase();
    
    const isRuralZone = form.zoneGeographique && form.zoneGeographique !== "Abidjan";
    const proMode = isProCat(categorie) && !isRuralZone;

    if (phone.length !== 10)
      return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    if (!cleanEmail.includes("@") || cleanEmail.length < 5)
      return toast.error("Adresse email invalide.");
    if (pattern.length < 3)
      return toast.error("Schéma de sécurité trop court (3 points min).");
    if (!form.lat) return toast.error("Position GPS requise.");
    if (!files.cni || !files.waveQr)
      return toast.error("CNI et QR Wave obligatoires.");
    if (!assistanceSaved)
      return toast.warning("Enregistrez le contact assistance.");
    if (!form.nomComplet.trim())
      return toast.error("Nom complet obligatoire (doit correspondre à la CNI).");

    if (proMode && form.raisonSociale?.trim() && !isValidRccmFormat(form.rccmNumber) && form.rccmNumber?.trim()) {
      toast.warning(
        "Format RCCM invalide (ex: CI-ABJ-03-2024-B13-01234) — la boutique sera créée non certifiée."
      );
    }

    const legalDocsProvided = !!(
      proMode &&
      form.raisonSociale?.trim() &&
      isValidRccmFormat(form.rccmNumber) &&
      files.rccmDoc
    );

    const shopFiles = shopImages
      .map((item) => item?.file)
      .filter((f) => f instanceof File && f.size > 0);

    if (shopFiles.length === 0) {
      return toast.error("Ajoutez la photo de votre commerce.");
    }

    setLoading(true);

    try {
      setLoadingStep("Vérification de la CNI (OCR)...");
      const cniCheck = await verifyCniWithServer({
        file: files.cni,
        expectedName: form.nomComplet,
        onStatus: (msg) => setLoadingStep(msg),
      });

      setLoadingStep("Téléversement de la photo du commerce...");
      const shopURLs = await Promise.all(shopFiles.map((f) => uploadToCloudinary(f)));

      setLoadingStep("Téléversement des documents officiels...");
      const logoURL = files.logo ? await uploadToCloudinary(files.logo) : "";
      const cniURL = await uploadToCloudinary(files.cni);
      const waveQrURL = await uploadToCloudinary(files.waveQr);
      const rccmDocURL = (proMode && files.rccmDoc)
        ? await uploadToCloudinary(files.rccmDoc)
        : "";

      setLoadingStep("Création du compte...");
      const emailTechnique = `${phone}@livraison-moto.firebaseapp.com`;
      const motDePasse = generatePatternPassword(pattern, phone);
      const { user } = await createUserWithEmailAndPassword(
        auth,
        emailTechnique,
        motDePasse
      );

      setLoadingStep("Sécurisation du compte...");
      await user.getIdToken(true);
      await new Promise((res) => setTimeout(res, 1000));

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
        zoneGeographique: form.zoneGeographique,
        isRuralZone,
        geoloc: { lat: form.lat, lng: form.lng },
        categorie,
        shopPhotos: shopURLs,
        photoURL: logoURL,
        cniURL,
        waveQrURL,
        role: "vendeur",
        isActive: true,
        isVerified: false,
        pendingAdminReview: true,
        verificationStatus: legalDocsProvided
          ? "pending_rccm_and_cni"
          : "pending_cni_ok",
        legalCertified: legalDocsProvided,
        solde: 0,
        method: "pattern",
        mamboLockPattern: pattern.join("-"),
        createdAt: serverTimestamp(),

        cniNumber: cniCheck.cniNumber || "",
        cniOcrName: cniCheck.extractedName || cniCheck.fullName || "",
        cniExpiry: cniCheck.expiry || "",
        cniMatchScore: cniCheck.score ?? null,
        cniVerifiedAt: serverTimestamp(),

        ...(form.raisonSociale?.trim() && {
          raisonSociale: form.raisonSociale.trim().toUpperCase(),
        }),
        ...(form.rccmNumber?.trim() && {
          rccmNumber: form.rccmNumber.trim().toUpperCase(),
        }),
        ...(form.iduNumber?.trim() && {
          iduNumber: form.iduNumber.trim().toUpperCase(),
        }),
        ...(rccmDocURL && { rccmDocURL }),
      };

      await setDocWithRetry(doc(db, "users", user.uid), payload);

      setLoadingStep("");
      toast.success(
        legalDocsProvided
          ? "Inscription OK. Compte en attente de validation RCCM + admin."
          : proMode
            ? "Inscription OK (sans documents légaux — boutique non certifiée, paiement à la livraison uniquement). Compte en attente de validation Mambo."
            : "Inscription OK (Zone rurale allégée). Compte en attente de validation Mambo."
      );
      setTimeout(() => navigate("/vendeur-dashboard"), 2200);
    } catch (err) {
      console.error("Erreur inscription vendeur :", err);
      setLoadingStep("");
      if (err.code === "auth/email-already-in-use") {
        toast.error("Ce numéro de téléphone est déjà enregistré.");
      } else if (err.code === "permission-denied") {
        toast.error("Erreur d'autorisation base de données. Réessayez.");
      } else {
        toast.error(
          err.message ||
            authErrorMessage(err.code) ||
            "Erreur lors de l'inscription."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const isRuralZoneSelected = form.zoneGeographique && form.zoneGeographique !== "Abidjan";
  const proModeActive = isProCat(categorie) && !isRuralZoneSelected;

  return (
    <div className="vendeur-page-container">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      <button
        onClick={() => navigate(-1)}
        className="vendeur-back-btn"
        type="button"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="vendeur-scroll-box">
        <header className="vendeur-header">
          <div className="vendeur-icon">
            <Store size={35} color="white" />
          </div>
          <h1>Devenir Vendeur</h1>
          <p>INSCRIPTION SÉCURISÉE MAMBO</p>
        </header>

        <form onSubmit={handleSignup} className="vendeur-form-grid">
          
          {/* SECTION PLEINE LARGEUR : ZONE GÉOGRAPHIQUE */}
          <div className="vendeur-full-span">
            <div className="section-title-premium">ZONE GÉOGRAPHIQUE</div>
            <FormGroup icon={<Globe size={18} />}>
              <select
                value={form.zoneGeographique}
                onChange={(e) => setForm({ ...form, zoneGeographique: e.target.value })}
                style={{ width: "100%", border: "none", background: "transparent", padding: "14px 0", fontWeight: "600", fontSize: "14px", color: "#1e293b", outline: "none" }}
              >
                <option value="Abidjan">Abidjan (Urbain - Soumis aux règles standard)</option>
                <option value="Alépé">Alépé (Zone rurale - Procédure allégée)</option>
                <option value="Grand-Bassam">Grand-Bassam (Zone externe - Procédure allégée)</option>
                <option value="Bingerville">Bingerville / Périphérie</option>
                <option value="Dabou">Dabou (Zone rurale - Procédure allégée)</option>
                <option value="Autre">Autre localité / Hors Abidjan</option>
              </select>
            </FormGroup>

            {isRuralZoneSelected && (
              <div style={{ background: "#f0fdf4", border: "1px solid #10b981", borderRadius: "12px", padding: "10px 14px", marginTop: "8px", fontSize: "11px", color: "#065f46", fontWeight: "600" }}>
                🌾 <strong>Zone rurale / Allégée :</strong> Aucune formalité RCCM lourde n&apos;est exigée pour le petit commerce local.
              </div>
            )}
          </div>

          {/* COLONNE DE GAUCHE : TYPE, PHOTO ET INFOS GÉNÉRALES */}
          <div className="vendeur-column">
            <div className="section-title-premium">TYPE DE COMMERCE</div>
            <CategorieDynamique
              mode="selection"
              categorie={categorie}
              onSelect={(id) => {
                setCategorie(id);
                setShopImages([]);
              }}
            />

            <div className="section-title-premium">PHOTO DU COMMERCE</div>
            <CategorieDynamique
              mode="photos-only"
              categorie={categorie}
              images={shopImages}
              setImages={setShopImages}
              maxPhotos={1}
            />

            <div className="section-title-premium">INFORMATIONS GÉNÉRALES</div>

            <FormGroup icon={<User size={18} />}>
              <input
                type="text"
                placeholder="NOM COMPLET (CNI)"
                value={form.nomComplet}
                onChange={handleNomCompletChange}
                required
              />
            </FormGroup>
            <FormGroup icon={<Store size={18} />}>
              <input
                type="text"
                placeholder="Nom de la boutique"
                value={form.nomBoutique}
                onChange={(e) =>
                  setForm({ ...form, nomBoutique: e.target.value })
                }
                required
              />
            </FormGroup>
            <FormGroup icon={<Mail size={18} />}>
              <input
                type="email"
                placeholder="Adresse email personnelle"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup icon={<Phone size={18} />}>
              <input
                type="tel"
                placeholder="Numéro whatsapp (Ex: 0707070707)"
                value={form.telephone}
                onChange={(e) =>
                  setForm({ ...form, telephone: e.target.value })
                }
                required
              />
            </FormGroup>

            <div className="vendeur-row-gps">
              <FormGroup icon={<MapPin size={18} />}>
                <input
                  type="text"
                  placeholder="Adresse physique précise"
                  value={form.adresse}
                  onChange={(e) =>
                    setForm({ ...form, adresse: e.target.value })
                  }
                  required
                />
              </FormGroup>
              <button
                type="button"
                onClick={handleGetLocation}
                className={`vendeur-gps-btn ${form.lat ? "done" : ""}`}
              >
                {locating ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Navigation size={20} />
                )}
              </button>
            </div>
          </div>

          {/* COLONNE DE DROITE : DOCUMENTS & SÉCURITÉ */}
          <div className="vendeur-column">
            <div className="section-title-premium">DOCUMENTS OFFICIELS</div>
            <div className="vendeur-grid-uploads">
              <UploadCard
                id="l"
                label="Logo"
                icon={<ImageIcon />}
                preview={previews.logo}
                onChange={(e) => handleFileChange(e, "logo")}
              />
              <UploadCard
                id="c"
                label="Ma CNI"
                icon={<FileCheck />}
                preview={previews.cni}
                onChange={(e) => handleFileChange(e, "cni")}
              />
              <UploadCard
                id="q"
                label="Wave QR"
                icon={<QrCode color="#1c93e4" />}
                preview={previews.waveQr}
                onChange={(e) => handleFileChange(e, "waveQr")}
              />
            </div>
            <p className="cni-hint">
              La CNI sera vérifiée automatiquement (OCR). Le nom saisi doit
              correspondre à la carte.
            </p>

            {proModeActive && (
              <>
                <div className="section-title-premium">
                  DOCUMENTS LÉGAUX (COMMERCE PRO - ABIDJAN)
                </div>
                <p className="legal-intro">
                  Ce type de commerce à Abidjan requiert normalement une immatriculation.
                  Renseigner votre <strong>Raison sociale</strong>, votre <strong>RCCM</strong> et le
                  document officiel correspondant est <strong>optionnel</strong>, mais vous permet
                  d'obtenir le badge « Boutique certifiée » et de proposer le paiement en ligne
                  Wave à vos clients. Sans ces documents, votre boutique reste active mais
                  affichera un badge orange « non certifiée » et ne pourra recevoir que des
                  commandes payées à la livraison.
                </p>

                <FormGroup icon={<Store size={18} />}>
                  <input
                    type="text"
                    placeholder="Raison sociale (comme sur le RCCM) — optionnel"
                    value={form.raisonSociale}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        raisonSociale: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </FormGroup>

                <FormGroup icon={<FileCheck size={18} />}>
                  <input
                    type="text"
                    placeholder="N° RCCM (ex: CI-ABJ-03-2024-B13-01234) — optionnel"
                    value={form.rccmNumber}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rccmNumber: e.target.value.toUpperCase().trim(),
                      })
                    }
                  />
                </FormGroup>

                <div className="vendeur-grid-uploads" style={{ marginTop: "10px" }}>
                  <UploadCard
                    id="rccmDoc"
                    label="Scan RCCM"
                    icon={<FileCheck color="#10b981" />}
                    preview={previews.rccmDoc}
                    onChange={(e) => handleFileChange(e, "rccmDoc")}
                  />
                </div>
              </>
            )}

            <div className="pattern-security-box">
              <div className="pattern-header">
                <Lock size={13} /> DÉFINISSEZ VOTRE SCHÉMA D&apos;ACCÈS
              </div>
              <div className="lock-wrapper">
                <MamboLock onChange={(val) => setPattern(val)} size={200} />
              </div>
            </div>
          </div>

          {/* SECTION PLEINE LARGEUR : ASSISTANCE & VALIDATION */}
          <div className="vendeur-full-span">
            <div
              className={`vendeur-assistance ${assistanceSaved ? "saved" : ""}`}
            >
              <p>
                L&apos;enregistrement du contact assistance est requis pour
                valider votre compte et authentifier les transactions Wave.
              </p>
              <button
                type="button"
                className="btn-wa-vendeur"
                onClick={() => {
                  openWhatsApp("Vendeur MAMBO : Enregistrement Assistance");
                  setAssistanceSaved(true);
                }}
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
              {loading ? (
                <Loader2 className="animate-spin" size={22} />
              ) : (
                "VALIDER MON INSCRIPTION"
              )}
            </button>
          </div>

        </form>
      </div>

      <style>{`
        .vendeur-page-container { height: 100vh; background: #0f172a; display: flex; justify-content: center; align-items: center; padding: 15px; overflow: hidden; position: relative; }
        .vendeur-back-btn { position: absolute; top: 25px; left: 20px; z-index: 100; background: rgba(77,55,66,0.8); border: 1px solid rgba(88,33,55,1); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: #fff; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s, transform 0.2s; }
        .vendeur-back-btn:hover { background: rgba(255,255,255,0.2); transform: translateX(-2px); }
        
        .vendeur-scroll-box { width: 100%; max-width: 480px; background: white; border-radius: 30px; padding: 25px; overflow-y: auto; max-height: 92vh; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
        
        @media (min-width: 850px) {
          .vendeur-scroll-box { max-width: 950px; padding: 35px; }
        }

        .vendeur-header { text-align: center; margin-bottom: 20px; }
        .vendeur-header h1 { font-size: 22px; font-weight: 900; color: #1e293b; margin: 10px 0 2px; }
        .vendeur-header p { font-size: 11px; font-weight: 700; color: #10b981; letter-spacing: 1px; }
        .vendeur-icon { background: #10b981; width: 55px; height: 55px; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
        
        .vendeur-form-grid { display: flex; flex-direction: column; gap: 15px; }
        @media (min-width: 850px) {
          .vendeur-form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
          }
          .vendeur-full-span {
            grid-column: span 2;
          }
        }

        .section-title-premium { font-size: 11px; font-weight: 800; color: #94a3b8; margin: 20px 0 10px; letter-spacing: 1px; text-transform: uppercase; }
        .cni-hint { font-size: 11px; color: #64748b; margin: -8px 0 12px; line-height: 1.35; }
        .legal-intro { font-size: 11px; color: #64748b; margin-bottom: 12px; line-height: 1.4; }
        
        .vendeur-grid-uploads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        .vendeur-drop-zone { height: 90px; background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 16px; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; transition: 0.3s; }
        .vendeur-drop-zone.active { border-color: #10b981; background: #f0fdf4; border-style: solid; }
        .placeholder-content { display: flex; flex-direction: column; align-items: center; color: #94a3b8; gap: 4px; }
        .placeholder-content span { font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .vendeur-drop-zone img { width: 100%; height: 100%; object-fit: cover; }
        
        .vendeur-input-group { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; display: flex; align-items: center; padding: 0 5px; margin-bottom: 10px; }
        .input-icon-box { color: #94a3b8; margin-right: 12px; display: flex; }
        .vendeur-input-group input { width: 100%; border: none; background: transparent; padding: 14px 0; font-weight: 600; font-size: 14px; color: #1e293b; outline: none; }
        
        .vendeur-row-gps { display: flex; gap: 10px; }
        .vendeur-gps-btn { width: 55px; height: 50px; background: #f1f5f9; border: none; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #64748b; cursor: pointer; flex-shrink: 0; }
        .vendeur-gps-btn.done { background: #10b981; color: white; }
        
        .pattern-security-box { background: #f8fafc; border-radius: 25px; padding: 10px; text-align: center; margin: 15px 0; border: 1.5px solid #e2e8f0; }
        .pattern-header { font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .lock-wrapper { background: white; border-radius: 20px; padding: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); touch-action: none; display: flex; justify-content: center; }
        
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
        
        @media (max-width: 500px) { 
          .vendeur-back-btn { top: 15px; left: 15px; width: 38px; height: 38px; } 
        }
      `}</style>
    </div>
  );
}