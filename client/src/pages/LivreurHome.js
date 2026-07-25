import React, { useEffect, useState, useRef, useCallback } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
  runTransaction,
  orderBy
} from "firebase/firestore";

import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  Wallet, Power, ChevronRight, Loader2, Menu,
  ShoppingBag, Zap,
  Phone, MapPin, AlertCircle, CheckCircle2, QrCode, ShieldCheck, Coins, KeyRound,
  X, UploadCloud, ArrowRight
} from "lucide-react";

import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { useWaveScan } from "../hooks/useWaveScan";
import TaxiMeter from "../components/TaxiMeter";
import UltimateDrivingView from "../components/UltimateDrivingView";
import SideMenu from "../components/SideMenu";

import imgSaloni from "../assets/saloni.png";
import imgAntara from "../assets/antara.png";
import imgMoto from "../assets/moto.png";
import imgVtc from "../assets/vtc.png";
import imgMoto2 from "../assets/driver-marker.png"; // (Ajustez le nom/chemin selon votre fichier)

const VEHICLE_IMAGES = {
  
  moto: imgMoto2,
  saloni: imgSaloni,
  antara: imgAntara,
  vtc: imgVtc,
};

const DEFAULT_ABIDJAN_CENTER = [5.3484, -4.0305];
const ALERT_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3";

const clientIcon = L.divIcon({
  html: `<div style="width:32px;height:32px;background:#10b981;border-radius:50%;border:3px solid white;box-shadow:0 6px 15px rgba(16,185,129,0.4);display:flex;align-items:center;justify-content:center"><div style="width:12px;height:12px;background:white;border-radius:50%"></div></div>`,
  iconSize: [32, 32], iconAnchor: [16, 16], className: "",
});

const destinationIcon = L.divIcon({
  html: `<div style="width:32px;height:32px;background:#ef4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 6px 15px rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center"><div style="transform:rotate(45deg);color:white;font-weight:900;font-size:10px">FIN</div></div>`,
  iconSize: [32, 32], iconAnchor: [16, 32], className: "",
});

const getRotatedDriverIcon = (vehicleType, rotation = 0) => {
  const type = (vehicleType || "moto").toLowerCase().trim();
  let iconUrl = imgMoto;
  if (VEHICLE_IMAGES[type]) iconUrl = VEHICLE_IMAGES[type];
  
  return L.divIcon({
    html: `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;transform:rotate(${rotation}deg);transition:transform 0.2s ease-out;">
             <img src="${iconUrl}" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0px 4px 6px rgba(0,0,0,0.3));"/>
           </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    className: "",
  });
};

function MapController3D({ myPos, mission, setRoute, setDistance, setDuration, panelHeight, vehicleRotation }) {
  const map = useMap();
  const lastFetchTime = useRef(0);

  const pickupLat = mission?.pickupLocation?.lat;
  const pickupLng = mission?.pickupLocation?.lng;
  const dropoffLat = mission?.dropoffLocation?.lat;
  const dropoffLng = mission?.dropoffLocation?.lng;
  const missionStatus = mission?.status;

  useEffect(() => {
    if (!myPos || !map || !map.getContainer()) return;

    if (!pickupLat || !pickupLng) {
      map.setView([myPos[0], myPos[1]], 16, { animate: true });
      return;
    }

    const fetchRoute = async () => {
      const now = Date.now();
      if (now - lastFetchTime.current < 8000) return;

      const start = `${myPos[1]},${myPos[0]}`;
      const end = missionStatus === "in_transit" && dropoffLat
        ? `${dropoffLng},${dropoffLat}`
        : `${pickupLng},${pickupLat}`;

      if (start === end) return;

      try {
        lastFetchTime.current = now;
        const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`);

        if (!r.ok) return;

        const d = await r.json();
        if (!map || !map.getContainer()) return;

        if (d.routes?.[0]) {
          const coords = d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          setRoute(coords);
          setDistance((d.routes[0].distance / 1000).toFixed(1));
          setDuration(Math.ceil(d.routes[0].duration / 60));

          const bp = (window.innerHeight * panelHeight) / 100;
          map.fitBounds(L.latLngBounds([myPos, coords[coords.length - 1]]), {
            paddingBottomRight: [20, bp + 80],
            paddingTopLeft: [80, 120],
            animate: true
          });
        }
      } catch (e) {
        console.error("Erreur OSRM:", e);
      }
    };

    fetchRoute();
  }, [myPos, map, panelHeight, pickupLat, pickupLng, dropoffLat, dropoffLng, missionStatus, setRoute, setDistance, setDuration]);

  return null;
}

export default function LivreurExterne({ onNavigateToUpload }) {
  const [courses, setCourses] = useState([]);
  const [livreurVehicle, setLivreurVehicle] = useState("moto");
  const [livreurName, setLivreurName] = useState("Chauffeur");
  const [driverZoneName, setDriverZoneName] = useState("Zone Externe");
  const [isOnline, setIsOnline] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [mission, setMission] = useState(null);
  const [myPos, setMyPos] = useState(DEFAULT_ABIDJAN_CENTER);
  const [userData, setUserData] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [vehicleRotation, setVehicleRotation] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationMin, setDurationMin] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [navigationMode, setNavigationMode] = useState(false);
  const [panelHeight, setPanelHeight] = useState(36);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(36);
  const [showPassModal, setShowPassModal] = useState(false);
  const [internalAlert, setInternalAlert] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pickupCodeInput, setPickupCodeInput] = useState("");
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const audioRef = useRef(new Audio(ALERT_SOUND_URL));
  const lastUpdateRef = useRef(0);

  const showAlert = useCallback((message, type = "error") => {
    setInternalAlert({ message, type });
    setTimeout(() => setInternalAlert(null), 4000);
  }, []);

  const isExterne = userData?.role === "livreur-externe";

  useWaveScan({
    userData: userData ? { id: auth.currentUser?.uid, ...userData } : null,
    mode: "pass",
    allowedAmounts: isExterne ? [1000, 2000] : [5000, 10000],
    onSuccess: (res) => {
      showAlert(`✅ Mode FREE ${res.hours >= 24 ? "24H" : "12H"} activé !`, "success");
      setShowPassModal(false);
    },
  });

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  const isFreeModeActive = () => {
    if (!userData?.passExpireAt) return false;
    const expire = userData.passExpireAt.toDate ? userData.passExpireAt.toDate() : new Date(userData.passExpireAt);
    return expire > currentTime;
  };

  useEffect(() => {
    if (mission?.status === "offering" || courses.length > 0) {
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
      audioRef.current.loop = true;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [mission?.status, courses.length]);

  useEffect(() => {
    if (!auth.currentUser) return;
    let isMounted = true;

    const userDocRef = doc(db, "users", auth.currentUser.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (!isMounted) return;
      if (docSnap.exists()) {
        const uData = docSnap.data();
        setUserData(uData);

        if (uData.prenom) setLivreurName(uData.prenom);
        else if (uData.nom) setLivreurName(uData.nom);

        const zoneName = uData.sectorZone
          ? uData.sectorZone.charAt(0).toUpperCase() + uData.sectorZone.slice(1)
          : "Zone Externe";
        setDriverZoneName(zoneName);

        const cleanedVehicleType = uData.typeVehicule
          ? uData.typeVehicule.toLowerCase().trim()
          : "moto";
        setLivreurVehicle(cleanedVehicleType);
        setIsOnline(uData.status === "online" || uData.isOnline === true);

        if (uData.lat && uData.lng) {
          setMyPos([uData.lat, uData.lng]);
        }
      }
      setLoadingStatus(false);
    });

    const wid = navigator.geolocation.watchPosition(
      async (position) => {
        if (!isMounted) return;
        const { latitude: lat, longitude: lng, heading } = position.coords;
        setMyPos([lat, lng]);
        if (heading !== null && heading !== undefined) setVehicleRotation(heading);

        const now = Date.now();
        if (now - lastUpdateRef.current >= 10000) {
          lastUpdateRef.current = now;
          const currentUserId = auth.currentUser?.uid || userData?.id;
          if (currentUserId) {
            try {
              await setDoc(
                doc(db, "users", currentUserId),
                { lat, lng, lastGpsUpdate: serverTimestamp() },
                { merge: true }
              );
            } catch (error) {
              console.error("Erreur mise à jour GPS :", error);
            }
          }
        }
      },
      (error) => console.error("Erreur Geolocation :", error),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
    );

    return () => {
      isMounted = false;
      unsubscribeUser();
      navigator.geolocation.clearWatch(wid);
    };
  }, [userData?.id]);

  useEffect(() => {
    if (!userData) return;
    let isMounted = true;
    const activeZone = userData.sectorZone || "default";

    const q = query(
      collection(db, "courses"),
      where("status", "==", "pending"),
      where("zone", "==", activeZone),
      orderBy("createdAt", "desc")
    );

    const unsubCourses = onSnapshot(q, (snap) => {
      if (!isMounted) return;
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Erreur flux courses:", err));

    return () => {
      isMounted = false;
      unsubCourses();
    };
  }, [userData]);

  useEffect(() => {
    if (!auth.currentUser) return;
    let isMounted = true;

    const q = query(
      collection(db, "courses"),
      where("assignedLivreurId", "==", auth.currentUser.uid),
      where("status", "in", ["offering", "assigned", "accepted", "arrived_at_pickup", "in_transit"])
    );

    const unsubMission = onSnapshot(q, (s) => {
      if (!isMounted) return;
      if (!s.empty) {
        setMission({ id: s.docs[0].id, ...s.docs[0].data() });
      } else {
        setMission(null);
        setRouteCoords([]);
      }
    });

    return () => {
      isMounted = false;
      unsubMission();
    };
  }, []);

  const toggleOnlineStatus = async () => {
    const currentUserId = auth.currentUser?.uid || userData?.id;
    if (!currentUserId) return;

    const newStatus = !isOnline;

    try {
      await setDoc(
        doc(db, "users", currentUserId),
        {
          isOnline: newStatus,
          isAvailable: newStatus,
          status: newStatus ? "online" : "offline",
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setIsOnline(newStatus);
    } catch (error) {
      console.error("Erreur changement de statut :", error);
    }
  };

  const handleValidatePickupCode = async () => {
    if (!mission) return;
    if (!pickupCodeInput || pickupCodeInput.trim().length !== 6) {
      showAlert("Veuillez saisir un code valide à 6 chiffres", "error");
      return;
    }

    setIsVerifyingCode(true);
    try {
      const validateHandoff = httpsCallable(functions, "validateCoursierToLivreurHandoff");
      await validateHandoff({ courseId: mission.id, enteredCode: pickupCodeInput.trim() });

      showAlert("Code validé ! Passation enregistrée.", "success");
      setPickupCodeInput("");
    } catch (error) {
      console.error("Erreur de passation:", error);
      showAlert(error.message || "Code invalide ou paiement non confirmé", "error");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const updateMissionStatus = async (nextStatus) => {
    if (!mission) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "courses", mission.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      showAlert(`Statut mis à jour : ${nextStatus.replace(/_/g, ' ')}`, "success");
    } catch (err) {
      console.error("Erreur statut:", err);
      showAlert("Erreur lors de la mise à jour de la mission", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    setStartY(e.type === "touchstart" ? e.touches[0].clientY : e.clientY);
    setStartHeight(panelHeight);
  };

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    const y = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
    setPanelHeight(Math.max(30, Math.min(70, startHeight + ((startY - y) / window.innerHeight) * 100)));
  }, [isDragging, startHeight, startY]);

  const acceptCourse = async (courseId, paymentMethod = "solde") => {
    if (!auth.currentUser || !isOnline) {
      showAlert("Vous devez être EN LIGNE pour accepter une course", "error");
      return;
    }

    setIsProcessing(true);
    const userRef = doc(db, "users", auth.currentUser.uid);
    const courseRef = doc(db, "courses", courseId);

    try {
      await runTransaction(db, async (transaction) => {
        const courseDoc = await transaction.get(courseRef);
        if (!courseDoc.exists()) throw new Error("Cette course n'existe plus.");

        const courseData = courseDoc.data();
        const price = Number(courseData.price || 0);

        let payload = {
          status: "accepted",
          assignedLivreurId: auth.currentUser.uid,
          assignedLivreurName: livreurName,
          livreurId: auth.currentUser.uid,
          driverId: auth.currentUser.uid,
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const userUpdates = { isAvailable: false, currentCourseId: courseId };

        if (isFreeModeActive()) {
          payload.commission = 0;
          payload.paymentMethod = "pass_free";
        } else {
          let commission = 0;
          if (paymentMethod === "solde") {
            commission = Math.round(price * 0.13);
            const currentSolde = Number(userData?.solde || 0);
            if (currentSolde < commission) throw new Error("Solde insuffisant pour la commission (13%)");
            userUpdates.solde = increment(-commission);
            payload.commission = commission;
            payload.paymentMethod = "solde";
            payload.commissionRateUsed = 0.13;
          } else {
            commission = Math.round(price * 0.17);
            const currentJetons = Number(userData?.jetons || 0);
            if (currentJetons < commission) throw new Error("Jetons insuffisants pour la commission (17%)");
            userUpdates.jetons = increment(-commission);
            payload.commission = commission;
            payload.paymentMethod = "jetons";
            payload.commissionRateUsed = 0.17;
          }
        }

        transaction.update(userRef, userUpdates);
        transaction.update(courseRef, payload);
      });

      showAlert("Course acceptée avec succès !", "success");

      try {
        const initCodes = httpsCallable(functions, "initializeVerificationCodes");
        await initCodes({ courseId });
      } catch (codeErr) {
        console.error("Erreur génération des codes de validation:", codeErr);
      }
    } catch (error) {
      console.error(error);
      showAlert(error.message || "Impossible d'accepter cette course");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!mission) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "courses", mission.id), {
        status: "pending",
        assignedLivreurId: null,
        updatedAt: serverTimestamp()
      });
      showAlert("Mission refusée", "success");
      setMission(null);
    } catch (e) {
      showAlert("Erreur lors du refus de la mission");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGoToUpload = () => {
    setShowPassModal(false);
    if (typeof onNavigateToUpload === "function") {
      onNavigateToUpload();
    } else {
      window.location.href = "/upload-recu";
    }
  };

  if (navigationMode) return (
    <div className="relative w-full h-screen">
      {mission?.isCompteur && <div className="fixed top-12 left-4 z-[300]"><TaxiMeter missionId={mission.id} userRole="livreur" currentDistance={distanceKm}/></div>}
      <button onClick={() => setNavigationMode(false)} className="fixed top-5 right-4 z-[300] px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-2xl">← QUITTER NAVIGATION</button>
      <UltimateDrivingView 
        vehiclePosition={myPos} 
        route={routeCoords} 
        remainingDistance={distanceKm} 
        estimatedTime={durationMin} 
        vehicleType={livreurVehicle} 
        courseMode={mission?.courseMode}
      />
    </div>
  );

  return (
    <div className="relative flex flex-col w-full h-screen overflow-hidden bg-slate-900"
      onTouchMove={handleDragMove} onMouseMove={handleDragMove}
      onMouseUp={() => setIsDragging(false)} onTouchEnd={() => setIsDragging(false)}>

      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} userData={userData} />

      {/* CARTE PLEIN ÉCRAN */}
      <div className="absolute inset-0 z-0 w-full h-full bg-slate-900">
        <MapContainer 
          center={myPos} 
          zoom={16} 
          style={{ height: "100%", width: "100%" }} 
          zoomControl={false} 
          attributionControl={false}
          className="w-full h-full filter invert-[0.9] hue-rotate-180 brightness-[0.85] contrast-[1.2]"
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          
          <MapController3D 
            myPos={myPos} 
            mission={mission} 
            setRoute={setRouteCoords} 
            setDistance={setDistanceKm} 
            setDuration={setDurationMin} 
            panelHeight={panelHeight} 
            vehicleRotation={vehicleRotation} 
          />

          {myPos && (
            <Marker position={myPos} icon={getRotatedDriverIcon(livreurVehicle, vehicleRotation)} />
          )}

          {mission?.pickupLocation && (
            <>
              {routeCoords.length > 0 && <Polyline positions={routeCoords} color="#10b981" weight={6} opacity={0.9} />}
              <Marker position={[mission.pickupLocation.lat, mission.pickupLocation.lng]} icon={clientIcon} />
              {mission.dropoffLocation && <Marker position={[mission.dropoffLocation.lat, mission.dropoffLocation.lng]} icon={destinationIcon} />}
            </>
          )}
        </MapContainer>
      </div>

      {/* BOUTONS ET INFORMATIONS DE BORD */}
      <div className="absolute top-3 left-4 right-4 z-[50] flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button onClick={() => setIsMenuOpen(true)} className="p-3.5 border border-slate-200 shadow-xl bg-white/95 backdrop-blur-md rounded-2xl text-slate-800 active:scale-95 transition-all w-fit"><Menu size={22}/></button>

          <div className="flex flex-col gap-1.5 p-3 border border-slate-200 shadow-lg rounded-2xl bg-white/95 backdrop-blur-md text-slate-800 min-w-[140px]">
            <div className="flex items-center gap-2 text-xs font-black">
              <Wallet size={14} className="text-emerald-600 shrink-0"/>
              <span>Solde : <span className="text-slate-900">{Number(userData?.solde || 0).toLocaleString()} F</span></span>
            </div>
            <div className="w-full h-[1px] bg-slate-100" />
            <div className="flex items-center gap-2 text-xs font-black">
              <Coins size={14} className="text-amber-500 shrink-0"/>
              <span>Jetons : <span className="text-slate-900">{Number(userData?.jetons || 0).toLocaleString()}</span></span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <button onClick={toggleOnlineStatus} disabled={loadingStatus} className={`px-5 py-3 rounded-2xl font-black text-[10px] shadow-xl border-2 transition-all active:scale-95 ${isOnline ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-400 border-slate-100"}`}>
            <Power size={14} className="inline mr-2"/> {isOnline ? "EN LIGNE" : "HORS LIGNE"}
          </button>
          <button onClick={() => setShowBadgeModal(true)} className="px-4 py-2.5 rounded-xl font-bold text-[9px] shadow-xl flex items-center gap-2 bg-white text-slate-800 border border-slate-100 transition-all active:scale-95">
            <QrCode size={12} className="text-emerald-600"/> MON BADGE QR
          </button>
          <button onClick={() => setShowPassModal(true)} className={`px-4 py-2.5 rounded-xl font-bold text-[9px] shadow-xl flex items-center gap-2 transition-all active:scale-95 ${isFreeModeActive() ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white"}`}>
            <Zap size={12} fill={isFreeModeActive() ? "white" : "none"}/>
            {isFreeModeActive() ? "PASS FREE ACTIF" : "ACTIVER PASS FREE"}
          </button>
        </div>
      </div>

      {/* PANNEAU INFÉRIEUR COULISSANT */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-2xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] rounded-t-[36px] transition-all duration-100 ease-out" style={{ height: `${panelHeight}vh` }}>
        {internalAlert && (
          <div className={`absolute -top-16 left-4 right-4 p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${internalAlert.type === "success" ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"}`}>
            {internalAlert.type === "success" ? <CheckCircle2 size={20}/> : <AlertCircle size={20} className="text-amber-400"/>}
            <span className="text-sm font-bold">{internalAlert.message}</span>
          </div>
        )}

        <div className="flex flex-col items-center py-3.5 cursor-grab active:cursor-grabbing" onMouseDown={handleDragStart} onTouchStart={handleDragStart}>
          <div className="w-12 h-1.5 bg-slate-300 rounded-full"/>
        </div>

        <div className="h-full px-6 pb-24 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="m-0 text-sm font-black tracking-wider uppercase text-slate-800">{livreurName}</h3>
            <span className="flex items-center gap-1 text-[11px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md">
              <ShieldCheck size={12} /> {driverZoneName}
            </span>
          </div>

          {mission ? (
            <div className="duration-300 animate-in fade-in">
              {mission.isCompteur && <TaxiMeter missionId={mission.id} userRole="livreur" currentDistance={distanceKm}/>}

              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 rounded-2xl"><ShoppingBag size={22} className="text-emerald-600"/></div>
                  <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</span>
                    <span className="text-sm font-black uppercase text-emerald-600">{mission.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Prix Course</span>
                  <p className="text-2xl font-black text-slate-900">{mission.price || 0} F</p>
                </div>
              </div>

              {["accepted", "arrived_at_pickup", "in_transit"].includes(mission.status) && (
                <>
                  <button onClick={() => setNavigationMode(true)} className="flex items-center justify-center w-full gap-3 p-4 mb-3 font-black text-white transition-all shadow-lg bg-slate-900 rounded-2xl active:scale-95">
                    <Zap size={18} className="text-amber-400 fill-amber-400" /> NAVIGATION ULTIMATE
                  </button>
                  <a href={`tel:${mission.clientPhone}`} className="flex items-center justify-center w-full gap-3 p-3.5 mb-4 font-black transition-colors border-2 text-emerald-600 border-emerald-100 rounded-2xl active:bg-emerald-50">
                    <Phone size={18}/> CONTACTER CLIENT
                  </a>
                </>
              )}

              <div className="p-4 mb-6 space-y-3 border border-slate-100 bg-slate-50 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center rounded-lg w-7 h-7 text-slate-500 bg-slate-200 shrink-0"><MapPin size={15}/></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ramassage</p><p className="text-xs font-bold text-slate-800">{mission.pickupAddress || "Non spécifiée"}</p></div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center rounded-lg w-7 h-7 text-emerald-600 bg-emerald-100 shrink-0"><ChevronRight size={15}/></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination</p><p className="text-xs font-bold text-slate-800">{mission.destination || "Non spécifiée"}</p></div>
                </div>
              </div>

              {mission.status === "offering" ? (
                <div className="space-y-3">
                  {isFreeModeActive() ? (
                    <button 
                      onClick={() => acceptCourse(mission.id, "pass_free")} 
                      disabled={isProcessing} 
                      className="w-full py-5 text-xs font-black text-white uppercase transition-all shadow-xl bg-emerald-600 rounded-2xl active:scale-95"
                    >
                      ⚡ CONFIRMER LA MISSION (FREE)
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => acceptCourse(mission.id, "solde")} 
                          disabled={isProcessing} 
                          className="flex flex-col items-center justify-center py-3.5 px-2 text-[11px] font-black text-white uppercase transition-all shadow-md bg-emerald-600 rounded-2xl active:scale-95 border-b-4 border-emerald-800"
                        >
                          <span>Accepter (Solde)</span>
                          <span className="text-[9px] text-emerald-100 font-medium normal-case mt-0.5">-13% Commission</span>
                        </button>
                        <button 
                          onClick={() => acceptCourse(mission.id, "jetons")} 
                          disabled={isProcessing} 
                          className="flex flex-col items-center justify-center py-3.5 px-2 text-[11px] font-black text-white uppercase transition-all shadow-md bg-amber-600 rounded-2xl active:scale-95 border-b-4 border-amber-800"
                        >
                          <span>Accepter (Jeton)</span>
                          <span className="text-[9px] text-amber-100 font-medium normal-case mt-0.5">-17% Commission</span>
                        </button>
                      </div>
                      <button onClick={handleReject} className="w-full py-3.5 text-xs font-black text-red-500 uppercase transition-colors bg-red-50 hover:bg-red-100 rounded-2xl">
                        Refuser la proposition
                      </button>
                    </div>
                  )}
                </div>
              ) : mission.status === "accepted" ? (
                <button
                  onClick={() => updateMissionStatus("arrived_at_pickup")}
                  disabled={isProcessing}
                  className="w-full py-4 text-xs font-black text-white uppercase bg-indigo-600 shadow-xl rounded-2xl active:scale-95"
                >
                  📍 JE SUIS ARRIVÉ AU RAMASSAGE
                </button>
              ) : mission.status === "arrived_at_pickup" ? (
                <div className="space-y-3">
                  <div className="p-4 space-y-2 border bg-amber-50 border-amber-200 rounded-2xl">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                      <KeyRound size={16} /> Validation de passation obligatoire
                    </div>
                    <p className="text-[11px] text-amber-700">Entrez le code à 6 chiffres transmis par le coursier pour débuter la livraison.</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        maxLength={6}
                        placeholder="000000"
                        value={pickupCodeInput}
                        onChange={(e) => setPickupCodeInput(e.target.value)}
                        className="w-full p-3 text-lg font-black tracking-widest text-center bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                      />
                      <button 
                        onClick={handleValidatePickupCode}
                        disabled={isVerifyingCode}
                        className="px-5 py-3 text-xs font-black text-white bg-indigo-600 shadow-md rounded-xl active:scale-95 shrink-0"
                      >
                        {isVerifyingCode ? <Loader2 size={16} className="animate-spin" /> : "VALIDER"}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => updateMissionStatus("in_transit")}
                    disabled={isProcessing}
                    className="w-full py-4 text-xs font-black text-white uppercase shadow-xl bg-emerald-600 rounded-2xl active:scale-95"
                  >
                    🚀 DÉBUTER LE TRANSIT
                  </button>
                </div>
              ) : mission.status === "in_transit" ? (
                <button
                  onClick={() => updateMissionStatus("completed")}
                  disabled={isProcessing}
                  className="w-full py-4 text-xs font-black text-white uppercase shadow-xl bg-emerald-600 rounded-2xl active:scale-95"
                >
                  🏁 TERMINER LA MISSION
                </button>
              ) : null}
            </div>
          ) : (
            <div className="py-8 space-y-3 text-center">
              <div className="inline-flex p-4 mb-2 rounded-full bg-slate-100 text-slate-400">
                <ShoppingBag size={32} />
              </div>
              <h4 className="text-sm font-black tracking-wider uppercase text-slate-700">Aucune mission en cours</h4>
              <p className="max-w-xs mx-auto text-xs text-slate-500">
                {isOnline 
                  ? "Vous êtes en ligne. Restez à proximité des zones d'activité pour recevoir des demandes."
                  : "Basculez en mode EN LIGNE pour recevoir des propositions de courses dans votre zone."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODALE / PAGE D'INSTRUCTIONS PASS FREE */}
      {showPassModal && (
        <div className="fixed inset-0 z-[400] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 space-y-5 duration-200 bg-white shadow-2xl rounded-3xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Zap className="text-indigo-600 fill-indigo-600" size={20} />
                <h3 className="text-base font-black text-slate-900">INSTRUCTIONS - PASS FREE</h3>
              </div>
              <button onClick={() => setShowPassModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>

            {/* GUIDE D'INSTRUCTIONS PAS À PAS */}
            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">1</span>
                  <h4 className="text-xs font-black uppercase text-slate-900">Enregistrer le contact Assistance</h4>
                </div>
                <p className="text-[11px] text-slate-600 pl-7 leading-relaxed font-medium">
                  Enregistrez notre numéro d'assistance afin de valider et confirmer votre reçu.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">2</span>
                  <h4 className="text-xs font-black uppercase text-slate-900">Effectuer le règlement Wave</h4>
                </div>
                <p className="text-[11px] text-slate-600 pl-7 leading-relaxed font-medium">
                  Réalisez le paiement correspondant à votre forfait ({isExterne ? "1 000 F / 2 000 F" : "5 000 F / 10 000 F"}).
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">3</span>
                  <h4 className="text-xs font-black uppercase text-slate-900">Transmettre le reçu complet</h4>
                </div>
                <p className="text-[11px] text-slate-600 pl-7 leading-relaxed font-medium">
                  Envoyez la capture d'écran de l'interface Wave via notre page de dépôt dédiée pour activer votre pass.
                </p>
              </div>
            </div>

            {/* MESSAGE RAPPEL DE CONFORMITÉ */}
            <div className="p-3 border bg-emerald-50 border-emerald-200/80 rounded-2xl">
              <p className="text-[11px] font-bold text-emerald-900 leading-relaxed">
                L'objectif est d'amener l'utilisateur à enregistrer le contact assistance pour confirmer son paiement par contrôle du reçu complet depuis l'interface Wave.
              </p>
            </div>

            {/* BOUTON D'ACTION DE REDIRECTION */}
            <div className="pt-1 space-y-2">
              <button
                onClick={handleGoToUpload}
                className="flex items-center justify-center w-full gap-2 px-4 py-4 text-xs font-black tracking-wide text-white uppercase transition-all bg-indigo-600 shadow-xl hover:bg-indigo-700 rounded-2xl active:scale-95"
              >
                <UploadCloud size={18} />
                <span>POURSUIVRE VERS RECHARGEMENT</span>
                <ArrowRight size={16} />
              </button>
            </div>

            <button 
              onClick={() => setShowPassModal(false)}
              className="w-full py-2.5 text-xs font-black text-slate-400 hover:text-slate-600 uppercase transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* MODALE BADGE QR */}
      {showBadgeModal && (
        <div className="fixed inset-0 z-[400] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm p-6 space-y-4 text-center duration-200 bg-white shadow-2xl rounded-3xl animate-in fade-in zoom-in-95">
            <div className="flex justify-end">
              <button onClick={() => setShowBadgeModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="flex items-center justify-center w-16 h-16 p-4 mx-auto rounded-full bg-emerald-50 text-emerald-600">
              <QrCode size={32} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">{livreurName}</h3>
              <p className="mt-1 text-xs font-bold tracking-wider uppercase text-slate-500">{driverZoneName}</p>
            </div>
            <div className="p-4 font-mono text-xs break-all border bg-slate-50 rounded-2xl border-slate-100 text-slate-600">
              ID: {auth.currentUser?.uid || "N/A"}
            </div>
            <p className="text-[10px] font-bold text-slate-400">Présentez ce badge lors des contrôles et passations de courses.</p>
          </div>
        </div>
      )}
    </div>
  );
}