import React, { useEffect, useMemo, useState, useCallback } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Zap, LocateFixed, CheckCircle } from "lucide-react";

import imgSaloni from "../assets/saloni.png";
import imgAntara from "../assets/antara.png";
import imgMoto from "../assets/moto.png";
import imgVtc from "../assets/vtc.png"; // Assure-toi d'ajouter cette image dans tes assets

import "leaflet/dist/leaflet.css";
import "./PageZoneAlepe.css";

// BASE DE DONNÉES DES SECTEURS ET LOCALITÉS ENRICHIE (Multi-zone)
const SECTORS_DATA = {
  alepe: {
    name: "Alépé",
    center: [5.500, -3.687],
    villages: [
      { id: 1, name: "Memni", coords: [5.5059347, -3.739214] },
      { id: 2, name: "Montézo", coords: [5.4848745, -3.7572816] },
      { id: 3, name: "Alépé (Ville)", coords: [5.5005307, -3.6872867] },
      { id: 4, name: "Grand-Alépé", coords: [5.4700883, -3.7731839] },
      { id: 5, name: "Oghlwapo", coords: [5.4010202, -3.7474217] },
      { id: 6, name: "Danguira", coords: [5.6638394, -3.7807132] },
      { id: 7, name: "Aboisso-Comoé", coords: [5.4675728, -3.2216766] },
      { id: 8, name: "Allosso", coords: [5.6287191, -3.6343922] },
      { id: 9, name: "Zodji", coords: [5.9997155, -3.9557516] },
      { id: 10, name: "Ingrakon", coords: [5.4365898, -3.6727811] },
      { id: 11, name: "Yakassé-Comoé", coords: [6.953852, -3.4475764] },
      { id: 12, name: "M'Braté", coords: [5.313897, -4.2623437] },
      { id: 13, name: "Carrefour Motobé", coords: [5.2327048, -3.6505961] },
      { id: 14, name: "Akouré", coords: [5.3758998, -3.7526358] },
      { id: 15, name: "Andou-M'batto", coords: [5.4371, -3.7944] },
      { id: 16, name: "Debimou", coords: [5.4124, -3.7122] }
    ]
  },
  azaguie: {
    name: "Azaguié",
    center: [5.6312, -4.0801],
    villages: [
      { id: 1, name: "Azaguié Ville / Gare", coords: [5.6345, -4.0754] },
      { id: 2, name: "Azaguié Blida", coords: [5.6284, -4.0912] },
      { id: 3, name: "Azaguié Ahoua", coords: [5.6120, -4.1132] },
      { id: 4, name: "M'Brou", coords: [5.6582, -4.1485] },
      { id: 5, name: "Azaguié M'Bromé", coords: [5.6421, -4.0411] },
      { id: 6, name: "Abbé-Bégnini", coords: [5.6885, -4.0532] },
      { id: 7, name: "Dingbe", coords: [5.5974, -4.1356] },
      { id: 8, name: "Carrefour Tranchée", coords: [5.6022, -4.0689] }
    ]
  },
  agboville: {
    name: "Agboville",
    center: [5.9281, -4.2132],
    villages: [
      { id: 1, name: "Agboville Centre-Ville", coords: [5.9294, -4.2148] },
      { id: 2, name: "Loviguié", coords: [5.8752, -4.3120] },
      { id: 3, name: "Grand-Yapo", coords: [5.8231, -4.1425] },
      { id: 4, name: "Rubino", coords: [6.0944, -4.2922] },
      { id: 5, name: "Ananguié", coords: [5.8450, -4.1150] },
      { id: 6, name: "Ery-Macouguié", coords: [5.9112, -4.2541] },
      { id: 7, name: "Aboudé", coords: [5.9388, -4.4124] },
      { id: 8, name: "Guesguié", coords: [5.8941, -4.1672] },
      { id: 9, name: "Offoumpo", coords: [5.9812, -4.1245] },
      { id: 10, name: "Oress-Krobou", coords: [5.7891, -4.3312] }
    ]
  },
  adzope: {
    name: "Adzopé",
    center: [6.1069, -3.8619],
    villages: [
      { id: 1, name: "Adzopé Centre", coords: [6.1069, -3.8619] },
      { id: 2, name: "Bécédi-Brignan", coords: [6.0124, -3.9451] },
      { id: 3, name: "Yakassé-Attobrou", coords: [6.1834, -3.6782] },
      { id: 4, name: "Assikoi", coords: [6.0712, -3.8124] },
      { id: 5, name: "Ananguié (Adzopé)", coords: [6.1415, -3.9210] },
      { id: 6, name: "Miadzin", coords: [6.0421, -3.8945] },
      { id: 7, name: "Boudépé", coords: [6.1951, -3.8211] },
      { id: 8, name: "Massandji", coords: [6.1284, -3.7314] }
    ]
  },
  dabou: {
    name: "Dabou",
    center: [5.3256, -4.3764],
    villages: [
      { id: 1, name: "Dabou Centre / Gare", coords: [5.3256, -4.3764] },
      { id: 2, name: "Lopou", coords: [5.3941, -4.4912] },
      { id: 3, name: "Toupah", coords: [5.2912, -4.5614] },
      { id: 4, name: "Débrimou", coords: [5.3512, -4.3981] },
      { id: 5, name: "Cosrou", coords: [5.3124, -4.6841] },
      { id: 6, name: "N'Gatty", coords: [5.2789, -4.4521] },
      { id: 7, name: "Pass", coords: [5.3421, -4.3112] },
      { id: 8, name: "Agnéby", coords: [5.3684, -4.2612] }
    ]
  },
  jacqueville: {
    name: "Jacqueville",
    center: [5.2052, -4.4145],
    villages: [
      { id: 1, name: "Jacqueville Ville", coords: [5.2052, -4.4145] },
      { id: 2, name: "N'Sikadjé / Pont", coords: [5.2289, -4.4112] },
      { id: 3, name: "Abreby", coords: [5.2012, -4.4754] },
      { id: 4, name: "Avagou", coords: [5.1841, -4.6412] },
      { id: 5, name: "Addah", coords: [5.1912, -4.7314] },
      { id: 6, name: "Grand-Jack", coords: [5.2145, -4.3121] },
      { id: 7, name: "Sassako-Bégnini", coords: [5.2112, -4.5421] },
      { id: 8, name: "Attoutou A", coords: [5.2412, -4.6124] }
    ]
  }
};

