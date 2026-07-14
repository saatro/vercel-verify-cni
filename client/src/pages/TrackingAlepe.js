import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Flame,
  Loader2,
  Phone,
  Share2,
  ShieldAlert,
  X,
  User,
  Activity,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useNavigate, useParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db } from "../firebase";

import "./Tracking.css";

const villageIcon = L.divIcon({
  html: `<div style="background:#ef4444; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px rgba(239,68,68,0.5);"></div>`,
  className: '', iconSize: [12, 12]
});

const driverIcon = L.divIcon({
  html: `<div class="pulse-driver" style="background:#6366f1; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow: 0 0 15px rgba(99,102,241,0.6);"></div>`,
  className: '', iconSize: [18, 18]
});

// ✅ Ajustement automatique dynamique prenant en compte la hauteur du panneau
function MapController({ points, isPanelOpen }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points || points.length === 0) return;
    const validPoints = points.filter(p => p && p[0] !== undefined && p[1] !== undefined);
    if (validPoints.length > 0) {
      const bounds = L.latLngBounds(validPoints);
      if (bounds.isValid()) {
        // Calcule le padding du bas dynamiquement pour surélever les marqueurs au-dessus du panneau ouvert/fermé
        const bottomPadding = isPanelOpen ? window.innerHeight * 0.45 : 120;
        map.fitBounds(bounds, { 
          paddingTop: 120,
          paddingBottom: bottomPadding, 
          paddingLeft: 40,
          paddingRight: 40,
          animate: true,
          duration: 1
        });
      }
    }
  }, [points, map, isPanelOpen]);
  return null;
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export default function TrackingAlepe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [livreurPos, setLivreurPos] = useState(null);
  const [route, setRoute] = useState([]);
  const [distanceInfo, setDistanceInfo] = useState({ km: "0", min: "0" });
  const [isPanelOpen, setIsPanelOpen] = useState(true); // ✅ État du panneau rétractable

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "courses", id), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setMission(data);
        
        if (data.status === "completed" || data.status === "cancelled") {
          toast.info(data.status === "completed" ? "Course terminée avec succès" : "Course annulée");
          setTimeout(() => navigate("/"), 3000);
        }
      }
    }, (error) => {
      console.error("Erreur écoute course client:", error);
    });
    return () => unsub();
  }, [id, navigate]);

  useEffect(() => {
    const targetLivreurId = mission?.assignedLivreurId || mission?.livreurId || mission?.driverId || mission?.livreurUid;
    if (!targetLivreurId) {
      setDriverData(null);
      return;
    }

    const unsubDriver = onSnapshot(doc(db, "users", targetLivreurId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setDriverData(d);
        
        const lat = d.lat ?? d.latitude;
        const lng = d.lng ?? d.longitude;
        if (lat && lng) {
          setLivreurPos([lat, lng]);
        }
      }
    }, (error) => {
      console.error("Erreur écoute position chauffeur:", error);
    });
    return () => unsubDriver();
  }, [mission]);

  useEffect(() => {
    if (livreurPos && mission?.dropoffLocation) {
      const startLng = livreurPos[1];
      const startLat = livreurPos[0];
      const endLng = mission.dropoffLocation.lng;
      const endLat = mission.dropoffLocation.lat;
      
      fetch(`https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Erreur serveur OSRM: ${response.status}`);
          }
          return response.json();
        })
        .then((res) => {
          if (res.routes?.[0]) {
            setRoute(res.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
            setDistanceInfo({
              km: (res.routes[0].distance / 1000).toFixed(1),
              min: Math.ceil(res.routes[0].duration / 60)
            });
          }
        })
        .catch((err) => {
          console.warn("⚠️ OSRM indisponible. Activation de l'itinéraire de secours.", err);
          const straightDistance = calculateHaversineDistance(startLat, startLng, endLat, endLng);
          const estimatedMinutes = Math.ceil((straightDistance / 40) * 60);

          setRoute([[startLat, startLng], [endLat, endLng]]);
          setDistanceInfo({
            km: straightDistance.toFixed(1),
            min: estimatedMinutes
          });
        });
    }
  }, [livreurPos, mission]);

  const hasDriver = useMemo(() => {
    return !!(mission?.assignedLivreurId || mission?.livreurId || mission?.driverId || mission?.status === "accepted" || mission?.status === "arrived" || mission?.status === "in_transit");
  }, [mission]);

  const statusConfig = useMemo(() => {
    if (!mission) return { label: "Chargement...", color: "text-slate-500", bg: "bg-slate-400" };
    
    switch (mission.status) {
      case "pending":
        return { label: "Recherche d'un chauffeur...", color: "text-amber-500", bg: "bg-amber-500" };
      case "accepted":
        return { label: "Chauffeur en route vers vous", color: "text-indigo-600", bg: "bg-indigo-500" };
      case "arrived":
        return { label: "Chauffeur arrivé au point de départ", color: "text-emerald-600", bg: "bg-emerald-500" };
      case "in_transit":
        return { label: "Course en cours de route", color: "text-blue-600", bg: "bg-blue-500" };
      default:
        return hasDriver 
          ? { label: "Chauffeur en route vers vous", color: "text-indigo-600", bg: "bg-indigo-500" }
          : { label: "Recherche de chauffeur...", color: "text-slate-500", bg: "bg-slate-500" };
    }
  }, [mission, hasDriver]);

  const displayVehicleModel = useMemo(() => {
    const model = driverData?.vehicleType || driverData?.vehicleModel || driverData?.marqueVehicule || mission?.courseMode || mission?.vehicleType;
    return model ? model.toUpperCase() : "VÉHICULE ALÉPÉ";
  }, [driverData, mission]);

  const displayVehiclePlate = useMemo(() => {
    return (
      driverData?.matricule || 
      driverData?.plaque ||
      driverData?.immatriculation || 
      driverData?.vehiclePlate || 
      mission?.vehiclePlate ||
      mission?.immatriculation ||
      mission?.plaque ||
      null
    );
  }, [driverData, mission]);

  if (!mission) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white">
        <Loader2 className="mb-2 text-indigo-600 animate-spin" />
        <p className="text-xs font-bold uppercase text-slate-500">Chargement du trajet Alépé...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-50">
      <ToastContainer position="top-center" />

      {/* Header Info */}
      <div className="absolute top-3 left-4 right-4 z-[1000] flex flex-col gap-2">
        <div className="p-4 border border-white shadow-xl bg-white/90 backdrop-blur-md rounded-3xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-indigo-600 uppercase">Destination</p>
              <h2 className="text-[13px] font-black leading-none text-slate-700">{mission.destination || "Non spécifiée"}</h2>
            </div>
            <div className="text-right">
              <p className="text-xl font-black text-slate-900">{distanceInfo.km} <span className="text-xs">KM</span></p>
              <p className="text-[10px] font-bold text-slate-400 italic">Alépé Zone ({distanceInfo.min} min)</p>
            </div>
          </div>
        </div>

       
      </div>

      {/* Carte */}
      <MapContainer center={[5.5, -3.6]} zoom={13} className="z-0 w-full h-full" zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        {livreurPos && <Marker position={livreurPos} icon={driverIcon} />}
        {mission.dropoffLocation && (
          <Marker position={[mission.dropoffLocation.lat, mission.dropoffLocation.lng]} icon={villageIcon} />
        )}
        {route.length > 0 && <Polyline positions={route} color="#6366f1" weight={6} opacity={0.6} />}
        <MapController 
          points={[livreurPos, mission.dropoffLocation ? [mission.dropoffLocation.lat, mission.dropoffLocation.lng] : null]} 
          isPanelOpen={isPanelOpen} 
        />
      </MapContainer>

      {/* ✅ Panneau Rétractable de Course */}
      <div className={`fixed bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-in-out ${isPanelOpen ? "translate-y-0" : "translate-y-[calc(100%-60px)]"}`}>
        
        {/* Poignée / Bouton de bascule */}
        <button 
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="flex items-center justify-center w-full py-3 text-slate-400 hover:text-slate-600 focus:outline-none"
        >
          <div className="flex flex-col items-center">
            <span className="w-12 h-1.5 bg-slate-200 rounded-full mb-1"></span>
            {isPanelOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </div>
        </button>

        <div className="px-5 pb-6 max-h-[75vh] overflow-y-auto">
          {/* Section Statut Étape par Étape */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Statut de la course</p>
              <p className={`flex items-center gap-1.5 text-[11px] font-black uppercase ${statusConfig.color} mt-0.5`}>
                <span className="relative flex w-1 h-2">
                  <span className={`absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping ${statusConfig.bg}`}></span>
                  <span className={`relative inline-flex w-2 h-2 rounded-full ${statusConfig.bg}`}></span>
                </span>
                {statusConfig.label}
              </p>
            </div>
            <div className="text-right">
               <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Net à payer</p>
               <p className="text-[15px] font-black text-indigo-600 mt-0.5">{Number(mission.price || 0).toLocaleString()} F <span className="text-xs font-bold text-slate-500">CFA</span></p>
            </div>
          </div>

          {/* Fiche Chauffeur */}
          <div className="flex items-start gap-4 p-4 mb-4 border rounded-3xl bg-slate-50/80 border-slate-100">
            <div className="relative">
              <div className="flex items-center justify-center w-16 h-16 overflow-hidden bg-white border-2 border-indigo-100 shadow-inner rounded-2xl">
                {driverData?.photoProfileURL || driverData?.photoURL || mission?.driverPhoto || mission?.livreurPhoto ? (
                  <img src={driverData?.photoProfileURL || driverData?.photoURL || mission?.driverPhoto || mission?.livreurPhoto} alt="Chauffeur" className="object-cover w-full h-full" />
                ) : (
                  <User className="w-6 h-6 text-indigo-300" />
                )}
              </div>
              {hasDriver && (
                <span className="absolute p-1 text-white border-2 border-white rounded-lg -bottom-1 -right-1 bg-emerald-500">
                  <Activity size={10} />
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Votre chauffeur</p>
              <h3 className="text-[13px] font-black text-slate-800 truncate leading-tight mt-0.5">
                {driverData 
                  ? `${driverData.prenom || ""} ${driverData.nom || ""}` 
                  : (mission?.driverName || mission?.livreurName || (hasDriver ? "Chauffeur Assigné" : "Assignation en cours..."))
                }
              </h3>
              
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2.5 py-1 text-[10px] font-black tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg">
                  {displayVehicleModel}
                </span>
                
                {displayVehiclePlate ? (
                  <span className="px-2.5 py-1 text-[10px] font-mono font-black tracking-wider text-slate-800 bg-amber-400 rounded-lg shadow-sm border border-amber-500/20">
                    {displayVehiclePlate}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-[11px] font-medium italic text-slate-400 bg-slate-200/50 rounded-lg">
                    Immatriculation en vérification
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Boutons d'actions */}
          <div className="flex gap-3">
            <a 
              href={`tel:${mission.assignedLivreurPhone || driverData?.phone || driverData?.telephone || mission.driverPhone || mission.livreurPhone || mission.clientPhone}`}
              className="flex items-center justify-center flex-1 gap-3 py-4 text-[10px] font-black text-white uppercase transition-transform bg-indigo-600 shadow-lg rounded-2xl shadow-indigo-200 active:scale-95"
            >
              <Phone size={18} /> Appeler le chauffeur
            </a>
            <button 
              onClick={() => {
                const url = window.location.href;
                window.open(`https://wa.me/?text=${encodeURIComponent("Suivez mon trajet Alépé ici : " + url)}`, '_blank');
              }}
              className="p-3 transition-transform bg-emerald-50 text-emerald-600 rounded-2xl active:scale-95"
            >
              <Share2 size={22} />
            </button>
            <button 
              onClick={async () => {
                if(window.confirm("Annuler cette course Alépé ?")) {
                  await updateDoc(doc(db, "courses", id), { 
                    status: "cancelled", 
                    cancelledBy: "client", 
                    cancelledAt: serverTimestamp() 
                  });
                  navigate("/");
                }
              }}
              className="p-4 text-red-500 transition-transform bg-red-50 rounded-2xl active:scale-95"
            >
              <X size={22} />
            </button>
          </div>

          {/* Raccourcis d'urgence & Secours */}
          <div className="flex justify-between px-2 pt-4 mt-6 border-t border-slate-100">
             <button onClick={() => window.location.href="tel:170"} className="flex flex-col items-center gap-1">
                <ShieldAlert size={20} className="text-red-500" />
                <span className="text-[9px] font-black text-slate-400 uppercase">Police</span>
             </button>
             <button onClick={() => window.location.href="tel:180"} className="flex flex-col items-center gap-1">
                <Flame size={20} className="text-orange-500" />
                <span className="text-[9px] font-black text-slate-400 uppercase">Pompiers</span>
             </button>
             <div className="h-8 w-[1px] bg-slate-100"></div>
             <div className="flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Sécurité</p>
                <p className="text-[10px] font-bold text-indigo-600">Active 24h/7</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}