import React, { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import {
  doc,
  serverTimestamp,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Upload,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { auth, db } from "../firebase";
import WelcomeModal from "./WelcomeModal";
import MamboLock from "../components/MamboLock";
import { cleanPhone, generatePatternPassword, openWhatsApp } from "../mamboUtils";
import "./InscriptionLivreurSecteurs.css";

import motoChapImg from "../assets/moto-chap.png";
import vtcConfortImg from "../assets/vtc-confort.png";
import taxiCompteurImg from "../assets/car-taxiCompteur.png";
import taxiEcoImg from "../assets/taxi-eco.png";
import carSuvImg from "../assets/car-suv.png";
import taxiConfortImg from "../assets/taxi-confort.png";
import motoDefaultImg from "../assets/moto.png";
import vtcDefaultImg from "../assets/vtc.png";
import saloniImg from "../assets/saloni.png";
import antaraImg from "../assets/antara.png";

const API_BASE =
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_SERVER_URL ||
  "https://mambo-5bt2.onrender.com";

const CLOUDINARY_PRESET = "mambo_upload";
const CLOUDINARY_CLOUD = "dh157ll3x";

// ── Sécurisation du téléversement avec validation du type MIME ─────────────────
const uploadToCloudinary = async (file) => {
  if (!file || !(file instanceof File) || file.size === 0)
    throw new Error("Fichier invalide.");
  
  // Limite de taille (4 Mo max)
  if (file.size > 4 * 1024 * 1024)
    throw new Error(`"${file.name}" dépasse la taille maximale autorisée (4 Mo).`);

  // Validation stricte du type MIME
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Format de fichier non autorisé. Utilisez JPG, PNG ou PDF.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: "POST", body: formData }
  );
  
  if (!res.ok) {
    throw new Error("Échec du téléversement sécurisé vers le serveur distant.");
  }
  const data = await res.json();
  return data.secure_url;
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const verifyCniOcr = async (file, nom, prenom) => {
  const base64Image = await fileToBase64(file);
  const res = await fetch(`${API_BASE}/api/verify-cni`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base64Image,
      expectedNom: nom.trim(),
      expectedPrenom: prenom.trim(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(
      data.error || "Échec de la validation OCR de la CNI. Assurez-vous que la photo est nette."
    );
  }
  return data;
};

const setDocWithRetry = async (ref, payload, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await setDoc(ref, payload);
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
};

const SECTEURS_CONFIG = {
  abidjan: {
    name: "Abidjan",
    role: "livreur",
    typeZone: "urbain",
    isRural: false,
    vehicles: [
      { id: "moto", label: "Moto", img: motoChapImg },
      { id: "vtc", label: "Cargo", img: vtcConfortImg },
      { id: "taxi", label: "Tricycle", img: taxiCompteurImg },
      { id: "pieton", label: "Piéton", img: taxiEcoImg },
      { id: "camion", label: "Camion", img: carSuvImg },
      { id: "bicyclette", label: "Bicyclette", img: taxiConfortImg },
    ],
  },
  default: {
    name: "Zone Partenaire",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto", label: "Moto Rurale", img: motoDefaultImg },
      { id: "vtc", label: "Cargo", img: vtcDefaultImg },
      { id: "saloni", label: "Saloni (Tricycle)", img: saloniImg },
      { id: "antara", label: "Camion Antara", img: antaraImg },
    ],
  },
};

const MARQUES = {
  moto: ["KTM", "SUZUKI", "YAMAHA", "HAOJUE", "APACHE", "KAWASAKI", "BAJAJ", "AUTRE"],
  vtc: ["TOYOTA", "SUZUKI", "HYUNDAI", "KIA", "MAZDA", "NISSAN", "MERCEDES", "AUTRE"],
  taxi: ["DAYANG", "ALBATROS", "HAOJUE", "LIFAN", "SANYA", "AUTRE"],
  pieton: ["PIÉTON", "MESSAGER", "AUTRE"],
  camion: ["MITSUBISHI", "ISUZU", "MERCEDES BENZ", "IVECO", "AUTRE"],
  bicyclette: ["BICYCLETTE", "VÉLO ÉLECTRIQUE", "AUTRE"],
  saloni: ["ALBATROS", "KAWASAKI", "SANYA", "HAOJUE", "AUTRE"],
  antara: ["MITSUBISHI", "ISUZU", "TOYOTA DINA", "HYUNDAI HD", "AUTRE"],
};

export default function InscriptionLivreurSecteurs() {
  const navigate = useNavigate();
  const { zone } = useParams();
  const zoneKey = zone && SECTEURS_CONFIG[zone.toLowerCase()] ? zone.toLowerCase() : "default";
  const config = SECTEURS_CONFIG[zoneKey];

  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    telephone: "+225",
    plaque: "",
    email: "",
    nomBoutique: "",
  });
  
  const [typeCommerce, setTypeCommerce] = useState("Boutique / Entreprise");
  const [typeVehicule, setTypeVehicule] = useState(config.vehicles[0].id);
  const [marqueVehicule, setMarqueVehicule] = useState("");
  const [pattern, setPattern] = useState([]);
  const [contrat, setContrat] = useState(false);
  const [assistanceSaved, setAssistanceSaved] = useState(false);
  
  const [files, setFiles] = useState({
    pfp: null,
    engin: null,
    cni: null,
    permis: null,
    registreCommerce: null,
  });

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);

  useEffect(() => {
    setTypeVehicule(config.vehicles[0].id);
    setMarqueVehicule("");
    window.scrollTo(0, 0);
  }, [zoneKey, config.vehicles]);

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      setGoogleUser(result.user);
      toast.success("Authentification Google réussie.");
    } catch {
      toast.error("Échec de l'authentification Google.");
    } finally {
      setLoading(false);
    }
  };

  const handleInscription = async (e) => {
    e.preventDefault();
    let phone = cleanPhone(form.telephone);
    if (phone.length === 10 && !phone.startsWith("225")) {
      phone = "225" + phone;
    }

    if (phone.length !== 13)
      return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    if (!form.nom.trim()) return toast.error("Le nom est obligatoire.");
    if (!form.prenom.trim()) return toast.error("Le prénom est obligatoire.");
    if (!googleUser && !form.email.trim())
      return toast.error("Une adresse email valide est obligatoire.");
    if (!marqueVehicule)
      return toast.error("Veuillez sélectionner la marque du véhicule.");
    if (!form.plaque.trim())
      return toast.error("Le numéro d'immatriculation est obligatoire.");
    
    if (!files.pfp || !files.engin || !files.cni || !files.permis)
      return toast.error("Tous les documents obligatoires doivent être joints.");

    const isParticulier = typeCommerce.toLowerCase().includes("particulier") || typeCommerce.toLowerCase().includes("deal");
    if (!isParticulier && !files.registreCommerce) {
      return toast.error("Le document légal ou registre de commerce est requis pour ce statut.");
    }

    if (!googleUser && pattern.length < 3)
      return toast.error("Le schéma de sécurité doit comporter au moins 3 points.");
    if (!assistanceSaved)
      return toast.warning("Veuillez enregistrer le contact d'assistance.");
    if (!contrat)
      return toast.error("Vous devez accepter le contrat de partenariat.");

    setLoading(true);
    try {
      // Vérification des doublons de numéros
      const snap = await getDocs(
        query(collection(db, "users"), where("telephone", "==", phone))
      );
      if (!snap.empty) {
        setLoading(false);
        return toast.error("Ce numéro de téléphone est déjà associé à un compte.");
      }

      setLoadingStep("Vérification OCR de la pièce d'identité...");
      const cniOcrMeta = await verifyCniOcr(files.cni, form.nom, form.prenom);

      setLoadingStep("Téléversement sécurisé des fichiers...");
      const pUrl = await uploadToCloudinary(files.pfp);
      const vUrl = await uploadToCloudinary(files.engin);
      const cUrl = await uploadToCloudinary(files.cni);
      const perUrl = await uploadToCloudinary(files.permis);

      let regUrl = null;
      if (!isParticulier && files.registreCommerce) {
        regUrl = await uploadToCloudinary(files.registreCommerce);
      }

      setLoadingStep("Création du compte sécurisé...");
      let user;
      let technicalEmail = "";

      if (googleUser) {
        user = googleUser;
        technicalEmail = googleUser.email;
      } else {
        technicalEmail = `${phone}@livraison.web.app`;
        const password = generatePatternPassword(pattern, phone);
        const creds = await createUserWithEmailAndPassword(auth, technicalEmail, password);
        user = creds.user;
      }

      await user.getIdToken(true);

      setLoadingStep("Enregistrement du profil...");
      const payload = {
        uid: user.uid,
        nom: form.nom.trim().toUpperCase(),
        prenom: form.prenom.trim(),
        nomComplet: `${form.nom.trim().toUpperCase()} ${form.prenom.trim()}`,
        nomBoutique: form.nomBoutique.trim() ? form.nomBoutique.trim().charAt(0).toUpperCase() + form.nomBoutique.trim().slice(1) : "",
        typeCommerce,
        telephone: phone,
        email: googleUser ? googleUser.email.toLowerCase() : form.email.trim().toLowerCase(),
        technicalEmail: technicalEmail.toLowerCase(),
        role: config.role,
        sectorZone: zoneKey,
        zone: zoneKey,
        typeVehicule,
        marqueVehicule: marqueVehicule || "AUTRE",
        plaque: form.plaque.trim().toUpperCase(),
        photoProfileURL: pUrl,
        vehiclePhotoURL: vUrl,
        cniURL: cUrl,
        permisURL: perUrl,
        registreCommerceURL: regUrl,
        cniVerified: true,
        cniNumber: cniOcrMeta?.cniNumber || null,
        cniOcrAt: serverTimestamp(),
        solde: 0,
        jetons: 3000,
        isCertified: false,
        isAvailable: true,
        isOnline: true,
        isActive: true,
        contactSaved: true,
        method: googleUser ? "google" : "pattern",
        mamboLockPattern: googleUser ? "" : pattern.join("-"),
        createdAt: serverTimestamp(),
      };

      await setDocWithRetry(doc(db, "users", user.uid), payload);
      await setDocWithRetry(doc(db, "phoneIndex", phone), {
        email: technicalEmail.toLowerCase(),
        uid: user.uid,
        role: config.role,
        sectorZone: zoneKey,
        mamboLockPattern: googleUser ? "" : pattern.join("-"),
      });

      setLoadingStep("");
      setShowWelcome(true);
    } catch (err) {
      setLoadingStep("");
      toast.error(err.message || "Une erreur est survenue lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  const marquesDisponibles = MARQUES[typeVehicule] || [];
  const isParticulierSelected = typeCommerce.toLowerCase().includes("particulier") || typeCommerce.toLowerCase().includes("deal");

  return (
    <div className="auth-master-wrapper">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      <WelcomeModal
        isOpen={showWelcome}
        onClose={() => navigate(config.role === "livreur" ? "/livreur-home" : `/livreur-secteur/${zoneKey}`)}
        driverName={form.prenom}
      />

      <div className="scrollable-auth-zone">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft />
        </button>

        <div className="reg-card">
          <h2>Flotte Partenaire — {config.name}</h2>
          <p className="sector-subtitle">Inscription Sécurisée — Validation CNI & Anti-Fraude</p>

          <form onSubmit={handleInscription}>
            {!config.isRural && !googleUser && (
              <button type="button" className="google-btn" onClick={handleGoogleAuth} disabled={loading}>
                Continuer avec Google
              </button>
            )}

            <input
              placeholder="NOM"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value.toUpperCase() })}
              required
            />
            <input
              placeholder="Prénom"
              value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              required
            />

            <select value={typeCommerce} onChange={(e) => setTypeCommerce(e.target.value)}>
              <option value="Boutique / Entreprise">Boutique / Entreprise / Société</option>
              <option value="Particulier / Deal">Particulier / Deal</option>
            </select>

            <input
              placeholder="Nom de la boutique / commerce"
              value={form.nomBoutique}
              onChange={(e) => setForm({ ...form, nomBoutique: e.target.value })}
            />

            <input
              placeholder="Numéro WhatsApp (Ex: 0700000000)"
              type="tel"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              required
            />

            {!googleUser && (
              <input
                placeholder="Adresse Email Réelle"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
                required
              />
            )}

            <div className="vehicle-grid">
              {config.vehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`v-btn ${typeVehicule === v.id ? "active" : ""}`}
                  onClick={() => { setTypeVehicule(v.id); setMarqueVehicule(""); }}
                >
                  <img src={v.img} alt={v.label} />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>

            <select value={marqueVehicule} onChange={(e) => setMarqueVehicule(e.target.value)} required>
              <option value="">Sélectionner la marque</option>
              {marquesDisponibles.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <input
              placeholder="Numéro d'immatriculation (Plaque)"
              value={form.plaque}
              onChange={(e) => setForm({ ...form, plaque: e.target.value.toUpperCase() })}
              required
            />

            {!googleUser && (
              <div className="pattern-section" style={{ background: "#f8fafc", padding: 15, borderRadius: 20, margin: "15px 0" }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textAlign: "center", marginBottom: 10 }}>
                  <Lock size={12} /> DÉFINISSEZ VOTRE SCHÉMA D&apos;ACCÈS (3 points min)
                </p>
                <div style={{ display: "flex", justifyContent: "center", touchAction: "none" }}>
                  <MamboLock value={pattern} onChange={setPattern} size={180} />
                </div>
              </div>
            )}

            <div className="docs-upload-sec">
              <p className="docs-title">Documents administratifs obligatoires (JPG, PNG, PDF)</p>
              <div className="docs-grid">
                {[
                  { id: "pfp", label: "PHOTO PRO" },
                  { id: "engin", label: "PHOTO ENGIN" },
                  { id: "cni", label: "PIÈCE CNI (OCR)" },
                  { id: "permis", label: "PERMIS CONDUITE" },
                  ...(!isParticulierSelected ? [{ id: "registreCommerce", label: "REGISTRE COMMERCE" }] : [])
                ].map((item) => (
                  <label key={item.id} className={`doc-card ${files[item.id] ? "is-active" : ""}`}>
                    <input
                      type="file"
                      onChange={(e) => setFiles({ ...files, [item.id]: e.target.files[0] })}
                      hidden
                      accept="image/*,.pdf"
                    />
                    {files[item.id] ? <CheckCircle color="#10b981" /> : <Upload />}
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                openWhatsApp("Enregistrement Assistance Flotte MAMBO");
                setAssistanceSaved(true);
              }}
              style={{ width: "100%", padding: 12, background: assistanceSaved ? "#10b981" : "#25d366", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", margin: "15px 0" }}
            >
              {assistanceSaved ? <><CheckCircle2 size={16} /> CONTACT ENREGISTRÉ</> : "ENREGISTRER LE CONTACT ASSISTANCE"}
            </button>

            <label className="checkbox-wrap contract-wrap">
              <input type="checkbox" checked={contrat} onChange={(e) => setContrat(e.target.checked)} required />
              <span>J&apos;accepte le contrat de partenariat Mambo et certifie l&apos;exactitude des pièces.</span>
            </label>

            {loading && loadingStep && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#f0fdf4", border: "1px solid #10b981", borderRadius: 12, padding: "10px", margin: "15px 0", color: "#10b981", fontWeight: 700 }}>
                <Loader2 className="animate-spin" size={16} />
                <span>{loadingStep}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !assistanceSaved || (!googleUser && pattern.length < 3)}
              className="submit-btn"
            >
              {loading ? <Loader2 className="mx-auto animate-spin" size={22} /> : "VALIDER L'INSCRIPTION"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}