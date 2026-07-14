import { doc, onSnapshot, serverTimestamp, updateDoc, collection, query, where, limit } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertTriangle,
  Flame,
  Loader2,
  Navigation,
  Phone,
  Share2,
  ShieldAlert,
  X,
  Package,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useNavigate, useParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db, auth } from "../firebase";

import TaxiMeter from "../components/TaxiMeter";
import "./Tracking.css";

// --- CONFIGURATION DES ICONES ---
import vtcMarkerImg from "../assets/courseDriverImg.png";
import motoMarkerImg from "../assets/marker-livreur.png"; 
import suvDriverImg from "../assets/suvDriver.png";
import taxiDriverImg from "../assets/taxiDriver.png";
import taxiSuvDriverImg from "../assets/taxiSuvDriver.png";

import carConfortImg from "../assets/car-confort.png";
import carEcoImg from "../assets/car-eco.png";
import carSuvImg from "../assets/car-suv.png";
import motoImg from "../assets/moto-3d.png"; 
import taxiConfortImg from "../assets/taxi-confort.png";
import taxiEcoImg from "../assets/taxi-eco.png";
import taxiSuvImg from "../assets/taxi-suv.png";

import arrivalSound from "../assets/sounds/arrival.mp3";
import assignSound from "../assets/sounds/assign.mp3";

const getVehicleImage = (vehicleType, courseMode) => {
  const mode = (courseMode || "").toLowerCase();
  const type = (vehicleType || "").toLowerCase();
  if (type === "moto") return motoImg;
  if (type === "taxi") {
    if (mode.includes("suv")) return taxiSuvImg;
    if (mode.includes("confor")) return taxiConfortImg;
    return taxiEcoImg;
  }
  if (type === "vtc") {
    if (mode.includes("suv")) return carSuvImg;
    if (mode.includes("confor")) return carConfortImg;
    return carEcoImg;
  }
  return carEcoImg;
};

function MapController({ points, isModalExpanded }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points || points.length === 0) return;
    const validPoints = points.filter(p => Array.isArray(p) && p.length >= 2);
    if (validPoints.length === 0) return;
    const bottomPadding = isModalExpanded ? 600 : 450;
    const bounds = L.latLngBounds(validPoints);
    map.fitBounds(bounds, { paddingBottomRight: [30, bottomPadding], animate: true });
  }, [points, isModalExpanded, map]);
  return null;
}

const getDynamicVehicleIcon = (livreur, rotation = 0) => {
  const type = (livreur?.typeVehicule || "moto").toLowerCase();
  const mode = (livreur?.modeVtc || "").toLowerCase();
  let iconImg = motoMarkerImg;
  if (type === "vtc") iconImg = mode.includes("suv") ? suvDriverImg : vtcMarkerImg;
  else if (type === "taxi") iconImg = mode.includes("suv") ? taxiSuvDriverImg : taxiDriverImg;
  
  return L.divIcon({
    html: `<div style="transform: rotate(${rotation}deg); width: 35px; height: 35px;">
            <img src="${iconImg}" style="width: 100%; height: 100%; object-fit: contain;"/>
           </div>`,
    iconSize: [35, 35], iconAnchor: [17, 17], className: ''
  });
};

