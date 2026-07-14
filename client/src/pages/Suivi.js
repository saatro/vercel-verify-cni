import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import socket from "../socket";
import { toast } from "react-toastify";
import "./Suivi.css";

/* ================= ICONS ================= */
// Note : Assure-toi que ces fichiers sont dans ton dossier /public
const clientIcon = new L.Icon({ iconUrl: "/marker-client.png", iconSize: [36, 36], iconAnchor: [18, 36] });
const destIcon = new L.Icon({ iconUrl: "/marker-destination.png", iconSize: [36, 36], iconAnchor: [18, 36] });

const livreurIconPulse = new L.divIcon({
  className: "custom-div-icon",
  html: `
    <div class="livreur-marker-pulse"></div>
    <img src="/marker-livreur.png" style="width:36px; height:36px; position:relative; top:-38px; left:0px;">
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 36]
});

/* ================= FORMULE HAVERSINE ================= */
const haversine = (a, b) => {
  if (!a || !b || !a[0] || !b[0]) return 0;
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

/* ================= COMPOSANT AUTO-BOUNDS ================= */
function AutoBounds({ a, b }) {
  const map = useMap();
  useEffect(() => {
    if (a && b && a[0] && b[0]) {
      map.fitBounds([a, b], { padding: [80, 80], animate: true });
    }
  }, [a, b, map]);
  return null;
}

export default function Suivi() {
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [userPos, setUserPos] = useState(null); 
  const [livreurPos, setLivreurPos] = useState(null); 
  const [destPos, setDestPos] = useState(null); 
  const [route, setRoute] = useState([]);
  const [distance, setDistance] = useState(null);
  const [eta, setEta] = useState(null);
  const [orderStatus, setOrderStatus] = useState("");

  /* ================= 1. RÉCUPÉRATION DATA & ROLE ================= */
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }

    // Récupérer le rôle de l'utilisateur
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setRole(snap.data().role);
    });

    const lastOrderId = sessionStorage.getItem("lastLivraisonId");
    if (!lastOrderId) {
      toast.error("Aucune mission active.");
      navigate(-1);
      return;
    }

    // Écoute en temps réel de la livraison
    const unsubOrder = onSnapshot(doc(db, "livraisons", lastOrderId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDestPos(data.destPos);
        setUserPos(data.pickupPos);
        setOrderStatus(data.status);

        if (data.status === "completed") {
          toast.success("Mission terminée !");
          if (role === "livreur") navigate("/recap-course");
        }
      }
    });

    return () => unsubOrder();
  }, [navigate, role]);

  /* ================= 2. TRACKING SOCKET ================= */
  useEffect(() => {
    socket.on("livreurPosition", (p) => {
      if (p.lat && p.lng) setLivreurPos([p.lat, p.lng]);
    });
    return () => socket.off("livreurPosition");
  }, []);

  /* ================= 3. CALCUL ITINÉRAIRE ================= */
  useEffect(() => {
    const updateNavigation = async () => {
      if (!livreurPos) return;
      
      // La cible change selon si le livreur va chercher le colis ou le livrer
      let target = (orderStatus === "accepted") ? userPos : destPos;
      if (!target) return;

      try {
        const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-motorcycle", {
          method: "POST",
          headers: {
            "Authorization": process.env.REACT_APP_ORS_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ coordinates: [[livreurPos[1], livreurPos[0]], [target[1], target[0]]] }),
        });
        const data = await res.json();
        const coords = data.features?.[0]?.geometry.coordinates.map(([lng, lat]) => [lat, lng]) || [];
        setRoute(coords);

        const km = haversine(livreurPos, target);
        setDistance(km.toFixed(1));
        setEta(Math.round((km / 25) * 60)); // Basé sur 25km/h en ville
      } catch (e) {
        console.error("Erreur itinéraire API:", e);
      }
    };

    updateNavigation();
  }, [livreurPos, userPos, destPos, orderStatus]);

  /* ================= 4. MISE À JOUR STATUT (LIVREUR) ================= */
  const handleUpdateStatus = async () => {
    const lastOrderId = sessionStorage.getItem("lastLivraisonId");
    const orderRef = doc(db, "livraisons", lastOrderId);

    try {
      if (orderStatus === "accepted") {
        await updateDoc(orderRef, { 
          status: "picked_up",
          pickedUpAt: serverTimestamp() 
        });
        toast.info("Colis en main ! Direction la destination.");
      } else if (orderStatus === "picked_up") {
        await updateDoc(orderRef, { 
          status: "completed",
          completedAt: serverTimestamp() 
        });
      }
    } catch (error) {
      toast.error("Erreur de connexion à la base de données.");
    }
  };

  return (
    <div className="suivi-page">
      <div className="map-container">
        <MapContainer center={[5.345, -4.024]} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />

          {userPos && <Marker position={userPos} icon={clientIcon} />}
          {livreurPos && <Marker position={livreurPos} icon={livreurIconPulse} />}
          {destPos && <Marker position={destPos} icon={destIcon} />}

          {route.length > 0 && <Polyline positions={route} weight={5} color="#4CAF50" />}

          <AutoBounds a={livreurPos} b={orderStatus === "accepted" ? userPos : destPos} />
        </MapContainer>
      </div>

      <div className="shadow-lg info-panel">
        <div className="header-bar">
           <button className="back-btn" onClick={() => navigate(-1)}>⬅</button>
           <span className="status-badge">{orderStatus.replace('_', ' ').toUpperCase()}</span>
        </div>
        
        <div className="p-4 text-center">
          <h3 className="mb-2 text-xl font-bold">
            {orderStatus === "accepted" ? "Aller chercher le colis" : 
             orderStatus === "picked_up" ? "Livraison en cours" : "Mission Terminée"}
          </h3>
          
          <div className="stats-grid">
            <div className="stat-item">
               <span className="label">Distance</span>
               <span className="value">{distance || "--"} km</span>
            </div>
            <div className="stat-item">
               <span className="label">Arrivée prévue</span>
               <span className="value">{eta || "--"} min</span>
            </div>
          </div>
        </div>
        
        {role === "livreur" && orderStatus !== "completed" && (
          <div className="p-4">
             <button 
                className={`action-btn ${orderStatus === "accepted" ? "btn-pickup" : "btn-complete"}`}
                onClick={handleUpdateStatus}
             >
                {orderStatus === "accepted" ? "📦 COLIS RÉCUPÉRÉ" : "✅ MARQUER COMME LIVRÉ"}
             </button>
          </div>
        )}
      </div>
    </div>
  );
}