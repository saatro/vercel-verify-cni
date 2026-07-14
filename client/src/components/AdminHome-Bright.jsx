import {
  collection,
  doc,
  onSnapshot, query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Activity, ChevronDown, ChevronUp, Clock, Loader2, MapPin, Navigation, TrendingUp, Users, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { ToastContainer } from "react-toastify";
import { db } from "../firebase";

import clientCourseImg from "../assets/clientCourse.png";
import vtcMarkerImg from "../assets/courseDriverImg.png";
import driverMarkerImg from "../assets/marker-livreur.png";
import AdminBottomMenu from "../components/AdminBottomMenu";

// ✅ ICÔNES AVEC DESIGN LUMINEUX
const clientIcon = L.divIcon({
  html: `<div style="width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%); border-radius: 50%; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); border: 2px solid #6366f1;"><img src="${clientCourseImg}" style="width: 36px; height: 36px; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:32px;height:32px;background:#6366f1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;font-weight:900;\\'>📍</div>';" /></div>`,
  iconSize: [45, 45],
  iconAnchor: [22, 22],
  className: 'client-marker-icon'
});

const destinationIconAdmin = L.divIcon({
  html: `<div style="width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; animation: pulse-destination 2s ease-in-out infinite;"><div style="width: 35px; height: 35px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 15px rgba(16, 185, 129, 0.5); display: flex; align-items: center; justify-content: center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" style="transform: rotate(45deg)"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div></div>`,
  iconSize: [45, 45],
  iconAnchor: [22, 45],
  className: 'destination-marker-animated'
});

const getRotatedVehicleIcon = (vehicleType, rotation = 0) => {
  const iconUrl = vehicleType === "vtc" ? vtcMarkerImg : driverMarkerImg;
  const fallbackIcon = vehicleType === "vtc" ? "🚗" : "🏍️";
  const borderColor = vehicleType === "vtc" ? "#6366f1" : "#f97316";

  return L.divIcon({
    html: `
      <div style="
        width: 42px; 
        height: 42px; 
        transform: rotate(${rotation}deg); 
        transform-origin: center center; 
        transition: transform 0.3s ease-out; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        background: white; 
        border-radius: 50%; 
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); 
        border: 3px solid ${borderColor};
      ">
        <img 
          src="${iconUrl}" 
          style="width: 28px; height: 28px; object-fit: contain; display: block;" 
          onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;font-size:22px;&quot;>${fallbackIcon}</div>';" 
        />
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21],
    className: 'vehicle-marker-rotating'
  });
};

// ✅ FONCTION DE CALCUL DE DISTANCE (Haversine)
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance en kilomètres
};

const icons = {
  client: clientIcon,
  dest: destinationIconAdmin
};

function MissionRoute({ mission, livreurs }) {
  const [route, setRoute] = useState([]);
  const [animatedRoute, setAnimatedRoute] = useState([]);
  const livreur = livreurs.find(l => l.uid === mission.assignedLivreurId);

  useEffect(() => {
    if (!livreur?.lat) return;

    const fetchFullRoute = async () => {
      const isInTransit = mission.status === "in_transit";
      const pLivreur = `${livreur.lng},${livreur.lat}`;
      const pClient = `${mission.pickupLocation.lng},${mission.pickupLocation.lat}`;
      const pDest = `${mission.dropoffLocation.lng},${mission.dropoffLocation.lat}`;

      const points = isInTransit ? `${pLivreur};${pDest}` : `${pLivreur};${pClient};${pDest}`;

      try {
        const res = await fetch(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${points}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (data.routes?.[0]) {
          setRoute(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
        }
      } catch (e) { console.error("Admin Route Error:", e); }
    };

    fetchFullRoute();
  }, [livreur?.lat, livreur?.lng, mission.status, mission.pickupLocation, mission.dropoffLocation]);

  useEffect(() => {
    if (route.length === 0) {
      setAnimatedRoute([]);
      return;
    }

    let currentIndex = 0;
    const totalPoints = route.length;
    const animationDuration = 1500;
    const intervalTime = animationDuration / totalPoints;

    const interval = setInterval(() => {
      currentIndex++;
      setAnimatedRoute(route.slice(0, currentIndex));
      if (currentIndex >= totalPoints) clearInterval(interval);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [route]);

  if (animatedRoute.length === 0) return null;

  const stepColor = mission.status === "in_transit" ? "#10b981" : "#6366f1";

  return (
    <>
      <Polyline positions={animatedRoute} pathOptions={{ color: "#ffffff", weight: 11, opacity: 1, lineJoin: 'round', lineCap: 'round' }} />
      <Polyline positions={animatedRoute} pathOptions={{ color: stepColor, weight: 6, opacity: 1, lineJoin: 'round', lineCap: 'round' }} />
      <Polyline positions={animatedRoute} pathOptions={{ color: "#ffffff", weight: 2, opacity: 0.6, dashArray: "2, 10", lineJoin: 'round', lineCap: 'round' }} />
    </>
  );
}

function MapAutoController({ livreurs, missions }) {
  const map = useMap();

  useEffect(() => {
    const points = [];
    livreurs.forEach(l => l.lat && points.push([l.lat, l.lng]));
    missions.forEach(m => {
      points.push([m.pickupLocation.lat, m.pickupLocation.lng]);
      points.push([m.dropoffLocation.lat, m.dropoffLocation.lng]);
    });
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [80, 80], animate: true });
    }
  }, [livreurs, missions, map]);

  return null;
}

export default function AdminHome() {
  const [coursesAttente, setCoursesAttente] = useState([]);
  const [livraisonsActives, setLivraisonsActives] = useState([]);
  const [livreursDispos, setLivreursDispos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignmentLog, setAssignmentLog] = useState([]);
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);

  useEffect(() => {
    // ✅ FORCER LA LECTURE DEPUIS LE SERVEUR (pas de cache)
    const unsubL = onSnapshot(
      query(collection(db, "users"), where("role", "==", "livreur")),
      {
        includeMetadataChanges: false // Désactiver les changements locaux
      },
      (snap) => {
        const livreurs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        console.log("📍 Livreurs récupérés (DIRECT SERVEUR):", livreurs.map(l => ({
          nom: l.nom,
          online: l.isOnline,
          onlineType: typeof l.isOnline,
          lat: l.lat,
          lng: l.lng,
          type: l.typeVehicule
        })));
        setLivreursDispos(livreurs);
      }
    );

    const unsubC = onSnapshot(
      collection(db, "courses"),
      {
        includeMetadataChanges: false // Désactiver les changements locaux
      },
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log("📦 Courses récupérées (DIRECT SERVEUR):", all.length);
        setCoursesAttente(all.filter(c => c.status === "pending"));
        setLivraisonsActives(all.filter(c => ["assigned", "accepted", "arrived_at_pickup", "in_transit"].includes(c.status)));

        const revenue = all
          .filter(c => ["assigned", "accepted", "arrived_at_pickup", "in_transit", "completed"].includes(c.status))
          .reduce((sum, c) => sum + (c.price || 0), 0);
        setTotalRevenue(revenue);

        setLoading(false);
      }
    );

    return () => {
      unsubL();
      unsubC();
    };
  }, []);

  const assignerCourse = useCallback(async (course, livreur, reason = "") => {
    try {
      await updateDoc(doc(db, "courses", course.id), {
        status: "assigned",
        assignedLivreurId: livreur.uid,
        assignedLivreurName: livreur.nom || "Livreur",
        assignedLivreurPhone: livreur.telephone || "",
        assignedAt: serverTimestamp(),
        assignmentReason: reason // Raison de l'assignation pour debug
      });

      const logMessage = `${new Date().toLocaleTimeString()} : ${livreur.nom} → ${course.destination} (${reason})`;
      setAssignmentLog(prev => [logMessage, ...prev].slice(0, 8));

      console.log(`✅ Assignation: ${logMessage}`);
    } catch (e) {
      console.error("Erreur assignation:", e);
    }
  }, []);

  // ✅ ALGORITHME D'ASSIGNATION INTELLIGENT AVEC PRIORITÉS
  useEffect(() => {
    if (coursesAttente.length === 0 || livreursDispos.length === 0) return;

    console.log("🔍 Début analyse assignations");
    console.log(`📋 Courses en attente: ${coursesAttente.length}`);
    console.log(`👥 Livreurs disponibles: ${livreursDispos.length}`);
    console.log(`👥 Livreurs EN LIGNE: ${livreursDispos.filter(l => l.isOnline === true).length}`);
    console.log(`👥 Livreurs HORS LIGNE: ${livreursDispos.filter(l => l.isOnline !== true).length}`);

    coursesAttente.forEach(course => {
      console.log(`\n📦 Course: ${course.destination}`);
      console.log(`   Type demandé: "${course.vehicleType}" (type JS: ${typeof course.vehicleType})`);
      console.log(`   Type normalisé: "${(course.vehicleType || "moto").toLowerCase().trim()}"`);

      // 1️⃣ Filtrer les livreurs disponibles et compatibles
      const livreursCompatibles = livreursDispos.filter(l => {
        const isOnline = l.isOnline === true; // ✅ Vérification stricte
        const hasGPS = l.lat && l.lng;
        const isNotBusy = !livraisonsActives.some(m => m.assignedLivreurId === l.uid);

        // ✅ CORRECTION: Normaliser les types de véhicules pour comparaison
        const courseType = (course.vehicleType || "moto").toLowerCase().trim();
        const livreurType = (l.typeVehicule || "moto").toLowerCase().trim();
        const isCompatibleType = courseType === livreurType;

        console.log(`   👤 ${l.nom}:`);
        console.log(`      - isOnline: ${isOnline} (raw: ${l.isOnline}, type: ${typeof l.isOnline})`);
        console.log(`      - GPS: ${hasGPS}`);
        console.log(`      - busy: ${!isNotBusy}`);
        console.log(`      - typeVehicule: "${l.typeVehicule}" → normalisé: "${livreurType}"`);
        console.log(`      - courseType: "${courseType}"`);
        console.log(`      - COMPATIBLE: ${isCompatibleType} (${courseType} === ${livreurType})`);

        // ✅ STOP IMMÉDIAT si pas en ligne
        if (isOnline !== true) {
          console.log(`      ⛔ IGNORÉ: hors ligne`);
          return false;
        }

        if (!isCompatibleType) {
          console.log(`      ⛔ IGNORÉ: type incompatible (demandé: ${courseType}, livreur: ${livreurType})`);
          return false;
        }

        return hasGPS && isNotBusy;
      });

      console.log(`   ✅ Livreurs compatibles (EN LIGNE + GPS + DISPONIBLES) trouvés: ${livreursCompatibles.length}`);

      if (livreursCompatibles.length === 0) {
        console.log(`   ❌ Aucun livreur ${course.vehicleType} EN LIGNE et disponible pour ${course.destination}`);
        return;
      }

      // 2️⃣ Calculer les scores de priorité pour chaque livreur
      const commission = (course.price || 0) * 0.10; // 10% de la course

      const livreursAvecScore = livreursCompatibles.map(livreur => {
        const soldeCash = livreur.solde || 0;
        const soldeBonus = livreur.soldeJetons || 0;
        const soldeTotal = soldeCash + soldeBonus;

        // Calculer la distance entre le livreur et le point de départ
        const distance = getDistance(
          livreur.lat,
          livreur.lng,
          course.pickupLocation.lat,
          course.pickupLocation.lng
        );

        // ✅ SYSTÈME DE SCORING PAR PRIORITÉS
        let score = 0;
        let raison = [];

        // PRIORITÉ 1: Distance (PRIORITÉ ABSOLUE - plus proche = mieux)
        // Distance max considérée: 10km -> Score de 0 à 1000 points
        const distanceScore = Math.max(0, 1000 - (distance * 100));
        score += distanceScore;
        raison.push(`📍 ${distance.toFixed(1)}km`);

        // PRIORITÉ 2: Livreur avec CASH (poids: 800 points)
        if (soldeCash > 0) {
          score += 800;
          raison.push("💰 Cash disponible");

          // SOUS-PRIORITÉ: Cash faible = ultra prioritaire (poids: +400)
          if (soldeCash < commission) {
            score += 400;
            raison.push(`🔴 Solde bas (${soldeCash}F < ${commission.toFixed(0)}F)`);
          }
        }
        // Livreur avec BONUS SEULEMENT (poids: 400 points)
        else if (soldeBonus > 0) {
          score += 400;
          raison.push("🎁 Bonus uniquement");
        }

        // PRIORITÉ 3: Solde total faible (besoin urgent)
        if (soldeTotal < 5000) {
          score += 200;
          raison.push("⚠️ Besoin urgent");
        }

        return {
          livreur,
          score,
          distance: distance.toFixed(1),
          soldeCash,
          soldeBonus,
          raison: raison.join(" | ")
        };
      });

      // 3️⃣ Trier par score décroissant (meilleur score en premier)
      livreursAvecScore.sort((a, b) => b.score - a.score);

      // 4️⃣ Sélectionner le meilleur livreur
      const meilleur = livreursAvecScore[0];

      console.log(`
   🎯 Assignation pour ${course.destination} (${course.price}F):
      Livreurs évalués: ${livreursAvecScore.length}
      
      🥇 Meilleur choix: ${meilleur.livreur.nom}
         Score: ${meilleur.score}
         Cash: ${meilleur.soldeCash}F | Bonus: ${meilleur.soldeBonus}J
         Distance: ${meilleur.distance}km
         Raison: ${meilleur.raison}
      
      📊 Classement complet:
   ${livreursAvecScore.map((l, i) =>
        `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '} ${l.livreur.nom}: ${l.score}pts (${l.distance}km, ${l.soldeCash}F)`
      ).join('\n   ')}
      `);

      // 5️⃣ Assigner au meilleur livreur
      assignerCourse(course, meilleur.livreur, meilleur.raison);
    });
  }, [coursesAttente, livraisonsActives, livreursDispos, assignerCourse]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#1e40af'
      }}>
        <Loader2 className="mb-4 text-indigo-600 animate-spin" size={50} />
        <p style={{
          fontStyle: 'italic',
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: '#3b82f6'
        }}>
          Initialisation Dashboard...
        </p>
      </div>
    );
  }

  const livreursActifs = livreursDispos.filter(l => l.isOnline).length;
  const livreursOccupes = livraisonsActives.filter((v, i, a) =>
    a.findIndex(t => t.assignedLivreurId === v.assignedLivreurId) === i
  ).length;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc'
    }}>
      <ToastContainer theme="light" />

      <div style={{
        flex: 1,
        position: 'relative',
        minHeight: 0
      }}>
        <MapContainer
          center={[5.348, -4.03]}
          zoom={15}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapAutoController livreurs={livreursDispos} missions={livraisonsActives} />

          {livreursDispos
            .filter(l => l.isOnline === true) // ✅ Afficher uniquement les livreurs EN LIGNE
            .map(l => {
              // ✅ Vérifications détaillées
              if (!l.lat || !l.lng) {
                console.warn(`⚠️ Livreur ${l.nom} sans GPS: lat=${l.lat}, lng=${l.lng}`);
                return null;
              }

              if (typeof l.lat !== 'number' || typeof l.lng !== 'number') {
                console.warn(`⚠️ Livreur ${l.nom} GPS invalide: lat=${typeof l.lat}, lng=${typeof l.lng}`);
                return null;
              }

              console.log(`✅ Affichage livreur EN LIGNE: ${l.nom} à [${l.lat}, ${l.lng}], type: ${l.typeVehicule}`);

              return (
                <Marker
                  key={l.uid}
                  position={[l.lat, l.lng]}
                  icon={getRotatedVehicleIcon(l.typeVehicule || "moto", 0)}
                  eventHandlers={{
                    click: () => {
                      console.log(`🖱️ Clic sur livreur: ${l.nom}`);
                      setSelectedLivreur(l);
                    }
                  }}
                />
              );
            })}

          {livraisonsActives.map(m => (
            <React.Fragment key={m.id}>
              <MissionRoute mission={m} livreurs={livreursDispos} />
              <Marker position={[m.pickupLocation.lat, m.pickupLocation.lng]} icon={icons.client} />
              <Marker position={[m.dropoffLocation.lat, m.dropoffLocation.lng]} icon={icons.dest} />
            </React.Fragment>
          ))}
        </MapContainer>

        {selectedLivreur && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.98)',
            color: '#1e293b',
            padding: '20px',
            borderRadius: '24px',
            zIndex: 1000,
            border: '2px solid #e0e7ff',
            boxShadow: '0 20px 40px rgba(99, 102, 241, 0.15)',
            backdropFilter: 'blur(20px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#6366f1', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
                  {selectedLivreur.nom}
                </p>
                <p style={{ fontSize: '14px', fontStyle: 'italic', fontWeight: 900, textTransform: 'uppercase', marginBottom: '10px', color: '#0f172a' }}>
                  {livraisonsActives.find(m => m.assignedLivreurId === selectedLivreur.uid)?.destination || "En attente de mission"}
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', padding: '8px 12px', borderRadius: '12px', border: '1px solid #93c5fd' }}>
                    <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#1e40af', display: 'block', marginBottom: '2px' }}>Type</span>
                    <p style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', margin: 0, color: '#1e3a8a' }}>{selectedLivreur.typeVehicule}</p>
                  </div>
                  <div style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', padding: '8px 12px', borderRadius: '12px', border: '1px solid #93c5fd' }}>
                    <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#1e40af', display: 'block', marginBottom: '2px' }}>Tél</span>
                    <p style={{ fontSize: '12px', fontWeight: 900, margin: 0, color: '#1e3a8a' }}>{selectedLivreur.telephone}</p>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedLivreur(null)} style={{ padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '12px', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}>
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', background: 'white', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', boxShadow: '0 -4px 30px rgba(99, 102, 241, 0.1)', maxHeight: isPanelExpanded ? '70vh' : '45vh', transition: 'max-height 0.3s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '20px' }}>
          <div onClick={() => setIsPanelExpanded(!isPanelExpanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={22} style={{ color: '#e0e7ff' }} />
              <h1 style={{ fontSize: '19px', fontWeight: 900, textTransform: 'uppercase', fontStyle: 'italic', margin: 0 }}>
                Fleet <span style={{ color: '#e0e7ff' }}>Manager</span>
              </h1>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.95)' }}>
              {isPanelExpanded ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.25)', padding: '12px', borderRadius: '16px', textAlign: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}><Users size={14} color="white" /></div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'white' }}>{livreursActifs}</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700, color: 'white' }}>EN LIGNE</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.25)', padding: '12px', borderRadius: '16px', textAlign: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}><Navigation size={14} color="white" /></div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'white' }}>{livreursOccupes}/{livraisonsActives.length}</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700, color: 'white' }}>ACTIFS</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.25)', padding: '12px', borderRadius: '16px', textAlign: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}><TrendingUp size={14} color="white" /></div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'white' }}>{(totalRevenue / 1000).toFixed(0)}K</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700, color: 'white' }}>REVENUE</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#f8fafc' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '2px solid #fef3c7', boxShadow: '0 4px 20px rgba(251, 191, 36, 0.1)' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', background: '#f59e0b', borderRadius: '50%', animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
              Files d'attente ({coursesAttente.length})
            </h3>
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {coursesAttente.length === 0 && <p style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '30px 0' }}>Aucune course en attente</p>}
              {coursesAttente.map(c => (
                <div key={c.id} style={{ padding: '14px', border: '2px solid #fef3c7', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', borderRadius: '16px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 900, marginBottom: '6px' }}>
                    <span style={{ color: '#f59e0b', textTransform: 'uppercase', fontStyle: 'italic' }}>{c.vehicleType}</span>
                    <span style={{ color: '#92400e' }}>{c.price} F</span>
                  </div>
                  <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#78716c', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={10} style={{ color: '#f59e0b' }} /> {c.destination}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', padding: '20px', borderRadius: '24px', border: '2px solid #c4b5fd', boxShadow: '0 4px 20px rgba(139, 92, 246, 0.1)' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#7c3aed', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={13} style={{ color: '#7c3aed' }} /> Log d'activité
            </h3>
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {assignmentLog.length === 0 && <p style={{ fontSize: '11px', color: '#7c3aed', opacity: 0.5, textAlign: 'center', padding: '30px 0', fontStyle: 'italic' }}>Aucun mouvement récent</p>}
              {assignmentLog.map((log, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'start', gap: '10px', marginBottom: '10px', background: 'rgba(255,255,255,0.7)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <div style={{ width: '4px', height: '100%', minHeight: '28px', borderRadius: '4px', background: '#8b5cf6' }}></div>
                  <p style={{ fontSize: '10px', fontFamily: 'monospace', color: '#5b21b6', lineHeight: '1.5', margin: 0, flex: 1, fontWeight: 600 }}>{log}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <AdminBottomMenu />
    </div>
  );
}