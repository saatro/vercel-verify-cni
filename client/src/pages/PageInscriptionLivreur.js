import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Loader2, Camera, 
  CheckCircle, Upload
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { auth, db } from "../firebase";
import { uploadToCloudinary } from "../utils/cloudinary";
import WelcomeModal from "./WelcomeModal";
import MamboLock from "../components/MamboLock"; 
import { cleanPhone, generatePatternPassword } from "../mamboUtils"; 
import "./PageInscriptionLivreur.css";

export default function PageInscriptionLivreur() {
  const navigate = useNavigate();

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("+225");
  const [email, setEmail] = useState(""); 
  const [pattern, setPattern] = useState([]); 
  const [typeVehicule, setTypeVehicule] = useState("moto"); 
  const [isClimatise, setIsClimatise] = useState(false);
  const [marqueVehicule, setMarqueVehicule] = useState("");
  const [plaque, setPlaque] = useState("");
  const [contratAccepte, setContratAccepte] = useState(false);

  const [photoProfile, setPhotoProfile] = useState(null);
  const [vehiclePhoto, setVehiclePhoto] = useState(null);
  const [cniPhoto, setCniPhoto] = useState(null);
  const [permisPhoto, setPermisPhoto] = useState(null);

  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [registeredName, setRegisteredName] = useState("");

  const uniquesMarquesMoto = ["KTM", "SUZUKI", "YAMAHA", "HAOJUE", "APACHE", "KAWASAKI", "BAJAJ", "ROYAL ENFIELD", "ALBATROS", "SANYA"];
  const uniquesMarquesVoiture = ["TOYOTA", "SUZUKI", "HYUNDAI", "KIA", "MAZDA", "NISSAN", "MERCEDES", "FORD", "DACIA", "RENAULT"];
  const uniquesMarquesAntara = ["MITSUBISHI", "ISUZU", "TOYOTA DINA", "HYUNDAI HD", "KIA RHINO", "MERCEDES BENZ", "IVECO", "CANTER"];

  const formatPrenom = (val) => val.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

  const isPlaqueValide = (p) => {
    const ancienFormat = /^[0-9]{4}[A-Z]{2}[0-9]{2}$/;
    const nouveauFormat = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
    return ancienFormat.test(p) || nouveauFormat.test(p);
  };

  const handleInscription = async (e) => {
    e.preventDefault();
    const phoneClean = cleanPhone(telephone);
    const finalEmail = email.toLowerCase().trim();

    if (!photoProfile) return toast.error("Photo de profil obligatoire");
    if (phoneClean.length !== 10) return toast.error("Numéro WhatsApp invalide");
    if (!finalEmail.includes("@") || finalEmail.length < 5) return toast.error("Email valide requis");
    if (pattern.length < 3) return toast.error("Schéma de sécurité requis");
    if (!isPlaqueValide(plaque)) return toast.error("Format de plaque invalide");
    if (!contratAccepte) return toast.error("Veuillez accepter le contrat");
    if (!vehiclePhoto || !cniPhoto || !permisPhoto) return toast.error("Tous les documents sont obligatoires");

    setLoading(true);

    try {
      const technicalPassword = generatePatternPassword(pattern, phoneClean);

      // Utilisation directe de l'email réel saisi par le livreur pour l'authentification Firebase
      const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, technicalPassword);
      const user = userCredential.user;

      const [pUrl, vUrl, cUrl, perUrl] = await Promise.all([
        uploadToCloudinary(photoProfile),
        uploadToCloudinary(vehiclePhoto),
        uploadToCloudinary(cniPhoto),
        uploadToCloudinary(permisPhoto)
      ]);

      const finalFirstName = formatPrenom(prenom.trim());
      const finalLastName = nom.trim().toUpperCase();

      const livreurData = {
        uid: user.uid,
        nom: finalLastName,
        prenom: finalFirstName,
        nomComplet: `${finalLastName} ${finalFirstName}`,
        email: finalEmail,
        telephone: phoneClean,
        role: "livreur",
        typeVehicule,
        isClimatise: (typeVehicule === "vtc" || typeVehicule === "saloni") ? isClimatise : false,
        marqueVehicule,
        plaque: plaque.toUpperCase().trim(),
        photoProfileURL: pUrl,
        vehiclePhotoURL: vUrl,
        cniURL: cUrl,
        permisURL: perUrl,
        solde: 0,
        soldeJetons: 3000,
        isOnline: true,
        isAvailable: true,
        isCertified: false, 
        isActive: true,
        method: "pattern",
        mamboLockPattern: pattern.join("-"),
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", user.uid), livreurData);
      
      setRegisteredName(finalFirstName);
      setShowWelcome(true); 
    } catch (err) {
      console.error("Inscription Error:", err);
      toast.error("Erreur lors de l'inscription. Cet e-mail ou ce numéro est peut-être déjà utilisé.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-master-wrapper pro-theme">
      <ToastContainer theme="dark" limit={1} position="top-center" />
      <WelcomeModal isOpen={showWelcome} onClose={() => navigate("/livreur-home")} driverName={registeredName} />

      <div className="scrollable-auth-zone">
        <button type="button" className="back-btn-float" onClick={() => navigate(-1)}>
          <ArrowLeft size={22} />
        </button>

        <div className="reg-card">
          <header className="reg-header">
            <div className="profile-upload-zone">
              <label className={`profile-ring ${!photoProfile ? 'ring-empty' : ''}`}>
                <input type="file" onChange={(e) => setPhotoProfile(e.target.files[0])} hidden accept="image/*" />
                {photoProfile ? <img src={URL.createObjectURL(photoProfile)} alt="pfp" /> : <Camera size={28} color="#94a3b8" />}
                <div className="cam-badge"><Camera size={12} /></div>
              </label>
              <div className="header-titles">
                <h2>Devenir Partenaire</h2>
                <p>INSCRIPTION PROFESSIONNELLE</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleInscription} className="reg-form-body">
            <div className="input-grid">
              <div className="mambo-input-box">
                <label>Nom</label>
                <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex: KOUASSI" />
              </div>
              <div className="mambo-input-box">
                <label>Prénom</label>
                <input type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)} required placeholder="Ex: Jean" />
              </div>
            </div>

            <div className="mambo-input-box">
              <label>Numéro WhatsApp</label>
              <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} required />
            </div>

            <div className="mambo-input-box">
              <label>Adresse Email Personnel</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="exemple@gmail.com" />
            </div>

            <div className="mambo-input-box">
              <label>Type de Véhicule</label>
              <select value={typeVehicule} onChange={(e) => { setTypeVehicule(e.target.value); setMarqueVehicule(""); }}>
                <option value="moto">Moto Livraison</option>
                <option value="vtc">Véhicule VTC</option>
                <option value="saloni">Camion / Camionnette</option>
              </select>
            </div>

            {(typeVehicule === "vtc" || typeVehicule === "saloni") && (
              <div className="checkbox-option">
                <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input type="checkbox" checked={isClimatise} onChange={(e) => setIsClimatise(e.target.checked)} className="rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-0" />
                  Véhicule climatisé
                </label>
              </div>
            )}

            <div className="mambo-input-box">
              <label>Marque du Véhicule</label>
              <select value={marqueVehicule} onChange={(e) => setMarqueVehicule(e.target.value)} required>
                <option value="">Sélectionner une marque</option>
                {typeVehicule === "moto" && uniquesMarquesMoto.map((m) => <option key={m} value={m}>{m}</option>)}
                {typeVehicule === "vtc" && uniquesMarquesVoiture.map((m) => <option key={m} value={m}>{m}</option>)}
                {typeVehicule === "saloni" && uniquesMarquesAntara.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="mambo-input-box">
              <label>Numéro d'Immatriculation (Plaque)</label>
              <input type="text" value={plaque} onChange={(e) => setPlaque(e.target.value)} placeholder="Ex: 1234AB01 ou CI-AB-123-CD" required />
            </div>

            <div className="docs-upload-sec">
              <h3>Documents Obligatoires</h3>
              <div className="docs-grid">
                <DocBox label="Photo du Véhicule" file={vehiclePhoto} setFile={setVehiclePhoto} />
                <DocBox label="Pièce d'identité (CNI / Passeport)" file={cniPhoto} setFile={setCniPhoto} />
                <DocBox label="Permis de Conduire" file={permisPhoto} setFile={setPermisPhoto} />
              </div>
            </div>

            <div className="pattern-lock-sec">
              <h3>Définir votre Schéma de Connexion</h3>
              <p className="pattern-desc">Ce schéma remplacera votre mot de passe pour vos connexions futures.</p>
              <div className="flex justify-center my-4">
                <MamboLock value={pattern} onChange={setPattern} />
              </div>
            </div>

            <div className="contract-acceptance-zone">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={contratAccepte} onChange={(e) => setContratAccepte(e.target.checked)} className="mt-1" />
                <span className="text-xs text-slate-400">J'accepte les conditions de partenariat Mambo, certifie l'exactitude de mes pièces fournies et m'engage à respecter la charte qualité de service.</span>
              </label>
            </div>

            <button type="submit" disabled={loading} className="mambo-submit-btn">
              {loading ? <Loader2 className="mx-auto animate-spin" size={24} /> : "SOUMETTRE MON INSCRIPTION"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function DocBox({ label, file, setFile }) {
  return (
    <label className={`mambo-doc-card ${file ? 'is-active' : ''}`}>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} hidden accept="image/*" />
      {file ? <CheckCircle size={24} color="#10b981" /> : <Upload size={24} color="#94a3b8" />}
      <span>{label}</span>
    </label>
  );
}