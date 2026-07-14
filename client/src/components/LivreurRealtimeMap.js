import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SideMenu from "../components/SideMenu.js";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import socket from "../socket";

// Icônes
import livreurIconImg from "../assets/livreur.png";
import destinationIconImg from "../assets/destination.png";
import pickupIconImg from "../assets/pickup.png";

const ICON_SIZE = [40, 40];
const ICON_ANCHOR = [20, 40];
const POPUP_ANCHOR = [0, -40];

const livreurIcon = new L.Icon({ iconUrl: livreurIconImg, iconSize: ICON_SIZE, iconAnchor: ICON_ANCHOR, popupAnchor: POPUP_ANCHOR });
const destinationIcon = new L.Icon({ iconUrl: destinationIconImg, iconSize: ICON_SIZE, iconAnchor: ICON_ANCHOR, popupAnchor: POPUP_ANCHOR });
const pickupIcon = new L.Icon({ iconUrl: pickupIconImg, iconSize: ICON_SIZE, iconAnchor: ICON_ANCHOR, popupAnchor: POPUP_ANCHOR });

// Centrage carte
function MapViewController({ center, zoom }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, zoom, { animate: true }); }, [center, zoom, map]);
  return null;
}

// Hook pour suivre le livreur
function useLivreurPosition() {
  const [livreurPos, setLivreurPos] = useState([5.3411, -4.0286]);
  const gpsWatcherRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    gpsWatcherRef.current = navigator.geolocation.watchPosition(
      (pos) => setLivreurPos([pos.coords.latitude, pos.coords.longitude]),
      console.error,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(gpsWatcherRef.current);
  }, []);

  return livreurPos;
}

// Hook pour calculer une route avec OSRM
function useRoute(livreurPos, destinationPos) {
  const [route, setRoute] = useState([]);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!livreurPos || !destinationPos) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < 5000) return; // Limite de requêtes

    fetch(`http://routing.openstreetmap.de/routed-car/route/v1/driving/${livreurPos[1]},${livreurPos[0]};${destinationPos[1]},${destinationPos[0]}?overview=full&geometries=geojson`)
      .then(res => res.json())
      .then(data => {
        if (data.routes && data.routes.length) {
          const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          setRoute(coords);
          lastUpdateRef.current = now;
        }
      }).catch(console.error);
  }, [livreurPos, destinationPos]);

  return route;
}

export default function LivreurHome() {
  const [userId, setUserId] = useState(null);
  const [status, setStatus] = useState("offline");
  const [orders, setOrders] = useState([]);
  const [currentDeliveries, setCurrentDeliveries] = useState([]); // Plusieurs livraisons
  const livreurPos = useLivreurPosition();

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => { if (user) setUserId(user.uid); });
    return () => unsubscribe();
  }, []);

  // Socket commandes
  useEffect(() => {
    if (!userId) return;
    socket.emit("joinLivreurRoom", userId);
    socket.on("orderAssigned", (data) => setCurrentDeliveries(prev => [...prev, data]));
    return () => socket.off("orderAssigned");
  }, [userId]);

  // Status toggle
  const toggleStatus = () => {
    const newStatus = status === "online" ? "offline" : "online";
    setStatus(newStatus);
    if (userId) updateDoc(doc(db, "livreurs", userId), { status: newStatus, lastSeen: serverTimestamp() });
  };

  return (
    <div className="livreur-home">
      <SideMenu />
      <div className="map-wrapper">
        <MapContainer center={livreurPos} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          <Marker position={livreurPos} icon={livreurIcon}>
            <Popup>📍 Votre position</Popup>
          </Marker>

          {/* Markers et routes pour chaque livraison */}
          {currentDeliveries.map((delivery) => {
            const destPos = [delivery.lat, delivery.lng];
            const route = useRoute(livreurPos, destPos); // recalcul automatique
            return (
              <div key={delivery.id}>
                <Marker position={destPos} icon={destinationIcon}>
                  <Popup>🎯 {delivery.address}</Popup>
                </Marker>
                {route.length > 0 && <Polyline positions={route} color="#FF5347" />}
              </div>
            );
          })}

          {/* Markers pour commandes disponibles */}
          {status === "online" && orders.filter(o => o.status === "pending" && o.lat && o.lng).map(o => (
            <Marker key={`pickup-${o.id}`} position={[o.lat, o.lng]} icon={pickupIcon}>
              <Popup>📦 {o.clientName}</Popup>
            </Marker>
          ))}

          <MapViewController center={livreurPos} zoom={14} />
        </MapContainer>

        <div className={`status-badge ${status}`}>{status === "online" ? "En ligne" : "Hors ligne"}</div>
        <button className="btn-status" onClick={toggleStatus}>{status === "online" ? "Passer hors ligne" : "Passer en ligne"}</button>
      </div>
    </div>
  );
}
