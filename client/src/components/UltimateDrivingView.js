import { useEffect, useState } from 'react';
import { MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import './UltimateDrivingView.css';

// --- ASSETS ---
import vtcEcoImg from "../assets/courseDriverImg.png";
import moto3dImg from "../assets/marker-livreur.png";
import carSuvImg from "../assets/suvDriver.png";
import taxiEcoImg from "../assets/taxiDriver.png";
import taxiSuvImg from "../assets/taxiSuvDriver.png";
import taxiConfortImg from "../assets/taxi-confort.png";

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
      let param = Math.max(0, Math.min(1, lenSq !== 0 ? dot / lenSq : 0));
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
        container.style.transition = "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
        container.style.transformOrigin = '50% 50%';
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

// ====================== HELPERS ======================
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
    if (param < 0) { projLat = p1[0]; projLon = p1[1]; }
    else if (param > 1) { projLat = p2[0]; projLon = p2[1]; }
    else { projLat = p1[0] + param * C; projLon = p1[1] + param * D; }

    const dist = getDistance(vehiclePos[0], vehiclePos[1], projLat, projLon);
    if (dist < minDist) { 
      minDist = dist; 
      closestIndex = i; 
    }
  }
  return { p1: route[closestIndex], p2: route[closestIndex + 1], distance: minDist };
}

function calculateBearing(p1, p2) {
  const dLat = p2[0] - p1[0];
  const dLon = p2[1] - p1[1];
  return Math.atan2(dLon, dLat) * (180 / Math.PI);
}

// ====================== MAIN COMPONENT ======================
export default function UltimateDrivingView({
  vehiclePosition,
  route,
  remainingDistance,
  estimatedTime,
  vehicleType,
  courseMode
}) {
  const [manualOffset, setManualOffset] = useState(0);

  const getVehicleIcon = () => {
    const type = (vehicleType || "").toLowerCase().trim();
    const mode = (courseMode || "").toLowerCase().trim();

    console.log("🚗 UltimateDrivingView → Type:", type, "| Mode:", mode); // Debug

    if (type.includes("moto")) return moto3dImg;
    if (type.includes("taxi")) {
      if (mode.includes("suv")) return taxiSuvImg;
      if (mode.includes("confort")) return taxiConfortImg;
      return taxiEcoImg;
    }
    if (type.includes("vtc") || type.includes("car")) {
      if (mode.includes("suv")) return carSuvImg;
      return vtcEcoImg;
    }
    return vtcEcoImg; // fallback
  };

  return (
    <div className="driving-view-container">
      <div className="hud-top">
        <div className="hud-direction-icon">↑</div>
        <div className="hud-info">
          <div className="hud-instruction">Navigation active</div>
          <div className="hud-metrics">
            {parseFloat(remainingDistance || 0).toFixed(1)} km • {Math.ceil(estimatedTime || 0)} min
          </div>
        </div>
      </div>

      <div className="calibration-panel">
        <button onClick={() => setManualOffset(prev => prev - 15)} className="btn-calibrate">↺</button>
        <div className="angle-label">{manualOffset}°</div>
        <button onClick={() => setManualOffset(prev => prev + 15)} className="btn-calibrate">↻</button>
        <button onClick={() => setManualOffset(0)} className="btn-calibrate reset">⟲</button>
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
              <Polyline positions={route} pathOptions={{ color: '#00ccff', weight: 18, opacity: 0.3 }} />
              <Polyline positions={route} pathOptions={{ color: '#ffffff', weight: 12, opacity: 1 }} />
              <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 7, opacity: 1 }} />
            </>
          )}
        </MapContainer>
      </div>

      <div className="vehicle-anchor">
        <div className="vehicle-glow"></div>
        <img src={getVehicleIcon()} alt="vehicle" className="vehicle-icon" />
      </div>
    </div>
  );
}