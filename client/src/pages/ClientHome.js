import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom"; 
import { collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, Popup } from "react-leaflet";
import { 
  X, Navigation, MapPin, Menu, Target, Route, Banknote, Zap, User, Phone, Map, Plus, Minus
} from "lucide-react"; 
import { auth, db } from "../firebase"; 
import { serverTimestamp } from 'firebase/firestore'; // Ajoute serverTimestamp ici si manquant
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
import taxiCompteurIcon from "../assets/car-taxiCompteur.png";
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
    const currLon = (1 - t) * (1 - t) * lon1 + 2 * (1 - t) * t * controlLon + t * t * lat2;
    points.push([currLat, currLon]);
  }
  return points;
}

const getDriverIcon = (driver) => {
  const vehicleType = (driver?.typeVehicule || "").toLowerCase().trim();
  const mode = (driver?.modeVtc || "").toLowerCase().trim();
  let imgSrc = courseMapIcon;
  if (vehicleType === "moto") imgSrc = motoMarkerImg;
  else if (vehicleType === "vtc") {
    if (mode.includes("suv")) imgSrc = suvMapIcon;
    else if (mode.includes("eco")) imgSrc = ecoMapIcon;
  } else if (vehicleType === "taxi") {
    imgSrc = mode.includes("confort") ? taxiConfortMapIcon : taxiEcoMapIcon;
  }
  const size = 40; 
  return L.divIcon({
    html: `<div class="pulse-driver"><img src="${imgSrc}" class="driver-img-marker" /></div>`,
    iconSize: [size, size], 
    iconAnchor: [size / 2, size / 2],
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

const destinationIcon = L.divIcon({
  html: `<div class="dest-marker-premium"><svg viewBox="0 0 32 40"><path d="M16 0C9.4 0 4 5.4 4 12c0 8 12 28 12 28s12-20 12-28c0-6.6-5.4-12-12-12z" fill="#f35416"/><circle cx="16" cy="12" r="7" fill="white"/></svg></div>`,
  iconSize: [40, 48], iconAnchor: [20, 48], className: "custom-leaflet-icon"
});

function MapEffect({ a, b, recenterPos }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    if (recenterPos) map.setView(recenterPos, 16, { animate: true });
    else if (a && b) map.fitBounds(L.latLngBounds([a, b]), { padding: [100, 100], animate: true });
    else if (a) map.setView(a, 16, { animate: true });
  }, [a, b, map, recenterPos]);
  return null;
}

const AnimatedPrice = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);
  useEffect(() => {
    let startTime = null;
    const startValue = prevValueRef.current;
    const duration = 800;
    const animate = (now) => {
      if (!startTime) startTime = now;
      const progress = Math.min((now - startTime) / duration, 1);
      const current = Math.floor(startValue + (value - startValue) * progress);
      setDisplayValue(isNaN(current) ? 0 : current);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    prevValueRef.current = value;
  }, [value]);
  return <span>{displayValue.toLocaleString()} F</span>;
};

