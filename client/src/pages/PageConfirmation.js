import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import {
  ArrowRight, Loader2,
  MapPin, Navigation, ShieldCheck, Handshake, ShoppingBag, Coins
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { auth, db } from "../firebase";

import carConfortImg     from "../assets/car-confort.png";
import carEcoImg         from "../assets/car-eco.png";
import carSuvImg         from "../assets/car-suv.png";
import motoImg           from "../assets/moto-3d.png";
import motoChapImg       from "../assets/moto-chap.png";
import motoNoStressImg   from "../assets/moto-nostress.png";
import taxiConfortImg    from "../assets/taxi-confort.png";
import taxiEcoImg        from "../assets/taxi-eco.png";
import taxiArrangementImg from "../assets/taxi-arrangement.png";
import imgSaloni         from "../assets/saloni.png";
import imgAntara         from "../assets/antara.png";
import imgMoto           from "../assets/moto.png";
import imgVtc            from "../assets/vtc.png";

import "./PageConfirmation.css";

const VEHICLE_CONFIG = {
  // ── Ruraux ────────────────────────────────────────────────────────────────
  moto:       { img: imgMoto,           label: "MOTO RURALE",  description: "Course ou livraison rapide", features: ["Rapide","Zone Rurale"],     color: "#10b981", isRural: true },
  saloni:     { img: imgSaloni,         label: "SALONI",       description: "Tricycle local polyvalent",  features: ["Pratique","Local"],          color: "#10b981", isRural: true },
  antara:     { img: imgAntara,         label: "ANTARA",       description: "Transport de marchandises",  features: ["Confortable","Spacieux"],    color: "#f97316", isRural: true },
  vtc:        { img: imgVtc,            label: "VTC RURAL",    description: "Chauffeur privé disponible", features: ["Premium","Sécurisé"],        color: "#6366f1", isRural: true },
  // Alias ruraux
  moto_rurale:{ img: imgMoto,           label: "MOTO RURALE",  description: "Course ou livraison rapide", features: ["Rapide","Zone Rurale"],     color: "#10b981", isRural: true },
  vtc_rural:  { img: imgVtc,            label: "VTC RURAL",    description: "Chauffeur privé disponible", features: ["Premium","Sécurisé"],       color: "#6366f1", isRural: true },
  // ── Urbains ───────────────────────────────────────────────────────────────
  MotoNoStress:    { img: motoNoStressImg,   label: "NO STRESS",     description: "Livraison sans urgence",    features: ["Économique","Flexible"],   color: "#10b981" },
  Moto:            { img: motoImg,           label: "STANDARD",      description: "Livraison rapide sous 3h",  features: ["Rapide","Fiable"],         color: "#10b981" },
  MotoChap:        { img: motoChapImg,       label: "CHAP CHAP",     description: "Livraison immédiate",       features: ["Ultra rapide","Prioritaire"], color: "#f97316" },
  VtcEco:          { img: carEcoImg,         label: "VTC ÉCO",       description: "Course confortable",        features: ["3 places","Climatisé"],    color: "#10b981" },
  VtcConfort:      { img: carConfortImg,     label: "VTC CONFORT",   description: "Course premium",            features: ["3 places","WiFi"],         color: "#6366f1" },
  VtcSuv:          { img: carSuvImg,         label: "VTC SUV",       description: "Véhicule spacieux",         features: ["6 places","Grand coffre"], color: "#8b5cf6" },
  TaxiEco:         { img: taxiEcoImg,        label: "TAXI ÉCO",      description: "Tarif réglementé",          features: ["Compteur","Officiel"],     color: "#f59e0b", isTaxi: true, isCompteur: true },
  TaxiConfort:     { img: taxiConfortImg,    label: "TAXI CONFORT",  description: "Taxi confort climatisé",    features: ["Compteur","Climatisé"],   color: "#f59e0b", isTaxi: true, isCompteur: true },
  TaxiArrangement: { img: taxiArrangementImg,label: "ARRANGEMENT",   description: "Prix négocié librement",    features: ["Prix libre","Négociable"], color: "#8b5cf6", isTaxi: true, isArrangement: true },
};

export default function PageConfirmation() {
  const location    = useLocation();
  const navigate    = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const data = useMemo(() => location.state || {}, [location.state]);

  // Résolution véhicule robuste (priorité à MotoNoStress pour tiers)
  const vehicleId = data.vehicle || data.vehicleId || "";
  const isTiersOrder = data.isTiersOrder || data.isForThirdParty || false;

  const resolvedKey = useMemo(() => {
    if (isTiersOrder) return "MotoNoStress";

    if (VEHICLE_CONFIG[vehicleId]) return vehicleId;
    const clean = vehicleId.toString().toLowerCase().trim();

    if (clean.includes("antara"))  return "antara";
    if (clean.includes("saloni"))  return "saloni";
    if (clean.includes("moto_rurale") || clean.includes("moto rurale")) return "moto_rurale";
    if (clean.includes("motochap") || clean.includes("moto chap")) return "MotoChap";
    if (clean.includes("motonos") || clean.includes("no stress")) return "MotoNoStress";
    if (clean.includes("moto")) return data.isRuralZone ? "moto" : "Moto";
    if (clean.includes("vtcsuv") || clean.includes("suv")) return "VtcSuv";
    if (clean.includes("vtcconfort") || clean.includes("confort") || clean.includes("vtc")) return "VtcConfort";
    if (clean.includes("vtc")) return data.isRuralZone ? "vtc" : "VtcEco";
    if (clean.includes("taxiconfort")) return "TaxiConfort";
    if (clean.includes("taxieco"))     return "TaxiEco";
    if (clean.includes("arrangement")) return "TaxiArrangement";
    if (clean.includes("taxi"))        return "TaxiConfort";

    return data.isRuralZone ? "vtc" : "VtcEco";
  }, [vehicleId, data.isRuralZone, isTiersOrder]);

  const vehicle = VEHICLE_CONFIG[resolvedKey] || VEHICLE_CONFIG["VtcEco"];

  // Prix
  const finalPrice = useMemo(() => {
    const raw = data.proposedPrice ?? data.customerOffer ?? data.price ?? 1000;
    return Number(raw.toString().replace(/[^0-9]/g, "")) || 1000;
  }, [data]);

  const basePrice = useMemo(() => {
    const raw = data.basePrice ?? data.price ?? data.estimatedPrice ?? 1000;
    return Number(raw.toString().replace(/[^0-9]/g, "")) || 1000;
  }, [data]);

  const showPriceDiff = vehicle.isArrangement && basePrice > 0 && basePrice !== finalPrice;

  const vehicleType = useMemo(() => {
    const k = resolvedKey.toLowerCase();
    if (k.includes("moto"))  return "moto";
    if (k.includes("taxi"))  return "taxi";
    return "vtc";
  }, [resolvedKey]);

  const handleValider = async () => {
    if (!auth.currentUser) { 
      navigate("/login-client"); 
      return; 
    }
    setIsSubmitting(true);
    try {
      // Nom / téléphone à contacter sur le terrain. Pour un tiers on garde
      // thirdPartyName/Phone (déjà saisis) ; sinon on va chercher le profil
      // du client connecté, sans quoi aucun numéro n'atterrit sur la course.
      let clientName = data.thirdPartyName || data.clientName || "";
      let clientPhone = data.thirdPartyPhone || data.clientPhone || "";

      if (!isTiersOrder && (!clientName || !clientPhone)) {
        try {
          const profSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
          if (profSnap.exists()) {
            const p = profSnap.data();
            clientName = clientName || p.nom || p.nomComplet || "Client Mambo";
            clientPhone = clientPhone || p.telephone || "";
          }
        } catch (e) {
          console.warn("Impossible de charger le profil client :", e);
        }
      }

      const courseData = {
        clientId:       auth.currentUser.uid,
        clientUserId:   auth.currentUser.uid,
        pickupAddress:  data.pickupAddress || data.pickup || "Position actuelle",
        dropoffAddress: data.destination || data.dest || data.dropoffAddress || "",
        destination:    data.destination || data.dest || data.dropoffAddress || "",
        pickupLocation: data.pickupLocation  || null,
        dropoffLocation:data.dropoffLocation || null,
        vehicleType,
        vehicleId:      resolvedKey,
        courseMode:     vehicle.label,
        isCompteur:     !!vehicle.isCompteur,
        price:          finalPrice,
        basePrice:      basePrice,
        status:         "pending",
        rejectedBy:     [],
        isRuralZone:    data.isRuralZone || vehicle.isRural || false,
        zone:           data.zoneId || data.assignedCitySector || "abidjan",
        zoneId:         data.zoneId || data.assignedCitySector || "abidjan",
        isForThirdParty: data.isForThirdParty || isTiersOrder || false,
        thirdPartyName:  data.thirdPartyName  || data.clientName || "",
        thirdPartyPhone: data.thirdPartyPhone || data.clientPhone || "",
        clientName,
        clientPhone,
        isNegoActive:   data.isNegoActive || false,
        createdAt:      serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "courses"), courseData);
      toast.success("Course confirmée !");

      setTimeout(() => {
        navigate(`/tracking/${docRef.id}`, { replace: true });
      }, 800);
    } catch (err) {
      console.error("Erreur confirmation :", err);
      toast.error("Erreur lors de la validation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="confirmation-page">
      <ToastContainer position="top-center" autoClose={2000} />

      <div className="confirmation-container">

        {/* Header */}
        <div className="confirmation-header">
          <div>
            <span className="confirmation-subtitle">
              {data.isStoreDelivery ? "LIVRAISON BOUTIQUE" : "VALIDATION"}
            </span>
            <h1 className="confirmation-title">
              {vehicle.isArrangement ? "Prix de l'Arrangement" : "Récapitulatif"}
            </h1>
          </div>
          <div className="confirmation-icon">
            {data.isStoreDelivery ? <ShoppingBag size={18} /> 
             : vehicle.isArrangement ? <Handshake size={18} /> 
             : <ShieldCheck size={18} />}
          </div>
        </div>

        {/* Tiers / Client */}
        {(data.isForThirdParty || isTiersOrder) && !data.isStoreDelivery && (
          <div style={{ marginBottom:15, background:'#eff6ff', borderLeft:'4px solid #3b82f6', padding:12, borderRadius:8 }}>
            <p style={{ fontSize:10, color:'#3b82f6', fontWeight:'bold', textTransform:'uppercase', margin:0 }}>BÉNÉFICIAIRE</p>
            <p style={{ fontSize:15, fontWeight:'bold', color:'#1e3a8a', margin:4 }}>{data.thirdPartyName || data.clientName || "Client"}</p>
            <p style={{ fontSize:13, color:'#1e40af' }}>{data.thirdPartyPhone || data.clientPhone}</p>
          </div>
        )}

        {/* Prix */}
        <div style={{ marginBottom:20, background:'linear-gradient(135deg,#f8fafc,#f1f5f9)', border:'1px solid #cbd5e1', padding:16, borderRadius:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <div style={{ background:'#475569', padding:6, borderRadius:10, color:'white' }}><Coins size={16}/></div>
            <div>
              <h4 style={{ margin:0, fontSize:13, fontWeight:900, color:'#1e293b', textTransform:'uppercase' }}>
                {vehicle.isArrangement ? "Votre proposition" : "Montant à payer"}
              </h4>
              <p style={{ margin:0, fontSize:11, color:'#64748b' }}>Paiement en espèces à destination</p>
            </div>
          </div>

          <div style={{ background:'white', padding:16, borderRadius:12, border:'1px solid #e2e8f0', textAlign:'center' }}>
            <span style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase' }}>
              {vehicle.label}
            </span>
            <div style={{ fontSize:32, fontWeight:950, color: vehicle.color, margin: '8px 0' }}>
              {finalPrice.toLocaleString()} F CFA
            </div>
            {showPriceDiff && (
              <p style={{ fontSize:12, color:'#94a3b8', textDecoration:'line-through' }}>
                Estimé : {basePrice.toLocaleString()} F
              </p>
            )}
          </div>
        </div>

        {/* Carte véhicule + itinéraire */}
        <div className="confirmation-card">
          <div className="vehicle-preview">
            <div className="vehicle-image-wrapper">
              <div className="vehicle-glow" style={{ background: vehicle.color }}></div>
              <img src={vehicle.img} alt="Véhicule" className="vehicle-image" />
            </div>
            <div className="vehicle-badge" style={{ borderColor: vehicle.color }}>
              <span style={{ color: vehicle.color }}>{vehicle.label}</span>
            </div>
          </div>

          <div className="route-info">
            <div className="route-point">
              <div className="route-icon pickup"><MapPin size={16}/></div>
              <div className="route-text">
                <p className="route-label">DÉPART</p>
                <p className="route-address">{data.pickupAddress || data.pickup || "Ma position"}</p>
              </div>
            </div>
            <div className="route-point">
              <div className="route-icon dropoff"><Navigation size={16}/></div>
              <div className="route-text">
                <p className="route-label">ARRIVÉE</p>
                <p className="route-address">{data.destination || data.dest || data.dropoffAddress || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bouton principal */}
        <div className="actions">
          <button
            onClick={handleValider}
            disabled={isSubmitting}
            className={`confirm-button ${isSubmitting ? 'loading' : ''}`}
            style={{ background: isSubmitting ? '#e2e8f0' : vehicle.color, color:'white' }}
          >
            {isSubmitting ? (
              <><Loader2 className="spinner-icon" size={20}/><span>ENVOI EN COURS...</span></>
            ) : (
              <>
                <span>CONFIRMER LA COURSE — {finalPrice.toLocaleString()} F</span>
                <ArrowRight size={20}/>
              </>
            )}
          </button>

          <button onClick={() => navigate(-1)} disabled={isSubmitting} className="back-button">
            ← RETOUR
          </button>
        </div>

      </div>
    </div>
  );
}