import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Edit2, MapPin, Plus, Trash2, Users, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db } from "../firebase";
import AdminBottomMenu from "../components/AdminBottomMenu";
import "./GestionLivreurs.css";

import vtcMarkerImg from "../assets/courseDriverImg.png";
import driverMarkerImg from "../assets/marker-livreur.png";

// ✅ MARKERS AMÉLIORÉS ET HARMONISÉS
const getLivreurIcon = (type, isOnline = false) => {
  const iconUrl = type === "vtc" || type === "taxi" ? vtcMarkerImg : driverMarkerImg;
  const borderColor = isOnline ? "#10b981" : "#94a3b8";

  return L.divIcon({
    html: `
      <div style="
        width: 40px; 
        height: 40px; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        background: white; 
        border-radius: 50%; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
        border: 3px solid ${borderColor};
        position: relative;
      ">
        <img src="${iconUrl}" style="width: 24px; height: 24px; object-fit: contain;" />
        ${isOnline ? '<div style="position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; background: #10b981; border-radius: 50%; border: 2px solid white;"></div>' : ''}
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
    className: 'livreur-marker'
  });
};

const DEFAULT_CENTER = [5.3411, -4.0286];

function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, 16, { duration: 1.2 });
    }
  }, [center, map]);
  return null;
}

export default function GestionLivreurs() {
  const [livreurs, setLivreurs] = useState([]);
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const adminEmail = "ydouagour@gmail.com";
  const currentUserEmail = localStorage.getItem("userEmail");
  const isAdmin = currentUserEmail === adminEmail;

  // ✅ HARMONISATION : Écouteur en temps réel + Support multi-rôles livreurs
  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("role", "in", ["livreur", "livreur-alepe"])
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setLivreurs(data);
        setLoading(false);
      },
      (err) => {
        console.error("Erreur Firestore temps réel:", err);
        toast.error("Erreur de synchronisation des données");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // ✅ RECHERCHE FLEXIBLE ET NETTOYÉE
  const filteredLivreurs = useMemo(() => {
    return livreurs.filter(l => {
      const nomLivreur = l.nomComplet || l.nom || "";
      const emailLivreur = l.email || "";
      const telephoneLivreur = l.telephone || "";

      return (
        nomLivreur.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emailLivreur.toLowerCase().includes(searchTerm.toLowerCase()) ||
        telephoneLivreur.includes(searchTerm)
      );
    });
  }, [livreurs, searchTerm]);

  const handleDelete = async (id, email) => {
    if (!isAdmin) {
      toast.error("Suppression réservée à l'admin !");
      return;
    }
    if (!window.confirm(`Supprimer définitivement le compte ${email} ?`)) return;
    try {
      await deleteDoc(doc(db, "users", id));
      if (selectedLivreur?.id === id) setSelectedLivreur(null);
      toast.success("Compte livreur supprimé !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleLocate = (livreur) => {
    // ✅ HARMONISATION : Vérification stricte des champs uniformisés lat et lng
    if (livreur.lat && livreur.lng && typeof livreur.lat === 'number' && typeof livreur.lng === 'number') {
      setSelectedLivreur(livreur);
    } else {
      toast.warning("Position GPS manquante ou invalide pour ce profil");
    }
  };

  return (
    <div className="gestion-livreurs-page">
      <ToastContainer position="top-center" theme="dark" autoClose={2000} />

      {/* ✅ CARTE INTEGRÉE AVEC TRAITEMENT SÉCURISÉ */}
      <div className="leaflet-map">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          zoomControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          
          <MapController 
            center={
              selectedLivreur?.lat && selectedLivreur?.lng && typeof selectedLivreur.lat === 'number'
                ? [selectedLivreur.lat, selectedLivreur.lng] 
                : null
            } 
          />

          {/* ✅ PARCOURS SÉCURISÉ DES MARQUEURS */}
          {filteredLivreurs.map(l => (
            l.lat && l.lng && typeof l.lat === 'number' && typeof l.lng === 'number' && (
              <Marker
                key={l.id}
                position={[l.lat, l.lng]}
                icon={getLivreurIcon(l.typeVehicule, l.isOnline)}
                eventHandlers={{ click: () => handleLocate(l) }}
              >
                <Popup>
                  <div style={{ textAlign: 'center', padding: '6px', minWidth: '140px' }}>
                    <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }} className="italic font-black uppercase text-slate-900">
                      {l.nomComplet || l.nom}
                    </strong>
                    <span style={{ fontSize: '12px', color: '#475569', display: 'block', fontWeight: '600', marginBottom: '2px' }}>
                      {l.telephone || "Aucun numéro"}
                    </span>
                    <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 'bold', marginBottom: '8px' }} className="uppercase">
                      {l.typeVehicule || "MOTO"} {l.role === "livreur-alepe" && "• ALÉPÉ"}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '8px',
                        fontSize: '10px',
                        fontWeight: '900',
                        textTransform: 'uppercase',
                        background: l.isOnline ? '#e6f4ea' : '#f1f5f9',
                        color: l.isOnline ? '#137333' : '#475569',
                        border: l.isOnline ? '1px solid #ceead6' : '1px solid #e2e8f0'
                      }}
                    >
                      {l.isOnline ? '🟢 En ligne' : '⚫ Hors ligne'}
                    </span>
                  </div>
                </Popup>
              </Marker>
            )
          ))}
        </MapContainer>
      </div>

      {/* ✅ PANNEAU DE CONTRÔLE ET RECHERCHE */}
      <div className="livreurs-panel">
        <div className="panel-header">
          <h2 className="flex items-center gap-2 text-xl italic font-black uppercase text-slate-900">
            <Users size={22} className="text-indigo-600" /> Livreurs ({filteredLivreurs.length})
          </h2>
          {isAdmin && (
            <button className="flex items-center gap-1 text-xs font-bold tracking-wider uppercase admin-btn admin-btn-primary">
              <Plus size={14} /> Ajouter
            </button>
          )}
        </div>

        <div className="relative my-3 search-container">
          <Search size={16} className="absolute -translate-y-1/2 left-3 top-1/2 text-slate-400" />
          <input
            placeholder="Rechercher par nom, mail, téléphone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full py-2 pr-4 text-sm font-semibold transition-colors border outline-none search-bar pl-9 bg-slate-50 border-slate-200 rounded-xl focus:border-indigo-500"
          />
        </div>

        {loading ? (
          <div className="p-8 text-sm font-bold text-center text-slate-500 animate-pulse">
            Synchronisation en temps réel...
          </div>
        ) : (
          <div className="pr-1 space-y-2 overflow-y-auto livreurs-list">
            {filteredLivreurs.length === 0 && (
              <p className="p-8 text-sm italic font-semibold text-center text-slate-400">
                Aucun compte livreur trouvé
              </p>
            )}
            
            {filteredLivreurs.map(l => (
              <div
                key={l.id}
                className={`livreur-card p-4 bg-white border-2 rounded-xl transition-all ${
                  selectedLivreur?.id === l.id 
                    ? 'border-indigo-500 shadow-md bg-indigo-50/10' 
                    : 'border-slate-100 hover:border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-1 info-main">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${l.isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <b className="text-sm font-black tracking-wide uppercase text-slate-800">{l.nomComplet || l.nom}</b>
                  </div>
                  {l.role === "livreur-alepe" && (
                    <span className="text-xxs px-2 py-0.5 font-bold uppercase tracking-wider text-purple-700 bg-purple-100 rounded">
                      Alépé
                    </span>
                  )}
                </div>
                
                <div className="space-y-0.5 text-xs font-medium text-slate-500">
                  <p className="truncate">{l.email || "Pas d'adresse email"}</p>
                  <p>{l.telephone || "Pas de numéro"}</p>
                  <p className="mt-1 font-bold tracking-wide uppercase text-xxs text-slate-400">
                    Mode : {l.typeVehicule || "moto"}
                  </p>
                </div>

                <div className="card-actions flex gap-1.5 mt-3 pt-2 border-t border-slate-100">
                  <button
                    className="admin-btn admin-btn-secondary text-xxs font-bold uppercase tracking-wider flex items-center gap-1 py-1.5 px-3 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-700"
                    onClick={() => handleLocate(l)}
                  >
                    <MapPin size={12} /> Localiser
                  </button>
                  
                  {isAdmin && (
                    <>
                      <button className="admin-btn admin-btn-primary text-xxs font-bold uppercase tracking-wider flex items-center gap-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg ml-auto">
                        <Edit2 size={12} /> Modifier
                      </button>
                      <button
                        className="admin-btn admin-btn-danger text-xxs font-bold uppercase tracking-wider flex items-center gap-1 py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                        onClick={() => handleDelete(l.id, l.email)}
                      >
                        <Trash2 size={12} /> Supprimer
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ✅ BARRE BASSE SÉCURISÉE DANS LE PANNEAU */}
        <AdminBottomMenu />
      </div>
    </div>
  );
}