export default function ClientHome() {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
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
  const [suggestions, setSuggestions] = useState([]);
  const [showSearchUI, setShowSearchUI] = useState(false);
  
  const [isRuralMode, setIsRuralMode] = useState(false);
  const [currentSectorKey, setCurrentSectorKey] = useState("abidjan");
  const [showSectorSelector, setShowSectorSelector] = useState(false);
  const [showNegotiationModal, setShowNegotiationModal] = useState(false);
  const [ruralProposedPrices, setRuralProposedPrices] = useState({});
  const [urbanNegoPrice, setUrbanNegoPrice] = useState("");

  const state = location.state || {};
  const isTiersFromVendeur = !!state.isTiersOrder || !!state.fromVendeur || !!state.vendeurId;

  const [isForThirdParty, setIsForThirdParty] = useState(isTiersFromVendeur);
  const [thirdPartyName, setThirdPartyName] = useState(
    state.prefillName || state.clientName || state.nomClient || state.nom || ""
  );
  const [thirdPartyPhone, setThirdPartyPhone] = useState(
    state.prefillPhone || state.telephone || state.clientPhone || state.telephoneClient || ""
  );

  const [internalAlert, setInternalAlert] = useState(null);
  const [wantClim, setWantClim] = useState(false);
  const [wantArret, setWantArret] = useState(false);

  const configVehicules = useMemo(() => ({
    MotoNoStress: { base: 1000, km: 0, img: motoNoStressImg, type: "moto", mode: "NoStress", isRural: false, minPrice: 1000 },
    Moto: { base: 500, km: 170, img: motoImg, type: "moto", mode: "Standard", isRural: false },
    MotoChap: { base: 500, km: 210, img: motoChapImg, type: "moto", mode: "ChapChap", isRural: false },
    VtcEco: { base: 500, km: 300, img: carEcoImg, type: "vtc", mode: "Économique", isRural: false },
    VtcConfort: { base: 500, km: 350, img: carConfortImg, type: "vtc", mode: "Confort", isRural: false },
    VtcSuv: { base: 1000, km: 500, img: carSuvImg, type: "vtc", mode: "Prémium", isRural: false },
    TaxiEco: { base: 375, km: 250, img: taxiEcoImg, type: "taxi", mode: "Compteur", isRural: false },
    TaxiConfort: { base: 600, km: 400, img: taxiConfortImg, type: "taxi", mode: "Confort", isRural: false },
    TaxiArrangement: { base: 0, km: 0, img: taxiArrangementImg, type: "taxi", mode: "Négociable", isArrangement: true, minPrice: 1000, isRural: false },
    moto: { base: 300, km: 200, img: imgMoto, type: "moto", mode: "Moto", isRural: true },
    saloni: { base: 500, km: 150, img: imgSaloni, type: "vtc", mode: "Saloni", isRural: true },
    antara: { base: 1000, km: 200, img: imgAntara, type: "vtc", mode: "Antara", isRural: true },
    vtc: { base: 500, km: 250, img: imgVtc, type: "vtc", mode: "VTC Rural", isRural: true }
  }), []);

  const currentSectorData = useMemo(() => {
    return SECTORS_CONFIG[currentSectorKey] || { name: currentSectorKey.toUpperCase(), img: alepeIllustration, isRural: true, dbRole: "livreur-externe" };
  }, [currentSectorKey]);

  const dynamicUI = useMemo(() => {
    const cityName = currentSectorData.name;
    const isFromVendeur = isTiersFromVendeur;

    const maps = {
      moto: { 
        title: isRuralMode ? `Livreur ${cityName}` : "Livraison de Colis", 
        placeholder: "Où livrer ?", 
        thirdPartyLabel: isFromVendeur ? "Client" : "Passager", 
        btnLabel: "LIEU DE LIVRAISON" 
      },
      taxi: { 
        title: "Taxi & Négos", 
        placeholder: "Où allez-vous ?", 
        thirdPartyLabel: isFromVendeur ? "Client" : "Passager", 
        btnLabel: "DESTINATION" 
      },
      vtc: { 
        title: isRuralMode ? `Chauffeur ${cityName}` : "Ma Course VTC", 
        placeholder: "Votre destination ?", 
        thirdPartyLabel: isFromVendeur ? "Client" : "Passager", 
        btnLabel: "DESTINATION" 
      }
    };
    return maps[activeFilter] || maps.vtc;
  }, [activeFilter, isRuralMode, currentSectorData, isTiersFromVendeur]);

  const getPrice = useCallback((vId) => {
    const v = configVehicules[vId];
    if (!v) return 0;
    
    if (v.isArrangement) {
      if (urbanNegoPrice && parseInt(urbanNegoPrice) > 0) return parseInt(urbanNegoPrice);
      const ecoVehicleId = vId.replace("Nego", "Eco"); 
      const ecoVehicle = configVehicules[ecoVehicleId];
      if (ecoVehicle) {
        let ecoPrice = ecoVehicle.base;
        if (distanceKm > 0 && distanceKm < 4) {
          ecoPrice += distanceKm * 300;
        } else {
          ecoPrice += distanceKm * (ecoVehicle.km || 0);
        }
        return Math.ceil(ecoPrice / 100) * 100;
      }
      return v.minPrice || 1000;
    }

    let finalPrice = v.base;
    if (distanceKm > 0 && distanceKm < 5) {
      let smoothKmPrice = v.km || 0;
      if (vId === "VtcEco" || vId === "TaxiEco") smoothKmPrice = 200; 
      else if (vId === "VtcConfort" || vId === "TaxiConfort") smoothKmPrice = 240;
      else if (vId === "VtcSuv") smoothKmPrice = 300;
      else if (vId === "Moto" || vId === "MotoChap") smoothKmPrice = 150;
      finalPrice += distanceKm * smoothKmPrice;
    } else {
      finalPrice += distanceKm * (v.km || 0);
    }
    return Math.ceil(finalPrice / 100) * 100;
  }, [configVehicules, distanceKm, urbanNegoPrice]);

  // Force MotoNoStress + géocodage destination pour commande tiers
  useEffect(() => {
    if (isTiersFromVendeur) {
      setSelectedVehicle("MotoNoStress");
      setActiveFilter("moto");
      toast.info("🚀 Mode Tiers activé - Moto NoStress (1000 F) sélectionnée par défaut", { autoClose: 4000 });

      // Géocodage automatique de la destination si elle est pré-remplie
      const prefilledDest = location.state?.targetDestination || location.state?.destination || location.state?.dropoffAddress;
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
  }, [isTiersFromVendeur, location.state, destPos]);

  useEffect(() => {
    let unsubProfile = null;
    let unsubDrivers = null;
  
    const unsubAuth = auth.onAuthStateChanged(u => {
      setCurrentUser(u);
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      if (unsubDrivers) { unsubDrivers(); unsubDrivers = null; }
  
      if (u) {
        unsubProfile = onSnapshot(doc(db, "users", u.uid), (s) => {
          if (s.exists()) setUserData(s.data());
        });
      }
  
      const q = query(
        collection(db, "users"),
        where("isOnline", "==", true),
        where("role", "in", ["livreur", "livreur-externe"])
      );
  
      unsubDrivers = onSnapshot(q, (s) => {
        setOnlineDrivers(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.lat && d.lng));
      });
    });
  
    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubDrivers) unsubDrivers();
    };
  }, []);

  const sanitizeKey = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const coords = [p.coords.latitude, p.coords.longitude];
        setUserPos(coords);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords[0]}&lon=${coords[1]}`);
          const d = await res.json();
          setPickup(d.address?.road || d.address?.suburb || "Ma position");

          let cityKey = sanitizeKey(d.address?.town || d.address?.village || d.address?.city || "");
          if (cityKey.includes("memni") || cityKey.includes("alepe")) cityKey = "alepe";
          else if (cityKey.includes("azaguie")) cityKey = "azaguie";

          if (cityKey && SECTORS_CONFIG[cityKey]) {
            setCurrentSectorKey(cityKey);
            setIsRuralMode(SECTORS_CONFIG[cityKey].isRural);
          }
        } catch (e) {
          setPickup("Position active (GPS)");
        }
      },
      () => setInternalAlert({ type: 'error', message: 'GPS requis' }),
      CONFIG.GEOLOCATION_OPTIONS
    );
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

  const handleToggleZone = () => setShowSectorSelector(true);

  const selectRuralSector = (key) => {
    const targetSector = SECTORS_CONFIG[key];
    setCurrentSectorKey(key);
    setIsRuralMode(targetSector.isRural);
    setActiveFilter("vtc");
    setSelectedVehicle(targetSector.isRural ? "saloni" : "VtcEco");
    setShowSectorSelector(false);
    toast.info(`Zone activée : ${targetSector.name}`);
  };

  const handleKeyboardNegoRural = (value) => {
    const targetAmount = parseInt(value) || 0;
    setRuralProposedPrices(prev => ({ ...prev, [selectedVehicle]: targetAmount }));
  };

  const handleQuickPriceRural = (amount) => {
    const baseInitial = getPrice(selectedVehicle);
    const currentProposal = ruralProposedPrices[selectedVehicle] || baseInitial;
    handleKeyboardNegoRural(currentProposal + amount);
  };

  const handleStepPriceRural = (direction) => {
    const baseInitial = getPrice(selectedVehicle);
    const currentProposal = ruralProposedPrices[selectedVehicle] || baseInitial;
    const step = direction === "up" ? 100 : -100;
    const nextProposal = currentProposal + step;
    if (nextProposal >= configVehicules[selectedVehicle].base) {
      handleKeyboardNegoRural(nextProposal);
    }
  };

  const handleCommand = () => {
    if (!destPos) return setInternalAlert({ type: 'info', message: 'Indiquez une destination' });

    const v = configVehicules[selectedVehicle];

    if (isForThirdParty && (!thirdPartyName || !thirdPartyPhone)) {
      return setInternalAlert({ type: 'warning', message: 'Veuillez remplir les infos du tiers' });
    }

    const calculatedPrice = getPrice(selectedVehicle);
    const proposedPrice = isRuralMode ? (ruralProposedPrices[selectedVehicle] || calculatedPrice) : calculatedPrice;

    navigate("/confirmation", {
      state: {
        orderId: state.orderId || null, 
        pickupAddress: pickup,
        destination: dest,
        dropoffAddress: dest,
        pickupLocation: userPos ? { lat: userPos[0], lng: userPos[1] } : null,
        dropoffLocation: destPos ? { lat: destPos[0], lng: destPos[1] } : null,
        distanceKm,
        vehicle: selectedVehicle,
        mode: v.mode,
        price: calculatedPrice,
        proposedPrice,
        isForThirdParty,
        clientName: thirdPartyName,
        clientPhone: thirdPartyPhone,
        thirdPartyName,
        thirdPartyPhone,
        isNegoActive: isRuralMode ? (ruralProposedPrices[selectedVehicle] != null && ruralProposedPrices[selectedVehicle] !== calculatedPrice) : v.isArrangement,
        wantClim,
        wantArret,
        isTiersOrder: isForThirdParty,
        fromVendeur: isTiersFromVendeur,
      }
    });
  };

  const fetchSuggestions = useCallback((val) => {
    if (val.length < CONFIG.SUGGESTION_MIN_CHARS) return;
    setTimeout(async () => {
      try {
        const lowerVal = val.toLowerCase().trim();
        let querySuffix = " Abidjan, Côte d'Ivoire";
        
        if (lowerVal.includes("alepe") || lowerVal.includes("alépé") || lowerVal.includes("memni")) {
          querySuffix = " Alépé, Côte d'Ivoire";
        } else if (lowerVal.includes("azaguie") || lowerVal.includes("azaguié")) {
          querySuffix = " Azaguié, Côte d'Ivoire";
        } else if (isRuralMode) {
          querySuffix = ` ${currentSectorData.name}, Côte d'Ivoire`;
        }

        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(val + querySuffix)}&limit=6`);
        if (!res.ok) return;
        const d = await res.json();
        if (!d.features) return;
        setSuggestions(d.features.map(f => ({
          name: f.properties.name || f.properties.street || "Lieu inconnu",
          district: f.properties.district || f.properties.city || f.properties.county || "",
          fullAddress: `${f.properties.name || ""}${f.properties.district ? ", " + f.properties.district : (f.properties.city ? ", " + f.properties.city : "")}`,
          coords: [f.geometry.coordinates[1], f.geometry.coordinates[0]]
        })));
      } catch (e) { console.error("Erreur suggestions:", e); }
    }, CONFIG.DEBOUNCE_DELAY);
  }, [isRuralMode, currentSectorData]);

  const handleSelectSuggestion = (sug) => {
    setDest(sug.name);
    setDestPos(sug.coords);
    setSuggestions([]);
    setShowSearchUI(false);
  };
  
  // Système d'écoute des messages In-App temps réel pour la page Client
  useEffect(() => {
    if (!auth.currentUser) return;
    let isMounted = true;

    const messagesQuery = query(
      collection(db, "in_app_messages"),
      where("recipientId", "==", auth.currentUser.uid),
      where("status", "==", "unread")
    );

    const unsubscribeInApp = onSnapshot(messagesQuery, (snapshot) => {
      if (!isMounted) return;
      snapshot.docs.forEach(async (messageDoc) => {
        const messageData = messageDoc.data();
        
        // Affichage de l'alerte locale via le toast de la page
        toast.info(messageData.body || "Nouveau message reçu", { autoClose: 5000 });

        try {
          // Passage immédiat du statut à "read" pour couper les boucles de doublons
          await updateDoc(doc(db, "in_app_messages", messageDoc.id), {
            status: "read",
            readAt: new Date()
          });
        } catch (err) {
          console.error("Erreur mise à jour statut message In-App:", err);
        }
      });
    });

    return () => {
      isMounted = false;
      unsubscribeInApp();
    };
  }, []);

// Extraction de la variable pour validation statique par ESLint
  const fcmUserKey = typeof currentUser !== 'undefined' ? currentUser?.uid : '';

  // Listener Firebase Cloud Messaging (Notifications Push pour Client)
  useEffect(() => {
    if (!fcmUserKey) return;

    const requestPushPermission = async () => {
      try {
        const { getMessaging, getToken } = await import('firebase/messaging');
        const messaging = getMessaging();
        
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          const currentToken = await getToken(messaging, { 
            vapidKey: 'BDE5b26fkUCHbCy7IzjX30eDjJpfQev7GWOrKc6yJxUV48L0XInKEd2urQwzuqUgjQ5UAfP9EcvZ3gtXYI52oII' 
          });
          
          if (currentToken) {
            await updateDoc(doc(db, "users", fcmUserKey), {
              fcmToken: currentToken,
              updatedAt: serverTimestamp()
            });
          } else {
            console.warn('Aucun jeton d\'enregistrement disponible pour le client.');
          }
        } else {
          console.warn('Permission de notification refusée par le client.');
        }
      } catch (err) {
        console.error('Erreur lors de la configuration des notifications Push FCM Client :', err);
      }
    };

    requestPushPermission();
  }, [fcmUserKey]);

  

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
        <button className="menu-btn" onClick={() => setIsSideNavOpen(true)}><Menu size={24} /></button>
        {distanceKm > 0 && <div className="distance-badge-top"><Route size={14} /><span>{distanceKm.toFixed(1)} km</span></div>}
      </div>
      
      <SideNav isOpen={isSideNavOpen} onClose={() => setIsSideNavOpen(false)} currentUser={currentUser} userData={userData} />

      <div className="map-fullscreen">
        <MapContainer center={CONFIG.DEFAULT_CENTER} zoom={CONFIG.DEFAULT_ZOOM} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          {onlineDrivers.map(d => <Marker key={d.id} position={[Number(d.lat), Number(d.lng)]} icon={getDriverIcon(d)} />)}
          {userPos && (
            <Marker position={userPos} icon={clientIcon}>
              <Popup autoPan={false} closeButton={false} className="pickup-popup" permanent>
                <div className="popup-content"><div className="dot"></div><span>{pickup}</span></div>
              </Popup>
            </Marker>
          )}
          {destPos && <Marker position={destPos} icon={destinationIcon} />}
          {route.length > 0 && <Polyline positions={route} pathOptions={{ color: "#f35416", weight: 5 }} />}
          <MapEffect a={userPos} b={destPos} recenterPos={recenterRequest} />
        </MapContainer>
        
        <button onClick={() => userPos && setRecenterRequest([...userPos])} className="recenter-map-btn"><Target size={24} color="#f35416" /></button>
      </div>

      {/* Modal Négociation Abidjan */}
      {showNegotiationModal && !isRuralMode && (
        <div className="negotiation-anchor-container">
          <div className="negotiation-card-premium">
            <div className="modal-header-premium">
              <div className="header-info">
                <div className="icon-badge"><Zap size={20} fill="#f35416" color="#f35416" /></div>
                <h3>Votre prix ?</h3>
              </div>
              <button className="close-x" onClick={() => setShowNegotiationModal(false)}><X size={20} /></button>
            </div>

            <div className="price-display-section">
              <span className="currency-label">Montant F CFA (minimum éco)</span>
              <input type="number" inputMode="numeric" value={urbanNegoPrice} onChange={e => setUrbanNegoPrice(e.target.value)} 
                placeholder={getPrice(selectedVehicle)} className="big-price-input" autoFocus />
            </div>

            <div className="quick-add-grid">
              <button onClick={() => setUrbanNegoPrice((prev => (parseInt(prev) || getPrice(selectedVehicle)) - 200).toString())} className="quick-btn">-200</button>
              <button onClick={() => setUrbanNegoPrice((prev => (parseInt(prev) || getPrice(selectedVehicle)) + 200).toString())} className="quick-btn">+200</button>
              <button onClick={() => setUrbanNegoPrice((prev => (parseInt(prev) || getPrice(selectedVehicle)) + 500).toString())} className="quick-btn">+500</button>
              <button onClick={() => setUrbanNegoPrice((prev => (parseInt(prev) || getPrice(selectedVehicle)) + 1000).toString())} className="quick-btn">+1000</button>
            </div>

            <div style={{ display: 'flex', gap: '12px', margin: '15px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={wantClim} onChange={e => setWantClim(e.target.checked)} /> Clim
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={wantArret} onChange={e => setWantArret(e.target.checked)} /> Arrêt
              </label>
            </div>

            <button onClick={() => setShowNegotiationModal(false)} className="confirm-nego-btn" style={{ background: '#059669' }}>
              VALIDER MON OFFRE
            </button>
          </div>
        </div>
      )}

      {isRuralMode && showNegotiationModal && (
        <div className="negotiation-anchor-container">
          <div className="negotiation-card-premium">
            <div className="modal-header-premium">
              <div className="header-info">
                <div className="icon-badge"><Zap size={20} fill="#059669" color="#059669" /></div>
                <h3>Proposer une offre</h3>
              </div>
              <button className="close-x" onClick={() => setShowNegotiationModal(false)}><X size={20} /></button>
            </div>

            <div className="price-display-section">
              <span className="currency-label">Votre Proposition (minimum éco)</span>
              <input type="number" inputMode="numeric" value={ruralProposedPrices[selectedVehicle] || getPrice(selectedVehicle)} onChange={e => handleKeyboardNegoRural(e.target.value)} 
                className="big-price-input" autoFocus />
            </div>

            <div className="quick-add-grid">
              <button onClick={() => handleQuickPriceRural(-200)} className="quick-btn">-200</button>
              <button onClick={() => handleQuickPriceRural(200)} className="quick-btn">+200</button>
              <button onClick={() => handleQuickPriceRural(500)} className="quick-btn">+500</button>
              <button onClick={() => handleQuickPriceRural(1000)} className="quick-btn">+1000</button>
            </div>

            <div style={{ display: 'flex', gap: '12px', margin: '15px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={wantClim} onChange={e => setWantClim(e.target.checked)} /> Clim
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={wantArret} onChange={e => setWantArret(e.target.checked)} /> Arrêt
              </label>
            </div>

            <button onClick={() => setShowNegotiationModal(false)} className="confirm-nego-btn" style={{ background: '#059669' }}>
              VALIDER MON OFFRE
            </button>
          </div>
        </div>
      )}

      {showSectorSelector && (
        <div className="negotiation-anchor-container" style={{ zIndex: 9999 }}>
          <div className="negotiation-card-premium" style={{ maxWidth: '340px' }}>
            <div className="modal-header-premium">
              <div className="header-info">
                <div className="icon-badge"><Map size={20} color="#059669" /></div>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800' }}>CHOISIR MA ZONE</h3>
              </div>
              <button className="close-x" onClick={() => setShowSectorSelector(false)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.5rem 0.5rem' }}>
              {Object.entries(SECTORS_CONFIG).map(([key, sector]) => (
                <button 
                  key={key} 
                  onClick={() => selectRuralSector(key)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.55rem', background: '#ffffff', border: sector.isRural ? '1px solid #fff' : '1px solid #f35416', borderRadius: '12px', cursor: 'pointer' }}
                >
                  <img src={sector.img} alt={sector.name} style={{ width: '89px', height: '62px', borderRadius: '13%', objectFit: 'cover', marginBottom: '0.25rem' }} />
                  <span style={{ color: '#000', fontSize: '0.60rem' }}>{sector.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="booking-panel">
        <div className="toggle-zone-container">
          <button onClick={handleToggleZone} className={`zone-switch-btn ${isRuralMode ? 'alepe-active' : ''}`}>
            <div className="zone-icon-circle">
              <img src={currentSectorData.img} alt={currentSectorData.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '21%' }} />
            </div>
            <div className="zone-text-info">
              <span className="zone-label">L'affichage de la zone active est automatique</span>
              <span className="zone-name" style={{ fontSize: '0.70rem', fontWeight: '700' }}>
                {isRuralMode ? `ZONE RURALE (${currentSectorData.name})` : `ZONE URBAINE (${currentSectorData.name})`}
              </span>
            </div>
            <div className={`status-indicator ${isRuralMode ? 'bg-emerald-500' : 'bg-orange-500'}`}></div>
          </button>
        </div>

        <h2 className="panel-title">{dynamicUI.title}</h2>
        
        <div className="search-field">
          <Navigation size={18} className="icon-search" />
          <input
            className="search-input"
            placeholder={dynamicUI.placeholder}
            value={dest}
            onFocus={() => setShowSearchUI(true)}
            onChange={(e) => {
              setDest(e.target.value);
              fetchSuggestions(e.target.value);
            }}
          />
          {dest && <X size={18} className="close-search-ui-btn" onClick={() => { setDest(""); setDestPos(null); setRoute([]); }} />}
        </div>

        {/* Suggestion list */}
        {showSearchUI && suggestions.length > 0 && (
          <div className="suggestions-list">
            {suggestions.map((sug, idx) => (
              <button key={idx} className="suggestion-item" onClick={() => handleSelectSuggestion(sug)}>
                <MapPin size={16} className="icon" />
                <div className="text-container">
                  <span className="name">{sug.name}</span>
                  {sug.district && <span className="sub">{sug.district}</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="third-party-toggle">
          <button className={`tp-btn ${isForThirdParty ? 'active' : ''}`} onClick={() => setIsForThirdParty(!isForThirdParty)}>
            {isForThirdParty ? <Zap size={16} fill="currentColor" /> : <User size={16} />}
            <span>Commander pour un {dynamicUI.thirdPartyLabel}</span>
          </button>
        </div>

        {isForThirdParty && (
          <div className="third-party-fields">
            <div className="tp-input">
              <User size={16} />
              <input placeholder={`Nom du ${dynamicUI.thirdPartyLabel}`} value={thirdPartyName} onChange={e => setThirdPartyName(e.target.value)} />
            </div>
            <div className="tp-input">
              <Phone size={16} />
              <input placeholder="Numéro de téléphone" type="tel" value={thirdPartyPhone} onChange={e => setThirdPartyPhone(e.target.value)} />
            </div>
          </div>
        )}

        {!isRuralMode && (
          <div className="transport-filters">
            <button onClick={() => {setActiveFilter("moto"); setSelectedVehicle("Moto");}} className={`filter-btn ${activeFilter === 'moto' ? 'active' : ''}`}>
              <img src={livraisonMotoIcon} alt="Moto" /><span>LIVRAISON</span>
            </button>
            <button onClick={() => {setActiveFilter("vtc"); setSelectedVehicle("VtcEco");}} className={`filter-btn ${activeFilter === 'vtc' ? 'active' : ''}`}>
              <img src={courseVtcIcon} alt="VTC" /><span>VTC</span>
            </button>
            <button onClick={() => {setActiveFilter("taxi"); setSelectedVehicle("TaxiConfort");}} className={`filter-btn ${activeFilter === 'taxi' ? 'active' : ''}`}>
              <img src={taxiCompteurIcon} alt="Taxi" /><span>TAXI</span>
            </button>
          </div>
        )}

        <div className={`vehicles-grid ${isRuralMode ? 'rural-unified' : ''}`}>
          {Object.entries(configVehicules)
            .filter(([id, v]) => isRuralMode ? v.isRural : v.type === activeFilter && !v.isRural)
            .map(([id, v]) => {
              const basePrice = getPrice(id);
              const hasProposal = isRuralMode && ruralProposedPrices[id] && ruralProposedPrices[id] !== basePrice;
              return (
                <button key={id} onClick={() => setSelectedVehicle(id)} className={`vehicle-card ${selectedVehicle === id ? 'selected' : ''}`}>
                  <div className="vehicle-image"><img src={v.img} alt={v.mode} /></div>
                  <span className="vehicle-name">{v.mode}</span>
                  <div className="vehicle-price" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {v.isArrangement ? "Négos" : <AnimatedPrice value={basePrice} />}
                    {hasProposal && (
                      <span style={{ fontSize: '0.55rem', background: '#dcfce7', color: '#166534', padding: '1px 4px', borderRadius: '4px', fontWeight: 'bold' }}>
                        Offre: {ruralProposedPrices[id]}F
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>

        {isRuralMode && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', padding: '0.6rem 1rem', borderRadius: '16px', margin: '0.5rem 0', border: '1px dashed #bbf7d0', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: '800', color: '#166534' }}>PRIX INITIAL: {getPrice(selectedVehicle)} F</span>
              <span style={{ fontSize: '0.7rem', fontWeight: '900', color: '#14532d', marginTop: '2px' }}>MA PROPOSITION :</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={() => handleStepPriceRural("down")} style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#ffffff', border: '1px solid #bbf7d0' }}>
                <Minus size={14} color="#059669" strokeWidth={3} />
              </button>
              <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#10b981', minWidth: '60px', textAlign: 'center' }}>
                {ruralProposedPrices[selectedVehicle] || getPrice(selectedVehicle)} F
              </span>
              <button onClick={() => handleStepPriceRural("up")} style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#ffffff', border: '1px solid #bbf7d0' }}>
                <Plus size={14} color="#059669" strokeWidth={3} />
              </button>
            </div>
            <button onClick={() => setShowNegotiationModal(true)} style={{ background: '#059669', color: '#fff', fontSize: '0.65rem', fontWeight: '800', padding: '0.4rem 0.6rem', borderRadius: '8px' }}>CLAVIER</button>
          </div>
        )}
        
      <button onClick={handleCommand} className={`cmd-button ${destPos ? 'active' : ''}`}>
        {destPos ? (
          <>
            <Banknote size={20} />
            <span>COMMANDER : </span>
            <AnimatedPrice value={getPrice(selectedVehicle)} />
          </>
        ) : `INDIQUER LA ${dynamicUI.btnLabel}`}
      </button>
      </div>
    </div>
  );
}