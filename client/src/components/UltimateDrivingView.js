import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { Volume2, VolumeX, X } from "lucide-react";
import "./UltimateDrivingView.css";

// --- ASSETS ---
import vtcEcoImg from "../assets/courseDriverImg.png";
import moto3dImg from "../assets/marker-livreur.png";
import carSuvImg from "../assets/suvDriver.png";
import taxiEcoImg from "../assets/taxiDriver.png";
import taxiSuvImg from "../assets/taxiSuvDriver.png";
import taxiConfortImg from "../assets/taxi-confort.png";

// ====================== HELPERS GÉO ======================
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
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

function findClosestSegment(vehiclePos, route) {
  if (!vehiclePos || !route || route.length < 2) return null;
  let minDist = Infinity;
  let closestIndex = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const A = vehiclePos[0] - p1[0];
    const B = vehiclePos[1] - p1[1];
    const C = p2[0] - p1[0];
    const D = p2[1] - p1[1];
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;

    let projLat, projLon;
    if (param < 0) {
      projLat = p1[0];
      projLon = p1[1];
    } else if (param > 1) {
      projLat = p2[0];
      projLon = p2[1];
    } else {
      projLat = p1[0] + param * C;
      projLon = p1[1] + param * D;
    }

    const dist = getDistance(vehiclePos[0], vehiclePos[1], projLat, projLon);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }
  return {
    p1: route[closestIndex],
    p2: route[closestIndex + 1],
    distance: minDist,
    index: closestIndex,
  };
}

function calculateBearing(p1, p2) {
  const dLat = p2[0] - p1[0];
  const dLon = p2[1] - p1[1];
  return (Math.atan2(dLon, dLat) * 180) / Math.PI;
}

/** Distance restante le long de la polyline à partir de l'index segment */
function remainingDistanceAlongRoute(vehiclePos, route, fromIndex) {
  if (!route || route.length < 2 || !vehiclePos) return 0;
  let total = 0;
  const start = Math.max(0, fromIndex || 0);
  // du véhicule au prochain point
  if (route[start + 1]) {
    total += getDistance(
      vehiclePos[0],
      vehiclePos[1],
      route[start + 1][0],
      route[start + 1][1]
    );
  }
  for (let i = start + 1; i < route.length - 1; i++) {
    total += getDistance(
      route[i][0],
      route[i][1],
      route[i + 1][0],
      route[i + 1][1]
    );
  }
  return total;
}

// ====================== MAP CONTROLLER ======================
function MapController({ vehiclePos, route, manualOffset }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !vehiclePos) return;

    const closest = findClosestSegment(vehiclePos, route);
    let targetPoint = vehiclePos;
    let bearing = 0;

    if (closest && closest.distance < 50) {
      const p1 = closest.p1;
      const p2 = closest.p2;
      const A = vehiclePos[0] - p1[0];
      const B = vehiclePos[1] - p1[1];
      const C = p2[0] - p1[0];
      const D = p2[1] - p1[1];
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      const param = Math.max(0, Math.min(1, lenSq !== 0 ? dot / lenSq : 0));
      targetPoint = [p1[0] + param * C, p1[1] + param * D];
      bearing = calculateBearing(p1, p2);
    } else if (route && route.length >= 2) {
      bearing = calculateBearing(route[0], route[route.length - 1]);
    }

    try {
      map.setView(targetPoint, 19, { animate: true, duration: 0.5 });
      const finalAngle = -bearing + manualOffset;
      const container = map.getContainer();
      if (container) {
        container.style.transition =
          "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
        container.style.transformOrigin = "50% 50%";
        container.style.transform = `rotate(${finalAngle}deg)`;
      }
    } catch (error) {
      console.error("Map Rotation Error:", error);
    }

    return () => {
      const container = map.getContainer();
      if (container) {
        container.style.transform = "rotate(0deg)";
        container.style.transition = "none";
      }
    };
  }, [map, vehiclePos, route, manualOffset]);

  return null;
}

