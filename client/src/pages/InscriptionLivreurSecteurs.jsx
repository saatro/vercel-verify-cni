import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, serverTimestamp, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ArrowLeft, Loader2, CheckCircle, Upload, Lock, CheckCircle2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { auth, db } from "../firebase";
import WelcomeModal from "./WelcomeModal";
import MamboLock from "../components/MamboLock";
import { cleanPhone, generatePatternPassword, openWhatsApp } from "../mamboUtils";
import "./InscriptionLivreurSecteurs.css";

import motoChapImg   from "../assets/moto-chap.png";
import vtcConfortImg from "../assets/vtc-confort.png";
import taxiCompteurImg from "../assets/taxi-compteur.png";
import motoDefaultImg from "../assets/moto.png";
import vtcDefaultImg  from "../assets/vtc.png";
import saloniImg      from "../assets/saloni.png";
import antaraImg      from "../assets/antara.png";

// ── Config Cloudinary ──────────────────────────────────────────────────────────
const CLOUDINARY_PRESET = "mambo_upload";
const CLOUDINARY_CLOUD  = "dh157ll3x";

const uploadToCloudinary = async (file) => {
  if (!file || !(file instanceof File) || file.size === 0)
    throw new Error(`Fichier invalide (reçu : ${typeof file})`);
  if (file.size > 8 * 1024 * 1024)
    throw new Error(`"${file.name}" dépasse 8 Mo.`);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);

  const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: formData });
  const text = await res.text();
  if (!res.ok) {
    let msg = "Échec du téléversement.";
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    throw new Error(`Cloudinary ${res.status}: ${msg}`);
  }
  return JSON.parse(text).secure_url;
};

const setDocWithRetry = async (ref, payload, maxRetries = 5) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { await setDoc(ref, payload); return; }
    catch (err) {
      const isPerm = err.code === "permission-denied" || err.code === "firestore/permission-denied";
      if (isPerm && attempt < maxRetries) {
        if (auth.currentUser) await auth.currentUser.getIdToken(true);
        await new Promise(r => setTimeout(r, attempt * 1000));
      } else throw err;
    }
  }
};

// ── Config des secteurs ────────────────────────────────────────────────────────
const SECTEURS_CONFIG = {
  abidjan: {
    name: "Abidjan",
    role: "livreur",
    typeZone: "urbain",
    isRural: false,
    vehicles: [
      { id: "moto",  label: "Moto Delivery",  img: motoChapImg    },
      { id: "vtc",   label: "Véhicule VTC",   img: vtcConfortImg  },
      { id: "taxi",  label: "Taxi Compteur",  img: taxiCompteurImg },
    ]
  },

  alepe: {
    name: "Alépé",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto",   label: "Moto Rurale",       img: motoDefaultImg },
      { id: "vtc",    label: "Véhicule VTC",       img: vtcDefaultImg  },
      { id: "saloni", label: "Saloni (Tricycle)",  img: saloniImg      },
      { id: "antara", label: "Camion Antara",      img: antaraImg      },
    ]
  },

  azaguie: {
    name: "Azaguié",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto",   label: "Moto Rurale",      img: motoDefaultImg },
      { id: "vtc",    label: "Véhicule VTC",      img: vtcDefaultImg  },
      { id: "saloni", label: "Saloni (Tricycle)", img: saloniImg      },
      { id: "antara", label: "Camion Antara",     img: antaraImg      },
    ]
  },

  agboville: {
    name: "Agboville",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto",   label: "Moto Rurale",      img: motoDefaultImg },
      { id: "vtc",    label: "Véhicule VTC",      img: vtcDefaultImg  },
      { id: "saloni", label: "Saloni (Tricycle)", img: saloniImg      },
      { id: "antara", label: "Camion Antara",     img: antaraImg      },
    ]
  },

  adzope: {
    name: "Adzopé",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto",   label: "Moto Rurale",      img: motoDefaultImg },
      { id: "vtc",    label: "Véhicule VTC",      img: vtcDefaultImg  },
      { id: "saloni", label: "Saloni (Tricycle)", img: saloniImg      },
      { id: "antara", label: "Camion Antara",     img: antaraImg      },
    ]
  },

  dabou: {
    name: "Dabou",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto",   label: "Moto Rurale",      img: motoDefaultImg },
      { id: "vtc",    label: "Véhicule VTC",      img: vtcDefaultImg  },
      { id: "saloni", label: "Saloni (Tricycle)", img: saloniImg      },
      { id: "antara", label: "Camion Antara",     img: antaraImg      },
    ]
  },

  jacqueville: {
    name: "Jacqueville",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto",   label: "Moto Rurale",      img: motoDefaultImg },
      { id: "vtc",    label: "Véhicule VTC",      img: vtcDefaultImg  },
      { id: "saloni", label: "Saloni (Tricycle)", img: saloniImg      },
      { id: "antara", label: "Camion Antara",     img: antaraImg      },
    ]
  },

  default: {
    name: "Zone Partenaire",
    role: "livreur-externe",
    typeZone: "rural",
    isRural: true,
    vehicles: [
      { id: "moto",  label: "Moto Rurale",       img: motoDefaultImg },
      { id: "vtc",   label: "Véhicule VTC",       img: vtcDefaultImg  },
      { id: "saloni", label: "Saloni (Tricycle)", img: saloniImg      },
      { id: "antara", label: "Camion Antara",     img: antaraImg      },
    ]
  },
};

const MARQUES = {
  moto:   ["KTM","SUZUKI","YAMAHA","HAOJUE","APACHE","KAWASAKI","BAJAJ","ROYAL ENFIELD","ALBATROS","SANYA"],
  vtc:    ["TOYOTA","SUZUKI","HYUNDAI","KIA","MAZDA","NISSAN","MERCEDES","FORD","DACIA","RENAULT"],
  taxi:   ["TOYOTA","SUZUKI","HYUNDAI","KIA","MAZDA","NISSAN","MERCEDES","FORD","DACIA","RENAULT"],
  saloni: ["ALBATROS","KAWASAKI","SANYA","HAOJUE","LIFAN","BAJAJ","TVS","AUTRE"],
  antara: ["MITSUBISHI","ISUZU","TOYOTA DINA","HYUNDAI HD","KIA RHINO","MERCEDES BENZ","IVECO","CANTER"],
};

export default function InscriptionLivreurSecteurs() {
  const navigate = useNavigate();
  const { zone }  = useParams();
  const zoneKey   = (zone && SECTEURS_CONFIG[zone.toLowerCase()]) ? zone.toLowerCase() : "default";
  const config    = SECTEURS_CONFIG[zoneKey];

  const [form, setForm]                   = useState({ nom:"", prenom:"", telephone:"+225", plaque:"", email:"" });
  const [typeVehicule, setTypeVehicule]   = useState(config.vehicles[0].id);
  const [marqueVehicule, setMarqueVehicule] = useState("");
  const [isClimatise, setIsClimatise]     = useState(false);
  const [pattern, setPattern]             = useState([]);
  const [contrat, setContrat]             = useState(false);
  const [assistanceSaved, setAssistanceSaved] = useState(false);
  const [files, setFiles]                 = useState({ pfp:null, engin:null, cni:null, permis:null });
  const [loading, setLoading]             = useState(false);
  const [loadingStep, setLoadingStep]     = useState("");
  const [showWelcome, setShowWelcome]     = useState(false);
  const [googleUser, setGoogleUser]       = useState(null);

  useEffect(() => {
    setTypeVehicule(config.vehicles[0].id);
    setMarqueVehicule("");
    window.scrollTo(0, 0);
  }, [zoneKey]); // eslint-disable-line

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      setGoogleUser(result.user);
      toast.success("Google connecté !");
    } catch (err) {
      toast.error("Erreur Google Auth");
    } finally { setLoading(false); }
  };

  const handleInscription = async (e) => {
    e.preventDefault();
    const phone = cleanPhone(form.telephone);

    if (phone.length !== 10)        return toast.error("Numéro WhatsApp invalide (10 chiffres).");
    if (!form.nom.trim())           return toast.error("Nom obligatoire.");
    if (!form.prenom.trim())        return toast.error("Prénom obligatoire.");
    if (!googleUser && !form.email.trim()) return toast.error("Adresse email réelle obligatoire.");
    if (!marqueVehicule)            return toast.error("Sélectionnez la marque du véhicule.");
    if (!form.plaque.trim())        return toast.error("Numéro de plaque obligatoire.");
    if (!files.pfp || !files.engin || !files.cni || !files.permis)
      return toast.error("Veuillez charger les 4 documents obligatoires.");
    if (!googleUser && pattern.length < 3)
      return toast.error("Schéma de sécurité trop court (3 points min).");
    if (!assistanceSaved)           return toast.warning("Enregistrez le contact Assistance.");
    if (!contrat)                   return toast.error("Acceptez le contrat de partenariat.");

    setLoading(true);
    try {
      try {
        const snap = await getDocs(query(collection(db, "users"), where("telephone", "==", phone)));
        if (!snap.empty) {
          setLoading(false);
          return toast.error("Ce numéro est déjà associé à un compte partenaire.");
        }
      } catch { /* règles de sécurité */ }

      setLoadingStep("Téléversement photo de profil...");
      const pUrl   = await uploadToCloudinary(files.pfp);

      setLoadingStep("Téléversement photo engin...");
      const vUrl   = await uploadToCloudinary(files.engin);

      setLoadingStep("Téléversement CNI...");
      const cUrl   = await uploadToCloudinary(files.cni);

      setLoadingStep("Téléversement permis...");
      const perUrl = await uploadToCloudinary(files.permis);

      setLoadingStep("Création du compte partenaire...");
      let user;
      if (googleUser) {
        user = googleUser;
      } else {
        const emailReel = form.email.trim().toLowerCase();
        const password  = generatePatternPassword(pattern, phone);
        const creds     = await createUserWithEmailAndPassword(auth, emailReel, password);
        user = creds.user;
      }

      setLoadingStep("Sécurisation du compte...");
      await user.getIdToken(true);
      await new Promise(r => setTimeout(r, 1000));

      setLoadingStep("Enregistrement du profil livreur...");
      const payload = {
        uid:            user.uid,
        nom:            form.nom.trim().toUpperCase(),
        prenom:         form.prenom.trim(),
        nomComplet:     `${form.nom.trim().toUpperCase()} ${form.prenom.trim()}`,
        telephone:      phone,
        email:          googleUser ? googleUser.email : form.email.trim().toLowerCase(),
        role:           config.role,
        sectorZone:     zoneKey,
        zone:           zoneKey, // ← Double mappage indispensable pour la détection du Vendeur Dashboard
        typeVehicule,
        isClimatise:    (typeVehicule === "vtc" || typeVehicule === "taxi") ? isClimatise : false,
        marqueVehicule: marqueVehicule || "AUTRE",
        plaque:         form.plaque.trim().toUpperCase(),
        photoProfileURL: pUrl,
        vehiclePhotoURL: vUrl,
        cniURL:          cUrl,
        permisURL:       perUrl,
        solde:          0,
        jetons:         3000,
        isCertified:    false,
        isAvailable:    true,
        isOnline:       true,
        isActive:       true,
        contactSaved:   true,
        method:         googleUser ? "google" : "pattern",
        mamboLockPattern: googleUser ? "" : pattern.join("-"),
        createdAt:      serverTimestamp(),
      };

      await setDocWithRetry(doc(db, "users", user.uid), payload);

      setLoadingStep("");
      setShowWelcome(true);

    } catch (err) {
      console.error("Erreur inscription livreur :", err.code, err.message);
      setLoadingStep("");
      if (err.code === "auth/email-already-in-use" || err.code === "auth/account-exists-with-different-credential") {
        toast.error("Cette adresse email est déjà associée à un compte partenaire.");
      } else if (err.code === "permission-denied") {
        toast.error("Erreur d'autorisation. Réessayez.");
      } else {
        toast.error(err.message || "Erreur lors de l'inscription.");
      }
    } finally {
      setLoading(false);
    }
  };

  const marquesDisponibles = MARQUES[typeVehicule] || [];

  return (
    <div className="auth-master-wrapper">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      <WelcomeModal
        isOpen={showWelcome}
        onClose={() => navigate(config.role === "livreur" ? "/livreur-home" : `/livreur-secteur/${zoneKey}`)}
        driverName={form.prenom}
      />

      <div className="scrollable-auth-zone">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}><ArrowLeft /></button>

        <div className="reg-card">
          <h2>Flotte Partenaire — {config.name}</h2>
          <p className="sector-subtitle">
            {config.isRural ? "Zone Rurale" : "Zone Urbaine"} · Inscription sécurisée MAMBO
          </p>

          <form onSubmit={handleInscription}>

            {/* Google Auth */}
            {!config.isRural && !googleUser && (
              <button type="button" className="google-btn" onClick={handleGoogleAuth} disabled={loading}>
                Continuer avec Google
              </button>
            )}
            {googleUser && (
              <div style={{ background:"#f0fdf4", border:"1px solid #10b981", borderRadius:12, padding:"10px 14px", marginBottom:14, fontSize:12, fontWeight:700, color:"#10b981" }}>
                ✅ Google : {googleUser.email}
              </div>
            )}

            {/* Infos personnelles */}
            <input placeholder="NOM" value={form.nom} onChange={e => setForm({...form, nom: e.target.value.toUpperCase()})} required />
            <input placeholder="Prénom" value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} required />
            <input placeholder="Numéro WhatsApp (Ex: 0700000000)" type="tel" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} required />

            {/* Adresse Email Réelle */}
            {!googleUser && (
              <input 
                placeholder="Adresse Email Réelle" 
                type="email" 
                value={form.email} 
                onChange={e => setForm({...form, email: e.target.value})} 
                required 
              />
            )}

            {/* Sélection véhicule */}
            <div className="vehicle-selection-title">Type d'engin de transport</div>
            <div className="vehicle-grid">
              {config.vehicles.map(v => (
                <button
                  key={v.id} type="button"
                  className={`v-btn ${typeVehicule === v.id ? "active" : ""}`}
                  onClick={() => { setTypeVehicule(v.id); setMarqueVehicule(""); }}
                >
                  <img src={v.img} alt={v.label} />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>

            {/* Marque */}
            <select value={marqueVehicule} onChange={e => setMarqueVehicule(e.target.value)} required>
              <option value="">Sélectionner la marque</option>
              {marquesDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* Plaque */}
            <input
              placeholder="Numéro d'immatriculation (Plaque)"
              value={form.plaque}
              onChange={e => setForm({...form, plaque: e.target.value.toUpperCase()})}
              required
            />

            {/* Option climatisé pour VTC/taxi */}
            {(typeVehicule === "vtc" || typeVehicule === "taxi") && (
              <label className="checkbox-wrap">
                <input type="checkbox" checked={isClimatise} onChange={e => setIsClimatise(e.target.checked)} />
                Véhicule climatisé
              </label>
            )}

            {/* Schéma de verrouillage */}
            {!googleUser && (
              <div className="pattern-section" style={{ background:"#f8fafc", padding:15, borderRadius:20, border:"1.5px solid #e2e8f0", margin:"15px 0" }}>
                <p style={{ fontSize:11, fontWeight:800, color:"#64748b", textAlign:"center", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <Lock size={12} /> DÉFINISSEZ VOTRE SCHÉMA D'ACCÈS (3 points min)
                </p>
                <div style={{ display:"flex", justifyContent:"center", touchAction:"none" }}>
                  <MamboLock value={pattern} onChange={setPattern} size={180} />
                </div>
              </div>
            )}

            {/* Documents */}
            <div className="docs-upload-sec">
              <p className="docs-title">Documents administratifs obligatoires</p>
              <div className="docs-grid">
                {[
                  { id:"pfp",   label:"PHOTO PRO"      },
                  { id:"engin", label:"PHOTO ENGIN"     },
                  { id:"cni",   label:"PIÈCE CNI"        },
                  { id:"permis",label:"PERMIS CONDUITE" },
                ].map(item => (
                  <label key={item.id} className={`doc-card ${files[item.id] ? "is-active" : ""}`}>
                    <input type="file" onChange={e => setFiles({...files, [item.id]: e.target.files[0]})} hidden accept="image/*" />
                    {files[item.id] ? <CheckCircle color="#10b981" /> : <Upload />}
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Section Assistance Obligatoire */}
            <div style={{
              border: assistanceSaved ? "1px dashed #10b981" : "1px dashed #ef4444",
              background: assistanceSaved ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.03)",
              padding:15, borderRadius:20, margin:"15px 0", transition:"all 0.3s"
            }}>
              <p style={{ fontSize:11, color: assistanceSaved ? "#10b981" : "#ef4444", fontWeight:800, textAlign:"center", marginBottom:5 }}>
                Confirmation Assistance Obligatoire
              </p>
              <p style={{ fontSize:11, color:"#64748b", textAlign:"center", marginBottom:12, lineHeight:1.4 }}>
                Enregistrez le contact assistance pour valider votre intégration et accéder aux contrôles de reçus complets depuis Wave.
              </p>
              <button
                type="button"
                onClick={() => { openWhatsApp("Livreur Flotte MAMBO : Enregistrement Assistance"); setAssistanceSaved(true); }}
                style={{
                  width:"100%", padding:12, background: assistanceSaved ? "#10b981" : "#25d366",
                  color:"white", border:"none", borderRadius:12, fontWeight:800,
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}
              >
                {assistanceSaved ? <><CheckCircle2 size={16} /> CONTACT ENREGISTRÉ</> : "ENREGISTRER LE CONTACT ASSISTANCE"}
              </button>
            </div>

            {/* Contrat */}
            <label className="checkbox-wrap contract-wrap">
              <input type="checkbox" checked={contrat} onChange={e => setContrat(e.target.checked)} required />
              <span>J'accepte le contrat de partenariat Mambo et certifie l'exactitude des pièces fournies.</span>
            </label>

            {/* Indicateur de chargement d'étape */}
            {loading && loadingStep && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"#f0fdf4", border:"1px solid #10b981", borderRadius:12, padding:"10px 14px", margin:"15px 0", fontSize:12, fontWeight:700, color:"#10b981" }}>
                <Loader2 className="animate-spin" size={16} />
                <span>{loadingStep}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !assistanceSaved || (!googleUser && pattern.length < 3)}
              className="submit-btn"
              style={(!assistanceSaved || loading) ? { backgroundColor:"#cbd5e1", color:"#64748b", cursor:"not-allowed", boxShadow:"none" } : {}}
            >
              {loading ? <Loader2 className="mx-auto animate-spin" size={22} /> : "VALIDER L'INSCRIPTION"}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}