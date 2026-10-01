/* eslint-disable no-unused-vars */
import { addDoc, collection, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  ArrowRight,
  Coins,
  Handshake,
  Loader2,
  MapPin,
  Navigation,
  ShieldCheck,
  ShoppingBag,
  UserX,
  PhoneOff
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { auth, db } from "../firebase";

import imgAntara from "../assets/antara.png";
import carConfortImg from "../assets/car-confort.png";
import carEcoImg from "../assets/car-eco.png";
import carSuvImg from "../assets/car-suv.png";
import motoImg from "../assets/moto-3d.png";
import motoChapImg from "../assets/moto-chap.png";
import motoNoStressImg from "../assets/moto-nostress.png";
import imgMoto from "../assets/moto.png";
import imgSaloni from "../assets/saloni.png";
import taxiArrangementImg from "../assets/taxi-arrangement.png";
import taxiConfortImg from "../assets/taxi-confort.png";
import taxiEcoImg from "../assets/taxi-eco.png";
import imgVtc from "../assets/vtc.png";

import "./PageConfirmation.css";

const API_URL = "https://mambo-5bt2.onrender.com";

const maskPhoneNumber = (phone) => {
  if (!phone) return 'Non renseigné';
  const str = String(phone).trim();
  if (str.length < 8) return '********';

  const firstPart = str.slice(0, 5);
  const lastPart = str.slice(-4);
  const maskedLength = Math.max(str.length - 9, 4);
  
  return `${firstPart}${'*'.repeat(maskedLength)}${lastPart}`;
};

const maskClientName = (name) => {
  if (!name) return 'Client masqué';
  const parts = String(name).trim().split(' ');
  return parts.map(part => {
    if (part.length <= 1) return part;
    return part[0] + '*'.repeat(part.length - 1);
  }).join(' ');
};

const VEHICLE_CONFIG = {
  moto: {
    img: imgMoto,
    label: "MOTO RURALE",
    description: "Livraison rapide en zone rurale",
    features: ["Rapide", "Zone Rurale"],
    color: "#10b981",
    isRural: true,
  },
  saloni: {
    img: imgSaloni,
    label: "SALONI",
    description: "Tricycle local polyvalent",
    features: ["Pratique", "Local"],
    color: "#10b981",
    isRural: true,
  },
  antara: {
    img: imgAntara,
    label: "ANTARA",
    description: "Transport de marchandises",
    features: ["Spacieux", "Charge"],
    color: "#f97316",
    isRural: true,
  },
  vtc: {
    img: imgVtc,
    label: "CARGO RURAL",
    description: "Livraison véhicule en zone rurale",
    features: ["Sécurisé", "Zone Rurale"],
    color: "#6366f1",
    isRural: true,
  },
  moto_rurale: {
    img: imgMoto,
    label: "MOTO RURALE",
    description: "Livraison rapide en zone rurale",
    features: ["Rapide", "Zone Rurale"],
    color: "#10b981",
    isRural: true,
  },
  vtc_rural: {
    img: imgVtc,
    label: "CARGO RURAL",
    description: "Livraison véhicule en zone rurale",
    features: ["Sécurisé", "Zone Rurale"],
    color: "#6366f1",
    isRural: true,
  },
  MotoNoStress: {
    img: motoNoStressImg,
    label: "NO STRESS",
    description: "Livraison sans urgence",
    features: ["Économique", "Flexible"],
    color: "#10b981",
  },
  Moto: {
    img: motoImg,
    label: "STANDARD",
    description: "Livraison rapide sous 3h",
    features: ["Rapide", "Fiable"],
    color: "#10b981",
  },
  MotoChap: {
    img: motoChapImg,
    label: "CHAP CHAP",
    description: "Livraison immédiate",
    features: ["Ultra rapide", "Prioritaire"],
    color: "#f97316",
  },
  VtcEco: {
    img: carEcoImg,
    label: "CARGO EXPRESS",
    description: "Livraison légère et rapide",
    features: ["Express", "Colis"],
    color: "#10b981",
  },
  VtcConfort: {
    img: carConfortImg,
    label: "CARGO STANDARD",
    description: "Livraison standard sécurisée",
    features: ["Standard", "Sécurisé"],
    color: "#6366f1",
  },
  VtcSuv: {
    img: carSuvImg,
    label: "CARGO CAMION",
    description: "Gros colis / volume",
    features: ["Camion", "Grand volume"],
    color: "#8b5cf6",
  },
  TaxiEco: {
    img: taxiEcoImg,
    label: "PIÉTON",
    description: "Livreur à pied · 0 à 2 km",
    features: ["Piéton", "≤ 2 km"],
    color: "#f59e0b",
    isTaxi: true,
  },
  TaxiConfort: {
    img: taxiConfortImg,
    label: "BICYCLETTE",
    description: "Livreur à vélo · 2 à 4 km",
    features: ["Vélo", "2–4 km"],
    color: "#f59e0b",
    isTaxi: true,
  },
  TaxiArrangement: {
    img: taxiArrangementImg,
    label: "TRANSPORTEUR",
    description: "Voiture / coffre — prix libre",
    features: ["Coffre", "Négociable"],
    color: "#8b5cf6",
    isTaxi: true,
    isArrangement: true,
  },
};

export default function PageConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const data = useMemo(() => location.state || {}, [location.state]);

  const vehicleId = data.vehicle || data.vehicleId || "";
  const isTiersOrder =
    data.isTiersOrder || data.isForThirdParty || data.fromVendeur || false;
  const isStoreDelivery = !!data.isStoreDelivery;

  const resolvedKey = useMemo(() => {
    if (isTiersOrder) return "MotoNoStress";

    if (VEHICLE_CONFIG[vehicleId]) return vehicleId;
    const clean = vehicleId.toString().toLowerCase().trim();

    if (clean.includes("antara")) return "antara";
    if (clean.includes("saloni")) return "saloni";
    if (clean.includes("moto_rurale") || clean.includes("moto rurale"))
      return "moto_rurale";
    if (clean.includes("motochap") || clean.includes("moto chap"))
      return "MotoChap";
    if (clean.includes("motonos") || clean.includes("no stress"))
      return "MotoNoStress";
    if (clean.includes("moto")) return data.isRuralZone ? "moto" : "Moto";
    if (clean.includes("vtcsuv") || clean.includes("suv") || clean.includes("camion"))
      return "VtcSuv";
    if (
      clean.includes("vtcconfort") ||
      clean.includes("confort") ||
      clean.includes("standard")
    )
      return "VtcConfort";
    if (clean.includes("vtceco") || clean.includes("express")) return "VtcEco";
    if (clean.includes("vtc") || clean.includes("cargo"))
      return data.isRuralZone ? "vtc" : "VtcEco";
    if (clean.includes("taxiconfort") || clean.includes("bicycle"))
      return "TaxiConfort";
    if (clean.includes("taxieco") || clean.includes("pieton") || clean.includes("piéton"))
      return "TaxiEco";
    if (clean.includes("arrangement") || clean.includes("transporteur"))
      return "TaxiArrangement";
    if (clean.includes("taxi") || clean.includes("hustle")) return "TaxiEco";

    return data.isRuralZone ? "vtc" : "VtcEco";
  }, [vehicleId, data.isRuralZone, isTiersOrder]);

  const vehicle = VEHICLE_CONFIG[resolvedKey] || VEHICLE_CONFIG.VtcEco;

  const finalPrice = useMemo(() => {
    const raw =
      data.proposedPrice ??
      data.customerOffer ??
      data.price ??
      data.estimatedPrice ??
      1000;
    const n = Number(String(raw).replace(/[^0-9]/g, "")) || 0;
    return n || 1000;
  }, [data]);

  const basePrice = useMemo(() => {
    const raw = data.basePrice ?? data.price ?? 1000;
    return Number(String(raw).replace(/[^0-9]/g, "")) || 1000;
  }, [data]);

  const showPriceDiff =
    vehicle.isArrangement && basePrice > 0 && basePrice !== finalPrice;

  const vehicleType = useMemo(() => {
    const k = resolvedKey.toLowerCase();
    if (k.includes("moto")) return "moto";
    if (k.includes("taxi")) return "taxi";
    return "vtc";
  }, [resolvedKey]);

  const handleValider = async () => {
    if (!auth.currentUser) {
      navigate("/login-client");
      return;
    }
    setIsSubmitting(true);
    try {
      let clientName =
        data.prefillName ||
        data.thirdPartyName ||
        data.clientName ||
        data.nomClient ||
        "";
      let clientPhone =
        data.prefillPhone ||
        data.thirdPartyPhone ||
        data.clientPhone ||
        data.telephoneClient ||
        data.tel ||
        "";

      let realClientId = data.realClientId || data.clientId || auth.currentUser.uid;

      if (!clientName || !clientPhone) {
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

      const linkedOrderId = data.orderId || data.linkedOrderId || null;
      if (linkedOrderId && !realClientId) {
        try {
          const orderSnap = await getDoc(doc(db, "orders", linkedOrderId));
          if (orderSnap.exists()) {
            const od = orderSnap.data();
            realClientId = od.clientId || od.userId || auth.currentUser.uid;
            clientName = clientName || od.clientName || od.nomClient || "";
            clientPhone =
              clientPhone || od.clientPhone || od.telephoneClient || "";
          }
        } catch (e) {
          console.warn("Impossible de charger l'order liée :", e);
        }
      }

      const assignedCoursierId =
        data.vendeurId ||
        data.assignedCoursierId ||
        data.coursierId ||
        null;

      const targetDriverId =
        data.assignedLivreurId || data.driverId || data.livreurId || null;

      const courseData = {
        clientId: realClientId,
        clientUserId: realClientId,
        clientName,
        clientPhone,
        telephoneClient: clientPhone,

        orderId: linkedOrderId,
        linkedOrderId: linkedOrderId,

        assignedCoursierId: assignedCoursierId || null,
        coursierId: assignedCoursierId || null,

        pickupAddress:
          data.pickupAddress ||
          data.pickup ||
          data.departAdresse ||
          "Position actuelle",
        dropoffAddress:
          data.destination ||
          data.dest ||
          data.dropoffAddress ||
          data.targetDestination ||
          data.targetAddress ||
          "",
        destination:
          data.destination ||
          data.dest ||
          data.dropoffAddress ||
          data.targetDestination ||
          data.targetAddress ||
          "",
        pickupLocation: data.pickupLocation || null,
        dropoffLocation: data.dropoffLocation || null,

        vehicleType,
        vehicleId: resolvedKey,
        courseMode: vehicle.label,
        isCompteur: false,
        baseFare: null,
        estimatedPrice: null,
        price: finalPrice,
        basePrice: basePrice,
        proposedPrice: finalPrice,

        status: targetDriverId ? "offering" : "pending",

        needCommission: isStoreDelivery ? false : true,
        commissionPaid: isStoreDelivery ? null : true,
        commissionRequested: isStoreDelivery ? false : true,
        commissionWhatsAppSent: isStoreDelivery ? false : true,
        passationCode: null,
        paymentStatus: "pending",

        driverId: targetDriverId,
        assignedLivreurId: targetDriverId,
        livreurId: targetDriverId,
        rejectedBy: [],

        isRuralZone: data.isRuralZone || vehicle.isRural || false,
        zone: data.zoneId || data.assignedCitySector || "abidjan",
        zoneId: data.zoneId || data.assignedCitySector || "abidjan",
        isForThirdParty: isTiersOrder || false,
        isTiersOrder: isTiersOrder || false,
        fromVendeur: !!data.fromVendeur,
        thirdPartyName: clientName,
        thirdPartyPhone: clientPhone,
        isNegoActive: data.isNegoActive || false,
        isArrangement: !!vehicle.isArrangement,
        distanceKm: data.distanceKm || data.distance || 0,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "courses"), courseData);

      // MISE À JOUR CRITIQUE : Synchronisation du statut de la commande liée
      if (linkedOrderId) {
        try {
          await updateDoc(doc(db, "orders", linkedOrderId), {
            status: "attente_livreur", // Corrigé pour faire évoluer la commande
            courseRequested: true,
            linkedCourseId: docRef.id,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn("Impossible de mettre à jour l'order liée :", e.message);
        }
      }

      toast.success(
        isTiersOrder
          ? "Livreur réservé ! En attente de son arrivée au point de ramassage."
          : "Course confirmée !"
      );

      setTimeout(() => {
        navigate(`/tracking/${docRef.id}`, { replace: true });
      }, 800);
    } catch (err) {
      console.error("Erreur confirmation :", err);
      toast.error("Erreur lors de la validation des permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const rawBeneficiaryName = data.prefillName || data.thirdPartyName || data.clientName || data.nomClient || "";
  const rawBeneficiaryPhone = data.prefillPhone || data.thirdPartyPhone || data.clientPhone || data.telephoneClient || data.tel || "";

  return (
    <div className="confirmation-page">
      <ToastContainer position="top-center" autoClose={2000} />

      <div className="confirmation-container">
        <div className="confirmation-header">
          <div>
            <span className="confirmation-subtitle">
              {data.isStoreDelivery
                ? "LIVRAISON BOUTIQUE"
                : isTiersOrder
                  ? "RÉSERVATION LIVREUR"
                  : "VALIDATION"}
            </span>
            <h1 className="confirmation-title">
              {vehicle.isArrangement
                ? "Prix Transporteur"
                : "Récapitulatif livraison"}
            </h1>
          </div>
          <div className="confirmation-icon">
            {data.isStoreDelivery ? (
              <ShoppingBag size={18} />
            ) : vehicle.isArrangement ? (
              <Handshake size={18} />
            ) : (
              <ShieldCheck size={18} />
            )}
          </div>
        </div>

        {(data.isForThirdParty || isTiersOrder) && !data.isStoreDelivery && (
          <div
            style={{
              marginBottom: 15,
              background: "#eff6ff",
              borderLeft: "4px solid #3b82f6",
              padding: 12,
              borderRadius: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <p
                style={{
                  fontSize: 10,
                  color: "#3b82f6",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                BÉNÉFICIAIRE
              </p>
              <span style={{ fontSize: 10, background: "#dbeafe", color: "#1e40af", padding: "2px 6px", borderRadius: 10, fontWeight: 700 }}>
                Données protégées
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}>
              <UserX size={15} color="#3b82f6" />
              <p
                style={{
                  fontSize: 15,
                  fontWeight: "bold",
                  color: "#1e3a8a",
                  margin: 0,
                }}
              >
                {maskClientName(rawBeneficiaryName)}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <PhoneOff size={14} color="#3b82f6" />
              <p style={{ fontSize: 13, color: "#1e40af", margin: 0, fontWeight: 600, letterSpacing: "0.03em" }}>
                {maskPhoneNumber(rawBeneficiaryPhone)}
              </p>
            </div>
          </div>
        )}

        <div
          style={{
            marginBottom: 20,
            background: "linear-gradient(135deg,#f8fafc,#f1f5f9)",
            border: "1px solid #cbd5e1",
            padding: 16,
            borderRadius: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                background: "#475569",
                padding: 6,
                borderRadius: 10,
                color: "white",
              }}
            >
              <Coins size={16} />
            </div>
            <div>
              <h4
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#1e293b",
                  textTransform: "uppercase",
                }}
              >
                {vehicle.isArrangement
                  ? "Votre proposition"
                  : "Montant à payer"}
              </h4>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
                {isTiersOrder
                  ? "Enregistrez le contact assistance pour confirmer votre paiement par contrôle du reçu complet Wave."
                  : "Paiement en espèces à destination"}
              </p>
            </div>
          </div>

          <div
            style={{
              background: "white",
              padding: 16,
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#94a3b8",
                textTransform: "uppercase",
              }}
            >
              {vehicle.label}
            </span>
            <div
              style={{
                fontSize: 32,
                fontWeight: 950,
                color: vehicle.color,
                margin: "8px 0",
              }}
            >
              {finalPrice.toLocaleString()} F CFA
            </div>
            {showPriceDiff && (
              <p
                style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  textDecoration: "line-through",
                }}
              >
                Estimé : {basePrice.toLocaleString()} F
              </p>
            )}
          </div>
        </div>

        <div className="confirmation-card">
          <div className="vehicle-preview">
            <div className="vehicle-image-wrapper">
              <div
                className="vehicle-glow"
                style={{ background: vehicle.color }}
              />
              <img
                src={vehicle.img}
                alt={vehicle.label}
                className="vehicle-image"
              />
            </div>
            <div
              className="vehicle-badge"
              style={{ borderColor: vehicle.color }}
            >
              <span style={{ color: vehicle.color }}>{vehicle.label}</span>
            </div>
          </div>

          <div className="route-info">
            <div className="route-point">
              <div className="route-icon pickup">
                <MapPin size={16} />
              </div>
              <div className="route-text">
                <p className="route-label">DÉPART</p>
                <p className="route-address">
                  {data.pickupAddress ||
                    data.pickup ||
                    data.departAdresse ||
                    "Ma position"}
                </p>
              </div>
            </div>
            <div className="route-point">
              <div className="route-icon dropoff">
                <Navigation size={16} />
              </div>
              <div className="route-text">
                <p className="route-label">ARRIVÉE</p>
                <p className="route-address">
                  {data.destination ||
                    data.dest ||
                    data.dropoffAddress ||
                    data.targetDestination ||
                    data.targetAddress ||
                    "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="actions">
          <button
            onClick={handleValider}
            disabled={isSubmitting}
            className={`confirm-button ${isSubmitting ? "loading" : ""}`}
            style={{
              background: isSubmitting ? "#e2e8f0" : vehicle.color,
              color: "white",
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="spinner-icon" size={20} />
                <span>ENVOI EN COURS...</span>
              </>
            ) : (
              <>
                <span>
                  {isTiersOrder
                    ? `RÉSERVER LE LIVREUR — ${finalPrice.toLocaleString()} F`
                    : vehicle.isArrangement
                      ? `PROPOSER ${finalPrice.toLocaleString()} F`
                      : `CONFIRMER — ${finalPrice.toLocaleString()} F`}
                </span>
                <ArrowRight size={20} />
              </>
            )}
          </button>

          <button
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
            className="back-button"
          >
            ← RETOUR
          </button>
        </div>
      </div>
    </div>
  );
}