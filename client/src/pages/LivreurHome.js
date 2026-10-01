import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Loader2,
  Navigation,
  Phone,
  Menu,
  Wallet,
  Coins,
  Power,
  QrCode,
  Zap,
  X,
  AlertCircle,
  ShoppingBag,
  ShieldCheck,
  MapPin,
  User,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { auth, db } from "../firebase";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  runTransaction,
  query,
  collection,
  where,
  or,
  increment,
  addDoc,
  getDocs,
  limit,
} from "firebase/firestore";

import SideMenu from "../components/SideMenu";
import UltimateDrivingView from "../components/UltimateDrivingView";
import "./LivreurHome.css";

import clientMarkerImg from "../assets/marker-client.png";
import livreurMarkerImg from "../assets/marker-livreur.png";
import suvMarkerImg from "../assets/marker-suv.png";
import taxiMarkerImg from "../assets/marker-taxi.png";
import vtcEcoMarkerImg from "../assets/marker-vct-eco.png";
import vtcConfortMarkerImg from "../assets/marker-vtc-confort.png";

// --- Envoi d'un message in-app générique ---
async function sendInAppMessage({ receiverId, text, orderId, orderDocId, courseId, type, extraData = {} }) {
  if (!receiverId || !text) return;
  try {
    await addDoc(collection(db, "inAppMessages"), {
      orderId: orderId || courseId,
      orderDocId: orderDocId || null,
      courseId: courseId || null,
      senderId: "system_mambo",
      senderName: "Mambo - Suivi de commande",
      receiverId: receiverId,
      text: text,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      read: false,
      role: "system",
      ...(type ? { type } : {}),
      ...extraData,
    });
  } catch (e) {
    console.error("Erreur création message inApp :", e);
  }
}

// --- Envoi d'un message in-app au client ---
async function sendClientInAppMessage({ mission, text, type, extraData }) {
  if (!mission || !text) return;
  const docIdCandidates = [mission.orderId, mission.linkedOrderId, mission.id].filter(Boolean);
  let clientId = mission.clientId || mission.clientUserId || mission.userId || null;
  let humanOrderId = null;
  let orderDocId = null;

  for (const candidate of docIdCandidates) {
    try {
      const snap = await getDoc(doc(db, "orders", candidate));
      if (snap.exists()) {
        const od = snap.data();
        orderDocId = snap.id;
        humanOrderId = od.orderId || null;
        clientId = od.clientId || od.userId || clientId;
        break;
      }
    } catch (e) {
      console.warn("Lecture commande impossible :", e);
    }
  }

  if (!clientId) {
    console.warn("Message in-app non envoyé : client introuvable pour la course", mission.id);
    return;
  }

  await sendInAppMessage({
    receiverId: clientId,
    text,
    orderId: humanOrderId || orderDocId || docIdCandidates[0] || mission.id,
    orderDocId,
    courseId: mission.id,
    type,
    extraData,
  });
}

// --- Notification de l'arrivée du livreur chez le client (Envoyé au VENDEUR) ---
async function notifyVendeurArrivalAtClient(mission) {
  if (!mission) return;
  let vendeurId = mission.vendeurId || mission.sellerId || mission.storeId || null;
  const docIdCandidates = [mission.orderId, mission.linkedOrderId, mission.id].filter(Boolean);
  let humanOrderId = null;
  let orderDocId = null;

  for (const candidate of docIdCandidates) {
    try {
      const snap = await getDoc(doc(db, "orders", candidate));
      if (snap.exists()) {
        const od = snap.data();
        orderDocId = snap.id;
        humanOrderId = od.orderId || null;
        vendeurId = od.vendeurId || od.sellerId || vendeurId;
        break;
      }
    } catch (e) {
      console.warn("Erreur lecture commande vendeur :", e);
    }
  }

  if (!vendeurId) {
    console.warn("Vendeur non trouvé pour la notification d'arrivée.");
    return;
  }

  await sendInAppMessage({
    receiverId: vendeurId,
    text: `📍 Le livreur est arrivé à l'adresse du client pour la commande #${humanOrderId || orderDocId || mission.id}.`,
    orderId: humanOrderId || orderDocId || mission.id,
    orderDocId,
    courseId: mission.id,
    type: "vendeur_arrival_alert",
  });
}

// --- Invitation au Paiement Wave envoyée au CLIENT avant la livraison finale ---
async function sendPaymentRequestToClient(mission) {
  if (!mission) return;

  let vendeurId = mission.vendeurId || mission.sellerId || mission.storeId || null;
  let articleAmount = 0;
  const deliveryFee =
    Number(mission.price || mission.proposedPrice || mission.finalPrice || mission.basePrice || 0) || 1000;

  const docIdCandidates = [mission.orderId, mission.linkedOrderId, mission.id].filter(Boolean);
  let humanOrderId = null;
  let orderDocId = null;

  // 1. Lecture de la commande pour récupérer l'ID du vendeur et le montant des articles
  for (const candidate of docIdCandidates) {
    try {
      const snap = await getDoc(doc(db, "orders", candidate));
      if (snap.exists()) {
        const od = snap.data();
        orderDocId = snap.id;
        humanOrderId = od.orderId || null;
        vendeurId = od.vendeurId || od.sellerId || od.storeId || vendeurId;
        articleAmount = Number(od.amount || od.montantArticles || od.totalAmount || od.prixTotal || articleAmount);
        break;
      }
    } catch (e) {
      console.warn("Erreur lecture details paiement :", e);
    }
  }

  // 2. Récupération directe du numéro du vendeur dans la collection 'users' (champ 'telephone')
  let vendeurWaveNumber = "";
  if (vendeurId) {
    try {
      const vendeurDoc = await getDoc(doc(db, "users", vendeurId));
      if (vendeurDoc.exists()) {
        const vData = vendeurDoc.data();
        vendeurWaveNumber = vData.telephone || "";
      }
    } catch (e) {
      console.warn("Erreur profil vendeur Wave :", e);
    }
  }

  const paymentUrl = `/payer-vendeur?orderId=${encodeURIComponent(humanOrderId || orderDocId || mission.id)}&vendeurId=${encodeURIComponent(vendeurId || "")}&amount=${articleAmount}&deliveryFee=${deliveryFee}`;
  const messageText = `💳 Le livreur est à votre adresse. Merci d'effectuer le règlement de ${articleAmount.toLocaleString("fr-FR")} FCFA au vendeur via Wave (${vendeurWaveNumber || "non renseigné"}) et ${deliveryFee.toLocaleString("fr-FR")} F au livreur pour la livraison.`;

  await sendClientInAppMessage({
    mission,
    text: messageText,
    type: "payment_request",
    extraData: {
      paymentUrl,
      vendeurWaveNumber,
      amount: articleAmount,
      articleAmount,
      deliveryFee,
    },
  });
}

