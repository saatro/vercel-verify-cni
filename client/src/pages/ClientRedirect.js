import React, { useState, useEffect } from "react";
import { doc, getDoc, getDocs, collection, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { useLocation, useNavigate } from "react-router-dom";
import { Bike, Car, Loader2, CheckCircle, ShieldCheck } from "lucide-react";

/**
 * Calcul de la distance Haversine entre deux points GPS
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // rayon Terre en km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function ClientRedirect() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const orderId = state?.orderId; 

  const [orderData, setOrderData] = useState(null);
  const [closestLivreur, setClosestLivreur] = useState(null);
  const [status, setStatus] = useState("gps_search"); // gps_search | livreur_search | assigned | error
  const [errorMessage, setErrorMessage] = useState("");

  // 1. Récupérer les données réelles de la course depuis Firestore
  useEffect(() => {
    if (!orderId) {
      console.error("Aucun orderId fourni pour l'attribution.");
      setStatus("error");
      setErrorMessage("Identifiant de commande manquant.");
      return;
    }

    const fetchOrderDetails = async () => {
      try {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (orderSnap.exists()) {
          const data = orderSnap.data();
          
          // CRITÈRE GÉOGRAPHIQUE RESTRICTIF : Sécuriser la frontière Abidjan / Alépé
          const isPickupInAbidjan = data.pickupAddress?.toLowerCase().includes("angré") || 
                                    data.pickupAddress?.toLowerCase().includes("cocody") ||
                                    data.pickupAddress?.toLowerCase().includes("bingerville");

          if (data.isAlepeZone && isPickupInAbidjan) {
            setStatus("error");
            setErrorMessage("Zone de livraison non prise en charge. Ce ramassage est situé à Abidjan. Veuillez basculer vers l'interface Grand Abidjan.");
            return;
          }

          setOrderData(data);
          setStatus("livreur_search");
        } else {
          setStatus("error");
          setErrorMessage("Commande introuvable.");
        }
      } catch (err) {
        console.error("Erreur récupération commande:", err);
        setStatus("error");
        setErrorMessage("Impossible de charger les données de la course.");
      }
    };

    fetchOrderDetails();
  }, [orderId]);

  // 2. Trouver le livreur le plus proche selon les coordonnées réelles de la commande
  useEffect(() => {
    const fetchAndAssignLivreur = async () => {
      if (!orderData || !orderId || status !== "livreur_search") return;

      try {
        // Extraction des coordonnées réelles du point de collecte de la commande
        const pickupLat = orderData.pickupLocation?.lat;
        const pickupLng = orderData.pickupLocation?.lng;

        if (!pickupLat || !pickupLng) {
          setStatus("error");
          setErrorMessage("Coordonnées de ramassage manquantes sur la commande.");
          return;
        }

        const snapshot = await getDocs(collection(db, "livreurs"));
        let minDist = Infinity;
        let nearest = null;

        snapshot.forEach((d) => {
          const data = d.data();
          // Filtrer uniquement les livreurs actifs et localisés
          if (data.latitude && data.longitude) {
            const dist = getDistance(
              pickupLat,
              pickupLng,
              data.latitude,
              data.longitude
            );
            if (dist < minDist) {
              minDist = dist;
              nearest = { id: d.id, ...data, distance: dist };
            }
          }
        });

        if (nearest) {
          setClosestLivreur(nearest);
          
          // Récupération dynamique et sécurisée du téléphone du client
          const userSnap = await getDoc(doc(db, "users", orderData.clientId));
          const verifiedClientPhone = userSnap.exists() ? userSnap.data().phone || "" : "";

          // Attribution officielle de la course avec préservation des états métier
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, {
            livreurId: nearest.id,
            livreurNom: nearest.nom || "Livreur Mambo",
            livreurPhone: nearest.telephone || "",
            clientPhone: verifiedClientPhone,
            paymentMethod: "cash", // Rectification obligatoire du mode de paiement
            vehicleType: orderData.vehicleType || "moto", // Dynamique et hérité du choix client
            status: "accepted", // Respect strict du flux d'acceptation
            assignedAt: serverTimestamp()
          });

          setStatus("assigned");

          // Redirection intelligente et routage étanche vers le bon canal de tracking
          setTimeout(() => {
            if (orderData.isAlepeZone) {
              navigate(`/tracking-alepe/${orderId}`);
            } else {
              navigate(`/tracking/${orderId}`);
            }
          }, 3500);
        } else {
          setStatus("error");
          setErrorMessage("Aucun chauffeur disponible à proximité pour le moment.");
        }
      } catch (error) {
        console.error("Erreur lors de l'attribution:", error);
        setStatus("error");
        setErrorMessage("Une erreur est survenue lors de l'attribution du chauffeur.");
      }
    };

    fetchAndAssignLivreur();
  }, [orderData, orderId, status, navigate]);

  return (
    <div style={S.container}>
      <div style={S.card}>
        {status === "gps_search" && (
          <>
            <Loader2 size={48} style={S.spinner} />
            <h2 style={S.title}>Analyse Course...</h2>
            <p style={S.sub}>Vérification des adresses et de la zone logistique</p>
          </>
        )}

        {status === "livreur_search" && (
          <>
            {orderData?.vehicleType === "moto" ? (
              <Bike size={48} style={S.spinner} />
            ) : (
              <Car size={48} style={S.spinner} />
            )}
            <h2 style={S.title}>Recherche Chauffeur</h2>
            <p style={S.sub}>Calcul du véhicule le plus proche du point de collecte...</p>
          </>
        )}

        {status === "assigned" && closestLivreur && (
          <>
            <div style={S.successIcon}>
              <CheckCircle size={50} color="#10b981" />
            </div>
            <h2 style={S.title}>Chauffeur Trouvé !</h2>
            <div style={S.livreurInfo}>
              <ShieldCheck size={18} color="#10b981" />
              <span style={S.name}>{closestLivreur.nom}</span>
            </div>
            <p style={S.dist}>📍 À {closestLivreur.distance.toFixed(1)} km d'Angré</p>
            <p style={S.redirectMsg}>Ouverture de votre carte de suivi...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div style={S.successIcon}>
              <CheckCircle size={50} color="#ef4444" />
            </div>
            <h2 style={{ ...S.title, color: "#ef4444" }}>Alerte Zone</h2>
            <p style={{ ...S.sub, color: "#475569", marginBottom: "20px" }}>{errorMessage}</p>
            {errorMessage.includes("Abidjan") && (
              <button 
                onClick={() => navigate("/grand-abidjan")} 
                style={S.actionButton}
              >
                BASCULER VERS ABIDJAN
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    background: "#0f172a",
    padding: "20px",
    fontFamily: "Inter, sans-serif",
  },
  card: {
    background: "#1e293b",
    padding: "40px 30px",
    borderRadius: "32px",
    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
    textAlign: "center",
    width: "100%",
    maxWidth: "360px",
    border: "1px solid #334155",
  },
  spinner: {
    color: "#10b981",
    marginBottom: "20px",
    animation: "spin 2s linear infinite",
  },
  title: {
    fontSize: "20px",
    fontWeight: "900",
    color: "#ffffff",
    textTransform: "uppercase",
    margin: "0 0 8px",
    letterSpacing: "-0.5px",
  },
  sub: {
    fontSize: "13px",
    color: "#94a3b8",
    margin: 0,
  },
  successIcon: {
    marginBottom: "20px",
    display: "flex",
    justifyContent: "center",
  },
  livreurInfo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    background: "#064e3b",
    padding: "10px 16px",
    borderRadius: "100px",
    margin: "15px 0",
    border: "1px solid #059669",
  },
  name: {
    fontSize: "14px",
    fontWeight: "800",
    color: "#34d399",
    textTransform: "uppercase",
  },
  dist: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#94a3b8",
    margin: "0 0 20px",
  },
  redirectMsg: {
    fontSize: "10px",
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  actionButton: {
    width: "100%",
    padding: "14px",
    background: "#10b981",
    color: "#ffffff",
    border: "none",
    borderRadius: "16px",
    fontWeight: "800",
    fontSize: "13px",
    cursor: "pointer",
    transition: "background 0.2s",
  }
};

const styleTag = document.createElement("style");
styleTag.innerHTML = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleTag);