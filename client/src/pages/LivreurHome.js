import React, { useEffect, useState, useRef, useCallback } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  increment,
  arrayUnion,
  runTransaction,
  orderBy,
  Timestamp   // ← Ajouté ici
} from "firebase/firestore";

import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  Wallet, Power, ChevronRight, Loader2, Menu,
  ShoppingBag, Zap, X, ExternalLink,
  Phone, MapPin, AlertCircle, CheckCircle2, QrCode, ShieldCheck, Coins
} from "lucide-react";

import { useWaveScan } from "../hooks/useWaveScan";
import TaxiMeter from "../components/TaxiMeter";
import UltimateDrivingView from "../components/UltimateDrivingView";
import MonQR from "../components/MonQR";
import SideMenu from "../components/SideMenu";
import InterfaceFluxLivreur from '../components/InterfaceFluxLivreur';

import imgSaloni from "../assets/saloni.png";
import imgAntara from "../assets/antara.png";
import imgMoto from "../assets/moto.png";
import imgVtc from "../assets/vtc.png";

const VEHICLE_IMAGES = {
  moto: imgMoto,
  saloni: imgSaloni,
  antara: imgAntara,
  vtc: imgVtc,
};

const ADMIN_WAVE_NUM  = "0778073456";
const WAVE_LINK       = "https://pay.wave.com/m/M_ci_fAQd8MgriWne/c/ci/";
const ALERT_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3";

const clientIcon = L.divIcon({
  html: `<div style="width:30px;height:30px;background:#10b981;border-radius:50%;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><div style="width:12px;height:12px;background:white;border-radius:50%"></div></div>`,
  iconSize:[30,30], iconAnchor:[15,15], className:"",
});

const destinationIcon = L.divIcon({
  html:`<div style="width:30px;height:30px;background:#ef4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><div style="transform:rotate(45deg);color:white;font-weight:bold;font-size:10px">FIN</div></div>`,
  iconSize:[30,30], iconAnchor:[15,30], className:"",
});

const getRotatedDriverIcon = (vehicleType, rotation=0) => {
  const type = (vehicleType || "moto").toLowerCase().trim();
  let iconUrl = imgMoto;
  if (VEHICLE_IMAGES[type]) iconUrl = VEHICLE_IMAGES[type];
  
  return L.divIcon({
    html:`<div style="width:35px;height:35px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(0,0,0,.3);border:3px solid #10b981;transform:rotate(${rotation}deg);transition:transform 0.3s ease-out;"><img src="${iconUrl}" style="width:28px;height:28px;object-fit:contain"/></div>`,
    iconSize:[40,40], iconAnchor:[20,20], className:"",
  });
};

function MapController({ myPos, mission, setRoute, setDistance, setDuration, panelHeight }) {
  const map = useMap();
  const lastFetchTime = useRef(0);

  const pickupLat = mission?.pickupLocation?.lat;
  const pickupLng = mission?.pickupLocation?.lng;
  const dropoffLat = mission?.dropoffLocation?.lat;
  const dropoffLng = mission?.dropoffLocation?.lng;
  const missionStatus = mission?.status;

  useEffect(() => {
    if (!myPos || !map || !map.getContainer()) return;

    const fetchRoute = async () => {
      if (!pickupLat || !pickupLng || !myPos || !map) {
        if (myPos && map && map.getContainer()) {
          map.setView([myPos[0] - panelHeight / 4000, myPos[1]], 16, { animate: true });
        }
        return;
      }

      const now = Date.now();
      if (now - lastFetchTime.current < 10000) return;

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
            paddingBottomRight: [10, bp + 90],
            paddingTopLeft: [80, 160],
            animate: true
          });
        }
      } catch (e) {
        console.error("OSRM Error:", e);
      }
    };

    fetchRoute();
  }, [myPos, map, panelHeight, pickupLat, pickupLng, dropoffLat, dropoffLng, missionStatus, setRoute, setDistance, setDuration]);

  return null;
}

