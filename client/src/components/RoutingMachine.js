import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  doc, increment, onSnapshot, query, collection,
  serverTimestamp, updateDoc, where 
} from "firebase/firestore";
import { auth, db } from "../firebase";

// UI Components
import { Wallet, XCircle, Navigation } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import AlerteSolde from "../components/AlerteSolde";
import LivreurNavbar from "../components/LivreurNavbar";

// Leaflet & Routing
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import RoutingMachine from "../components/RoutingMachine";

// Imports des images
import markerLivreurImg from "../assets/marker-livreur.png"; 
import markerClientImg from "../assets/marker-client.png";



// Icons config
const iconLivreurCustom = L.icon({
  iconUrl: markerLivreurImg,
  iconSize: [45, 45],
  iconAnchor: [22, 45]
});

const iconDestCustom = L.icon({
  iconUrl: markerClientImg,
  iconSize: [45, 45],
  iconAnchor: [22, 45]
});

export default function LivreurHome() {
  const navigate = useNavigate();
  const [newOrder, setNewOrder] = useState(null);
  const [activeMission, setActiveMission] = useState(null);
  const [solde, setSolde] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [myPos, setMyPos] = useState(null);

  // 1. Initialisation & GPS
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) { navigate("/login-livreur"); return; }
    
    setIsOnline(true);
    updateDoc(doc(db, "users", u.uid), { isOnline: true }).catch(() => {});

    const watchId = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setMyPos([latitude, longitude]);
      updateDoc(doc(db, "users", u.uid), { 
        lat: latitude, 
        lng: longitude,
        lastSeen: serverTimestamp() // UTILISATION de serverTimestamp
      }).catch(() => {});
    }, null, { enableHighAccuracy: true });

    const unsubSolde = onSnapshot(doc(db, "users", u.uid), (snap) => {
      if (snap.exists()) setSolde(snap.data().soldeJetons || 0);
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
      unsubSolde();
    };
  }, [navigate]);

  // 2. Écouteurs de commandes
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;

    const unsubNew = onSnapshot(query(collection(db, "orders"), where("status", "==", "searching")), (snap) => {
      if (!snap.empty) setNewOrder({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setNewOrder(null);
    });

    const unsubActive = onSnapshot(query(collection(db, "orders"), 
      where("assignedLivreurId", "==", u.uid), where("status", "==", "accepted")), (snap) => {
      if (!snap.empty) setActiveMission({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setActiveMission(null);
    });

    return () => { unsubNew(); unsubActive(); };
  }, []);

  // 3. Actions
  const handleAccept = async () => {
    if (!newOrder) return;
    const commission = Math.round(newOrder.price * 0.10);
    if (solde < commission) return toast.error("Solde insuffisant");
    
    try {
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, "orders", newOrder.id), { 
        assignedLivreurId: uid, 
        status: "accepted", 
        acceptedAt: serverTimestamp() 
      });
      // UTILISATION de increment
      await updateDoc(doc(db, "users", uid), { soldeJetons: increment(-commission) });
      toast.success("Course acceptée !");
    } catch (e) { toast.error("Erreur"); }
  };

  const handleRevoke = async () => {
    if (!activeMission) return;
    if (window.confirm("Annuler la course ?")) {
      await updateDoc(doc(db, "orders", activeMission.id), {
        status: "searching", assignedLivreurId: null, acceptedAt: null
      });
      toast.info("Course annulée");
    }
  };

  return (
    <div className="livreur-home-fullscreen">
      <ToastContainer position="top-center" autoClose={2000} />
      
      <div className="map-background">
        <MapContainer center={[5.348, -4.03]} zoom={15} zoomControl={false} className="full-map">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          
          {myPos && <Marker position={myPos} icon={iconLivreurCustom} />}

          {/* Tracer la route si mission active */}
          {myPos && activeMission?.dropoffLocation && (
            <RoutingMachine 
              from={myPos} 
              to={[activeMission.dropoffLocation.lat, activeMission.dropoffLocation.lng]} 
            />
          )}

          {activeMission?.dropoffLocation && (
            <Marker position={[activeMission.dropoffLocation.lat, activeMission.dropoffLocation.lng]} icon={iconDestCustom} />
          )}
        </MapContainer>
      </div>

      <div className="ui-overlay">
        <header className="floating-header">
          <div className="header-card">
             <div className="user-info">
               <div className={`status-dot ${isOnline ? 'online' : 'offline'}`}></div>
               <h1 className="text-sm font-bold">Livreur Connecté</h1>
             </div>
             {/* UTILISATION de Wallet et solde */}
             <div className="wallet-badge" onClick={() => navigate("/upload-recu")}>
               <Wallet size={14} className="text-indigo-600" />
               <span>{solde.toLocaleString()} J</span>
             </div>
          </div>
        </header>

        <main className="floating-content">
          {/* UTILISATION de AlerteSolde */}
          <AlerteSolde solde={solde} onRechargeClick={() => navigate("/upload-recu")} />

          {/* UTILISATION de newOrder */}
          {newOrder && (
            <div className="order-card-floating new-order">
              <div className="price-banner">OFFRE : {newOrder.price} F</div>
              <div className="p-4">
                <p className="text-sm">Vers: {newOrder.destination}</p>
                <div className="mt-3 button-group">
                  <button className="btn-accept" onClick={handleAccept}>ACCEPTER</button>
                  <button className="btn-close" onClick={() => setNewOrder(null)}>IGNORER</button>
                </div>
              </div>
            </div>
          )}

          {activeMission && (
            <div className="order-card-floating active-mission">
              <div className="price-banner">
                <Navigation size={16} /> <span>EN COURS • {activeMission.price} F</span>
                <XCircle size={18} onClick={handleRevoke} className="cursor-pointer" />
              </div>
              <div className="p-3">
                <p className="text-xs font-bold">{activeMission.destination}</p>
                <button className="w-full mt-2 btn-finish-mini">DÉTAILS</button>
              </div>
            </div>
          )}
        </main>

        {/* UTILISATION de LivreurNavbar */}
        <LivreurNavbar />
      </div>
    </div>
  );
}