/* eslint-disable no-unused-vars */
import {
  arrayUnion, collection, doc,
  onSnapshot, query, serverTimestamp,
  updateDoc, where, addDoc,
} from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Loader2, ShieldCheck, Zap,
  CheckCircle2, AlertCircle, Bike, Globe, QrCode
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer, Marker, TileLayer, useMap, Popup } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db } from "../firebase";

import courseMapIcon    from "../assets/courseDriverImg.png";
import ecoMapIcon       from "../assets/ecoDriver.png";
import livreurMapIcon   from "../assets/marker-livreur.png";
import suvMapIcon       from "../assets/suvDriver.png";
import taxiConfortMapIcon from "../assets/taxiConfortDriver.png";
import taxiMapIcon      from "../assets/taxiDriver.png";
import taxiSuvMapIcon   from "../assets/taxiSuvDriver.png";
import AdminBottomMenu  from "../components/AdminBottomMenu";

// ── Icônes personnalisées Leaflet ─────────────────────────────────────────────
const getVehicleIcon = (livreur) => {
  const type   = (livreur?.typeVehicule || "").toLowerCase().trim();
  const mode   = (livreur?.modeVtc     || "").toLowerCase().trim();
  const isExterne = livreur?.role === "livreur-externe";
  let iconSrc = taxiMapIcon, color = "#fbbf24";

  if (type === "moto" || mode.includes("moto") || (isExterne && !type && !mode)) {
    iconSrc = livreurMapIcon;
    color   = isExterne ? "#10b981" : "#f97316";
  } else if (type === "vtc" || mode.includes("vtc") || mode.includes("saloni") || mode.includes("antara")) {
    color   = isExterne ? "#059669" : "#6366f1";
    iconSrc = mode.includes("suv") ? suvMapIcon : mode.includes("confort") ? taxiConfortMapIcon : ecoMapIcon;
  } else if (type === "taxi") {
    color   = "#fbbf24";
    iconSrc = mode.includes("suv") ? taxiSuvMapIcon : mode.includes("confort") ? taxiConfortMapIcon : taxiMapIcon;
  }

  return L.divIcon({
    html: `<div style="background:white;border:3px solid ${color};width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,.15)"><img src="${iconSrc}" style="width:24px;height:24px;object-fit:contain"/></div>`,
    iconSize: [38, 38], iconAnchor: [19, 19], className: "mambo-marker-icon",
  });
};

