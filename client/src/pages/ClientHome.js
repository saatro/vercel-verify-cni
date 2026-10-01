import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  X, Menu, Target, Route, Search, MapPin, Banknote, User, Phone
} from "lucide-react";
import { auth, db } from "../firebase";
import { toast } from "react-toastify";
import "./ClientHome.css";
import SideNav from "../components/SideNav";
import "../components/SideNav.css";

// --- ASSETS ---
import motoImg from "../assets/moto-3d.png";
import motoChapImg from "../assets/moto-chap.png";
import motoNoStressImg from "../assets/moto-nostress.png";
import carConfortImg from "../assets/car-confort.png";
import carEcoImg from "../assets/car-eco.png";
import carSuvImg from "../assets/car-suv.png";
import taxiConfortImg from "../assets/taxi-confort.png";
import taxiEcoImg from "../assets/taxi-eco.png";
import taxiArrangementImg from "../assets/taxi-arrangement.png";
import courseVtcIcon from "../assets/courseVtc.png";
import livraisonMotoIcon from "../assets/livraisonMoto.png";
import courseMapIcon from "../assets/courseDriverImg.png";
import motoMarkerImg from "../assets/marker-livreur.png";
import suvMapIcon from "../assets/suvDriver.png";
import ecoMapIcon from "../assets/ecoDriver.png";
import taxiEcoMapIcon from "../assets/taxiDriver.png";
import taxiConfortMapIcon from "../assets/taxiConfortDriver.png";

// Assets Rural
import imgSaloni from "../assets/saloni.png";
import imgAntara from "../assets/antara.png";
import imgMoto from "../assets/moto.png";
import imgVtc from "../assets/vtc.png";

// Illustrations
import abidjanIllustration from "../assets/abidjan-illustration.jpg";
import alepeIllustration from "../assets/alepe-illustration.jpg";
import azaguieIllustration from "../assets/azaguie-illustration.jpg";
import agbovilleIllustration from "../assets/agboville-illustration.jpg";
import adzopeIllustration from "../assets/adzope-illustration.jpg";
import dabouIllustration from "../assets/dabou-illustration.jpg";
import jacquevilleIllustration from "../assets/jacqueville-illustration.jpg";

