import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import "./TaxiMeter.css";

export default function TaxiMeter({ missionId, userRole, currentDistance: propDistance }) {
  const [meterValue, setMeterValue] = useState(400);
  const [isRunning, setIsRunning] = useState(false);
  const [currentDistance, setCurrentDistance] = useState(0);
  const lastPosition = useRef(null);
  
  // ✅ TARIFS MODIFIABLES
  const RATE_PER_KM = 120;      // 120F par km
  const BASE_FARE = 400;        // 400F prise en charge

  // ✅ Calcul de distance entre 2 points GPS (formule de Haversine)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ✅ 1. ÉCOUTE DES CHANGEMENTS FIREBASE (pour chauffeur ET client)
  useEffect(() => {
    if (!missionId) return;

    const unsubscribe = onSnapshot(doc(db, "courses", missionId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsRunning(data.status === "in_transit");

        // Synchroniser les valeurs depuis Firebase
        if (data.meterValue !== undefined) {
          setMeterValue(data.meterValue);
        }

        if (data.currentDistance !== undefined) {
          setCurrentDistance(data.currentDistance);
        }
      }
    });

    return () => unsubscribe();
  }, [missionId]);

  // ✅ 2. MISE À JOUR GPS EN TEMPS RÉEL (UNIQUEMENT POUR LE CHAUFFEUR)
  useEffect(() => {
    // Ne s'exécute que pour le chauffeur ET quand la course est en transit
    if (!missionId || !isRunning || userRole !== "livreur") return;

    console.log("🚖 Compteur démarré - Mode chauffeur");

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        if (lastPosition.current) {
          // Calculer la distance parcourue depuis la dernière position
          const distanceTraveled = calculateDistance(
            lastPosition.current.lat,
            lastPosition.current.lng,
            latitude,
            longitude
          );

          // ✅ Mise à jour tous les 10 mètres minimum (évite trop de writes Firebase)
          if (distanceTraveled >= 0.01) {
            const newDistance = currentDistance + distanceTraveled;
            const newValue = BASE_FARE + Math.round(newDistance * RATE_PER_KM);

            console.log("📊 Compteur mis à jour:", {
              distanceParcourue: distanceTraveled.toFixed(3),
              distanceTotale: newDistance.toFixed(3),
              nouveauPrix: newValue
            });

            try {
              await updateDoc(doc(db, "courses", missionId), {
                meterValue: newValue,
                currentDistance: parseFloat(newDistance.toFixed(3)),
                lastMeterUpdate: new Date().toISOString()
              });

              // Mettre à jour la position de référence
              lastPosition.current = { lat: latitude, lng: longitude };
            } catch (error) {
              console.error("❌ Erreur mise à jour compteur:", error);
            }
          }
        } else {
          // Première position - initialiser
          lastPosition.current = { lat: latitude, lng: longitude };
        }
      },
      (error) => {
        console.error("❌ Erreur GPS:", error);
      },
      {
        enableHighAccuracy: true,  // GPS haute précision
        maximumAge: 1000,          // Max 1 seconde de cache
        timeout: 5000              // Timeout 5 secondes
      }
    );

    return () => {
      console.log("🛑 Compteur arrêté");
      navigator.geolocation.clearWatch(watchId);
      lastPosition.current = null;
    };
  }, [missionId, isRunning, currentDistance, userRole]);

  // ✅ FONCTION HELPER POUR FORMATER LA DISTANCE
  const formatDistance = () => {
    // Utiliser propDistance si disponible, sinon currentDistance
    const distance = propDistance || currentDistance;
    
    // Convertir en nombre et gérer les cas invalides
    const numDistance = parseFloat(distance);
    
    // Si ce n'est pas un nombre valide, retourner 0.00
    if (isNaN(numDistance)) {
      return "0.00";
    }
    
    // Retourner le nombre formaté avec 2 décimales
    return numDistance.toFixed(2);
  };

  return (
    <div className={`taxi-meter-modern ${isRunning ? 'running' : 'standby'}`}>
      <div className="meter-compact">
        {/* Icône */}
        <div className="meter-icon">
          <Gauge 
            size={20} 
            className={isRunning ? "text-blue-500" : "text-slate-400"} 
          />
        </div>

        {/* Valeur du compteur */}
        <div className="meter-value-compact">
          <span className="value-number">{meterValue.toLocaleString()}</span>
          <span className="value-currency">F</span>
        </div>

        {/* Distance */}
        <div className="meter-distance-compact">
          {formatDistance()} km
        </div>
      </div>
    </div>
  );
}