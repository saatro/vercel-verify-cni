import { doc, onSnapshot, serverTimestamp, updateDoc, collection, query, where, limit } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Phone, Car, ShieldCheck, BadgeCheck, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useNavigate, useParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db, auth } from "../firebase";

import "./Tracking.css";

import vtcMarkerImg from "../assets/courseDriverImg.png";
import motoMarkerImg from "../assets/marker-livreur.png";
import suvDriverImg from "../assets/suvDriver.png";
import taxiDriverImg from "../assets/taxiDriver.png";
import taxiSuvDriverImg from "../assets/taxiSuvDriver.png";

let assignSound = "";
let arrivalSound = "";

try {
  assignSound = require("../assets/sounds/assign.mp3");
} catch (e) {
  assignSound = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
}

try {
  arrivalSound = require("../assets/sounds/arrival.mp3");
} catch (e) {
  arrivalSound = "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3";
}

function MapController({ points, routePoints, panelHeight }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 180);
    return () => clearTimeout(t);
  }, [map, panelHeight]);

  useEffect(() => {
    if (!map) return;
    const validPoints = [];
    (points || []).forEach((p) => {
      if (Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) validPoints.push(p);
    });
    (routePoints || []).forEach((p) => {
      if (Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) validPoints.push(p);
    });
    if (validPoints.length === 0) return;

    // Zone utile au-dessus du panneau — cadrage plus généreux sur la route
    const bottomPadding = Math.max(150, Math.round((window.innerHeight * panelHeight) / 200) + 6);
    const sidePad = 50;
    const topPad = -10;

    const bounds = L.latLngBounds(validPoints);

    // maxZoom dynamique : trajets courts → zoom plus serré (moins « avare »)
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const span = Math.max(Math.abs(ne.lat - sw.lat), Math.abs(ne.lng - sw.lng));

    let maxZoom = 20;
    if (span > 0.12) maxZoom = 16;
    else if (span > 0.08) maxZoom = 18;
    else if (span > 0.020) maxZoom = 20;
    else maxZoom = 20;

    map.fitBounds(bounds, {
      paddingTopLeft: [sidePad, topPad],
      paddingBottomRight: [sidePad, bottomPadding],
      maxZoom,
      animate: true,
      duration: 0.4,
    });
  }, [points, routePoints, panelHeight, map]);

  return null;
}