// ====================== MOTEUR VOCAL ======================
/**
 * Navigation audio FR via Web Speech API.
 * Annonce : démarrage, distance, approche destination, arrivée.
 */
function useNavVoice(enabled) {
  const lastSpokenRef = useRef("");
  const lastTimeRef = useRef(0);
  const voicesReady = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      voicesReady.current = true;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  const speak = useCallback(
    (text, { force = false } = {}) => {
      if (!enabled || !text) return;
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      const now = Date.now();
      // anti-spam : même phrase ou < 8 s
      if (!force && text === lastSpokenRef.current && now - lastTimeRef.current < 8000) {
        return;
      }
      if (!force && now - lastTimeRef.current < 4000) return;

      lastSpokenRef.current = text;
      lastTimeRef.current = now;

      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "fr-FR";
        u.rate = 1.05;
        u.pitch = 1;
        u.volume = 1;

        const voices = window.speechSynthesis.getVoices();
        const fr =
          voices.find((v) => v.lang.startsWith("fr") && /Google|Thomas|Amelie|Marie/i.test(v.name)) ||
          voices.find((v) => v.lang.startsWith("fr"));
        if (fr) u.voice = fr;

        window.speechSynthesis.speak(u);
      } catch (e) {
        console.warn("Speech error:", e);
      }
    },
    [enabled]
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { speak, stop };
}

function formatDistanceVoice(meters) {
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(1).replace(".0", "");
    return `${km} kilomètre${km === "1" ? "" : "s"}`;
  }
  const m = Math.round(meters / 10) * 10;
  return `${m} mètres`;
}