export default function LivreurExterne() {
  const [courses, setCourses] = useState([]);
  const [livreurVehicle, setLivreurVehicle] = useState(null);
  const [livreurName, setLivreurName] = useState("Chauffeur");
  const [driverZoneName, setDriverZoneName] = useState("Zone Externe");
  const [isOnline, setIsOnline] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [mission, setMission] = useState(null);
  const [myPos, setMyPos] = useState(null);
  const [userData, setUserData] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [vehicleRotation, setVehicleRotation] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationMin, setDurationMin] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [navigationMode, setNavigationMode] = useState(false);
  const [panelHeight, setPanelHeight] = useState(45);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(45);
  const [showPassModal, setShowPassModal] = useState(false);
  const [internalAlert, setInternalAlert] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
const [commandeSelectionnee, setCommandeSelectionnee] = useState(null);

  const audioRef = useRef(new Audio(ALERT_SOUND_URL));

  const showAlert = useCallback((message, type="error") => {
    setInternalAlert({message,type});
    setTimeout(()=>setInternalAlert(null),4000);
  },[]);

  const isExterne = userData?.role === "livreur-externe";

 
  const {
    scan: scanPass,
    status: scanPassStatus,
    reset: resetScanPass,
  } = useWaveScan({
    userData: userData ? { id: auth.currentUser?.uid, ...userData } : null,
    mode: "pass",
    allowedAmounts: isExterne ? [1000, 2000] : [5000, 10000],
    onSuccess: (res) => {
      showAlert(`✅ Mode FREE ${res.hours >= 24 ? "24H" : "12H"} activé !`, "success");
      setShowPassModal(false);
    },
  });

  useEffect(()=>{ 
    const t=setInterval(()=>setCurrentTime(new Date()),10000); 
    return()=>clearInterval(t); 
  },[]);

  const isFreeModeActive = () => {
    if(!userData?.passExpireAt) return false;
    const expire = userData.passExpireAt.toDate ? userData.passExpireAt.toDate() : new Date(userData.passExpireAt);
    return expire > currentTime;
  };

  useEffect(()=>{
    if(mission?.status === "offering" || courses.length > 0){ 
      if("vibrate" in navigator) navigator.vibrate([200,100,200]); 
      audioRef.current.loop = true; 
      audioRef.current.play().catch(()=>{});
    } else { 
      audioRef.current.pause(); 
      audioRef.current.currentTime = 0; 
    }
  },[mission?.status, courses.length]);

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
      }
      setLoadingStatus(false);
    });

    const wid = navigator.geolocation.watchPosition(
      ({coords:{latitude:lat,longitude:lng,heading}})=>{
        if (!isMounted) return;
        setMyPos([lat,lng]);
        if(heading!==null) setVehicleRotation(heading);
        updateDoc(doc(db,"users",auth.currentUser.uid),{lat,lng,lastGpsUpdate:serverTimestamp()}).catch(()=>{});
      },null,{enableHighAccuracy:true}
    );

    return () => {
      isMounted = false;
      unsubscribeUser();
      navigator.geolocation.clearWatch(wid);
    };
  }, []);

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
    }, (err) => {
      console.error("Erreur flux courses:", err);
      showAlert("Erreur de chargement des courses", "error");
    });
    
    return () => { 
      isMounted = false; 
      unsubCourses(); 
    };
  }, [userData, showAlert]);

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

  const toggleStatus = async () => {
    if (!auth.currentUser) return;
    const nextStatus = isOnline ? "offline" : "online";
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        status: nextStatus,
        isAvailable: nextStatus === "online",
        lastStatusUpdate: serverTimestamp()
      });
      showAlert(nextStatus === "online" ? "Vous êtes EN LIGNE" : "Vous êtes HORS LIGNE", "success");
    } catch (error) {
      showAlert("Impossible de modifier le statut");
    }
  };

  const handleDragStart = (e) => { 
    setIsDragging(true); 
    setStartY(e.type==="touchstart"?e.touches[0].clientY:e.clientY); 
    setStartHeight(panelHeight); 
  };
  
  const handleDragMove = useCallback((e) => {
    if(!isDragging) return;
    const y = e.type==="touchmove"?e.touches[0].clientY:e.clientY;
    setPanelHeight(Math.max(20, Math.min(85, startHeight + ((startY - y)/window.innerHeight)*100)));
  }, [isDragging, startHeight, startY]);

  const handleBuyPassWithBalance = async (hours, price) => {
    const currentSolde = Number(userData?.solde || 0);
    if(!userData || currentSolde < price) return showAlert("Solde insuffisant");
    setIsProcessing(true);
    try{
      const exp = new Date(); 
      exp.setHours(exp.getHours() + hours);
      await updateDoc(doc(db,"users",auth.currentUser.uid),{
        solde: increment(-price),
        passExpireAt: Timestamp.fromDate(exp),
        updatedAt: serverTimestamp()
      });
      showAlert(`Pass ${hours}H activé !`,"success"); 
      setShowPassModal(false);
    }catch{ 
      showAlert("Erreur activation"); 
    } finally { 
      setIsProcessing(false); 
    }
  };

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
    } catch (error) {
      console.error(error);
      showAlert(error.message || "Impossible d'accepter cette course");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if(!mission) return;
    await updateDoc(doc(db,"courses",mission.id),{
      status: "pending",
      assignedLivreurId: null,
      driverId: null,
      rejectedBy: arrayUnion(auth.currentUser.uid)
    });
  };

  const handleNextStep = async () => {
    if (!mission) return;
    const steps = { offering: "accepted", accepted: "arrived_at_pickup", arrived_at_pickup: "in_transit", in_transit: "completed" };
    const next = steps[mission.status] || "completed";
    setIsProcessing(true);
    try {
      const courseRef = doc(db, "courses", mission.id);
      await updateDoc(courseRef, { 
        status: next, 
        [`${next}At`]: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      });
      if (next === "completed") {
        await updateDoc(doc(db, "users", auth.currentUser.uid), { 
          isAvailable: true, 
          currentCourseId: null 
        });
        showAlert(`Course finalisée avec succès !`, "success");
        setRouteCoords([]);
      }
    } catch (e) { 
      showAlert("Erreur réseau"); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  if(navigationMode) return (
    <div className="relative w-full h-screen">
      {mission?.isCompteur && <div className="fixed top-12 left-4 z-[300]"><TaxiMeter missionId={mission.id} userRole="livreur" currentDistance={distanceKm}/></div>}
      <button onClick={()=>setNavigationMode(false)} className="fixed top-5 right-4 z-[300] px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-2xl">← QUITTER NAVIGATION</button>
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
    <div className="relative flex flex-col w-full h-screen overflow-hidden bg-slate-50"
      onTouchMove={handleDragMove} onMouseMove={handleDragMove}
      onMouseUp={()=>setIsDragging(false)} onTouchEnd={()=>setIsDragging(false)}>

      {!mission && isOnline && (
        <div className="super-hud-radar" style={{transform:`translateY(-${panelHeight/4}vh)`}}>
          <div className="radar-ping"/><div className="radar-sweep"/>
          <div className="floating-driver" style={{transform:`rotate(${vehicleRotation}deg)`}}>
            <img src={VEHICLE_IMAGES[livreurVehicle] || imgMoto} style={{width:42, height:32, objectFit:"contain"}} alt="driver"/>
          </div>
        </div>
      )}

      <div className="absolute top-2 left-4 right-4 z-[50] flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button onClick={() => setIsMenuOpen(true)} className="p-3.5 border shadow-xl bg-white/95 backdrop-blur-md rounded-2xl text-slate-800 active:scale-95 transition-all w-fit"><Menu size={24}/></button>
          
          <div className="flex flex-col gap-1.5 p-3 border shadow-lg rounded-2xl bg-white/95 backdrop-blur-md text-slate-800 min-w-[140px]">
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
          <button onClick={toggleStatus} disabled={loadingStatus} className={`px-5 py-3 rounded-2xl font-black text-[10px] shadow-xl border-2 transition-all active:scale-95 ${isOnline?"bg-slate-900 text-white border-slate-900":"bg-white text-slate-400 border-slate-100"}`}>
            <Power size={14} className="inline mr-2"/> {isOnline?"EN LIGNE":"HORS LIGNE"}
          </button>
          <button onClick={() => setShowBadgeModal(true)} className="px-4 py-2.5 rounded-xl font-bold text-[9px] shadow-xl flex items-center gap-2 bg-white text-slate-800 border border-slate-100 transition-all active:scale-95"><QrCode size={12} className="text-emerald-600"/> MON BADGE QR</button>
          <button onClick={()=>{resetScanPass();setShowPassModal(true);}} className={`px-4 py-2.5 rounded-xl font-bold text-[9px] shadow-xl flex items-center gap-2 transition-all active:scale-95 ${isFreeModeActive()?"bg-green-600 text-white":"bg-indigo-600 text-white"}`}><Zap size={12} fill={isFreeModeActive()?"white":"none"}/> {isFreeModeActive()?"PASS FREE ACTIF":"ACTIVER PASS FREE"}</button>
        </div>
      </div>

      <div className="relative z-0 w-full h-full">
        <MapContainer center={[5.62,-3.72]} zoom={14} style={{height:"100%",width:"100%"}} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"/>
          {(mission || !isOnline) && myPos && userData && <Marker position={myPos} icon={getRotatedDriverIcon(livreurVehicle, vehicleRotation)} />}
          {mission?.pickupLocation && (
            <>
              <MapController myPos={myPos} mission={mission} setRoute={setRouteCoords} setDistance={setDistanceKm} setDuration={setDurationMin} panelHeight={panelHeight} />
              {routeCoords.length > 0 && <Polyline positions={routeCoords} color="#10b981" weight={6} opacity={0.8} />}
              <Marker position={[mission.pickupLocation.lat, mission.pickupLocation.lng]} icon={clientIcon} />
              {mission.dropoffLocation && <Marker position={[mission.dropoffLocation.lat, mission.dropoffLocation.lng]} icon={destinationIcon} />}
            </>
          )}
        </MapContainer>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-xl border-t shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[40px] transition-all" style={{height:`${panelHeight}vh`}}>
        {internalAlert && (
          <div className={`absolute -top-16 left-4 right-4 p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${internalAlert.type === "success"?"bg-green-600 text-white":"bg-slate-900 text-white"}`}>
            {internalAlert.type === "success" ? <CheckCircle2 size={20}/> : <AlertCircle size={20} className="text-orange-400"/>}
            <span className="text-sm font-bold">{internalAlert.message}</span>
          </div>
        )}
        <div className="flex flex-col items-center py-4 cursor-grab active:cursor-grabbing" onMouseDown={handleDragStart} onTouchStart={handleDragStart}>
          <div className="w-14 h-1.5 bg-slate-200 rounded-full"/>
        </div>

        <div className="h-full px-6 pb-24 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-black tracking-wider uppercase margin-0 text-slate-800">{livreurName}</h3>
            <span className="flex items-center gap-1 text-[11px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md">
              <ShieldCheck size={12} /> {driverZoneName}
            </span>
          </div>

          {mission ? (
            <div className="duration-500 animate-in fade-in slide-in-from-bottom-6">
              {mission.isCompteur && <TaxiMeter missionId={mission.id} userRole="livreur" currentDistance={distanceKm}/>}

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 rounded-2xl"><ShoppingBag size={24} className="text-emerald-600"/></div>
                  <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</span>
                    <span className="text-sm font-black uppercase text-emerald-600">{mission.status.replace(/_/g,' ')}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Prix Course</span>
                  <p className="text-2xl font-black text-slate-900">{mission.price||0} F</p>
                </div>
              </div>

              {["accepted","arrived_at_pickup","in_transit"].includes(mission.status) && (
                <>
                  <button onClick={()=>setNavigationMode(true)} className="flex items-center justify-center w-full gap-3 p-4 mb-3 font-black text-white transition-all border-b-4 shadow-lg bg-slate-900 rounded-2xl active:scale-95 border-slate-700">
                    <Zap size={18} className="text-yellow-400 fill-yellow-400" /> NAVIGATION ULTIMATE
                  </button>
                  <a href={`tel:${mission.clientPhone}`} className="flex items-center justify-center w-full gap-3 p-4 mb-4 font-black transition-colors border-2 text-emerald-600 border-emerald-100 rounded-2xl active:bg-emerald-50">
                    <Phone size={20}/> CONTACTER CLIENT
                  </a>
                </>
              )}

              <div className="p-5 mb-8 border border-slate-50 bg-slate-50/50 rounded-3xl">
                <div className="flex items-start gap-4 mb-3">
                  <div className="flex items-center justify-center w-8 h-8 text-slate-500 bg-slate-100 rounded-xl shrink-0"><MapPin size={16}/></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ramassage</p><p className="text-xs font-bold leading-tight text-slate-800">{mission.pickupAddress || "Non spécifiée"}</p></div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-8 h-8 text-emerald-500 bg-emerald-50 rounded-xl shrink-0"><ChevronRight size={16}/></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination</p><p className="text-xs font-bold leading-tight text-slate-800">{mission.destination || "Non spécifiée"}</p></div>
                </div>
              </div>

              {mission.status==="offering" ? (
                <div className="space-y-4">
                  {isFreeModeActive() ? (
                    <button onClick={()=>handleNextStep()} disabled={isProcessing} className="w-full py-6 text-sm font-black text-white uppercase transition-all bg-green-600 shadow-xl rounded-3xl active:scale-95">⚡ CONFIRMER LA MISSION (FREE)</button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => acceptCourse(mission.id, "solde")} disabled={isProcessing} className="flex flex-col items-center justify-center py-4 px-2 text-[11px] font-black text-white uppercase transition-all shadow-md bg-emerald-600 rounded-2xl active:scale-95 border-b-4 border-emerald-800">
                          <span>Accepter (Solde)</span>
                          <span className="text-[9px] text-emerald-100 font-medium normal-case mt-0.5">-13% Commission</span>
                        </button>
                        <button onClick={() => acceptCourse(mission.id, "jetons")} disabled={isProcessing} className="flex flex-col items-center justify-center py-4 px-2 text-[11px] font-black text-white uppercase transition-all shadow-md bg-amber-600 rounded-2xl active:scale-95 border-b-4 border-amber-800">
                          <span>Accepter (Jeton)</span>
                          <span className="text-[9px] text-amber-100 font-medium normal-case mt-0.5">-17% Commission</span>
                        </button>
                      </div>
                      <button onClick={handleReject} className="w-full py-4 text-xs font-black text-red-500 uppercase transition-colors bg-red-50 hover:bg-red-100 rounded-2xl">Refuser la proposition</button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={handleNextStep} disabled={isProcessing} className="flex items-center justify-between w-full px-8 py-6 font-black text-white bg-emerald-600 rounded-[32px] shadow-2xl active:scale-95 transition-all">
                  <span className="text-sm tracking-widest uppercase">
                    {mission.status === "accepted" ? "Arrivé au point" : mission.status === "arrived_at_pickup" ? "Démarrer la livraison" : "Finaliser la course"}
                  </span>
                  {isProcessing ? <Loader2 size={24} className="animate-spin"/> : <ChevronRight size={24}/>}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-xs font-black tracking-wider uppercase text-slate-400">Demandes en attente ({courses.length})</h4>
              {courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center animate-pulse">
                  <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-slate-50">
                    <Loader2 className="text-slate-400 animate-spin" size={24}/>
                  </div>
                  <p className="text-[11px] font-black tracking-widest uppercase text-slate-300">Recherche de demandes sur {driverZoneName}...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {courses.map(c => (
                    <div key={c.id} className="flex flex-col justify-between gap-3 p-4 border bg-slate-50 border-slate-100 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase">{c.courseMode || "Standard"}</span>
                        <p className="m-0 text-base font-black text-slate-900">{c.price} F</p>
                      </div>
                      <div className="text-[12px] text-slate-600 space-y-1">
                        <p className="m-0 truncate">📍 <strong>De:</strong> {c.pickupAddress}</p>
                        <p className="m-0 truncate">🏁 <strong>À:</strong> {c.destination}</p>
                      </div>
                      
                      {isFreeModeActive() ? (
                        <button onClick={() => acceptCourse(c.id, "solde")} disabled={isProcessing} className="w-full py-3.5 text-xs font-black tracking-wider text-white uppercase transition-all bg-green-600 rounded-xl active:scale-98">
                          Prendre la course (FREE)
                        </button>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button onClick={() => acceptCourse(c.id, "solde")} disabled={isProcessing} className="flex flex-col items-center justify-center py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all active:scale-95">
                            <span className="text-[11px] font-black">Prendre (Solde)</span>
                            <span className="text-[9px] text-slate-400 font-bold">-13%</span>
                          </button>
                          <button onClick={() => acceptCourse(c.id, "jetons")} disabled={isProcessing} className="flex flex-col items-center justify-center py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-all active:scale-95">
                            <span className="text-[11px] font-black">Prendre (Jeton)</span>
                            <span className="text-[9px] text-amber-200 font-bold">-17%</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showBadgeModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6">
          <div className="relative w-full max-w-sm">
            <button onClick={() => setShowBadgeModal(false)} className="absolute right-0 p-2 -top-12 text-white/50 hover:text-white">
              <X size={32} />
            </button>
            <MonQR userProfile={userData} />
          </div>
        </div>
      )}
      
      <SideMenu 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)} 
        userRole="livreur-externe" 
        activeCoursesCount={mission ? 1 : 0} 
      />

      {showScanner && commandeSelectionnee && (
  <InterfaceFluxLivreur 
    orderId={commandeSelectionnee.id}
    orderType={commandeSelectionnee.type || "standard"} // Évite les crashs si le type n'est pas renseigné
    onClose={() => setShowScanner(false)}
    onOrderCompleted={(receipt) => {
      setShowScanner(false);
      // Optionnel : Ajoutez ici votre fonction de rafraîchissement des commandes (ex: fetchOrders())
    }}
  />
)}

      {showPassModal && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl animate-in slide-in-from-bottom-10 duration-500">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Pass Free {driverZoneName}</h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {isExterne ? "Tarif réduit - Zone Externe" : "Zéro commission assurée"}
                </p>
              </div>
              <button onClick={()=>{setShowPassModal(false);resetScanPass();}} className="p-3 transition-colors rounded-2xl bg-slate-50 text-slate-700 hover:bg-slate-100">
                <X size={20}/>
              </button>
            </div>

            <div className="mb-8 space-y-4">
              <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
                <p className="text-xs font-bold text-slate-500">Option 1 — Paiement Solde Principal</p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button onClick={() => handleBuyPassWithBalance(12, isExterne ? 1000 : 5000)} disabled={isProcessing} className="p-4 text-left transition-all bg-white border border-slate-200 hover:border-indigo-500 rounded-xl active:scale-95">
                    <span className="block text-xs font-black text-slate-800">Pass 12 Heures</span>
                    <span className="block text-[11px] font-medium text-indigo-600 mt-1">
                      {isExterne ? "1,000" : "5,000"} F CFA
                    </span>
                  </button>
                  <button onClick={() => handleBuyPassWithBalance(24, isExterne ? 2000 : 10000)} disabled={isProcessing} className="p-4 text-left transition-all bg-white border border-slate-200 hover:border-indigo-500 rounded-xl active:scale-95">
                    <span className="block text-xs font-black text-slate-800">Pass 24 Heures</span>
                    <span className="block text-[11px] font-medium text-indigo-600 mt-1">
                      {isExterne ? "2,000" : "10,000"} F CFA
                    </span>
                  </button>
                </div>
              </div>

              <div className="p-4 border border-indigo-200 border-dashed rounded-2xl bg-indigo-50/30">
                <p className="text-xs font-bold text-indigo-900">Option 2 — Scan Reçu de Paiement Wave</p>
                <p className="text-[11px] text-indigo-500 mt-1 leading-relaxed">Transférez le montant exact sur le numéro Wave Assistance, puis scannez le reçu complet.</p>
                
                <div className="mt-4 space-y-2">
                  <a href={WAVE_LINK} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3.5 bg-blue-600 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-98">
                    <span>OUVRIR L'APPLICATION WAVE</span>
                    <ExternalLink size={14}/>
                  </a>
                  <div className="flex items-center justify-between p-3 text-xs font-bold bg-white border border-indigo-100 rounded-xl text-slate-700">
                    <span>Numéro : {ADMIN_WAVE_NUM}</span>
                  </div>
                </div>

              <div className="mt-4">
  {scanPassStatus === "scanning" ? (
    <div className="flex flex-col items-center justify-center p-6 text-center bg-white border border-indigo-100 rounded-xl">
      <Loader2 className="mb-2 text-indigo-600 animate-spin" size={24}/>
      <span className="text-xs font-black tracking-wider uppercase text-slate-700">Analyse du reçu Wave...</span>
    </div>
  ) : (
    <button 
      onClick={() => {
        // 1. On stocke la référence pour l'interface de flux
        setCommandeSelectionnee({
          id: `pass-${userData?.uid || 'free'}`,
          type: "pass_free"
        });
        // 2. On ouvre visuellement le conteneur du scanner
        setShowScanner(true);
        // 3. On déclenche la logique interne du hook de scan
        scanPass();
      }} 
      className="w-full py-4 text-xs font-black tracking-widest text-white uppercase transition-all bg-indigo-600 shadow-lg rounded-xl shadow-indigo-600/20 active:scale-95"
    >
      📷 SCANNER LE REÇU COMPLET
    </button>
  )}
</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}