export default function Tracking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [livreurPos, setLivreurPos] = useState(null);
  const [animatedRoute, setAnimatedRoute] = useState([]);
  const [vehicleRotation, setVehicleRotation] = useState(0);
  const [distanceKm, setDistanceKm] = useState("0");
  const [durationMin, setDurationMin] = useState(0);
  const [isModalExpanded, setIsModalExpanded] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [waitTime, setWaitTime] = useState(0);
  const [isNegotiating, setIsNegotiating] = useState(false);

  const hasPlayedAssignSound = useRef(false);
  const hasPlayedArrivalSound = useRef(false);
  const assignSoundRef = useRef(new Audio(assignSound));
  const arrivalSoundRef = useRef(new Audio(arrivalSound));

  // ÉCOUTEUR MULTI-RÔLES
  useEffect(() => {
    let unsub = () => {};

    if (id) {
      // Mode Client : suivi via ID de la course
      unsub = onSnapshot(doc(db, "courses", id), (snap) => {
        if (snap.exists()) {
          processMissionData({ id: snap.id, ...snap.data() });
        }
      });
    } else if (auth.currentUser) {
      const currentUserId = auth.currentUser.uid;

      const q = query(
        collection(db, "courses"),
        where("status", "in", ["pending", "offering", "accepted", "arrived_at_pickup", "in_transit"]),
        limit(10)
      );

      unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const courses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          // Priorité : course assignée à l'utilisateur connecté
          let missionData = courses.find(c => c.assignedLivreurId === currentUserId);

          // Fallback : course pending la plus récente
          if (!missionData) {
            missionData = courses
              .filter(c => c.status === "pending" || c.status === "offering")
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
          }

          if (missionData) processMissionData(missionData);
        }
      });
    }

    function processMissionData(data) {
      if (data.status === "accepted" && !hasPlayedAssignSound.current) {
        assignSoundRef.current.play().catch(() => {});
        toast.success("Chauffeur en route !");
        hasPlayedAssignSound.current = true;
      }
      if (data.status === "arrived_at_pickup" && !hasPlayedArrivalSound.current) {
        arrivalSoundRef.current.play().catch(() => {});
        toast.info("Votre chauffeur est arrivé !");
        hasPlayedArrivalSound.current = true;
      }

      setMission(data);
      setIsNegotiating(data.negotiationStatus === 'counter_offer');
      
      if (data.status === "completed" || data.status === "cancelled") {
        setTimeout(() => navigate("/"), 2500);
      }
    }

    return () => unsub();
  }, [id, navigate]);

  useEffect(() => {
    let interval;
    if (mission && ["pending", "offering", "assigned"].includes(mission.status)) {
      interval = setInterval(() => setWaitTime(v => v + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [mission]);

  const updateRoute = useCallback(async (start, end) => {
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end.lng},${end.lat}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (data.routes?.[0]) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setAnimatedRoute(coords);
        setDistanceKm((data.routes[0].distance / 1000).toFixed(1));
        setDurationMin(Math.ceil(data.routes[0].duration / 60));
        if (coords.length > 1) {
          const dy = coords[1][0] - start[0];
          const dx = coords[1][1] - start[1];
          setVehicleRotation((Math.atan2(dx, dy) * 180) / Math.PI);
        }
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (!mission?.assignedLivreurId || ["pending", "offering", "assigned"].includes(mission.status)) return;

    const unsubDriver = onSnapshot(doc(db, "users", mission.assignedLivreurId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setDriverData(d);
        if (d.lat && d.lng) {
          setLivreurPos([d.lat, d.lng]);
          const target = mission.status === "in_transit" ? mission.dropoffLocation : mission.pickupLocation;
          if (target) updateRoute([d.lat, d.lng], target);
        }
      }
    });
    return () => unsubDriver();
  }, [mission, updateRoute]);

  if (!mission || (["pending", "offering", "assigned"].includes(mission.status) && !isNegotiating)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-100">
        <Loader2 className="mb-4 text-indigo-600 animate-spin" />
        <h2 className="font-black uppercase text-slate-900">Recherche d'un chauffeur...</h2>
        <p className="mt-2 text-xs font-bold text-slate-400">{waitTime}s</p>
      </div>
    );
  }

  const mapPoints = [
    livreurPos, 
    mission.pickupLocation ? [mission.pickupLocation.lat, mission.pickupLocation.lng] : null
  ].filter(Boolean);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <ToastContainer position="top-center" theme="dark" hideProgressBar />
      
      {mission.isCompteur && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300]">
          <TaxiMeter 
            missionId={mission.id} 
            userRole={auth.currentUser?.uid === mission.assignedLivreurId ? "livreur" : "client"} 
            currentDistance={parseFloat(distanceKm)} 
          />
        </div>
      )}
      
      <MapContainer center={[5.34, -4.02]} zoom={12} className="z-0 w-full h-full" zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        {livreurPos && <Marker position={livreurPos} icon={getDynamicVehicleIcon(driverData, vehicleRotation)} />}
        {animatedRoute.length > 0 && <Polyline positions={animatedRoute} color="#6366f1" weight={5} />}
        <MapController points={mapPoints} isModalExpanded={isModalExpanded} />
      </MapContainer>

      <div className={`fixed left-0 right-0 z-[100] transition-all duration-500 bg-white rounded-t-[40px] shadow-2xl ${isModalExpanded ? 'bottom-16 h-[75vh]' : 'bottom-16 h-auto p-6'}`}>
        <div className="w-12 h-1.5 mx-auto mb-6 bg-slate-200 rounded-full cursor-pointer" onClick={() => setIsModalExpanded(!isModalExpanded)}></div>
        
        {mission.isStoreDelivery && (
          <div className="flex items-center gap-3 p-3 mb-4 bg-orange-50 rounded-2xl">
            <Package size={20} className="text-orange-600" />
            <span className="text-xs font-black text-orange-800">Commande Boutique : {mission.itemName}</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 overflow-hidden bg-slate-100 rounded-xl">
              {driverData?.photoProfileURL && <img src={driverData.photoProfileURL} alt="chauffeur" className="object-cover w-full h-full" />}
            </div>
            <div>
              <h3 className="font-black text-slate-900">{driverData?.prenom} {driverData?.nom}</h3>
              <div className="flex items-center gap-1 text-[10px] text-orange-500 font-bold">
                <Navigation size={10} /> {durationMin} min • {distanceKm} km
              </div>
            </div>
          </div>
          <img src={getVehicleImage(mission.vehicleType, mission.courseMode)} alt="vehicule" className="w-auto h-10" />
        </div>

        {isModalExpanded && (
          <div className="grid grid-cols-3 gap-3 mb-6 animate-in fade-in slide-in-from-bottom-2">
            <button onClick={() => window.location.href="tel:170"} className="flex flex-col items-center p-3 bg-red-50 rounded-2xl">
              <ShieldAlert size={20} className="mb-1 text-red-600" />
              <span className="text-[10px] font-black text-red-600">POLICE</span>
            </button>
            <button onClick={() => window.location.href="tel:180"} className="flex flex-col items-center p-3 bg-orange-50 rounded-2xl">
              <Flame size={20} className="mb-1 text-orange-600" />
              <span className="text-[10px] font-black text-orange-600">POMPIERS</span>
            </button>
            <button onClick={() => window.location.href="tel:111"} className="flex flex-col items-center p-3 bg-slate-50 rounded-2xl">
              <AlertTriangle size={20} className="mb-1 text-slate-600" />
              <span className="text-[10px] font-black text-slate-600">S.O.S</span>
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <a href={`tel:${auth.currentUser?.uid === mission.assignedLivreurId ? mission.clientPhone : mission.assignedLivreurPhone}`} 
             className="flex items-center justify-center flex-1 gap-2 py-4 text-xs font-black text-white uppercase bg-indigo-600 rounded-2xl">
            <Phone size={16} /> Appeler
          </a>
          <button onClick={() => setShowCancelModal(true)} className="p-4 bg-slate-100 text-slate-400 rounded-2xl">
            <X size={20} />
          </button>
          <button onClick={() => {
            const url = window.location.href;
            window.open(`https://wa.me/?text=${encodeURIComponent("Suivez le trajet : " + url)}`, '_blank');
          }} className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Share2 size={20} />
          </button>
        </div>
      </div>

      {showCancelModal && <CancelModal onClose={() => setShowCancelModal(false)} missionId={mission.id} navigate={navigate} />}
    </div>
  );
}

function CancelModal({ onClose, missionId, navigate }) {
  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-[32px] text-center w-full max-w-sm">
        <AlertTriangle className="mx-auto mb-4 text-red-500" size={40} />
        <h3 className="mb-4 font-black uppercase">Annuler la course ?</h3>
        <button 
          onClick={async () => { 
            const cancelByRole = auth.currentUser?.uid === missionId ? "livreur" : "client";
            await updateDoc(doc(db, "courses", missionId), { 
              status: "cancelled", 
              cancelledBy: cancelByRole, 
              cancelledAt: serverTimestamp() 
            }); 
            navigate("/"); 
          }} 
          className="w-full py-4 mb-2 text-xs font-black text-white uppercase bg-red-600 rounded-2xl"
        >
          Confirmer
        </button>
        <button onClick={onClose} className="w-full py-4 text-xs font-bold uppercase text-slate-400">Retour</button>
      </div>
    </div>
  );
}