const CONFIG = {
  DEFAULT_ZOOM: 13,
  GEOLOCATION_OPTIONS: { 
    enableHighAccuracy: true, 
    timeout: 10000, 
    maximumAge: 0 
  }
};

const clientIcon = L.divIcon({
  html: `<div class="client-marker-wrapper"><div class="client-dot"></div><div class="client-pulse"></div></div>`,
  iconSize: [30, 30], iconAnchor: [15, 15], className: "custom-leaflet-icon"
});

const villageIcon = L.divIcon({
  html: `<div class="village-marker-final"><div class="v-dot"></div></div>`,
  iconSize: [24, 24], iconAnchor: [12, 12], className: "custom-leaflet-icon"
});

// Calcul de secours mathématique de la distance à vol d'oiseau (Formule de Haversine)
const calculateHaversineDistance = (coords1, coords2) => {
  if (!coords1 || !coords2) return 0;
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Rayon de la Terre en km
  const dLat = toRad(coords2[0] - coords1[0]);
  const dLon = toRad(coords2[1] - coords1[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1[0])) * Math.cos(toRad(coords2[0])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  // On ajoute une majoration forfaitaire moyenne de +25% pour simuler la réalité des virages routiers ruraux
  return Number((distance * 1.25).toFixed(1));
};

function MapEffect({ userPos, destPos }) {
  const map = useMap();
  useEffect(() => {
    if (map && userPos && destPos) {
      map.fitBounds(L.latLngBounds([userPos, destPos]), { padding: [70, 70] });
    } else if (map && userPos) {
      map.setView(userPos, 15);
    }
  }, [userPos, destPos, map]);
  return null;
}

export default function ClientZoneAlepe() {
  const navigate = useNavigate();
  const { zoneName } = useParams();

  const currentZoneKey = zoneName && SECTORS_DATA[zoneName.toLowerCase()] ? zoneName.toLowerCase() : "alepe";
  const currentZone = SECTORS_DATA[currentZoneKey];

  const [userPos, setUserPos] = useState(null);
  const [destPos, setDestPos] = useState(null);
  const [destName, setDestName] = useState("");
  const [distanceKm, setDistanceKm] = useState(0);
  const [route, setRoute] = useState([]);
  const [selectedService, setSelectedService] = useState("saloni");
  const [isLocating, setIsLocating] = useState(true);

  // Intégration de l'option VTC classique (voiture normale) avec sa tarification dédiée
  const configServices = useMemo(() => ({
    saloni: { label: "SALONI", base: 500, km: 200, img: imgSaloni },
    vtc: { label: "VTC", base: 1500, km: 250, img: imgVtc }, // Nouvelle option Voiture normale
    antara: { label: "ANTARA", base: 2500, km: 350, img: imgAntara },
    moto: { label: "MOTO", base: 1000, km: 100, img: imgMoto },
  }), []);

  const syncLocation = useCallback(() => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude, longitude } = p.coords;
        if (latitude > 4 && latitude < 10) {
          setUserPos([latitude, longitude]);
        } else {
          setUserPos(currentZone.center);
        }
        setIsLocating(false);
      },
      () => { 
        setIsLocating(false); 
        setUserPos(currentZone.center); 
      },
      CONFIG.GEOLOCATION_OPTIONS
    );
  }, [currentZone.center]);

  useEffect(() => { 
    syncLocation(); 
    setDestPos(null);
    setDestName("");
    setRoute([]);
    setDistanceKm(0);
  }, [currentZoneKey, syncLocation]);

  const handleVillageChange = (e) => {
    const village = currentZone.villages.find(v => v.name === e.target.value);
    if (village) {
      setDestPos(village.coords);
      setDestName(village.name);
    }
  };

  useEffect(() => {
    if (userPos && destPos) {
      const url = `https://router.project-osrm.org/route/v1/driving/${userPos[1]},${userPos[0]};${destPos[1]},${destPos[0]}?overview=full&geometries=geojson`;
      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error("OSRM Unavailable");
          return r.json();
        })
        .then(d => {
          if (d.routes?.[0]) {
            const dist = d.routes[0].distance / 1000;
            setDistanceKm(dist);
            setRoute(d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
          } else {
            throw new Error("No route found");
          }
        })
        .catch(() => {
          // Logique Fallback Professionnelle : En cas d'erreur 503 d'OSRM, calcul mathématique immédiat
          const backupDistance = calculateHaversineDistance(userPos, destPos);
          setDistanceKm(backupDistance);
          setRoute([userPos, destPos]); // On trace une ligne directe de secours visuel sur Leaflet
        });
    }
  }, [userPos, destPos]);

  const calculatePrice = (id) => {
    const s = configServices[id];
    const total = s.base + (distanceKm * s.km);
    return Math.ceil(total / 100) * 100;
  };

  return (
    <div className="alepe-container">
      {/* HEADER PREMIUM DYNAMIQUE */}
      <div className="alepe-header-glass">
        <button onClick={() => navigate(-1)} className="back-blur-btn"><ChevronLeft /></button>
        <div className="title-stack">
          <h1>Secteur {currentZone.name}</h1>
          <div className="gps-status">
            {isLocating ? <span>Recherche GPS...</span> : <span className="txt-ok"><CheckCircle size={12}/> GPS Actif</span>}
          </div>
        </div>
        <button onClick={syncLocation} className="gps-refresh-btn">
          <LocateFixed size={20} className={isLocating ? "animate-spin" : ""} />
        </button>
      </div>

      {/* MAP SECTION */}
      <div className="map-view-rural">
        <MapContainer center={currentZone.center} zoom={CONFIG.DEFAULT_ZOOM} zoomControl={false} style={{ height: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {userPos && <Marker position={userPos} icon={clientIcon} />}
          {destPos && <Marker position={destPos} icon={villageIcon} />}
          {route.length > 0 && <Polyline positions={route} pathOptions={{ color: "#ef4444", weight: 5, opacity: 0.8 }} />}
          <MapEffect userPos={userPos} destPos={destPos} />
        </MapContainer>
      </div>

      {/* SELECTION PANEL */}
      <div className="selection-sheet">
        <div className="sheet-handle"></div>
        
        <div className="rural-input-group">
          <label className="input-label">Destination</label>
          <select className="village-select" onChange={handleVillageChange} value={destName}>
            <option value="">Où allez-vous ?</option>
            {currentZone.villages.map(v => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>

        <div className="services-grid-rural">
          {Object.entries(configServices).map(([id, s]) => (
            <div 
              key={id} 
              className={`service-card-rural ${selectedService === id ? 'active' : ''}`} 
              onClick={() => setSelectedService(id)}
            >
              <div className="service-img-circle">
                <img src={s.img} alt={s.label} className="vehicle-img-fitted" />
              </div>
              <div className="service-info-stack">
                <span className="s-name">{s.label}</span>
                <div className="s-price">{calculatePrice(id)} F</div>
              </div>
            </div>
          ))}
        </div>

        <button 
          className="confirm-rural-btn" 
          disabled={!destPos || isLocating}
          onClick={() => {
            // Mapping enrichi des services pour inclure la clé VtcStandard/VtcEco attendue par PageConfirmation
            const vehicleMapping = {
              saloni: "VtcEco", 
              vtc: "VtcStandard", // Identifiant envoyé à l'écran de confirmation
              antara: "VtcConfort",
              moto: "Moto"
            };

            navigate("/page-confirmation", { 
              state: { 
                vehicle: vehicleMapping[selectedService],
                price: calculatePrice(selectedService), 
                dest: destName,
                pickup: `Ma position (${currentZone.name})`,
                distance: Number(distanceKm),
                pickupLocation: { lat: userPos[0], lng: userPos[1] },
                dropoffLocation: { lat: destPos[0], lng: destPos[1] },
                isAlepeZone: true,
                zoneKey: currentZoneKey
              } 
            });
          }}
        >
          <Zap size={20} fill="white" />
          <span>{destPos ? "CONFIRMER LA COURSE" : "CHOISIR UN VILLAGE"}</span>
        </button>
      </div>
    </div>
  );
}