const coursiersIcon = L.divIcon({
  html: `<div style="background:#6366f1;border:3px solid white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(99,102,241,.4);font-size:18px">🛒</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18],
});

const boutiqueIcon = L.divIcon({
  html: `<div style="background:#ec4899;border:3px solid white;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(236,72,153,.4);font-size:16px">🏪</div>`,
  iconSize: [34, 34], iconAnchor: [17, 17],
});

const getDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function MapAutoController({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points?.length >= 1) {
      try { map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 14, animate: true }); } catch {}
    }
  }, [points, map]);
  return null;
}

const STATUS_META = {
  pending:              { label: "En attente",          color: "bg-amber-50 text-amber-600 border-amber-200" },
  offering:             { label: "Offre envoyée",        color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  en_attente_admin:     { label: "Att. Admin",           color: "bg-orange-50 text-orange-600 border-orange-200" },
  attente_livreur:      { label: "Att. Livreur",         color: "bg-sky-50 text-sky-600 border-sky-200" },
  paye_ia_valide:       { label: "Payée·sans coursier",  color: "bg-rose-50 text-rose-600 border-rose-200" },
  en_attente_coursier:  { label: "Att. Coursier",        color: "bg-violet-50 text-violet-600 border-violet-200" },
  en_preparation:       { label: "Coursier en course",   color: "bg-violet-50 text-violet-600 border-violet-200" },
  achats_termines:      { label: "Att. livreur moto",    color: "bg-green-50 text-green-600 border-green-200" },
};

// ── Composant Principal ────────────────────────────────────────────────────────
export default function AdminHome() {
  const [allCourses, setAllCourses]               = useState([]);
  const [marketOrders, setMarketOrders]           = useState([]);
  const [supermarcheOrders, setSupermarcheOrders] = useState([]);
  const [livreursRaw, setLivreursRaw]             = useState([]);
  const [coursiersRaw, setCoursiersRaw]           = useState([]);
  const [loading, setLoading]                     = useState(true);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true);
  const [engineCycles, setEngineCycles]           = useState(0);
  const [activePanel, setActivePanel]             = useState("flux");

  const processingRefs = useRef(new Set());
  const navigate = useNavigate();

  const sendPush = useCallback(async (uid, title, body, data = {}) => {
    try {
      await addDoc(collection(db, "notifications_queue"), {
        toUserId: uid, title, body,
        data: { ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" },
        status: "pending",
        createdAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("role", "in", ["livreur", "coursier", "livreur-externe"])),
      (s) => {
        const allStaff = s.docs.map(d => ({ uid: d.id, ...d.data() }));
        setLivreursRaw(allStaff.filter(u => u.role === "livreur" || u.role === "livreur-externe"));
        setCoursiersRaw(allStaff.filter(u => u.role === "coursier"));
      }
    );

    const unsubC = onSnapshot(collection(db, "courses"),
      (s) => setAllCourses(s.docs.map(d => ({ id: d.id, typeTask: "vtc", ...d.data() }))));

    const unsubO = onSnapshot(
      query(collection(db, "orders"), where("status", "in", ["en_attente_admin", "attente_livreur"])),
      (s) => {
        setMarketOrders(s.docs.map(d => ({ id: d.id, typeTask: "market", ...d.data() })).filter(o => o.type !== "supermarche"));
        setLoading(false);
      }
    );

    const unsubS = onSnapshot(
      query(collection(db, "orders"), 
        where("type", "==", "supermarche"),
        where("status", "in", ["paye_ia_valide","en_attente_coursier","en_preparation","achats_termines"])
      ),
      (s) => setSupermarcheOrders(s.docs.map(d => ({ id: d.id, typeTask: "supermarche", ...d.data() })))
    );

    return () => { unsubUsers(); unsubC(); unsubO(); unsubS(); };
  }, []);

  // Livreurs en ligne filtrés
  const livreursOnline = useMemo(() =>
    livreursRaw.filter(l => {
      const online = l.isOnline === true || l.status === "online";
      const lat    = l.lat ?? l.latitude;
      const lng    = l.lng ?? l.longitude;
      return online && lat != null && lng != null;
    }).map(l => ({ ...l, lat: l.lat ?? l.latitude, lng: l.lng ?? l.longitude })),
  [livreursRaw]);

  // Coursiers connectés filtrés
  const coursiersOnline = useMemo(() =>
    coursiersRaw.filter(c => {
      const active = c.isActive === true || c.status === "actif" || c.isOnline === true;
      const lat    = c.geoloc?.lat ?? c.lat ?? c.latitude;
      const lng    = c.geoloc?.lng ?? c.lng ?? c.longitude;
      return active && lat != null && lng != null;
    }).map(c => ({ ...c, lat: c.geoloc?.lat ?? c.lat ?? c.latitude, lng: c.geoloc?.lng ?? c.lng ?? c.longitude })),
  [coursiersRaw]);

 // Récupération des points géographiques des boutiques à cartographier
  const boutiquePoints = useMemo(() => {
    const list = [];
    [...marketOrders, ...supermarcheOrders].forEach(o => {
      const lat = o.pickupLat ?? o.pickupLocation?.lat;
      const lng = o.pickupLng ?? o.pickupLocation?.lng;
      if (lat != null && lng != null) {
        list.push({ id: o.id, lat, lng, nom: o.nomBoutique || o.nom || "Boutique Partenaire", orderId: o.orderId || o.id });
      }
    });
    return list;
  }, [marketOrders, supermarcheOrders]);

  const countAbidjan = useMemo(() => livreursOnline.filter(l => l.role === "livreur").length, [livreursOnline]);
  const countExterne  = useMemo(() => livreursOnline.filter(l => l.role === "livreur-externe").length, [livreursOnline]);

  useEffect(() => {
    if (!autoAssignEnabled || loading) return;

    const findVTC = async (course) => {
      processingRefs.current.add(course.id);
      try {
        const rejected   = course.rejectedBy || [];
        const isExterne  = course.isExterneZone === true || course.zone?.toLowerCase() !== "abidjan";
        
        const candidates = livreursOnline.filter(d => {
          const matchRole  = isExterne ? d.role === "livreur-externe" : d.role === "livreur";
          const matchVeh   = d.typeVehicule?.toLowerCase() === course.vehicleType?.toLowerCase() || 
                             d.modeVtc?.toLowerCase() === course.vehicleType?.toLowerCase();
          const matchAvail = d.isAvailable === true;
          return matchRole && matchVeh && matchAvail && !rejected.includes(d.uid);
        });

        if (!candidates.length) return;

        const pLat = course.pickupLocation?.lat ?? course.pickupLat;
        const pLng = course.pickupLocation?.lng ?? course.pickupLng;
        const best = candidates.map(d => ({ ...d, dist: getDistance(d.lat, d.lng, pLat, pLng) })).sort((a, b) => a.dist - b.dist)[0];

        await updateDoc(doc(db, "courses", course.id), { 
          status: "offering", 
          assignedLivreurId: best.uid, 
          assignedLivreurName: best.nom ?? best.nomComplet, 
          offerTimestamp: serverTimestamp() 
        });

        await sendPush(best.uid, 
          isExterne ? "🟢 Nouvelle Course Externe !" : "🚖 Nouvelle Course VTC !", 
          `Course à ${best.dist.toFixed(1)} km.`, 
          { courseId: course.id }
        );
      } catch (e) { console.error(e); } 
      finally { processingRefs.current.delete(course.id); }
    };

    const assignMoto = async (order) => {
      processingRefs.current.add(order.id);
      try {
        const isExterne = order.isExterneZone === true || order.zone?.toLowerCase() !== "abidjan";
        
        const motos = livreursOnline.filter(d => {
          const matchRole = isExterne ? d.role === "livreur-externe" : d.role === "livreur";
          const isMoto    = d.typeVehicule?.toLowerCase().includes("moto") || 
                            d.modeVtc?.toLowerCase().includes("moto") || 
                            (d.role === "livreur-externe" && !d.typeVehicule);
          return matchRole && isMoto && d.isAvailable === true;
        });

        if (!motos.length) return;

        const best = motos.map(d => ({ 
          ...d, 
          dist: getDistance(d.lat, d.lng, order.pickupLat ?? 5.348, order.pickupLng ?? -4.03) 
        })).sort((a, b) => a.dist - b.dist)[0];

        await updateDoc(doc(db, "orders", order.id), { 
          status: order.typeTask === "supermarche" ? "en_preparation" : "attente_livreur", 
          assignedLivreurId: best.uid, 
          assignedLivreurName: best.nom ?? best.nomComplet, 
          assignedLivreurPhone: best.telephone, 
          assignedAt: serverTimestamp() 
        });

        await sendPush(best.uid, "📦 Livraison Mambo !", `Commande #${order.id.slice(-5)}.`, { orderId: order.id });
      } catch (e) { console.error(e); } 
      finally { processingRefs.current.delete(order.id); }
    };

    const cycle = async () => {
      const now = Date.now();
      for (const c of allCourses) {
        if (processingRefs.current.has(c.id)) continue;
        if (c.status === "pending") await findVTC(c);
        if (c.status === "offering" && c.offerTimestamp) {
          const t = c.offerTimestamp?.toMillis?.() ?? 0;
          if (t > 0 && now - t > 55_000) {
            await updateDoc(doc(db, "courses", c.id), { 
              status: "pending", 
              assignedLivreurId: null, 
              rejectedBy: arrayUnion(c.assignedLivreurId) 
            });
          }
        }
      }

      for (const o of marketOrders) {
        if (!processingRefs.current.has(o.id) && !o.assignedLivreurId) await assignMoto(o);
      }

      for (const o of supermarcheOrders) {
        if (processingRefs.current.has(o.id)) continue;
        if ((o.status === "paye_ia_valide" || o.status === "en_attente_coursier") && !o.coursierId) {
          coursiersOnline.slice(0,5).forEach(c => 
            sendPush(c.uid, "🛒 Nouveau panier !", "Un panier supermarché est disponible.")
          );
        }
        if (o.status === "achats_termines" && !o.assignedLivreurId) await assignMoto(o);
      }

      setEngineCycles(n => n + 1);
    };

    const iv = setInterval(cycle, 5000);
    return () => clearInterval(iv);
  }, [allCourses, marketOrders, supermarcheOrders, livreursOnline, coursiersOnline, autoAssignEnabled, loading, sendPush]);

  const handleVerifyCoursier = useCallback(async (uid, verify) => {
    try {
      await updateDoc(doc(db, "users", uid), { 
        isVerified: verify, 
        status: verify ? "actif" : "refusé", 
        updatedAt: serverTimestamp() 
      });
      toast.success(verify ? "✓ Coursier activé" : "Accès révoqué");
    } catch { toast.error("Erreur"); }
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950">
      <Loader2 className="text-indigo-500 animate-spin" size={40} />
      <span className="mt-4 text-[10px] text-white/40 tracking-[5px] font-black uppercase">Mambo Engine...</span>
    </div>
  );

  const activeTasks = [
    ...allCourses.filter(t => ["pending","offering"].includes(t.status)),
    ...marketOrders,
    ...supermarcheOrders,
  ];

  const allMapPoints = [
    ...livreursOnline.map(l => [l.lat, l.lng]),
    ...coursiersOnline.map(c => [c.lat, c.lng]),
    ...boutiquePoints.map(b => [b.lat, b.lng]),
  ];

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-slate-100">
      <ToastContainer position="top-center" theme="dark" hideProgressBar />

      {/* ── MAP MAPCONTAINER ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MapContainer center={[5.348, -4.03]} zoom={12} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          <MapAutoController points={allMapPoints} />
          
          {/* Marqueurs Livreurs / Véhicules avec Popup */}
          {livreursOnline.map(l  => (
            <Marker key={`l-${l.uid}`} position={[l.lat, l.lng]} icon={getVehicleIcon(l)}>
              <Popup>
                <div style={{ fontFamily: 'sans-serif', padding: '2px' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{l.nom ?? l.nomComplet}</h4>
                  <p style={{ margin: '0 0 2px 0', fontSize: '11px', color: '#f97316', fontWeight: '700' }}>🏍️ {l.typeVehicule || 'Livreur Moto'}</p>
                  <p style={{ margin: '0', fontSize: '11px', color: '#64748b' }}>📞 {l.telephone || 'Aucun numéro'}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Marqueurs Coursiers Connectés avec Popup */}
          {coursiersOnline.map(c => (
            <Marker key={`c-${c.uid}`} position={[c.lat, c.lng]} icon={coursiersIcon}>
              <Popup>
                <div style={{ fontFamily: 'sans-serif', padding: '2px' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 'bold', color: '#6366f1' }}>🛒 {c.nomComplet || 'Coursier connecté'}</h4>
                  <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>🟢 En Ligne / Prêt</p>
                  <p style={{ margin: '0', fontSize: '11px', color: '#64748b' }}>📞 {c.telephone || 'Non renseigné'}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Marqueurs Boutiques / Restos Partenaires avec Popup */}
          {boutiquePoints.map(b => (
            <Marker key={`b-${b.id}`} position={[b.lat, b.lng]} icon={boutiqueIcon}>
              <Popup>
                <div style={{ fontFamily: 'sans-serif', padding: '2px' }}>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 'bold', color: '#ec4899' }}>🏪 {b.nom}</h4>
                  <p style={{ margin: '0', fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>CMD : #{b.orderId.slice(-6).toUpperCase()}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* BADGES OVERLAY */}
      <div style={{
        position: "fixed", top: 20, left: 16,
        zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "auto",
      }}>
        <div style={{
          padding: "10px 14px", background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(10px)", borderRadius: 16,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid rgba(255,255,255,0.6)",
          minWidth: 150,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
            <ShieldCheck size={12} color="#6366f1" />
            <span style={{ fontSize:10, fontWeight:900, color:"#1e293b", textTransform:"uppercase", letterSpacing:1 }}>MAMBO ENGINE</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{
              width:8, height:8, borderRadius:"50%",
              background: autoAssignEnabled ? "#10b981" : "#cbd5e1",
              display:"inline-block",
              animation: autoAssignEnabled ? "pulse 2s infinite" : "none",
            }}/>
            <span style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>
              {autoAssignEnabled ? `IA LIVE · #${engineCycles}` : "PAUSE"}
            </span>
          </div>
        </div>

        <button
          onClick={() => setAutoAssignEnabled(v => !v)}
          style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"10px 16px", borderRadius:16, border:"none", cursor:"pointer",
            background:"#0f172a", color:"white",
            fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:1,
            boxShadow:"0 4px 15px rgba(0,0,0,0.25)",
          }}
        >
          <Zap size={14} />{autoAssignEnabled ? "Stop IA" : "Start IA"}
        </button>

        <button
          onClick={() => navigate("/admin/print-qr")}
          style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"10px 16px", borderRadius:16, border:"none", cursor:"pointer",
            background:"#10b981", color:"white",
            fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:1,
            boxShadow:"0 4px 15px rgba(16,185,129,0.3)",
          }}
        >
          <QrCode size={14} />Imprimer QR
        </button>
      </div>

      {/* Compteurs Livreurs */}
      <div style={{
        position: "fixed", top: 20, right: 16,
        zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
      }}>
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"8px 14px", background:"rgba(255,255,255,0.95)",
          backdropFilter:"blur(10px)", borderRadius:12,
          boxShadow:"0 4px 15px rgba(0,0,0,0.1)",
        }}>
          <Bike size={13} color="#f97316" />
          <span style={{ fontSize:11, fontWeight:900, color:"#1e293b" }}>{countAbidjan} Abidjan</span>
        </div>
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"8px 14px", background:"rgba(255,255,255,0.95)",
          backdropFilter:"blur(10px)", borderRadius:12,
          boxShadow:"0 4px 15px rgba(0,0,0,0.1)",
        }}>
          <Globe size={13} color="#10b981" />
          <span style={{ fontSize:11, fontWeight:900, color:"#059669" }}>{countExterne} Externe</span>
        </div>
      </div>

      {/* Panel bas */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        zIndex: 9998,
        background: "white",
        borderRadius: "40px 40px 0 0",
        boxShadow: "0 -20px 50px rgba(0,0,0,0.08)",
        height: "45vh",
        display: "flex", flexDirection: "column",
        paddingBottom: 80,
      }}>
        <div style={{ width:48, height:6, background:"#f1f5f9", borderRadius:3, margin:"14px auto 4px" }} />

        <div style={{ display:"flex", padding:"0 24px", borderBottom:"1px solid #f1f5f9" }}>
          {[{ id:"flux", label:"Flux Actif" }, { id:"coursiers", label:"Coursiers Connectés" }].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActivePanel(tab.id)} 
              style={{
                padding:"12px 16px", fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:1,
                background:"none", border:"none", cursor:"pointer",
                borderBottom: activePanel === tab.id ? "2px solid #6366f1" : "2px solid transparent",
                color: activePanel === tab.id ? "#6366f1" : "#94a3b8",
              }}
            >
              {tab.label}
              {tab.id === "flux" && activeTasks.length > 0 && (
                <span style={{ marginLeft:6, background:"#ef4444", color:"white", borderRadius:8, padding:"1px 6px", fontSize:9 }}>
                  {activeTasks.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"12px 24px" }}>
          {activePanel === "flux" ? (
            activeTasks.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"#cbd5e1", fontSize:11, fontWeight:700 }}>
                Aucune tâche active
              </div>
            ) : activeTasks.map(t => {
              const meta = STATUS_META[t.status] ?? { label: t.status, color: "bg-slate-50 text-slate-500 border-slate-200" };
              return (
                <div key={t.id} style={{
                  padding:"12px 16px", borderRadius:20, border:"1px solid #f1f5f9",
                  marginBottom:8, display:"flex", alignItems:"center", justifyContent:"space-between",
                  background:"#fafafa",
                }}>
                  <div>
                    <p style={{ fontSize:11, fontWeight:900, color:"#1e293b", margin:0, textTransform:"uppercase" }}>
                      #{t.id.slice(-6)}
                    </p>
                    <p style={{ fontSize:10, color:"#94a3b8", margin:0, fontWeight:600 }}>
                      {t.pickupAddress || t.nom || "—"}
                    </p>
                  </div>
                  <span style={{
                    fontSize:9, fontWeight:900, padding:"4px 8px",
                    borderRadius:8, border:"1px solid", textTransform:"uppercase",
                  }} className={meta.color}>
                    {meta.label}
                  </span>
                </div>
              );
            })
          ) : (
            coursiersRaw.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"#cbd5e1", fontSize:11, fontWeight:700 }}>
                Aucun coursier enregistré
              </div>
            ) : coursiersRaw.map(c => {
              const isOnline = coursiersOnline.some(co => co.uid === c.uid);
              return (
                <div key={c.uid} style={{
                  padding:"12px 16px", borderRadius:20, border:"1px solid #f1f5f9",
                  marginBottom:8, display:"flex", alignItems:"center", gap:12,
                  background: isOnline ? "#fcfdfd" : "#fafafa",
                  opacity: isOnline ? 1 : 0.6
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? '#10b981' : '#cbd5e1' }} />
                      <p style={{ fontSize:13, fontWeight:900, margin:0 }}>{c.nomComplet || "Coursier Mambo"}</p>
                    </div>
                    <p style={{ fontSize:10, color:"#94a3b8", margin:0, paddingLeft: 13 }}>{c.telephone || 'Pas de numéro'}</p>
                  </div>
                  <button
                    onClick={() => handleVerifyCoursier(c.uid, !c.isVerified)}
                    style={{
                      padding:"8px 12px", borderRadius:12, border:"none", cursor:"pointer",
                      background: c.isVerified ? "#fef2f2" : "#f0fdf4",
                      color: c.isVerified ? "#ef4444" : "#10b981",
                    }}
                  >
                    {c.isVerified ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:10000 }}>
        <AdminBottomMenu />
      </div>

      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
          70%  { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
        .leaflet-pane, .leaflet-control-container, .leaflet-top, .leaflet-bottom { z-index: 400 !important; }
        .leaflet-popup-content-wrapper { border-radius: 12px; padding: 4px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
}