const createCustomIcon = (iconUrl, size = [38, 38], tintColor = null) => {
  return L.divIcon({
    className: "custom-map-marker",
    html: `<div style="position:relative; width:${size[0]}px; height:${size[1]}px; display:flex; align-items:center; justify-content:center;">
      <img src="${iconUrl}" style="width:100%; height:100%; object-fit:contain; border-radius:50%; box-shadow:0 4px 12px rgba(0,0,0,0.3); border: 2px solid ${tintColor || "#ffffff"}; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));" />
    </div>`,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
    popupAnchor: [0, -size[1] / 2],
  });
};

const icons = {
  client: createCustomIcon(clientMarkerImg, [34, 34], "#3b82f6"),
  destination: createCustomIcon(clientMarkerImg, [36, 36], "#10b981"),
  moto: createCustomIcon(livreurMarkerImg, [43, 43], "#10b981"),
  suv: createCustomIcon(suvMarkerImg, [40, 40], "#0f172a"),
  taxi: createCustomIcon(taxiMarkerImg, [40, 40], "#0f172a"),
  eco: createCustomIcon(vtcEcoMarkerImg, [40, 40], "#0f172a"),
  confort: createCustomIcon(vtcConfortMarkerImg, [40, 40], "#0f172a"),
};

const DEFAULT_ABIDJAN_CENTER = [5.36, -4.0083];
const ALERT_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
const OFFER_TIMEOUT_MS = 55 * 1000;

const PASS_FREE_PRICES = {
  abidjan: { h12: 2000, h24: 5000 },
  externe: { h12: 500, h24: 1000 },
};

function MapFitBounds({ points, panelHeight }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 200);
    return () => clearTimeout(t);
  }, [map, panelHeight]);

  useEffect(() => {
    if (!map || !points?.length) return;
    const valid = points.filter(
      (p) => Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])
    );
    if (valid.length === 0) return;

    const h = typeof window !== "undefined" ? window.innerHeight : 700;
    const panelRatio = Math.min(0.75, Math.max(0.25, (panelHeight || 36) / 100));
    const bottomPad = Math.max(260, Math.round(h * panelRatio) + 24);
    const sidePad = 36;
    const topPad = 120;

    if (valid.length === 1) {
      const latOffset = (bottomPad / h) * 0.012;
      map.setView([valid[0][0] - latOffset, valid[0][1]], 15, { animate: true });
      return;
    }

    map.fitBounds(L.latLngBounds(valid), {
      paddingTopLeft: [sidePad, topPad],
      paddingBottomRight: [sidePad, bottomPad],
      maxZoom: 15,
      animate: true,
    });
  }, [map, points, panelHeight]);

  return null;
}