const getDynamicVehicleIcon = (livreur, rotation = 0, mission = null) => {
  const rawType = (
    livreur?.typeVehicule ||
    livreur?.vehicleType ||
    mission?.vehicleType ||
    mission?.vehicleId ||
    "moto"
  ).toString().toLowerCase();
  const mode = (
    livreur?.modeVtc ||
    mission?.courseMode ||
    mission?.mode ||
    ""
  ).toString().toLowerCase();

  let iconImg = motoMarkerImg;
  if (rawType.includes("suv") || mode.includes("suv")) iconImg = suvDriverImg;
  else if (rawType.includes("taxi")) iconImg = mode.includes("suv") ? taxiSuvDriverImg : taxiDriverImg;
  else if (rawType.includes("vtc") || rawType.includes("confort") || rawType.includes("eco")) {
    iconImg = mode.includes("suv") || rawType.includes("suv") ? suvDriverImg : vtcMarkerImg;
  } else {
    iconImg = motoMarkerImg;
  }

  return L.divIcon({
    html: `<div style="
        transform: rotate(${rotation}deg);
        width: 48px; height: 48px;
        display:flex;align-items:center;justify-content:center;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));
      ">
        <img src="${iconImg}" style="width:100%;height:100%;object-fit:contain;" alt="véhicule"/>
      </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    className: "",
  });
};




/** Dropoff : drapeau arrivée + badge temps (styles inline) */
function createDropoffIcon(timeLabel) {
  const badge = timeLabel
    ? `<div style="
        margin-top:4px;background:#0f172a;color:#fff;
        font-size:10px;font-weight:800;font-family:system-ui,sans-serif;
        padding:3px 8px;border-radius:10px;white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
      ">${timeLabel}</div>`
    : "";
  return L.divIcon({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;width:64px;pointer-events:none;">
        <div style="position:relative;width:40px;height:48px;display:flex;flex-direction:column;align-items:center;">
          <div style="
            width:38px;height:38px;border-radius:50%;
            background:linear-gradient(145deg,#22c55e 0%,#16a34a 100%);
            border:3px solid #fff;
            box-shadow:0 4px 14px rgba(22,163,74,0.45);
            display:flex;align-items:center;justify-content:center;z-index:2;
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 21V3" stroke="white" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M5 4h12l-3 4 3 4H5" fill="white"/>
            </svg>
          </div>
          <div style="
            width:0;height:0;
            border-left:7px solid transparent;border-right:7px solid transparent;
            border-top:10px solid #16a34a;margin-top:-2px;
          "></div>
        </div>
        ${badge}
      </div>`,
    iconSize: [64, 78],
    iconAnchor: [32, 58],
    className: "",
  });
}

function extractCoords(userData) {
  if (!userData) return null;
  if (userData.location?.lat != null && userData.location?.lng != null) {
    return [Number(userData.location.lat), Number(userData.location.lng)];
  }
  if (userData.lat != null && userData.lng != null) {
    return [Number(userData.lat), Number(userData.lng)];
  }
  if (userData.latitude != null && userData.longitude != null) {
    return [Number(userData.latitude), Number(userData.longitude)];
  }
  return null;
}

function resolveLivreurId(mission) {
  if (!mission) return null;
  return mission.assignedLivreurId || mission.driverId || mission.livreurId || null;
}

export default function Tracking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [livreurPos, setLivreurPos] = useState([5.3484, -4.0305]);
  const [animatedRoute, setAnimatedRoute] = useState([]);
  const [vehicleRotation, setVehicleRotation] = useState(0);
  const [distanceKm, setDistanceKm] = useState("0");
  const [durationMin, setDurationMin] = useState(0);
  // Panneau glissable (hauteur en % de l'écran)
  const [panelHeight, setPanelHeight] = useState(42);
  const [isDragging, setIsDragging] = useState(false);
  const [cancelHelpOpen, setCancelHelpOpen] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(42);

  const hasPlayedAssignSound = useRef(false);
  const hasPlayedArrivalSound = useRef(false);
  const assignSoundRef = useRef(null);
  const arrivalSoundRef = useRef(null);
  const lastRouteKeyRef = useRef("");

  const handlePanelDragStart = useCallback((e) => {
    setIsDragging(true);
    const y = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    dragStartY.current = y;
    dragStartHeight.current = panelHeight;
  }, [panelHeight]);

  const handlePanelDragMove = useCallback((e) => {
    if (!isDragging) return;
    const y = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
    const deltaPct = ((dragStartY.current - y) / window.innerHeight) * 100;
    const next = Math.max(18, Math.min(88, dragStartHeight.current + deltaPct));
    setPanelHeight(next);
  }, [isDragging]);

  const handlePanelDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    // Snap vers positions confortables
    setPanelHeight((h) => {
      if (h < 33) return 30;
      if (h < 50) return 42;
      if (h < 70) return 62;
      return 75;
    });
  }, [isDragging]);

  useEffect(() => {
    if (assignSound) assignSoundRef.current = new Audio(assignSound);
    if (arrivalSound) arrivalSoundRef.current = new Audio(arrivalSound);
  }, []);

  const isLivreurRole =
    !!auth.currentUser?.uid &&
    (auth.currentUser.uid === mission?.assignedLivreurId ||
      auth.currentUser.uid === mission?.driverId ||
      auth.currentUser.uid === mission?.livreurId);

  useEffect(() => {
    let unsub = () => {};

    function processMissionData(data) {
      if (data.status === "accepted" && !hasPlayedAssignSound.current) {
        if (assignSoundRef.current) assignSoundRef.current.play().catch(() => {});
        toast.success("Chauffeur en route !");
        hasPlayedAssignSound.current = true;
      }
      if (data.status === "arrived_at_pickup" && !hasPlayedArrivalSound.current) {
        if (arrivalSoundRef.current) arrivalSoundRef.current.play().catch(() => {});
        toast.info("Votre chauffeur est arrivé !");
        hasPlayedArrivalSound.current = true;
      }
      setMission(data);
      if (data.status === "completed" || data.status === "cancelled") {
        setTimeout(() => navigate("/"), 2500);
      }
    }

    if (id) {
      unsub = onSnapshot(doc(db, "courses", id), (snap) => {
        if (snap.exists()) processMissionData({ id: snap.id, ...snap.data() });
      });
    } else if (auth.currentUser) {
      const currentUserId = auth.currentUser.uid;
      const q = query(
        collection(db, "courses"),
        where("status", "in", [
          "pending",
          "offering",
          "accepted",
          "arrived_at_pickup",
          "ready_for_pickup",
          "in_transit",
        ]),
        limit(15)
      );
      unsub = onSnapshot(q, (snap) => {
        if (snap.empty) return;
        const courses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        let missionData = courses.find(
          (c) =>
            c.assignedLivreurId === currentUserId ||
            c.driverId === currentUserId ||
            c.livreurId === currentUserId ||
            c.clientId === currentUserId
        );
        if (!missionData) {
          missionData = courses
            .filter((c) => c.status === "pending" || c.status === "offering")
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
        }
        if (missionData) processMissionData(missionData);
      });
    }

    return () => unsub();
  }, [id, navigate]);

  const updateRoute = useCallback(async (start, end) => {
    try {
      if (!start || !end || end.lat == null || end.lng == null) return;
      const key = `${start[0].toFixed(5)},${start[1].toFixed(5)}>${Number(end.lat).toFixed(5)},${Number(end.lng).toFixed(5)}`;
      if (key === lastRouteKeyRef.current) return;
      lastRouteKeyRef.current = key;

      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end.lng},${end.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.routes?.[0]) {
        const coords = data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
        setAnimatedRoute(coords);
        setDistanceKm((data.routes[0].distance / 1000).toFixed(1));
        setDurationMin(Math.ceil(data.routes[0].duration / 60));
        if (coords.length > 1) {
          const dy = coords[1][0] - start[0];
          const dx = coords[1][1] - start[1];
          setVehicleRotation((Math.atan2(dx, dy) * 180) / Math.PI);
        }
      } else {
        setAnimatedRoute([start, [Number(end.lat), Number(end.lng)]]);
      }
    } catch (e) {
      console.error("Erreur OSRM:", e);
      if (start && end?.lat != null && end?.lng != null) {
        setAnimatedRoute([start, [Number(end.lat), Number(end.lng)]]);
      }
    }
  }, []);

  useEffect(() => {
    const driverUid = resolveLivreurId(mission);
    if (!driverUid) {
      if (mission?.pickupLocation?.lat != null) {
        setLivreurPos([mission.pickupLocation.lat, mission.pickupLocation.lng]);
      }
      return;
    }

    const unsubDriver = onSnapshot(doc(db, "users", driverUid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setDriverData(d);
      const coords = extractCoords(d);
      if (!coords) return;
      setLivreurPos(coords);
      const target =
        mission.status === "in_transit" ? mission.dropoffLocation : mission.pickupLocation;
      if (target?.lat != null && target?.lng != null) {
        updateRoute(coords, target);
      }
    });
    return () => unsubDriver();
  }, [mission, updateRoute]);


  // Tracé pickup → dropoff seulement si aucun livreur GPS (pending / offering)
  useEffect(() => {
    if (!mission) return;
    const pickup = mission.pickupLocation;
    const dropoff = mission.dropoffLocation;
    if (pickup?.lat == null || dropoff?.lat == null) return;

    // Dès qu'un livreur est assigné, la route vient du watcher users (GPS)
    const hasDriver = !!(mission.assignedLivreurId || mission.driverId || mission.livreurId);
    if (hasDriver) return;
    if (!["pending", "offering"].includes(mission.status)) return;

    const start = [Number(pickup.lat), Number(pickup.lng)];
    updateRoute(start, dropoff);
  }, [mission, updateRoute]);

  // Toujours les 3 points quand dispo (livreur + ramassage + destination)
  const mapPoints = [
    livreurPos,
    mission?.pickupLocation?.lat != null && mission?.pickupLocation?.lng != null
      ? [Number(mission.pickupLocation.lat), Number(mission.pickupLocation.lng)]
      : null,
    mission?.dropoffLocation?.lat != null && mission?.dropoffLocation?.lng != null
      ? [Number(mission.dropoffLocation.lat), Number(mission.dropoffLocation.lng)]
      : null,
  ].filter((p) => Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]));

  const handleCancelCourse = async () => {
    if (!mission?.id) {
      navigate("/");
      return;
    }
    // Client : dès qu'un livreur a accepté → pas d'annulation directe
    const lockedStatuses = ["accepted", "arrived_at_pickup", "ready_for_pickup", "in_transit"];
    if (!isLivreurRole && lockedStatuses.includes(mission.status)) {
      setCancelHelpOpen(true);
      setPanelHeight((h) => Math.max(h, 62));
      toast.info("Annulation bloquée : dédommagement requis");
      return;
    }
    const cancelByRole = isLivreurRole ? "livreur" : "client";
    await updateDoc(doc(db, "courses", mission.id), {
      status: "cancelled",
      cancelledBy: cancelByRole,
      cancelledAt: serverTimestamp(),
    });
    navigate("/");
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!mission?.id) return;
    try {
      const payload = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };
      if (newStatus === "arrived_at_pickup") {
        payload.commissionRequested = true;
        payload.commissionRequestedAt = serverTimestamp();
      }
      await updateDoc(doc(db, "courses", mission.id), payload);

      const orderId = mission.orderId || mission.linkedOrderId;
      if (newStatus === "arrived_at_pickup" && orderId) {
        try {
          await updateDoc(doc(db, "orders", orderId), {
            status: "en_attente_commission",
            commissionNotifiedAt: serverTimestamp(),
            inAppMessage:
              "📦 Vos achats sont prêts ! Le livreur est arrivé. Merci de payer la commission (500 F) et d'envoyer le reçu Wave à l'assistance.",
            inAppMessageRead: false,
            inAppMessageAt: serverTimestamp(),
          });
        } catch (oe) {
          console.warn("Update order commission:", oe.message);
        }
      }
      if (newStatus === "completed" && orderId) {
        try {
          await updateDoc(doc(db, "orders", orderId), {
            status: "livre",
            closedAt: serverTimestamp(),
          });
        } catch (oe) {
          console.warn("Clôture order:", oe.message);
        }
      }

      if (newStatus === "in_transit") toast.success("Livraison démarrée !");
      else if (newStatus === "arrived_at_pickup") toast.info("Arrivée notifiée — en attente commission");
      else if (newStatus === "completed") {
        toast.success("Course terminée !");
        setTimeout(() => navigate("/"), 2000);
      }
    } catch (error) {
      console.error(error);
      toast.error("Impossible de mettre à jour le statut.");
    }
  };

  // Profil livreur (users) : typeVehicule, marqueVehicule, plaque, photoProfileURL, vehiclePhotoURL
  const driverPhoto =
    driverData?.photoProfileURL ||
    driverData?.vehiclePhotoURL ||
    mission?.assignedLivreurPhoto ||
    null;
  const vehiclePhoto =
    driverData?.vehiclePhotoURL ||
    mission?.vehiclePhotoURL ||
    null;
  const driverName =
    driverData?.nomComplet ||
    `${driverData?.prenom || ""} ${driverData?.nom || ""}`.trim() ||
    mission?.assignedLivreurName ||
    "Chauffeur";
  const driverPhone = isLivreurRole
    ? mission?.thirdPartyPhone || mission?.clientPhone || mission?.telephoneClient
    : driverData?.telephone || mission?.assignedLivreurPhone || "";

  const vehicleType = (
    driverData?.typeVehicule ||
    driverData?.vehicleType ||
    mission?.vehicleType ||
    mission?.vehicleId ||
    ""
  ).toString().trim();
  const vehicleBrand = (
    driverData?.marqueVehicule ||
    driverData?.marqueMoto ||
    mission?.vehicleBrand ||
    mission?.marqueVehicule ||
    ""
  ).toString().trim();
  const vehicleModel = (
    driverData?.modeleMoto ||
    driverData?.modele ||
    mission?.vehicleModel ||
    ""
  ).toString().trim();
  const vehiclePlate = (
    driverData?.plaque ||
    driverData?.immatriculation ||
    mission?.vehiclePlate ||
    mission?.plaque ||
    ""
  ).toString().trim();

  // Ex: "MOTO · KTM · 1234"
  const vehicleInfo = [
    vehicleType ? vehicleType.toUpperCase() : null,
    vehicleBrand || null,
    vehicleModel || null,
  ].filter(Boolean).join(" · ");
  const STATUS_FR = {
    pending: "En attente",
    offering: "Proposition en cours",
    accepted: "Chauffeur en route",
    arrived_at_pickup: "Arrivé au ramassage",
    ready_for_pickup: "Prêt pour enlèvement",
    in_transit: "En course",
    completed: "Terminée",
    cancelled: "Annulée",
  };
  const statusLabel =
    STATUS_FR[mission?.status] ||
    (mission?.status ? String(mission.status).replace(/_/g, " ") : "Recherche...");

  const commissionPaid =
    !!mission?.commissionPaid || mission?.status === "ready_for_pickup";

  return (
    <div
      className="tracking-container"
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      <style>{`
        .tracking-container .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          z-index: 0 !important;
        }
        .tracking-container .leaflet-pane,
        .tracking-container .leaflet-top,
        .tracking-container .leaflet-bottom {
          z-index: auto !important;
        }
        .tracking-ui-layer {
          position: absolute;
          inset: 0;
          z-index: 500;
          pointer-events: none;
        }
        .tracking-ui-layer > * {
          pointer-events: auto;
        }
        /* Styles panneau : voir Tracking.css (hauteur via style.height) */
      `}</style>

      <ToastContainer position="top-right" autoClose={3000} style={{ zIndex: 10000 }} />

      <div className="tracking-map-layer" style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <MapContainer
          center={livreurPos}
          zoom={15}
          zoomControl={false}
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        >
          <TileLayer 
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
          <MapController
            points={mapPoints}
            routePoints={animatedRoute}
            panelHeight={panelHeight}
          />
          <Marker
            position={livreurPos}
            icon={getDynamicVehicleIcon(driverData, vehicleRotation, mission)}
            zIndexOffset={1500}
          />
          {mission?.dropoffLocation?.lat != null && (
            <Marker
              key={`drop-${mission.dropoffLocation.lat}-${durationMin}`}
              position={[Number(mission.dropoffLocation.lat), Number(mission.dropoffLocation.lng)]}
              icon={createDropoffIcon(durationMin > 0 ? `~${durationMin} min` : "Arrivée")}
              zIndexOffset={900}
            />
          )}
          {/* Route : bordure blanche + trait coloré */}
          {animatedRoute.length > 1 && (
            <>
              <Polyline
                positions={animatedRoute}
                pathOptions={{
                  color: "#ffffff",
                  weight: 10,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <Polyline
                positions={animatedRoute}
                pathOptions={{
                  color: "#3b82f6",
                  weight: 5,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </>
          )}
        </MapContainer>
      </div>

      <div
        className="tracking-ui-layer"
        onMouseMove={handlePanelDragMove}
        onMouseUp={handlePanelDragEnd}
        onMouseLeave={handlePanelDragEnd}
        onTouchMove={handlePanelDragMove}
        onTouchEnd={handlePanelDragEnd}
      >
        <div
          className={`tracking-panel ${isDragging ? "dragging" : ""}`}
          style={{
            height: `${panelHeight}vh`,
            transition: isDragging ? "none" : "height 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div
            className="tracking-panel-handle"
            onMouseDown={handlePanelDragStart}
            onTouchStart={handlePanelDragStart}
            role="button"
            aria-label="Glisser le panneau"
          >
            <div className="tracking-panel-grip" />
            <span className="tracking-panel-hint">
              {panelHeight < 30 ? "Glisser vers le haut" : panelHeight > 65 ? "Glisser vers le bas" : "Glisser"}
            </span>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-bold tracking-wider uppercase text-slate-400">
                Statut de la course
              </span>
              <h2 className="text-base font-black uppercase text-slate-800">
                {statusLabel}
              </h2>
            </div>
            {distanceKm !== "0" && (
              <div className="text-right">
                <span className="text-xs font-bold tracking-wider uppercase text-slate-400">
                  Distance / Temps
                </span>
                <p className="text-sm font-black text-indigo-600">
                  {distanceKm} km ({durationMin} min)
                </p>
              </div>
            )}
          </div>

          {/* Identité livreur : compact si panneau bas, carte stylisée si glissé vers le haut */}
          {panelHeight >= 52 ? (
            <div className="tracking-id-card">
              <div className="tracking-id-banner">
                <ShieldCheck size={14} />
                <span>Identité livreur Mambo</span>
                <BadgeCheck size={14} />
              </div>
              <div className="tracking-id-body">
                <div className="tracking-id-photo-wrap">
                  {driverPhoto ? (
                    <img src={driverPhoto} alt={driverName} className="tracking-id-photo" />
                  ) : (
                    <div className="tracking-id-photo tracking-id-photo-fallback">
                      <Car size={36} color="#94a3b8" />
                    </div>
                  )}
                  {driverData?.isCertified && (
                    <span className="tracking-id-certified">
                      <Star size={10} fill="#fbbf24" color="#fbbf24" /> Certifié
                    </span>
                  )}
                </div>
                <div className="tracking-id-details">
                  <h3 className="tracking-id-name">{driverName}</h3>
                  <p className="tracking-id-role">Livreur professionnel</p>
                  <div className="tracking-id-rows">
                    {vehicleType && (
                      <div className="tracking-id-row">
                        <span>Véhicule</span>
                        <strong>{vehicleType.toUpperCase()}</strong>
                      </div>
                    )}
                    {(vehicleBrand || vehicleModel) && (
                      <div className="tracking-id-row">
                        <span>Modèle</span>
                        <strong>{[vehicleBrand, vehicleModel].filter(Boolean).join(" ")}</strong>
                      </div>
                    )}
                    {vehiclePlate && (
                      <div className="tracking-id-row tracking-id-plate">
                        <span>Plaque</span>
                        <strong>{vehiclePlate}</strong>
                      </div>
                    )}
                  </div>
                  {vehiclePhoto && (
                    <div className="tracking-id-vehicle-photo">
                      <img src={vehiclePhoto} alt="Véhicule" />
                    </div>
                  )}
                  {driverPhone && (
                    <a href={`tel:${driverPhone}`} className="tracking-id-call">
                      <Phone size={16} />
                      Appeler {driverPhone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="tracking-driver-card">
              <div className="tracking-driver-avatar">
                {driverPhoto ? (
                  <img src={driverPhoto} alt={driverName} />
                ) : (
                  <Car size={24} className="text-slate-500" />
                )}
              </div>
              <div className="tracking-driver-info">
                <h4>{driverName}</h4>
                <p className="tracking-vehicle-line">
                  {vehicleInfo || (driverData ? "Véhicule" : "Chargement…")}
                  {vehiclePlate ? ` · ${vehiclePlate}` : ""}
                </p>
              </div>
              {driverPhone && (
                <a href={`tel:${driverPhone}`} className="tracking-call-btn" aria-label="Appeler">
                  <Phone size={18} />
                </a>
              )}
            </div>
          )}

          {isLivreurRole && mission?.status === "accepted" && (
            <button
              onClick={() => handleUpdateStatus("arrived_at_pickup")}
              className="w-full py-3.5 mb-2 bg-indigo-600 text-white font-black text-xs uppercase rounded-xl shadow-lg active:scale-95 transition"
            >
              Arrivé au point de ramassage
            </button>
          )}

          {isLivreurRole &&
            (mission?.status === "arrived_at_pickup" || mission?.status === "ready_for_pickup") && (
              <>
                {!commissionPaid && mission?.orderId && (
                  <div className="p-3 mb-2 text-center border bg-amber-50 border-amber-200 rounded-xl">
                    <p className="text-xs font-bold text-amber-800">
                      En attente du paiement commission client (500 F)...
                    </p>
                  </div>
                )}
                <button
                  onClick={() => handleUpdateStatus("in_transit")}
                  className="w-full py-3.5 mb-2 bg-blue-600 text-white font-black text-xs uppercase rounded-xl shadow-lg active:scale-95 transition"
                >
                  Démarrer la course (En route)
                </button>
              </>
            )}

          {isLivreurRole && mission?.status === "in_transit" && (
            <button
              onClick={() => handleUpdateStatus("completed")}
              className="w-full py-3.5 mb-2 bg-emerald-600 text-white font-black text-xs uppercase rounded-xl shadow-lg active:scale-95 transition"
            >
              Terminer la course
            </button>
          )}

          {/* Client : annulation libre UNIQUEMENT avant acceptation */}
          {!isLivreurRole &&
            ["pending", "offering"].includes(mission?.status) && (
              <button
                onClick={handleCancelCourse}
                className="w-full py-3 text-xs font-bold uppercase transition bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100"
              >
                Annuler la course
              </button>
            )}

          {/* Client : dès acceptation → annulation bloquée (dédommagement 1/3) */}
          {!isLivreurRole &&
            ["accepted", "arrived_at_pickup", "ready_for_pickup", "in_transit"].includes(
              mission?.status
            ) && (
              <div className="tracking-cancel-locked">
                {!cancelHelpOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelHelpOpen(true);
                      setPanelHeight((h) => Math.max(h, 62));
                    }}
                    className="w-full py-3 text-xs font-bold uppercase transition bg-rose-50 text-rose-600 rounded-xl"
                    style={{ border: "none", cursor: "pointer" }}
                  >
                    Annuler la course
                  </button>
                ) : (
                  <>
                    <p>
                      Un livreur a déjà <strong>accepté</strong> la course.
                      L&apos;annulation immédiate n&apos;est plus disponible.
                      <br />
                      <br />
                      Pour débloquer l&apos;annulation :
                      <br />
                      1. Versez un dédommagement de <strong>1/3 du prix</strong> au livreur via Wave
                      <br />
                      2. Scannez le reçu pour validation IA
                      <br />
                      3. Le bouton d&apos;annulation s&apos;active ensuite
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        navigate("/dedomagement", {
                          state: {
                            courseId: mission?.id,
                            missionId: mission?.id,
                            price:
                              Number(mission?.price) ||
                              Number(mission?.finalPrice) ||
                              Number(mission?.proposedPrice) ||
                              0,
                            driverPhone:
                              driverData?.telephone ||
                              mission?.assignedLivreurPhone ||
                              "",
                            driverWaveMerchant:
                              driverData?.waveMerchantUrl ||
                              driverData?.waveLink ||
                              null,
                          },
                        })
                      }
                    >
                      Continuer vers le dédommagement
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelHelpOpen(false)}
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: 10,
                        border: "none",
                        background: "transparent",
                        color: "#9a3412",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Fermer
                    </button>
                  </>
                )}
              </div>
            )}

          {/* Livreur peut toujours annuler (sauf terminée) */}
          {isLivreurRole &&
            ["pending", "offering", "accepted", "arrived_at_pickup", "ready_for_pickup"].includes(
              mission?.status
            ) && (
              <button
                onClick={handleCancelCourse}
                className="w-full py-3 text-xs font-bold uppercase transition bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100"
              >
                Annuler la course
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