const CONFIG = {
  DEFAULT_CENTER: [5.348, -4.03],
  DEFAULT_ZOOM: 13,
  SUGGESTION_MIN_CHARS: 3,
  DEBOUNCE_DELAY: 450,
  GEOLOCATION_OPTIONS: { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
};

const SECTORS_CONFIG = {
  abidjan: { name: "ABIDJAN", img: abidjanIllustration, isRural: false, dbRole: "livreur", domain: "mambo.ci", redirect: "/client-home" },
  alepe: { name: "ALÉPÉ", img: alepeIllustration, isRural: true, dbRole: "livreur-externe", domain: "mambo-alepe.ci", redirect: "/livreur-secteur/alepe" },
  azaguie: { name: "AZAGUIÉ", img: azaguieIllustration, isRural: true, dbRole: "livreur-externe", domain: "mambo-azaguie.ci", redirect: "/livreur-secteur/azaguie" },
  agboville: { name: "AGBOVILLE", img: agbovilleIllustration, isRural: true, dbRole: "livreur-externe", domain: "mambo-agboville.ci", redirect: "/livreur-secteur/agboville" },
  adzope: { name: "ADZOPÉ", img: adzopeIllustration, isRural: true, dbRole: "livreur-externe", domain: "mambo-adzope.ci", redirect: "/livreur-secteur/adzope" },
  dabou: { name: "DABOU", img: dabouIllustration, isRural: true, dbRole: "livreur-externe", domain: "mambo-dabou.ci", redirect: "/livreur-secteur/dabou" },
  jacqueville: { name: "JACQUEVILLE", img: jacquevilleIllustration, isRural: true, dbRole: "livreur-externe", domain: "mambo-jacqueville.ci", redirect: "/livreur-secteur/jacqueville" }
};

function extractDriverCoords(d) {
  if (!d) return null;
  if (d.location?.lat != null && d.location?.lng != null) {
    return [Number(d.location.lat), Number(d.location.lng)];
  }
  if (d.lat != null && d.lng != null) {
    return [Number(d.lat), Number(d.lng)];
  }
  if (d.latitude != null && d.longitude != null) {
    return [Number(d.latitude), Number(d.longitude)];
  }
  return null;
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function generateElegantCurveRoute(p1, p2) {
  const points = [];
  const segments = 32;
  const lat1 = p1[0], lon1 = p1[1];
  const lat2 = p2[0], lon2 = p2[1];
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;
  const offsetLat = (lon2 - lon1) * 0.15;
  const offsetLon = (lat1 - lat2) * 0.15;
  const controlLat = midLat + offsetLat;
  const controlLon = midLon + offsetLon;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const currLat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2;
    const currLon = (1 - t) * (1 - t) * lon1 + 2 * (1 - t) * t * controlLon + t * t * lon2;
    points.push([currLat, currLon]);
  }
  return points;
}

function estimateDriverEtaMin(userPos, driverCoords) {
  if (!userPos || !driverCoords) return null;
  const km = calculateHaversineDistance(userPos[0], userPos[1], driverCoords[0], driverCoords[1]);
  if (!Number.isFinite(km)) return null;
  return Math.max(1, Math.ceil((km / 22) * 60));
}

const getDriverIcon = (driver, etaMin = null) => {
  const vehicleType = (driver?.typeVehicule || driver?.vehicleType || "").toLowerCase().trim();
  const mode = (driver?.modeVtc || "").toLowerCase().trim();
  let imgSrc = courseMapIcon;
  if (vehicleType === "moto") imgSrc = motoMarkerImg;
  else if (vehicleType === "vtc") {
    if (mode.includes("suv")) imgSrc = suvMapIcon;
    else if (mode.includes("eco")) imgSrc = ecoMapIcon;
  } else if (vehicleType === "taxi") {
    imgSrc = mode.includes("confort") ? taxiConfortMapIcon : taxiEcoMapIcon;
  }

  const timeLabel = etaMin != null ? `~${etaMin} min` : "";
  const badgeHtml = timeLabel
    ? `<div style="
          margin-top:2px;
          background:#0f172a;
          color:#fff;
          font-size:9px;
          font-weight:800;
          font-family:system-ui,-apple-system,sans-serif;
          padding:2px 6px;
          border-radius:8px;
          white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
          letter-spacing:0.2px;
          line-height:1.2;
          border:1.5px solid #10b981;
        ">${timeLabel}</div>`
    : "";

  return L.divIcon({
    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        width:56px;
        pointer-events:none;
      ">
        <div class="pulse-driver" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
          <img src="${imgSrc}" class="driver-img-marker" style="width:36px;height:36px;object-fit:contain;" />
        </div>
        ${badgeHtml}
      </div>
    `,
    iconSize: [56, etaMin != null ? 62 : 40],
    iconAnchor: [28, 20],
    className: "custom-leaflet-icon"
  });
};

const clientIcon = L.divIcon({
  html: `
    <div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">
      <div style="width:14px;height:14px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(59,130,246,0.6);position:relative;z-index:2;"></div>
      <div style="position:absolute;width:30px;height:30px;background:rgba(59,130,246,0.25);border-radius:50%;animation:clientPulse 2s ease-out infinite;"></div>
    </div>
    <style>@keyframes clientPulse { 0% { transform:scale(0.5); opacity:1; } 100% { transform:scale(2); opacity:0; } }</style>
  `,
  iconSize: [20, 20], iconAnchor: [10, 10], className: "custom-leaflet-icon"
});

function createDestinationIcon(timeLabel) {
  const badgeHtml = timeLabel
    ? `<div style="
          margin-top:4px;
          background:#0f172a;
          color:#fff;
          font-size:10px;
          font-weight:800;
          font-family:system-ui,-apple-system,sans-serif;
          padding:3px 8px;
          border-radius:10px;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
          letter-spacing:0.2px;
          line-height:1.2;
        ">${timeLabel}</div>`
    : "";

  return L.divIcon({
    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        width:64px;
        pointer-events:none;
      ">
        <div style="
          position:relative;
          width:40px;
          height:48px;
          display:flex;
          flex-direction:column;
          align-items:center;
        ">
          <div style="
            width:38px;
            height:38px;
            border-radius:50%;
            background:linear-gradient(145deg,#ff6a2b 0%,#e11d48 100%);
            border:3px solid #fff;
            box-shadow:0 4px 14px rgba(225,29,72,0.45);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:2;
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 21V3" stroke="white" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M5 4h12l-3 4 3 4H5" fill="white"/>
            </svg>
          </div>
          <div style="
            width:0;height:0;
            border-left:7px solid transparent;
            border-right:7px solid transparent;
            border-top:10px solid #e11d48;
            margin-top:-2px;
            filter:drop-shadow(0 2px 2px rgba(0,0,0,0.15));
          "></div>
        </div>
        ${badgeHtml}
      </div>
    `,
    iconSize: [64, 78],
    iconAnchor: [32, 58],
    className: "custom-leaflet-icon",
  });
}

function MapEffect({ a, b, routePoints, recenterPos }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const h = typeof window !== "undefined" ? window.innerHeight : 700;
    const bottomPad = Math.max(300, Math.round(h * 0.08));
    const sidePad = 40;
    const topPad = 130;

    const timer = setTimeout(() => map.invalidateSize({ animate: false }), 150);

    const fitPoints = [];
    if (Array.isArray(routePoints) && routePoints.length > 1) {
      routePoints.forEach((p) => {
        if (Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) fitPoints.push(p);
      });
    }
    if (a && a.length >= 2) fitPoints.push(a);
    if (b && b.length >= 2) fitPoints.push(b);

    if (fitPoints.length >= 2) {
      const bounds = L.latLngBounds(fitPoints);
      map.fitBounds(bounds, {
        paddingTopLeft: [sidePad, topPad],
        paddingBottomRight: [sidePad, bottomPad],
        maxZoom: 15,
        animate: true,
      });
    } else if (recenterPos) {
      const latOffset = (bottomPad / h) * 0.0008;
      map.setView([recenterPos[0] - latOffset, recenterPos[1]], 16, { animate: true });
    } else if (a) {
      const latOffset = (bottomPad / h) * 0.0008;
      map.setView([a[0] - latOffset, a[1]], 16, { animate: true });
    }

    return () => clearTimeout(timer);
  }, [a, b, routePoints, map, recenterPos]);
  return null;
}

function estimateNearestWaitMin(userPos, drivers) {
  if (!userPos || !drivers?.length) return null;
  let bestKm = Infinity;
  for (const d of drivers) {
    const c = extractDriverCoords(d);
    if (!c) continue;
    const km = calculateHaversineDistance(userPos[0], userPos[1], c[0], c[1]);
    if (km < bestKm) bestKm = km;
  }
  if (!Number.isFinite(bestKm) || bestKm === Infinity) return null;
  const min = Math.max(1, Math.ceil((bestKm / 22) * 60));
  return { min, km: bestKm };
}

const AnimatedPrice = ({ price }) => {
  return <span className="animated-price">{price} FCFA</span>;
};

export default function ClientHome() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userPos, setUserPos] = useState(null);
  const [recenterRequest, setRecenterRequest] = useState(null);
  const [pickup, setPickup] = useState("Localisation...");
  const [dest, setDest] = useState(location.state?.targetDestination || location.state?.targetAddress || location.state?.dropoffAddress || location.state?.destination || "");
  const [destPos, setDestPos] = useState(null);
  const [route, setRoute] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [activeFilter, setActiveFilter] = useState("moto");
  const [selectedVehicle, setSelectedVehicle] = useState("MotoNoStress");
  const [onlineDrivers, setOnlineDrivers] = useState([]);

  const [isRuralMode, setIsRuralMode] = useState(false);
  const [currentSectorKey, setCurrentSectorKey] = useState("abidjan");
  const [showSectorSelector, setShowSectorSelector] = useState(false);
  const [showSearchUI, setShowSearchUI] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const [ruralProposedPrices, setRuralProposedPrices] = useState({});
  const [urbanNegoPrice, setUrbanNegoPrice] = useState("");

  const state = useMemo(() => location.state || {}, [location.state]);
  const isTiersFromVendeur = !!state.isTiersOrder || !!state.fromVendeur || !!state.vendeurId;

  const [isForThirdParty, setIsForThirdParty] = useState(isTiersFromVendeur);
  const [thirdPartyNameInput, setThirdPartyNameInput] = useState(state.prefillName || state.clientName || state.nomClient || state.nom || "");
  const [thirdPartyPhoneInput, setThirdPartyPhoneInput] = useState(state.prefillPhone || state.telephone || state.clientPhone || state.telephoneClient || "");

  const [internalAlert, setInternalAlert] = useState(null);

  const configVehicules = useMemo(() => ({
    MotoNoStress: { base: 1000, km: 0, img: motoNoStressImg, type: "moto", mode: "NoStress/24h", isRural: false, minPrice: 1000 },
    Moto: { base: 500, km: 170, img: motoImg, type: "moto", mode: "Standard/3h", isRural: false },
    MotoChap: { base: 500, km: 210, img: motoChapImg, type: "moto", mode: "ChapChap", isRural: false },
    VtcEco: { base: 2500, km: 500, img: carEcoImg, type: "vtc", mode: "Cargo mini", isRural: false },
    VtcConfort: { base: 3500, km: 500, img: carConfortImg, type: "vtc", mode: "Cargo", isRural: false },
    VtcSuv: { base: 4500, km: 600, img: carSuvImg, type: "vtc", mode: "Camion", isRural: false },
    
    TaxiEco: { base: 100, km: 0, img: taxiEcoImg, type: "taxi", mode: "Piéton", isRural: false, fixedRule: true, maxDist: 2 },
    TaxiConfort: { base: 100, km: 0, img: taxiConfortImg, type: "taxi", mode: "Bicyclette", isRural: false, fixedRule: true, maxDist: 2 },

    TaxiArrangement: { base: 0, km: 0, img: taxiArrangementImg, type: "taxi", mode: "Négociable", isArrangement: true, minPrice: 2000, isRural: false },
    
    moto: { base: 300, km: 200, img: imgMoto, type: "moto", mode: "Moto", isRural: true },
    saloni: { base: 500, km: 150, img: imgSaloni, type: "vtc", mode: "Saloni", isRural: true },
    antara: { base: 1000, km: 200, img: imgAntara, type: "vtc", mode: "Antara", isRural: true },
    vtc: { base: 500, km: 250, img: imgVtc, type: "vtc", mode: "VTC Rural", isRural: true },
    
    RuralPieton: { base: 100, km: 0, img: taxiEcoImg, type: "taxi", mode: "Piéton", isRural: true, fixedRule: true, maxDist: 2 },
    RuralBicyclette: { base: 100, km: 0, img: taxiConfortImg, type: "taxi", mode: "Bicyclette", isRural: true, fixedRule: true, maxDist: 2 }
  }), []);

  const currentSectorData = useMemo(() => {
    return SECTORS_CONFIG[currentSectorKey] || { name: currentSectorKey.toUpperCase(), img: alepeIllustration, isRural: true, dbRole: "livreur-externe" };
  }, [currentSectorKey]);

  const getPrice = useCallback((vId) => {
    const v = configVehicules[vId];
    if (!v) return 0;

    if (v.fixedRule) {
      if (distanceKm <= 1.5) {
        return 100;
      } else {
        const extraKm = distanceKm - 1.5;
        const halfKmUnits = Math.ceil(extraKm / 0.5);
        return 100 + (halfKmUnits * 50);
      }
    }

    if (v.isArrangement) {
      if (urbanNegoPrice && parseInt(urbanNegoPrice, 10) > 0) return parseInt(urbanNegoPrice, 10);
      const ecoVehicleId = vId.includes("Arrangement") ? "TaxiEco" : vId.replace("Nego", "Eco");
      const ecoVehicle = configVehicules[ecoVehicleId];
      if (ecoVehicle) {
        let ecoPrice = ecoVehicle.base;
        if (distanceKm > 0 && distanceKm < 4) {
          ecoPrice += distanceKm * 500;
        } else {
          ecoPrice += distanceKm * (ecoVehicle.km || 0);
        }
        return Math.ceil(ecoPrice / 100) * 100;
      }
      return v.minPrice || 2000;
    }

    let finalPrice = v.base;
    if (distanceKm > 0 && distanceKm < 5) {
      let smoothKmPrice = v.km || 0;
      if (vId === "VtcEco") smoothKmPrice = 200;
      else if (vId === "VtcConfort") smoothKmPrice = 240;
      else if (vId === "VtcSuv") smoothKmPrice = 300;
      else if (vId === "Moto" || vId === "MotoChap" || vId === "moto") smoothKmPrice = 150;
      finalPrice += distanceKm * smoothKmPrice;
    } else {
      finalPrice += distanceKm * (v.km || 0);
    }
    return Math.ceil(finalPrice / 100) * 100;
  }, [configVehicules, distanceKm, urbanNegoPrice]);

  useEffect(() => {
    if (distanceKm > 2) {
      if (selectedVehicle === "TaxiEco" || selectedVehicle === "TaxiConfort" || selectedVehicle === "RuralPieton" || selectedVehicle === "RuralBicyclette") {
        setSelectedVehicle(isRuralMode ? "moto" : "MotoNoStress");
        toast.info("Distance supérieure à 2 km : basculement automatique sur la Moto.", { autoClose: 3000 });
      }
    } else if (distanceKm >= 5 && !isRuralMode) {
      if (selectedVehicle === "TaxiEco" || selectedVehicle === "TaxiConfort") {
        setSelectedVehicle("MotoNoStress");
        toast.info("Distance supérieure ou égale à 5 km : basculement automatique sur la Moto.", { autoClose: 3000 });
      }
    }
  }, [distanceKm, selectedVehicle, isRuralMode]);

  useEffect(() => {
    const baseCalculatedPrice = getPrice(selectedVehicle);
    if (isRuralMode) {
      setRuralProposedPrices(prev => ({
        ...prev,
        [selectedVehicle]: prev[selectedVehicle] !== undefined ? prev[selectedVehicle] : baseCalculatedPrice
      }));
    } else if (configVehicules[selectedVehicle]?.isArrangement) {
      if (!urbanNegoPrice) {
        setUrbanNegoPrice(baseCalculatedPrice.toString());
      }
    }
  }, [selectedVehicle, distanceKm, isRuralMode, getPrice, configVehicules, urbanNegoPrice]);

  useEffect(() => {
    if (isTiersFromVendeur) {
      setSelectedVehicle("MotoNoStress");
      setActiveFilter("moto");
      toast.info("🚀 Mode Tiers activé - Moto NoStress (1000 F) sélectionnée par défaut", { autoClose: 4000 });

      const prefilledDest = state?.targetDestination || state?.destination || state?.dropoffAddress;
      if (prefilledDest && !destPos) {
        (async () => {
          try {
            const suffix = " Côte d'Ivoire";
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(prefilledDest + suffix)}`
            );
            const data = await res.json();
            if (data?.[0]) {
              setDestPos([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
              setDest(prefilledDest);
            }
          } catch (e) {
            console.error("Géocodage destination tiers échoué", e);
          }
        })();
      }
    }
  }, [isTiersFromVendeur, state, destPos]);

  useEffect(() => {
    let unsubProfile = null;
    let isMounted = true;

    const unsubAuth = auth.onAuthStateChanged((u) => {
      if (!isMounted) return;
      setCurrentUser(u);

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (u) {
        unsubProfile = onSnapshot(
          doc(db, "users", u.uid),
          (s) => {
            if (!isMounted) return;
            if (s.exists()) setUserData(s.data());
          },
          (err) => console.warn("Profil snapshot:", err?.message || err)
        );
      } else {
        setUserData(null);
      }
    });

    return () => {
      isMounted = false;
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const q = query(
      collection(db, "users"),
      where("isOnline", "==", true),
      where("role", "in", ["livreur", "livreur-externe"])
    );

    const unsubDrivers = onSnapshot(
      q,
      (s) => {
        if (!isMounted) return;
        setOnlineDrivers(
          s.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((d) => extractDriverCoords(d) !== null)
        );
      },
      (err) => console.warn("Drivers snapshot:", err?.message || err)
    );

    return () => {
      isMounted = false;
      unsubDrivers();
    };
  }, []);

  const sanitizeKey = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const buildPickupLabel = (addr, displayName) => {
    if (!addr && !displayName) return null;
    const a = addr || {};
    const road = a.road || a.pedestrian || a.path || a.residential || a.neighbourhood;
    const area = a.suburb || a.quarter || a.city_district || a.village || a.town;
    const city = a.city || a.municipality || a.county;
    const parts = [road, area, city].filter(Boolean);
    if (parts.length > 0) {
      const unique = [];
      for (const p of parts) {
        if (!unique.some((u) => u.toLowerCase() === p.toLowerCase())) unique.push(p);
      }
      return unique.slice(0, 2).join(", ");
    }
    if (displayName) {
      return displayName.split(",").slice(0, 2).map((s) => s.trim()).join(", ");
    }
    return null;
  };

  useEffect(() => {
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const coords = [p.coords.latitude, p.coords.longitude];
        if (cancelled) return;
        setUserPos(coords);

        let label = null;
        let cityKey = "";

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords[0]}&lon=${coords[1]}&zoom=18&addressdetails=1&accept-language=fr`,
            { headers: { "Accept-Language": "fr" } }
          );
          if (res.ok) {
            const d = await res.json();
            label = buildPickupLabel(d.address, d.display_name);
            cityKey = sanitizeKey(
              d.address?.town || d.address?.village || d.address?.city || d.address?.suburb || ""
            );
          }
        } catch (e) {
          console.warn("Nominatim reverse:", e);
        }

        if (!label) {
          try {
            const pr = await fetch(
              `https://photon.komoot.io/reverse?lat=${coords[0]}&lon=${coords[1]}&lang=fr`
            );
            if (pr.ok) {
              const pd = await pr.json();
              const feat = pd?.features?.[0];
              const props = feat?.properties || {};
              const parts = [props.name, props.street, props.district, props.city]
                .filter(Boolean);
              const unique = [];
              for (const x of parts) {
                if (!unique.some((u) => u.toLowerCase() === x.toLowerCase())) unique.push(x);
              }
              label = unique.slice(0, 2).join(", ") || null;
              if (!cityKey) cityKey = sanitizeKey(props.city || props.district || "");
            }
          } catch (e) {
            console.warn("Photon reverse:", e);
          }
        }

        if (cancelled) return;

        setPickup(label || `GPS ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`);

        if (cityKey.includes("memni") || cityKey.includes("alepe")) cityKey = "alepe";
        else if (cityKey.includes("azaguie")) cityKey = "azaguie";
        else if (cityKey.includes("abidjan") || cityKey.includes("cocody") || cityKey.includes("yopougon") || cityKey.includes("abobo") || cityKey.includes("marcory") || cityKey.includes("plateau")) {
          cityKey = "abidjan";
        }

        if (cityKey && SECTORS_CONFIG[cityKey]) {
          setCurrentSectorKey(cityKey);
          setIsRuralMode(SECTORS_CONFIG[cityKey].isRural);
        }
      },
      () => {
        if (!cancelled) setInternalAlert({ type: "error", message: "GPS requis" });
      },
      CONFIG.GEOLOCATION_OPTIONS
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userPos && destPos) {
      fetch(`https://router.project-osrm.org/route/v1/driving/${userPos[1]},${userPos[0]};${destPos[1]},${destPos[0]}?overview=full&geometries=geojson`)
        .then(r => r.json())
        .then(d => {
          if (d.routes?.[0]) {
            setDistanceKm(d.routes[0].distance / 1000);
            setRoute(d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
          }
        })
        .catch(() => {
          const geoDistance = calculateHaversineDistance(userPos[0], userPos[1], destPos[0], destPos[1]);
          setDistanceKm(geoDistance * 1.25);
          setRoute(generateElegantCurveRoute(userPos, destPos));
        });
    }
  }, [userPos, destPos]);

  const formatSuggestionLabel = (item) => {
    const main = (item.name || item.display_name?.split(",")[0] || "Lieu").trim();
    const parts = (item.display_name || "").split(",").map((s) => s.trim()).filter(Boolean);
    const skip = /côte d.?ivoire|ivory coast|^\d{4,}$/i;
    const secondaryFromParts = parts
      .slice(1)
      .filter((p) => !skip.test(p) && p.toLowerCase() !== main.toLowerCase())
      .slice(0, 2)
      .join(" · ");
    const secondaryPhoton = [item.street, item.district, item.city, item.suburb]
      .filter(Boolean)
      .filter((p) => p.toLowerCase() !== main.toLowerCase())
      .slice(0, 2)
      .join(" · ");
    return { main, secondary: secondaryPhoton || secondaryFromParts };
  };

  const fetchSuggestions = async (input) => {
    if (!input || input.length < CONFIG.SUGGESTION_MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    try {
      const sectorName = currentSectorData?.name || "Abidjan";
      const biasLat = userPos?.[0] ?? CONFIG.DEFAULT_CENTER[0];
      const biasLon = userPos?.[1] ?? CONFIG.DEFAULT_CENTER[1];
      const qRaw = input.trim();
      const qEnriched = `${qRaw} ${sectorName}`;

      const photonParams = new URLSearchParams({
        q: qRaw,
        lat: String(biasLat),
        lon: String(biasLon),
        limit: "12",
        lang: "fr",
      });
      photonParams.set("bbox", "-8.6,4.2,-2.5,10.7");

      const photonRes = await fetch(`https://photon.komoot.io/api/?${photonParams}`);
      const photonData = await photonRes.json();
      const fromPhoton = (photonData?.features || []).map((f) => {
        const p = f.properties || {};
        const [lon, lat] = f.geometry?.coordinates || [];
        const name = p.name || p.street || "Lieu";
        const display = [name, p.street, p.district, p.city, p.country]
          .filter(Boolean)
          .join(", ");
        return {
          lat: String(lat),
          lon: String(lon),
          name,
          display_name: display,
          street: p.street,
          district: p.district || p.suburb,
          city: p.city || p.county,
          suburb: p.suburb,
          osm_value: p.osm_value,
          class: p.osm_key,
          type: p.osm_value,
        };
      });

      let fromNominatim = [];
      try {
        const nomParams = new URLSearchParams({
          format: "json",
          q: qEnriched,
          countrycodes: "ci",
          limit: "10",
          addressdetails: "1",
          "accept-language": "fr",
        });
        nomParams.set("viewbox", "-4.20,5.50,-3.80,5.20");
        nomParams.set("bounded", "0");

        const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?${nomParams}`, {
          headers: { "Accept-Language": "fr" },
        });
        fromNominatim = await nomRes.json();
      } catch (e) {
        console.warn("Nominatim fallback:", e);
      }

      const seen = new Set();
      const cleaned = [];
      for (const item of [...fromPhoton, ...(fromNominatim || [])]) {
        if (!item.lat || !item.lon) continue;
        const label = formatSuggestionLabel(item);
        if (!label.main || label.main.length < 2) continue;
        const key = `${label.main}|${label.secondary}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push({ ...item, _label: label });
        if (cleaned.length >= 12) break;
      }

      setSuggestions(cleaned);
    } catch (e) {
      console.error("Recherche lieu:", e);
      setSuggestions([]);
    }
  };

  const handleSelectSuggestion = (item) => {
    const label = item._label || formatSuggestionLabel(item);
    setDest(label.main);
    const newDestPos = [parseFloat(item.lat), parseFloat(item.lon)];
    setDestPos(newDestPos);
    setRecenterRequest(null);
    setSuggestions([]);
    setShowSearchUI(false);
  };

  const selectRuralSector = (key) => {
    setCurrentSectorKey(key);
    setIsRuralMode(SECTORS_CONFIG[key].isRural);
    setShowSectorSelector(false);
    if (SECTORS_CONFIG[key].isRural) {
      const ruralVehicles = Object.keys(configVehicules).filter(k => configVehicules[k].isRural);
      if (ruralVehicles.length > 0) setSelectedVehicle(ruralVehicles[0]);
    } else {
      setSelectedVehicle("MotoNoStress");
      setActiveFilter("moto");
    }
  };

  const getDynamicPlaceholder = () => {
    return "Où livrer ?";
  };

  const handleCommand = () => {
    if (!destPos) return setInternalAlert({ type: 'info', message: 'Indiquez une destination' });

    const v = configVehicules[selectedVehicle];

    if (isForThirdParty && (!thirdPartyNameInput || !thirdPartyPhoneInput)) {
      return setInternalAlert({ type: 'warning', message: 'Veuillez remplir les infos du tiers' });
    }

    const calculatedPrice = getPrice(selectedVehicle);
    const proposedPrice = isRuralMode
      ? (ruralProposedPrices[selectedVehicle] !== undefined ? ruralProposedPrices[selectedVehicle] : calculatedPrice)
      : (v.isArrangement && urbanNegoPrice ? parseInt(urbanNegoPrice, 10) : calculatedPrice);

    const pickupAddress =
      (isTiersFromVendeur && (state.departAdresse || state.pickupAddress))
        ? (state.departAdresse || state.pickupAddress)
        : pickup;

    // --- CORRECTION DE LA REDIRECTION ---
    // Si c'est un vendeur qui passe la commande tiers (isTiersFromVendeur == true) OU une commande classique,
    // le vendeur/utilisateur est bien redirigé vers la confirmation pour lancer/suivre la course.
    
    navigate("/confirmation", {
      state: {
        orderId: state.orderId || null,
        vendeurId: state.vendeurId || null,
        assignedCoursierId: state.vendeurId || null,
        pickupAddress,
        departAdresse: state.departAdresse || pickupAddress,
        destination: dest,
        dropoffAddress: dest,
        targetDestination: dest,
        pickupLocation: userPos ? { lat: userPos[0], lng: userPos[1] } : null,
        dropoffLocation: destPos ? { lat: destPos[0], lng: destPos[1] } : null,
        distanceKm,
        vehicle: selectedVehicle,
        mode: v.mode,
        price: calculatedPrice,
        proposedPrice,
        estimatedPrice: calculatedPrice,
        isCompteur: false,
        baseFare: null,
        isForThirdParty,
        clientName: thirdPartyNameInput,
        clientPhone: thirdPartyPhoneInput,
        thirdPartyName: thirdPartyNameInput,
        thirdPartyPhone: thirdPartyPhoneInput,
        prefillName: thirdPartyNameInput,
        prefillPhone: thirdPartyPhoneInput,
        isNegoActive: isRuralMode
          ? (ruralProposedPrices[selectedVehicle] !== undefined && ruralProposedPrices[selectedVehicle] !== calculatedPrice)
          : !!v.isArrangement,
        wantArret: false,
        isTiersOrder: isForThirdParty,
        fromVendeur: isTiersFromVendeur,
      }
    });
  };
  // Fonction pour hacher/masquer le nom et le téléphone
const maskData = (value, type = "text") => {
  if (!value) return "";
  if (type === "phone") {
    // Affiche seulement les 2 premiers et 2 derniers chiffres (ex: 07****34)
    const cleaned = value.toString().trim();
    if (cleaned.length <= 4) return "****";
    return `${cleaned.slice(0, 2)}****${cleaned.slice(-2)}`;
  } else {
    // Affiche la première lettre et masque le reste (ex: K***)
    const parts = value.toString().trim().split(" ");
    return parts
      .map((part) => (part.length > 1 ? `${part[0]}***` : part))
      .join(" ");
  }
};

  // --- ÉCOUTE DES MESSAGES IN-APP (RÉSOLUTION EXPERTE DU PROBLÈME) ---
  useEffect(() => {
    if (!currentUser?.uid) return;
    let isMounted = true;

    const unreadQuery = query(
      collection(db, "inAppMessages"),
      where("receiverId", "==", currentUser.uid),
      where("read", "==", false)
    );

    const unsubscribeInApp = onSnapshot(
      unreadQuery,
      (snapshot) => {
        if (!isMounted) return;

        // Met à jour le nombre de messages non lus sur l'icône de navigation
        setUnreadCount(snapshot.size);

        // Analyse les modifications et notifie l'utilisateur via toast
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const msgData = change.doc.data();

            if (!msgData.notified) {
              const messageText =
                msgData.text ||
                msgData.message ||
                msgData.body ||
                "Nouveau message reçu";

              toast.info(`📩 ${messageText}`, {
                position: "top-right",
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
              });

              // Marquer comme notifié afin d'éviter la réémission du toast lors des re-renders
              updateDoc(doc(db, "inAppMessages", change.doc.id), {
                notified: true,
              }).catch(() => {});
            }
          }
        });
      },
      (err) => {
        if (err?.code === "permission-denied") return;
        console.warn("Erreur d'écoute de la collection inAppMessages:", err?.code || err?.message || err);
      }
    );

    return () => {
      isMounted = false;
      unsubscribeInApp();
    };
  }, [currentUser?.uid]);

  const fcmUserKey = currentUser?.uid || "";

  useEffect(() => {
    if (!fcmUserKey) return;

    const requestPushPermission = async () => {
      try {
        if (typeof window === "undefined") return;
        if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
        if (!window.isSecureContext) return;

        const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
        const supported = await isSupported().catch(() => false);
        if (!supported) return;

        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted") return;

        const messaging = getMessaging();
        const currentToken = await getToken(messaging, {
          vapidKey:
            "BDE5b26fkUCHbCy7IzjX30eDjJpfQev7GWOrKc6yJxUV48L0XInKEd2urQwzuqUgjQ5UAfP9EcvZ3gtXYI52oII",
        });

        if (currentToken) {
          await updateDoc(doc(db, "users", fcmUserKey), {
            fcmToken: currentToken,
            notificationsEnabled: true,
            lastTokenUpdate: serverTimestamp(),
          }).catch(() => {});
        }
      } catch (err) {
        if (err?.name === "AbortError" || /push service/i.test(String(err?.message || ""))) {
          return;
        }
        console.warn("FCM client (non bloquant):", err?.code || err?.message || err);
      }
    };

    requestPushPermission();
  }, [fcmUserKey]);

  const dynamicUI = useMemo(() => {
    const list = Object.keys(configVehicules)
      .filter(k => {
        if (isRuralMode) {
          return configVehicules[k].isRural;
        } else {
          return !configVehicules[k].isRural && configVehicules[k].type === activeFilter;
        }
      })
      .map(k => {
        const item = configVehicules[k];
        let isDisabled = false;
        if (distanceKm > 2 && (k === "TaxiEco" || k === "TaxiConfort" || k === "RuralPieton" || k === "RuralBicyclette")) {
          isDisabled = true;
        } else if (!isRuralMode) {
          if (k === "TaxiEco" && distanceKm > 2) isDisabled = true;
          if (k === "TaxiConfort" && distanceKm > 4) isDisabled = true;
        }
        return { key: k, ...item, isDisabled };
      });
    return list;
  }, [configVehicules, isRuralMode, activeFilter, distanceKm]);

  const nearestWait = useMemo(
    () => estimateNearestWaitMin(userPos, onlineDrivers),
    [userPos, onlineDrivers]
  );

  return (
    <div className="client-home">
      {internalAlert && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-xs font-black animate-in fade-in slide-in-from-top-4 duration-200 ${
          internalAlert.type === 'error' ? 'bg-red-600 text-white' :
          internalAlert.type === 'warning' ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'
        }`}>
          <span>{internalAlert.message}</span>
          <button onClick={() => setInternalAlert(null)} className="p-1 rounded-lg hover:bg-white/20"><X size={14}/></button>
        </div>
      )}

      <div className="current-location-badge">
        <div className="client-dot-small"></div>
        <span>{pickup}</span>
      </div>

      <div className="home-header">
        <button className="relative menu-btn" onClick={() => setIsSideNavOpen(true)}>
          <Menu size={24} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
        {distanceKm > 0 && <div className="distance-badge-top"><Route size={14} /><span>{distanceKm.toFixed(1)} km</span></div>}
      </div>

      <SideNav 
        isOpen={isSideNavOpen} 
        onClose={() => setIsSideNavOpen(false)} 
        currentUser={currentUser} 
        userData={userData} 
        unreadCount={unreadCount} 
      />

      <div className="map-fullscreen">
        <MapContainer center={CONFIG.DEFAULT_CENTER} zoom={CONFIG.DEFAULT_ZOOM} zoomControl={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {onlineDrivers.map(d => {
            const coords = extractDriverCoords(d);
            if (!coords) return null;
            const etaMin = userPos ? estimateDriverEtaMin(userPos, coords) : null;
            return (
              <Marker
                key={`drv-${d.id}-${etaMin ?? "x"}`}
                position={coords}
                icon={getDriverIcon(d, etaMin)}
                zIndexOffset={500}
              />
            );
          })}
          {userPos && (
            <Marker position={userPos} icon={clientIcon} zIndexOffset={1000}>
              <Popup autoPan={false} closeButton={false} className="pickup-popup">
                <div className="popup-content"><div className="dot"></div><span>{pickup}</span></div>
              </Popup>
            </Marker>
          )}
          {destPos && (() => {
            const etaLabel =
              distanceKm > 0
                ? `~${Math.max(1, Math.ceil((distanceKm / 25) * 60))} min`
                : nearestWait
                  ? `~${nearestWait.min} min`
                  : "Arrivée";
            return (
              <Marker
                key={`dest-${destPos[0]}-${destPos[1]}-${etaLabel}`}
                position={destPos}
                icon={createDestinationIcon(etaLabel)}
                zIndexOffset={1200}
              />
            );
          })()}
          {route.length > 0 && <Polyline positions={route} pathOptions={{ color: "#f35416", weight: 5 }} />}
          <MapEffect a={userPos} b={destPos} routePoints={route} recenterPos={recenterRequest} />
        </MapContainer>

        <button onClick={() => userPos && setRecenterRequest([...userPos])} className="recenter-map-btn"><Target size={24} color="#f35416" /></button>
      </div>

      <div className="bottom-panel-wrapper">
        <div className="bottom-panel-card">

          <div className="sector-pill-container">
            <button className="sector-pill-btn" onClick={() => setShowSectorSelector(!showSectorSelector)}>
              <MapPin size={14} color="#f35416" />
              <span>Secteur: <strong>{currentSectorData.name}</strong></span>
            </button>
          </div>

          {showSectorSelector && (
            <div className="sector-dropdown-menu">
              {Object.keys(SECTORS_CONFIG).map(secKey => (
                <div key={secKey} className={`sector-item ${currentSectorKey === secKey ? 'active' : ''}`} onClick={() => selectRuralSector(secKey)}>
                  <img src={SECTORS_CONFIG[secKey].img} alt={SECTORS_CONFIG[secKey].name} />
                  <span>{SECTORS_CONFIG[secKey].name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="destination-search-box" onClick={() => setShowSearchUI(true)}>
            <Search size={18} color="#f35416" />
            <span className={dest ? "dest-text-active" : "dest-placeholder"}>
              {dest || getDynamicPlaceholder()}
            </span>
          </div>

          {showSearchUI && (
            <div className="search-overlay-modal">
              <div className="search-header">
                <input
                  type="text"
                  placeholder={getDynamicPlaceholder()}
                  value={dest}
                  onChange={(e) => {
                    setDest(e.target.value);
                    fetchSuggestions(e.target.value);
                  }}
                  autoFocus
                />
                <button onClick={() => setShowSearchUI(false)}><X size={20} /></button>
              </div>
              <div className="suggestions-list">
                {suggestions.length === 0 ? (
                  <p className="suggestions-empty">
                    {dest && dest.length >= CONFIG.SUGGESTION_MIN_CHARS
                      ? `Aucun résultat pour « ${dest} ». Essayez un quartier (ex: Plateau, Angré, Marcory)…`
                      : "Tapez un lieu (ex: Collège, Plateau, Marcory, Cocody)…"}
                  </p>
                ) : (
                  suggestions.map((item, index) => {
                    const label = item._label || { main: item.display_name?.split(",")[0], secondary: "" };
                    return (
                      <div key={index} className="suggestion-item" onClick={() => handleSelectSuggestion(item)}>
                        <div className="suggestion-pin"><MapPin size={16} color="#7a0edf" /></div>
                        <div className="suggestion-text">
                          <span className="suggestion-main">{label.main}</span>
                          {label.secondary ? <span className="suggestion-sub">{label.secondary}</span> : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {!isRuralMode && (
            <div className="category-filter-tabs">
              <button className={`tab-btn ${activeFilter === 'moto' ? 'active' : ''}`} onClick={() => setActiveFilter('moto')}>
                <img src={livraisonMotoIcon} alt="Moto" className="tab-icon" /> Moto
              </button>
              <button className={`tab-btn ${activeFilter === 'vtc' ? 'active' : ''}`} onClick={() => setActiveFilter('vtc')}>
                <img src={courseVtcIcon} alt="Cargo" className="tab-icon" /> Cargo
              </button>
              <button className={`tab-btn ${activeFilter === 'taxi' ? 'active' : ''}`} onClick={() => setActiveFilter('taxi')}>
                <img src={taxiEcoImg} alt="Hustler" className="tab-icon" /> Hustling
              </button>
            </div>
          )}

          <div className="vehicles-horizontal-scroll">
            {dynamicUI.map((item) => {
              const isSelected = selectedVehicle === item.key;
              const calculatedPrice = getPrice(item.key);

              return (
                <div
                  key={item.key}
                  className={`vehicle-card ${isSelected ? 'selected' : ''} ${item.isDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                  onClick={() => {
                    if (!item.isDisabled) setSelectedVehicle(item.key);
                  }}
                  style={item.isDisabled ? { filter: "grayscale(100%)", cursor: "not-allowed" } : {}}
                >
                  <img src={item.img} alt={item.mode} className="vehicle-img" />
                  <div className="vehicle-info">
                    <span className="vehicle-title">{item.mode}</span>
                    <span className="vehicle-price">
                      {item.fixedRule ? (
                        <span className="animated-price" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span>{calculatedPrice} F</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#10b981" }}>Max 2km</span>
                        </span>
                      ) : (
                        <AnimatedPrice price={calculatedPrice} />
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="third-party-toggle">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={isForThirdParty}
                onChange={(e) => setIsForThirdParty(e.target.checked)}
              />
              <span>Commander pour quelqu'un d'autre ?</span>
            </label>
          </div>

          {isForThirdParty && (
            <div className="grid grid-cols-2 gap-2 mt-2 third-party-inputs">
              <div className="input-with-icon">
                <User size={14} />
                <input
                  type="text"
                  placeholder="Nom du passager"
                  value={
                    isTiersFromVendeur
                      ? maskData(thirdPartyNameInput, "text")
                      : thirdPartyNameInput
                  }
                  onChange={(e) => {
                    if (!isTiersFromVendeur) setThirdPartyNameInput(e.target.value);
                  }}
                  readOnly={isTiersFromVendeur}
                  style={isTiersFromVendeur ? { backgroundColor: "#f1f5f9", cursor: "not-allowed" } : {}}
                />
              </div>
              <div className="input-with-icon">
                <Phone size={14} />
                <input
                  type="tel"
                  placeholder="Téléphone"
                  value={
                    isTiersFromVendeur
                      ? maskData(thirdPartyPhoneInput, "phone")
                      : thirdPartyPhoneInput
                  }
                  onChange={(e) => {
                    if (!isTiersFromVendeur) setThirdPartyPhoneInput(e.target.value);
                  }}
                  readOnly={isTiersFromVendeur}
                  style={isTiersFromVendeur ? { backgroundColor: "#f1f5f9", cursor: "not-allowed" } : {}}
                />
              </div>
            </div>
          )}

          <div className="mt-3 action-button-container">
            {(isRuralMode || configVehicules[selectedVehicle]?.isArrangement) && (
              <button
                className="nego-trigger-btn"
                onClick={() => {
                  if (!destPos) {
                    setInternalAlert({ type: "info", message: "Indiquez d'abord une destination" });
                    return;
                  }
                  const v = configVehicules[selectedVehicle];
                  let ecoPrice = getPrice(selectedVehicle);
                  if (v?.isArrangement) {
                    const ecoId = selectedVehicle.replace("Nego", "Eco").replace("Arrangement", "Eco");
                    const ecoV = configVehicules[ecoId] || configVehicules.TaxiEco || configVehicules.VtcEco;
                    if (ecoV) {
                      let p = ecoV.base || 500;
                      if (distanceKm > 0 && distanceKm < 4) p += distanceKm * 300;
                      else p += distanceKm * (ecoV.km || 0);
                      ecoPrice = Math.ceil(p / 100) * 100;
                    } else {
                      ecoPrice = v.minPrice || 1000;
                    }
                  }
                  navigate("/negociation", {
                    state: {
                      orderId: state.orderId || null,
                      vendeurId: state.vendeurId || null,
                      ecoPrice,
                      price: ecoPrice,
                      vehicle: selectedVehicle,
                      mode: v?.mode || "Négociable",
                      destination: dest,
                      dropoffAddress: dest,
                      targetDestination: dest,
                      pickupAddress: pickup,
                      pickupLocation: userPos ? { lat: userPos[0], lng: userPos[1] } : null,
                      dropoffLocation: destPos ? { lat: destPos[0], lng: destPos[1] } : null,
                      distanceKm,
                      isForThirdParty,
                      clientName: thirdPartyNameInput,
                      clientPhone: thirdPartyPhoneInput,
                      thirdPartyName: thirdPartyNameInput,
                      thirdPartyPhone: thirdPartyPhoneInput,
                      isTiersOrder: isForThirdParty,
                      fromVendeur: isTiersFromVendeur,
                      isRuralMode,
                      currentSectorKey,
                    },
                  });
                }}
              >
                <Banknote size={18} /> Proposer un tarif
              </button>
            )}

            <button className="submit-order-btn" onClick={handleCommand}>
              {configVehicules[selectedVehicle]?.fixedRule
                ? `Commander · ${getPrice(selectedVehicle)} F (Piéton/Bicyclette)`
                : `Commander (${getPrice(selectedVehicle)} FCFA)`}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}