function createDropoffIcon(timeLabel) {
  const badge = timeLabel
    ? `<div style="margin-top:4px;background:#0f172a;color:#fff;font-size:10px;font-weight:800;font-family:system-ui,sans-serif;padding:3px 8px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);">${timeLabel}</div>`
    : "";
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;width:64px;pointer-events:none;">
      <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(145deg,#22c55e,#16a34a);border:3px solid #fff;box-shadow:0 4px 14px rgba(22,163,74,0.45);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M5 21V3" stroke="white" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M5 4h12l-3 4 3 4H5" fill="white"/>
        </svg>
      </div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #16a34a;margin-top:-2px;"></div>
      ${badge}
    </div>`,
    iconSize: [64, 78],
    iconAnchor: [32, 58],
    className: "",
  });
}

function createPickupIcon() {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(145deg,#3b82f6,#1d4ed8);border:3px solid #fff;box-shadow:0 3px 10px rgba(37,99,235,0.4);"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    className: "",
  });
}

const STATUS_FR = {
  pending: "En attente",
  offering: "Proposition",
  accepted: "En route vers le point de ramassage",
  arrived_at_pickup: "Arrivé au ramassage",
  ready_for_pickup: "Prêt pour enlèvement",
  in_transit: "En cours de livraison client",
  arrived_at_client: "Arrivé chez le client",
  completed: "Terminée",
  cancelled: "Annulée",
  rejected: "Refusée",
};

export default function LivreurHome() {
  const [courses, setCourses] = useState([]);
  const [livreurVehicle, setLivreurVehicle] = useState("moto");
  const [livreurName, setLivreurName] = useState("Livreur");
  const [driverZoneName, setDriverZoneName] = useState("Zone");
  const [isOnline, setIsOnline] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [mission, setMission] = useState(null);
  const [articlePaymentValidated, setArticlePaymentValidated] = useState(false);
  const orderPaymentUnsubRef = useRef(null);
  const [myPos, setMyPos] = useState(DEFAULT_ABIDJAN_CENTER);
  const [userData, setUserData] = useState(null);

  const [routeSegments, setRouteSegments] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationMin, setDurationMin] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [navigationMode, setNavigationMode] = useState(false);
  const [panelHeight, setPanelHeight] = useState(36);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(36);

  const [showPassModal, setShowPassModal] = useState(false);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [internalAlert, setInternalAlert] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotifyingArrival, setIsNotifyingArrival] = useState(false);
  const [offerCountdown, setOfferCountdown] = useState(null);

  const audioRef = useRef(new Audio(ALERT_SOUND_URL));
  const lastUpdateRef = useRef(0);
  const prevMissionIdRef = useRef(null);
  const offerTimerRef = useRef(null);

  const showAlert = useCallback((message, type = "error") => {
    setInternalAlert({ message, type });
    setTimeout(() => setInternalAlert(null), 4000);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const user = auth?.currentUser;
    if (!user) return;

    const unsubUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        setIsOnline(!!data.isOnline);
        const vType = (data.typeVehicule || data.vehicleType || "moto")
          .toString()
          .toLowerCase()
          .trim();
        setLivreurVehicle(vType);
        if (data.fullName || data.nom || data.nomComplet) {
          setLivreurName(data.fullName || data.nomComplet || data.nom);
        }
        if (data.zone || data.sectorZone) {
          setDriverZoneName(data.zone || data.sectorZone);
        }
      }
      setLoadingStatus(false);
    });

    return () => unsubUser();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const newPos = [latitude, longitude];
        setMyPos(newPos);
        lastUpdateRef.current = Date.now();

        if (auth?.currentUser && isOnline) {
          const userRef = doc(db, "users", auth.currentUser.uid);
          setDoc(
            userRef,
            {
              location: { lat: latitude, lng: longitude },
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      },
      (err) => {
        console.warn("Avertissement GPS:", err.message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline]);

  useEffect(() => {
    if (offerTimerRef.current) {
      clearTimeout(offerTimerRef.current);
      offerTimerRef.current = null;
    }

    if (!mission || !auth?.currentUser) {
      setOfferCountdown(null);
      return;
    }
    if (mission.status !== "pending" && mission.status !== "offering") {
      setOfferCountdown(null);
      return;
    }

    const courseId = mission.id;
    const uid = auth.currentUser.uid;
    const totalSec = Math.round(OFFER_TIMEOUT_MS / 1000);
    setOfferCountdown(totalSec);
    const startedAt = Date.now();

    const tickId = setInterval(() => {
      const left = Math.max(
        0,
        totalSec - Math.floor((Date.now() - startedAt) / 1000)
      );
      setOfferCountdown(left);
    }, 250);

    offerTimerRef.current = setTimeout(async () => {
      try {
        const courseRef = doc(db, "courses", courseId);
        const cycle = Number(mission?.offerCycle || 0) + 1;
        await updateDoc(courseRef, {
          status: "pending",
          driverId: null,
          assignedLivreurId: null,
          livreurId: null,
          lastOfferTimedOutAt: serverTimestamp(),
          lastOfferTimedOutBy: uid,
          offerCycle: cycle,
          updatedAt: serverTimestamp(),
        });
        setMission(null);
        setOfferCountdown(null);
        showAlert(
          "55 s écoulées — la course a été remise dans le circuit pour un autre livreur éligible.",
          "info"
        );
      } catch (err) {
        console.warn("Timeout offre 55s:", err?.message || err);
      }
    }, OFFER_TIMEOUT_MS);

    return () => {
      clearInterval(tickId);
      if (offerTimerRef.current) {
        clearTimeout(offerTimerRef.current);
        offerTimerRef.current = null;
      }
    };
  }, [mission, showAlert]);

  const isVehicleCompatible = useCallback((course, livreurType) => {
    const lt = (livreurType || "moto").toLowerCase().trim();
    const vt = (course?.vehicleType || "").toLowerCase();
    const vid = `${course?.vehicleId || ""} ${course?.courseMode || ""} ${course?.mode || ""}`.toLowerCase();
    const blob = `${vt} ${vid}`;

    const isMoto =
      blob.includes("moto") ||
      blob.includes("chap") ||
      blob.includes("nostress") ||
      blob.includes("no stress") ||
      blob.includes("saloni");

    const isHustle =
      blob.includes("taxi") ||
      blob.includes("hustle") ||
      blob.includes("pieton") ||
      blob.includes("piéton") ||
      blob.includes("bicycle") ||
      blob.includes("bicyclette") ||
      blob.includes("transporteur") ||
      blob.includes("arrangement");

    const isCargo =
      blob.includes("vtc") ||
      blob.includes("cargo") ||
      blob.includes("suv") ||
      blob.includes("camion") ||
      blob.includes("express") ||
      blob.includes("confort") ||
      blob.includes("standard") ||
      blob.includes("eco") ||
      (blob.includes("voiture") && !isMoto);

    const isAntara = blob.includes("antara");

    if (lt.includes("moto") || lt === "bike" || lt === "bicycle") {
      return isMoto && !isHustle && !isCargo;
    }
    if (
      lt.includes("taxi") ||
      lt.includes("hustle") ||
      lt.includes("pieton") ||
      lt.includes("piéton") ||
      lt.includes("bicycle")
    ) {
      return isHustle;
    }
    if (
      lt.includes("vtc") ||
      lt.includes("cargo") ||
      lt.includes("suv") ||
      lt.includes("eco") ||
      lt.includes("confort") ||
      lt.includes("voiture") ||
      lt.includes("camion")
    ) {
      return isCargo;
    }
    if (lt.includes("saloni")) return isMoto || blob.includes("saloni");
    if (lt.includes("antara")) return isAntara;

    return vt === lt || vid.includes(lt);
  }, []);

  useEffect(() => {
    if (!mission) {
      setRouteSegments([]);
      return;
    }

    let cancelled = false;
    const hasPickup =
      mission.pickupLocation?.lat != null && mission.pickupLocation?.lng != null;
    const hasDropoff =
      mission.dropoffLocation?.lat != null &&
      mission.dropoffLocation?.lng != null;

    async function fetchLeg(start, end) {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
          const coords = data.routes[0].geometry.coordinates.map((c) => [
            c[1],
            c[0],
          ]);
          return {
            positions: coords,
            distance: data.routes[0].distance / 1000,
            duration: data.routes[0].duration / 60,
          };
        }
      } catch (_) {}
      return {
        positions: [start, end],
        distance: null,
        duration: null,
      };
    }

    (async () => {
      const segments = [];
      let totalKm = 0;
      let totalMin = 0;

      if (
        myPos &&
        hasPickup &&
        [
          "pending",
          "offering",
          "accepted",
          "arrived_at_pickup",
          "ready_for_pickup",
        ].includes(mission.status)
      ) {
        const leg = await fetchLeg(myPos, [
          Number(mission.pickupLocation.lat),
          Number(mission.pickupLocation.lng),
        ]);
        segments.push({
          positions: leg.positions,
          color: "#6366f1",
          dashArray: "10, 10",
        });
        if (leg.distance) totalKm += leg.distance;
        if (leg.duration) totalMin += leg.duration;
      }

      if (hasPickup && hasDropoff) {
        const leg = await fetchLeg(
          [
            Number(mission.pickupLocation.lat),
            Number(mission.pickupLocation.lng),
          ],
          [
            Number(mission.dropoffLocation.lat),
            Number(mission.dropoffLocation.lng),
          ]
        );
        segments.push({
          positions: leg.positions,
          color: "#10b981",
          dashArray: null,
        });
        if (leg.distance) totalKm += leg.distance;
        if (leg.duration) totalMin += leg.duration;
      }

      if (myPos && hasDropoff && (mission.status === "in_transit" || mission.status === "arrived_at_client")) {
        const leg = await fetchLeg(myPos, [
          Number(mission.dropoffLocation.lat),
          Number(mission.dropoffLocation.lng),
        ]);
        segments.length = 0;
        segments.push({
          positions: leg.positions,
          color: "#10b981",
          dashArray: null,
        });
        totalKm = leg.distance || 0;
        totalMin = leg.duration || 0;
      }

      if (cancelled) return;
      setRouteSegments(segments);
      setDistanceKm(
        totalKm > 0 ? Number(totalKm.toFixed(1)) : Number(mission.distance || 0)
      );
      setDurationMin(
        totalMin > 0 ? Math.ceil(totalMin) : Number(mission.duration || 0)
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [mission, myPos]);

  useEffect(() => {
    const linkedOrderId = mission?.orderId || mission?.linkedOrderId;
    if (!mission || mission.status !== "arrived_at_client" || !linkedOrderId) {
      setArticlePaymentValidated(false);
      return;
    }

    let cancelled = false;
    setArticlePaymentValidated(false);

    (async () => {
      let orderDocRef = null;
      try {
        const direct = await getDoc(doc(db, "orders", linkedOrderId));
        if (direct.exists()) {
          orderDocRef = direct.ref;
        } else {
          const matchSnap = await getDocs(
            query(collection(db, "orders"), where("orderId", "==", linkedOrderId), limit(1))
          );
          if (!matchSnap.empty) orderDocRef = matchSnap.docs[0].ref;
        }
      } catch (e) {
        console.warn("Résolution commande pour validation paiement :", e);
      }
      if (cancelled || !orderDocRef) return;

      const unsub = onSnapshot(orderDocRef, (snap) => {
        if (!snap.exists()) return;
        const od = snap.data();
        const validated =
          !!od.paymentValidatedAt ||
          od.status === "paye_ia_valide" ||
          od.articlePaymentValidated === true;
        setArticlePaymentValidated(validated);
      });
      orderPaymentUnsubRef.current = unsub;
    })();

    return () => {
      cancelled = true;
      if (orderPaymentUnsubRef.current) {
        orderPaymentUnsubRef.current();
        orderPaymentUnsubRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.id, mission?.status, mission?.orderId, mission?.linkedOrderId]);

  useEffect(() => {
    const user = auth?.currentUser;
    if (!user || !isOnline) {
      setCourses([]);
      setMission(null);
      prevMissionIdRef.current = null;
      return;
    }

    const q = query(
      collection(db, "courses"),
      or(
        where("driverId", "==", user.uid),
        where("assignedLivreurId", "==", user.uid),
        where("livreurId", "==", user.uid),
        where("status", "in", ["pending", "offering"])
      )
    );

    const unsubCourses = onSnapshot(
      q,
      (snapshot) => {
        let docsList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        docsList = docsList.filter((c) => {
          const isMine =
            c.driverId === user.uid ||
            c.assignedLivreurId === user.uid ||
            c.livreurId === user.uid;
          if (isMine) return true;

          if (c.status !== "pending" && c.status !== "offering") return false;
          if (!isVehicleCompatible(c, livreurVehicle)) return false;

          if (c.lastOfferTimedOutBy === user.uid && c.lastOfferTimedOutAt) {
            const ts = c.lastOfferTimedOutAt.toDate
              ? c.lastOfferTimedOutAt.toDate().getTime()
              : (c.lastOfferTimedOutAt.seconds || 0) * 1000;
            if (Date.now() - ts < OFFER_TIMEOUT_MS) return false;
          }
          return true;
        });

        docsList.sort((a, b) => {
          const timeA = a.createdAt?.toDate
            ? a.createdAt.toDate().getTime()
            : a.createdAt || 0;
          const timeB = b.createdAt?.toDate
            ? b.createdAt.toDate().getTime()
            : b.createdAt || 0;
          return timeB - timeA;
        });

        setCourses(docsList);

        const activeMission = docsList.find((c) =>
          [
            "pending",
            "offering",
            "accepted",
            "arrived_at_pickup",
            "in_transit",
            "arrived_at_client",
            "ready_for_pickup",
          ].includes(c.status)
        );

        if (activeMission && prevMissionIdRef.current !== activeMission.id) {
          audioRef.current.play().catch(() => {});
        }

        prevMissionIdRef.current = activeMission ? activeMission.id : null;
        setMission(activeMission || null);
      },
      (error) => {
        console.error("Erreur récupération courses:", error);
      }
    );

    return () => unsubCourses();
  }, [isOnline, livreurVehicle, isVehicleCompatible]);

  const isFreeModeActive = useCallback(() => {
    return (
      userData?.passFreeUntil &&
      userData.passFreeUntil.toDate() > new Date()
    );
  }, [userData]);

  const isExterneZone = useCallback(() => {
    const role = (userData?.role || "").toLowerCase();
    const zone = (
      userData?.zone ||
      userData?.sectorZone ||
      "abidjan"
    ).toLowerCase();
    if (role.includes("externe") || role.includes("livreur-")) return true;
    if (zone && zone !== "abidjan") return true;
    return false;
  }, [userData]);

  const passPrices = isExterneZone()
    ? PASS_FREE_PRICES.externe
    : PASS_FREE_PRICES.abidjan;

  const getDriverIcon = () => {
    switch (livreurVehicle) {
      case "suv":
      case "camion":
        return icons.suv;
      case "taxi":
      case "hustle":
      case "pieton":
      case "piéton":
      case "bicyclette":
        return icons.taxi;
      case "eco":
      case "vtc":
      case "cargo":
        return icons.eco;
      case "confort":
        return icons.confort;
      case "moto":
      default:
        return icons.moto;
    }
  };

  const toggleOnlineStatus = async () => {
    if (!auth?.currentUser) {
      showAlert("Session expirée, reconnecte-toi.");
      return;
    }
    try {
      setLoadingStatus(true);
      const newStatus = !isOnline;
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        isOnline: newStatus,
        updatedAt: serverTimestamp(),
      });
      setIsOnline(newStatus);
      showAlert(`Statut : ${newStatus ? "En ligne" : "Hors ligne"}`, "success");
    } catch (e) {
      console.error(e);
      showAlert("Erreur lors du changement de statut");
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleDragStart = (e) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    setStartY(clientY);
    setStartHeight(panelHeight);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (clientY == null) return;
      const deltaY = startY - clientY;
      let newHeight = startHeight + (deltaY / window.innerHeight) * 100;
      newHeight = Math.min(60, Math.max(18, newHeight));
      setPanelHeight(newHeight);
    };
    const onEnd = () => {
      setIsDragging(false);
      setPanelHeight((h) => {
        if (h < 28) return 22;
        if (h < 45) return 36;
        return 55;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isDragging, startY, startHeight]);

  const price = Number(
    mission?.proposedPrice ?? mission?.price ?? mission?.finalPrice ?? 0
  );
  const basePrice = Number(mission?.basePrice ?? mission?.price ?? 0);
  const isNegoMission = !!(
    mission?.isNegoActive ||
    mission?.isArrangement ||
    mission?.courseMode?.toLowerCase?.().includes("transporteur")
  );

  const commissionRateSolde = 0.13;
  const commissionRateJeton = 0.17;
  const costSolde13 = Math.round(price * commissionRateSolde);
  const discountJetons17 = Math.round(price * commissionRateJeton);

  const needsCommission =
    mission?.needCommission === true ||
    (!!mission?.orderId && mission?.needCommission !== false);
  const commissionPaid =
    !!mission?.commissionPaid || mission?.status === "ready_for_pickup";

  const otherPendingCourses = courses.filter(
    (c) =>
      c.id !== mission?.id &&
      (c.status === "pending" || c.status === "offering")
  );

  const acceptCourseWithMode = async (courseId, mode) => {
    if (!auth?.currentUser || isProcessing) return;
    setIsProcessing(true);
    try {
      const courseRef = doc(db, "courses", courseId);
      const userRef = doc(db, "users", auth.currentUser.uid);

      let orderIdToSync = null;

      await runTransaction(db, async (transaction) => {
        const courseSnap = await transaction.get(courseRef);
        if (!courseSnap.exists()) throw new Error("Course introuvable");
        const c = courseSnap.data();
        if (c.status !== "pending" && c.status !== "offering") {
          throw new Error("Course déjà prise");
        }

        orderIdToSync = c.orderId || c.linkedOrderId || null;

        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error("Profil introuvable");
        const u = userSnap.data();

        const p = Number(c.proposedPrice ?? c.price ?? 0);
        const free =
          u.passFreeUntil &&
          u.passFreeUntil.toDate &&
          u.passFreeUntil.toDate() > new Date();

        if (!free) {
          if (mode === "solde") {
            const cost = Math.round(p * commissionRateSolde);
            if ((u.solde || 0) < cost) throw new Error("Solde insuffisant");
            transaction.update(userRef, {
              solde: increment(-cost),
              updatedAt: serverTimestamp(),
            });
          } else if (mode === "jeton") {
            const cost = Math.round(p * commissionRateJeton);
            if ((u.jetons || 0) < cost) throw new Error("Jetons insuffisants");
            transaction.update(userRef, {
              jetons: increment(-cost),
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(courseRef, {
          status: "accepted",
          driverId: auth.currentUser.uid,
          assignedLivreurId: auth.currentUser.uid,
          livreurId: auth.currentUser.uid,
          acceptedAt: serverTimestamp(),
          paymentMode: free ? "pass_free" : mode,
          updatedAt: serverTimestamp(),
        });

        if (orderIdToSync) {
          const orderRef = doc(db, "orders", orderIdToSync);
          transaction.update(orderRef, {
            status: "accepte",
            driverId: auth.currentUser.uid,
            coursierId: auth.currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
      });

      await sendClientInAppMessage({
        mission: { ...(mission || {}), id: courseId, orderId: orderIdToSync || mission?.orderId, linkedOrderId: orderIdToSync || mission?.linkedOrderId },
        text: "Un livreur a pris en charge votre commande et se dirige vers le point de ramassage.",
      });

      showAlert("Livraison acceptée !", "success");
    } catch (err) {
      console.error(err);
      showAlert(err.message || "Impossible d'accepter");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (courseId) => {
    if (!auth?.currentUser || isProcessing) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "courses", courseId), {
        status: "pending",
        driverId: null,
        assignedLivreurId: null,
        livreurId: null,
        lastOfferTimedOutBy: auth.currentUser.uid,
        lastOfferTimedOutAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMission(null);
      showAlert("Livraison refusée et remise dans le circuit", "info");
    } catch (err) {
      showAlert("Erreur refus");
    } finally {
      setIsProcessing(false);
    }
  };

  const updateMissionStatus = async (newStatus, e) => {
    if (e) e.stopPropagation();
    if (!mission?.id || isProcessing) return;
    setIsProcessing(true);
    try {
      const targetOrderId = mission.orderId || mission.linkedOrderId || mission.id;

      const payload = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };
      if (newStatus === "completed") {
        payload.completedAt = serverTimestamp();
      }
      await updateDoc(doc(db, "courses", mission.id), payload);

      let msgText = "";
      let mappedOrderStatus = newStatus;

      if (newStatus === "arrived_at_pickup" || newStatus === "ready_for_pickup") {
        msgText = "Votre livreur est arrivé au point de ramassage. Les articles sont en cours de préparation / vérification.";
        mappedOrderStatus = "arrived_at_pickup";
      } else if (newStatus === "in_transit") {
        msgText = "Votre livreur a récupéré votre colis et est maintenant en route pour la livraison.";
        mappedOrderStatus = "in_transit";
      } else if (newStatus === "arrived_at_client") {
        mappedOrderStatus = "arrived_at_client";
      } else if (newStatus === "completed") {
        msgText = "Votre commande a été livrée avec succès ! Merci pour votre confiance.";
        mappedOrderStatus = "livre";
      }

      if (targetOrderId) {
        try {
          const orderRef = doc(db, "orders", targetOrderId);
          await updateDoc(orderRef, {
            status: mappedOrderStatus,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn("Mise à jour directe orders ignorée si non existant:", e);
        }
      }

      if (newStatus === "arrived_at_client") {
        await notifyVendeurArrivalAtClient(mission);
        await sendPaymentRequestToClient(mission);
      } else if (msgText) {
        await sendClientInAppMessage({ mission, text: msgText });
      }

      showAlert(
        newStatus === "completed"
          ? "Livraison terminée !"
          : newStatus === "arrived_at_client"
          ? "Arrivée chez le client notifiée & invitation Wave envoyée !"
          : "Statut mis à jour",
        "success"
      );

      if (newStatus === "completed") setMission(null);
    } catch (err) {
      console.error(err);
      showAlert("Erreur lors de la mise à jour");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNotifyArrivalAndRequestCommission = async () => {
    if (!mission?.id || isNotifyingArrival) return;
    setIsNotifyingArrival(true);
    try {
      const targetOrderId = mission.orderId || mission.linkedOrderId || mission.id;

      await updateDoc(doc(db, "courses", mission.id), {
        status: "arrived_at_pickup",
        commissionRequested: true,
        commissionRequestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (targetOrderId) {
        try {
          await updateDoc(doc(db, "orders", targetOrderId), {
            status: "arrived_at_pickup",
            updatedAt: serverTimestamp(),
          });
        } catch (_) {}
      }

      await sendClientInAppMessage({
        mission,
        text: "Votre livreur est arrivé au point de ramassage. Les articles sont en cours de préparation / vérification.",
      });

      showAlert("Arrivée au point de ramassage notifiée", "success");
    } catch (err) {
      showAlert("Erreur notification");
    } finally {
      setIsNotifyingArrival(false);
    }
  };

  if (navigationMode && mission) {
    const navRoute =
      routeSegments.length > 0
        ? routeSegments.flatMap((s) => s.positions || [])
        : [];

    const destLabel =
      mission.destination ||
      mission.dropoffAddress ||
      mission.pickupAddress ||
      "la destination";

    return (
      <UltimateDrivingView
        vehiclePosition={myPos}
        route={navRoute}
        remainingDistance={distanceKm}
        estimatedTime={durationMin}
        vehicleType={livreurVehicle}
        courseMode={mission.courseMode || mission.mode || ""}
        destinationLabel={destLabel}
        onClose={() => setNavigationMode(false)}
      />
    );
  }

  const mapPoints = [
    myPos,
    mission?.pickupLocation?.lat != null
      ? [
          Number(mission.pickupLocation.lat),
          Number(mission.pickupLocation.lng),
        ]
      : null,
    mission?.dropoffLocation?.lat != null
      ? [
          Number(mission.dropoffLocation.lat),
          Number(mission.dropoffLocation.lng),
        ]
      : null,
  ].filter((p) => Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]));

  return (
    <div className="relative w-full h-screen overflow-hidden livreur-home bg-slate-100">
      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <div className="absolute inset-0 z-0">
        <MapContainer
          center={myPos}
          zoom={14}
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <MapFitBounds points={mapPoints} panelHeight={panelHeight} />
          <Marker position={myPos} icon={getDriverIcon()} zIndexOffset={1000} />
          {mission?.pickupLocation?.lat != null && (
            <Marker
              position={[
                Number(mission.pickupLocation.lat),
                Number(mission.pickupLocation.lng),
              ]}
              icon={createPickupIcon()}
              zIndexOffset={800}
            />
          )}
          {mission?.dropoffLocation?.lat != null && (
            <Marker
              position={[
                Number(mission.dropoffLocation.lat),
                Number(mission.dropoffLocation.lng),
              ]}
              icon={createDropoffIcon(
                durationMin > 0 ? `~${durationMin} min` : "Arrivée"
              )}
              zIndexOffset={900}
            />
          )}
          {routeSegments.map((seg, i) => (
            <Polyline
              key={i}
              positions={seg.positions}
              pathOptions={{
                color: seg.color,
                weight: 5,
                dashArray: seg.dashArray || null,
              }}
            />
          ))}
        </MapContainer>
      </div>

      <div className="absolute top-0 left-0 right-0 z-20 p-3 pointer-events-none">
        <div className="flex items-center justify-between gap-2 pointer-events-auto">
          <button
            onClick={() => setIsMenuOpen(true)}
            className="p-2.5 bg-white rounded-xl shadow-lg"
          >
            <Menu size={20} className="text-slate-800" />
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={toggleOnlineStatus}
              disabled={loadingStatus}
              className={`px-4 py-2.5 rounded-xl font-bold text-[9px] shadow-xl border transition-all active:scale-95 ${
                isOnline
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-white text-slate-400 border-slate-100"
              }`}
            >
              <Power size={14} className="inline mr-2" />{" "}
              {isOnline ? "EN LIGNE" : "HORS LIGNE"}
            </button>
            <button
              onClick={() => setShowBadgeModal(true)}
              className="px-4 py-2.5 rounded-xl font-bold text-[9px] shadow-xl flex items-center gap-2 bg-white text-slate-800 border border-slate-100 transition-all active:scale-95"
            >
              <QrCode size={12} className="text-emerald-600" /> MON BADGE QR
            </button>
            <button
              onClick={() => setShowPassModal(true)}
              className={`px-4 py-2.5 rounded-xl font-bold text-[9px] shadow-xl flex items-center gap-2 transition-all active:scale-95 ${
                isFreeModeActive()
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 text-white"
              }`}
            >
              <Zap size={12} fill={isFreeModeActive() ? "white" : "none"} />
              {isFreeModeActive() ? "PASS GRATUIT ACTIF" : "ACTIVER PASS GRATUIT"}
            </button>
          </div>
        </div>
      </div>

      {showBadgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white shadow-2xl rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900">
                Mon Badge QR Livreur
              </h3>
              <button
                onClick={() => setShowBadgeModal(false)}
                className="p-2 rounded-full text-slate-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col items-center justify-center p-6 mb-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
              <QrCode size={120} className="mb-3 text-slate-800" />
              <p className="text-xs font-bold text-center text-slate-600">
                {auth?.currentUser?.uid}
              </p>
              <span className="mt-2 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                {livreurName} — {driverZoneName}
              </span>
            </div>
            <button
              onClick={() => setShowBadgeModal(false)}
              className="w-full py-3 text-xs font-black text-white uppercase bg-slate-900 rounded-xl"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {showPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white shadow-2xl rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900">
                Pass Gratuit Livreur
              </h3>
              <button
                onClick={() => setShowPassModal(false)}
                className="p-2 rounded-full text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 mb-4 border border-indigo-100 rounded-2xl bg-indigo-50">
              <div className="flex items-center gap-3 mb-2">
                <Zap size={24} className="text-indigo-600 fill-indigo-600" />
                <div>
                  <h4 className="text-xs font-black text-indigo-900 uppercase">
                    Statut du Pass
                  </h4>
                  <p className="text-xs font-bold text-indigo-700">
                    {isFreeModeActive() ? "Actuellement Actif" : "Inactif"}
                  </p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-indigo-600">
                Sans commission sur les livraisons pendant la durée du Pass.
                {isExterneZone() && (
                  <span className="block mt-1 font-bold text-emerald-700">
                    Tarif zone externe appliqué
                  </span>
                )}
              </p>
            </div>

            {!isFreeModeActive() && (
              <div className="mb-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Enregistrez le contact assistance, payez sur Wave et envoyez le reçu complet
                </p>
                <div className="flex items-center justify-between w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50">
                  <span className="text-xs font-black text-slate-800">
                    12 heures
                  </span>
                  <span className="text-sm font-black text-indigo-600">
                    {passPrices.h12.toLocaleString()} F
                  </span>
                </div>
                <div className="flex items-center justify-between w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50">
                  <span className="text-xs font-black text-slate-800">
                    24 heures
                  </span>
                  <span className="text-sm font-black text-indigo-600">
                    {passPrices.h24.toLocaleString()} F
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowPassModal(false)}
              className="w-full py-3 text-xs font-black text-white uppercase bg-indigo-600 rounded-xl"
            >
              {isFreeModeActive() ? "Compris" : "Fermer"}
            </button>
          </div>
        </div>
      )}

      <div
        className={`livreur-bottom-panel ${isDragging ? "is-dragging" : ""}`}
        style={{ height: `${panelHeight}vh` }}
      >
        {internalAlert && (
          <div
            className={`absolute -top-16 left-4 right-4 p-4 rounded-2xl shadow-2xl flex items-center gap-3 ${
              internalAlert.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-slate-900 text-white"
            }`}
          >
            {internalAlert.type === "success" ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertCircle size={20} className="text-amber-400" />
            )}
            <span className="text-sm font-bold">{internalAlert.message}</span>
          </div>
        )}

        <div
          className="flex flex-col items-center py-3.5 cursor-grab active:cursor-grabbing select-none touch-none livreur-panel-handle"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          style={{ touchAction: "none" }}
        >
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
          <span className="mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Glisser
          </span>
        </div>

        <div className="h-full px-6 pb-24 overflow-y-auto livreur-panel-scroll">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="m-0 text-sm font-black tracking-wider uppercase text-slate-800">
                {livreurName}
              </h3>
              <span className="flex items-center gap-1 text-[11px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md">
                <ShieldCheck size={12} /> {driverZoneName}
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              {currentTime.toLocaleTimeString()}
            </span>
          </div>

          {mission &&
          (mission.status === "pending" || mission.status === "offering") ? (
            <div className="p-4 mb-4 border bg-amber-50 border-amber-200 rounded-2xl">
              <h4 className="mb-1 text-sm font-black text-amber-900">
                {isNegoMission
                  ? "Livraison négociée !"
                  : "Nouvelle proposition de livraison !"}
              </h4>
              <p className="mb-2 text-xs text-amber-700">
                {isNegoMission ? (
                  <>
                    Client propose <strong>{price.toLocaleString()} F</strong>
                    {basePrice > 0 && basePrice !== price && (
                      <span className="text-amber-600">
                        {" "}
                        (réf. {basePrice.toLocaleString()} F)
                      </span>
                    )}
                  </>
                ) : (
                  <>Livraison de {price.toLocaleString()} F CFA.</>
                )}{" "}
                Choisissez votre mode de paiement :
              </p>

              {(mission.courseMode || mission.mode) && (
                <span className="inline-block px-2 py-1 mb-2 text-[10px] font-black uppercase rounded-lg bg-slate-100 text-slate-700">
                  {mission.courseMode || mission.mode}
                </span>
              )}

              {isNegoMission && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {mission.wantClim && (
                    <span className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-sky-100 text-sky-700">
                      ❄️ Climatisation
                    </span>
                  )}
                  {mission.wantArret && (
                    <span className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-orange-100 text-orange-700">
                      📍 Arrêt(s)
                    </span>
                  )}
                  <span className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-indigo-100 text-indigo-700">
                    Négociation
                  </span>
                </div>
              )}

              {otherPendingCourses.length > 0 && (
                <div className="p-2 mb-3 border bg-white/80 border-amber-100 rounded-xl">
                  <p className="mb-2 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Autres livraisons ({otherPendingCourses.length})
                  </p>
                  <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto">
                    {otherPendingCourses.slice(0, 5).map((c) => {
                      const p = Number(c.proposedPrice || c.price || 0);
                      const nego = !!(c.isNegoActive || c.isArrangement);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setMission(c)}
                          className="flex items-center justify-between w-full px-3 py-2 text-left border rounded-lg border-slate-100 bg-slate-50 hover:bg-indigo-50"
                        >
                          <span className="text-[11px] font-bold text-slate-700 truncate max-w-[55%]">
                            {c.pickupAddress ||
                              c.destination ||
                              c.dropoffAddress ||
                              "Livraison"}
                          </span>
                          <span className="text-[11px] font-black text-slate-900">
                            {p.toLocaleString()} F
                            {nego ? " · Négo" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {offerCountdown != null && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                      Temps pour accepter
                    </span>
                    <span className="text-xs font-black text-amber-900 tabular-nums">
                      {offerCountdown}s
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-amber-200/80">
                    <div
                      className="h-full transition-all duration-200 rounded-full bg-amber-500"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, (offerCountdown / 55) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 mb-3">
                <button
                  onClick={() => acceptCourseWithMode(mission.id, "solde")}
                  disabled={isProcessing}
                  className="flex items-center justify-between w-full px-4 py-3 text-xs font-black text-white uppercase bg-emerald-600 rounded-xl disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <Wallet size={16} /> Payer avec Solde
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-800 rounded text-[11px]">
                    -13% ({costSolde13} F)
                  </span>
                </button>
                <button
                  onClick={() => acceptCourseWithMode(mission.id, "jeton")}
                  disabled={isProcessing}
                  className="flex items-center justify-between w-full px-4 py-3 text-xs font-black text-white uppercase bg-amber-500 rounded-xl disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <Coins size={16} /> Payer avec Bonus Jeton
                  </span>
                  <span className="px-2 py-0.5 bg-amber-700 rounded text-[11px]">
                    -17% (-{discountJetons17} F)
                  </span>
                </button>
              </div>

              <button
                onClick={() => handleReject(mission.id)}
                disabled={isProcessing}
                className="w-full py-2.5 text-xs font-black uppercase text-slate-600 bg-slate-200 rounded-xl disabled:opacity-50"
              >
                Refuser la livraison
              </button>
            </div>
          ) : mission ? (
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 rounded-2xl">
                    <ShoppingBag size={22} className="text-emerald-600" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Statut
                    </span>
                    <span className="text-sm font-black uppercase text-emerald-600">
                      {STATUS_FR[mission.status] ||
                        mission.status.replace(/_/g, " ")}
                    </span>
                    {(mission.courseMode || mission.mode) && (
                      <span className="block text-[10px] font-bold text-slate-500 mt-0.5">
                        {mission.courseMode || mission.mode}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Tarif
                  </span>
                  <p className="text-2xl font-black text-slate-900">{price} F</p>
                  {distanceKm > 0 && (
                    <p className="text-[11px] font-bold text-slate-500">
                      {distanceKm} km · ~{durationMin} min
                    </p>
                  )}
                </div>
              </div>

              {[
                "accepted",
                "arrived_at_pickup",
                "ready_for_pickup",
                "in_transit",
                "arrived_at_client",
              ].includes(mission.status) && (
                <div className="flex flex-col gap-2 mb-3">
                  {mission.status === "accepted" && (
                    <button
                      onClick={handleNotifyArrivalAndRequestCommission}
                      disabled={isNotifyingArrival || isProcessing}
                      className="w-full py-3.5 text-xs font-black text-white uppercase bg-indigo-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isNotifyingArrival ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />{" "}
                          Notification...
                        </>
                      ) : (
                        "Arrivé au point de ramassage"
                      )}
                    </button>
                  )}

                  {(mission.status === "arrived_at_pickup" ||
                    mission.status === "ready_for_pickup") && (
                    <>
                      {needsCommission && !commissionPaid && (
                        <div className="p-3 mb-1 text-center border bg-amber-50 border-amber-200 rounded-xl">
                          <p className="text-xs font-bold text-amber-800">
                            Enregistrez le contact assistance et envoyez le reçu complet Wave pour valider le paiement.
                          </p>
                        </div>
                      )}
                      <button
                        onClick={(e) => updateMissionStatus("in_transit", e)}
                        disabled={
                          isProcessing || 
                          (needsCommission && !commissionPaid && !mission?.paymentVerified)
                        }
                        className="w-full py-3.5 text-xs font-black text-white uppercase bg-blue-600 rounded-2xl disabled:opacity-50"
                      >
                        Démarrer la livraison vers le client
                      </button>
                    </>
                  )}

                  {mission.status === "in_transit" && (
                    <button
                      onClick={(e) => updateMissionStatus("arrived_at_client", e)}
                      disabled={isProcessing}
                      className="w-full py-3.5 text-xs font-black text-white uppercase bg-amber-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <MapPin size={16} /> Arrivé chez le client
                    </button>
                  )}

                  {mission.status === "arrived_at_client" && (
                    <div className="space-y-2">
                      {articlePaymentValidated ? (
                        <div className="p-3 text-center border bg-emerald-50 border-emerald-200 rounded-xl">
                          <p className="text-xs font-bold text-emerald-800">
                            ✅ Paiement du client validé par l'IA. Vous pouvez remettre la commande.
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 text-center border bg-amber-50 border-amber-200 rounded-xl">
                          <p className="text-xs font-bold text-amber-800">
                            ⏳ En attente du reçu Wave du client (vérification automatique OCR).
                            Ne remettez pas la commande avant validation.
                          </p>
                        </div>
                      )}
                      <button
                        onClick={(e) => updateMissionStatus("completed", e)}
                        disabled={isProcessing || !articlePaymentValidated}
                        title={
                          !articlePaymentValidated
                            ? "En attente de la validation automatique du paiement du client"
                            : undefined
                        }
                        className="w-full py-3.5 text-xs font-black text-white uppercase bg-emerald-600 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={16} /> Confirmer la remise & Terminer
                      </button>
                    </div>
                  )}
                </div>
              )}

              {[
                "accepted",
                "arrived_at_pickup",
                "ready_for_pickup",
                "in_transit",
                "arrived_at_client",
              ].includes(mission.status) && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNavigationMode(true);
                    }}
                    className="flex items-center justify-center w-full gap-3 p-4 mb-2 font-black text-white bg-slate-900 rounded-2xl"
                  >
                    <Navigation size={18} className="text-amber-400" />{" "}
                    NAVIGATION GPS
                  </button>
                  <div className="flex gap-2 mb-4">
                    <a
                      href={`tel:${
                        mission.clientPhone ||
                        mission.clientTel ||
                        mission.telephoneClient ||
                        mission.thirdPartyPhone ||
                        ""
                      }`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 flex items-center justify-center gap-2 p-3.5 font-black border-2 text-emerald-600 border-emerald-100 rounded-2xl text-xs"
                    >
                      <Phone size={16} /> APPELER CLIENT
                    </a>
                  </div>
                </>
              )}

              <div className="p-4 mb-6 space-y-3 border border-slate-100 bg-slate-50 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center text-indigo-600 bg-indigo-100 rounded-lg w-7 h-7 shrink-0">
                    <User size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Client
                    </p>
                    <p className="text-xs font-bold text-slate-800">
                      {mission.thirdPartyName ||
                        mission.clientName ||
                        mission.nomClient ||
                        "Non spécifié"}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {mission.thirdPartyPhone ||
                        mission.clientPhone ||
                        mission.clientTel ||
                        mission.telephoneClient ||
                        "Pas de téléphone"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center text-blue-600 bg-blue-100 rounded-lg w-7 h-7 shrink-0">
                    <MapPin size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Ramassage
                    </p>
                    <p className="text-xs font-bold text-slate-800">
                      {mission.pickupAddress ||
                        mission.adresse ||
                        "Non spécifiée"}
                    </p>
                  </div>
                </div>
                {(mission.destination || mission.dropoffAddress) && (
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center rounded-lg text-emerald-600 bg-emerald-100 w-7 h-7 shrink-0">
                      <MapPin size={15} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Destination Client
                      </p>
                      <p className="text-xs font-bold text-slate-800">
                        {mission.destination || mission.dropoffAddress}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-11 text-slate-400">
              <p className="text-xs font-bold tracking-wider uppercase">
                En attente d'une livraison...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}