// ====================== MAIN ======================
export default function UltimateDrivingView({
  vehiclePosition,
  route,
  remainingDistance, // km (depuis LivreurHome)
  estimatedTime, // min
  vehicleType,
  courseMode,
  destinationLabel = "destination",
  onClose,
}) {
  const [manualOffset, setManualOffset] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [hudInstruction, setHudInstruction] = useState("Navigation active");
  const startedRef = useRef(false);
  const arrivedRef = useRef(false);
  const lastAnnounceDistRef = useRef(null);

  const { speak, stop } = useNavVoice(voiceOn);

  // Démarrage vocal
  useEffect(() => {
    if (startedRef.current) return;
    if (!vehiclePosition || !route || route.length < 2) return;
    startedRef.current = true;
    speak(
      `Navigation démarrée. Direction ${destinationLabel}. Suivez l'itinéraire.`,
      { force: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiclePosition, route]);

  // Annonces selon distance restante
  useEffect(() => {
    if (!vehiclePosition || !route || route.length < 2) return;

    const closest = findClosestSegment(vehiclePosition, route);
    const remainM =
      remainingDistanceAlongRoute(
        vehiclePosition,
        route,
        closest?.index ?? 0
      ) || (Number(remainingDistance) || 0) * 1000;

    // Arrivée
    if (remainM < 40 && !arrivedRef.current) {
      arrivedRef.current = true;
      setHudInstruction("Vous êtes arrivé");
      speak(`Vous êtes arrivé à ${destinationLabel}.`, { force: true });
      return;
    }

    // Seuils d'annonce (mètres)
    const thresholds = [2000, 1000, 500, 200, 100];
    for (const t of thresholds) {
      if (remainM <= t + 30 && remainM > t - 40) {
        if (lastAnnounceDistRef.current === t) break;
        lastAnnounceDistRef.current = t;
        const phrase = `Dans ${formatDistanceVoice(t)}, ${destinationLabel}.`;
        setHudInstruction(phrase);
        speak(phrase);
        break;
      }
    }

    // Instruction HUD continue
    if (remainM >= 40) {
      setHudInstruction(
        `Reste ${formatDistanceVoice(remainM)} · ${Math.ceil(estimatedTime || 0)} min`
      );
    }
  }, [
    vehiclePosition,
    route,
    remainingDistance,
    estimatedTime,
    destinationLabel,
    speak,
  ]);

  // Cleanup voix à la fermeture
  useEffect(() => {
    return () => stop();
  }, [stop]);

  const getVehicleIcon = () => {
    const type = (vehicleType || "").toLowerCase().trim();
    const mode = (courseMode || "").toLowerCase().trim();

    if (type.includes("moto") || type.includes("bike")) return moto3dImg;

    if (
      type.includes("taxi") ||
      type.includes("hustle") ||
      mode.includes("pieton") ||
      mode.includes("piéton") ||
      mode.includes("bicycle") ||
      mode.includes("transporteur")
    ) {
      if (mode.includes("suv") || mode.includes("camion")) return taxiSuvImg;
      if (mode.includes("confort") || mode.includes("bicycle"))
        return taxiConfortImg;
      return taxiEcoImg;
    }

    if (
      type.includes("vtc") ||
      type.includes("cargo") ||
      type.includes("car") ||
      type.includes("suv") ||
      type.includes("camion")
    ) {
      if (
        mode.includes("suv") ||
        mode.includes("camion") ||
        mode.includes("premium")
      ) {
        return carSuvImg;
      }
      return vtcEcoImg;
    }

    return vtcEcoImg;
  };

  const toggleVoice = () => {
    if (voiceOn) {
      stop();
      setVoiceOn(false);
    } else {
      setVoiceOn(true);
      speak("Guidage vocal activé.", { force: true });
    }
  };

  return (
    <div className="driving-view-container">
      {/* HUD haut */}
      <div className="hud-top">
        <div className="hud-direction-icon">↑</div>
        <div className="hud-info">
          <div className="hud-instruction">{hudInstruction}</div>
          <div className="hud-metrics">
            {parseFloat(remainingDistance || 0).toFixed(1)} km •{" "}
            {Math.ceil(estimatedTime || 0)} min
          </div>
        </div>
        <button
          type="button"
          className="hud-voice-btn"
          onClick={toggleVoice}
          aria-label={voiceOn ? "Couper le son" : "Activer le son"}
        >
          {voiceOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
        {typeof onClose === "function" && (
          <button
            type="button"
            className="hud-close-btn"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            <X size={22} />
          </button>
        )}
      </div>

      {/* Calibration boussole */}
      <div className="calibration-panel">
        <button
          onClick={() => setManualOffset((prev) => prev - 15)}
          className="btn-calibrate"
        >
          ↺
        </button>
        <div className="angle-label">{manualOffset}°</div>
        <button
          onClick={() => setManualOffset((prev) => prev + 15)}
          className="btn-calibrate"
        >
          ↻
        </button>
        <button
          onClick={() => setManualOffset(0)}
          className="btn-calibrate reset"
        >
          ⟲
        </button>
      </div>

      <div className="map-viewport">
        <MapContainer
          center={vehiclePosition || [5.348, -4.03]}
          zoom={19}
          zoomControl={false}
          className="leaflet-map"
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" />

          {vehiclePosition && (
            <MapController
              vehiclePos={vehiclePosition}
              route={route}
              manualOffset={manualOffset}
            />
          )}

          {route && route.length > 0 && (
            <>
              <Polyline
                positions={route}
                pathOptions={{ color: "#00ccff", weight: 18, opacity: 0.3 }}
              />
              <Polyline
                positions={route}
                pathOptions={{ color: "#ffffff", weight: 12, opacity: 1 }}
              />
              <Polyline
                positions={route}
                pathOptions={{ color: "#2563eb", weight: 7, opacity: 1 }}
              />
            </>
          )}
        </MapContainer>
      </div>

      <div className="vehicle-anchor">
        <div className="vehicle-glow" />
        <img src={getVehicleIcon()} alt="vehicle" className="vehicle-icon" />
      </div>
    </div>
  );
}