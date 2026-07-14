import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertCircle,
  Bike, Car,
  ChevronDown, ChevronUp,
  DollarSign,
  Gift,
  Search, Users,
  Wallet
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer as RLMapContainer, TileLayer as RLTileLayer, useMap, Marker, Popup } from "react-leaflet";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db } from "../firebase";
import AdminBottomMenu from "../components/AdminBottomMenu";

import vtcMarkerImg from "../assets/courseDriverImg.png";
import driverMarkerImg from "../assets/marker-livreur.png";

// ✅ ICÔNES CARTE AVEC INDICATEUR SOLDE
const getLivreurIcon = (type, hasLowBalance = false) => {
  const iconUrl = type === "vtc" ? vtcMarkerImg : driverMarkerImg;
  const borderColor = type === "vtc" ? "#6366f1" : "#f97316";

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
        ${hasLowBalance ? '<div style="position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; background: #ef4444; border-radius: 50%; border: 2px solid white;"></div>' : ''}
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
    className: 'livreur-marker'
  });
};

const DEFAULT_CENTER = [5.3411, -4.0286];

function MapController({ center, panelHeight }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.flyTo(center, 15, {
        duration: 1.2,
        paddingBottomRight: [0, panelHeight + 50]
      });
    }
  }, [center, panelHeight, map]);

  return null;
}

export default function GestionJetons() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ total: 0, totalCash: 0, totalBonus: 0 });
  const [mapCenter, setMapCenter] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    // ✅ Prise en compte de "livreur" ET "livreur-alepe"
    const q = query(
      collection(db, "users"), 
      where("role", "in", ["livreur", "livreur-alepe"])
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
      
      const totalCash = list.reduce((sum, u) => sum + (Number(u.solde) || 0), 0);
      const totalBonus = list.reduce((sum, u) => sum + (parseInt(u.jetons, 10) || 0), 0);
      
      setStats({ total: list.length, totalCash, totalBonus });
    });
    return () => unsub();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = (u.nomComplet || u.nom || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.telephone || "").includes(search);
      const currentVehicleType = u.typeVehicule || (u.vehicleType === "antara" ? "moto" : "moto");
      const matchesType = filterType === "all" || currentVehicleType === filterType;
      return matchesSearch && matchesType;
    });
  }, [users, search, filterType]);

  const updateBalance = async (userId, field, value) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) {
        toast.error("Utilisateur introuvable");
        return;
      }

      const currentValue = field === "jetons" ? (parseInt(user[field], 10) || 0) : (Number(user[field]) || 0);
      const newValue = Math.max(0, currentValue + value);

      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        [field]: newValue
      });

      const action = value > 0 ? "ajouté" : "retiré";
      const amount = Math.abs(value);
      const type = field === "solde" ? "Cash" : "Bonus";
      toast.success(`${amount.toLocaleString()} F ${type} ${action} !`);

    } catch (error) {
      console.error("Erreur updateBalance:", error);
      if (error.code === 'permission-denied') {
        toast.error("❌ Accès refusé. Assurez-vous d'être connecté en tant qu'admin.");
      } else {
        toast.error(`❌ Erreur: ${error.message}`);
      }
    }
  };

  const locateUser = (u) => {
    if (u.lat && u.lng) {
      setMapCenter([u.lat, u.lng]);
      setSelectedUserId(u.id);
      setIsPanelExpanded(false);
    }
  };

  const lowBalanceCount = users.filter(u => {
    const cash = Number(u.solde) || 0;
    const bonus = parseInt(u.jetons, 10) || 0;
    return (cash + bonus) < 5000;
  }).length;

  const panelHeight = isPanelExpanded ? 600 : 250;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc'
    }}>
      <ToastContainer position="top-center" theme="dark" autoClose={2000} />

      {/* ✅ MAP SECTION */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <RLMapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <RLTileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapController center={mapCenter} panelHeight={panelHeight} />

          {users.map((u) => {
            const cash = Number(u.solde) || 0;
            const bonus = parseInt(u.jetons, 10) || 0;
            const hasLowBalance = (cash + bonus) < 5000;
            const vehicle = u.typeVehicule || (u.vehicleType === "antara" ? "moto" : "moto");

            return (
              <Marker
                key={u.id}
                position={[u.lat || 5.34, u.lng || -4.02]}
                icon={getLivreurIcon(vehicle, hasLowBalance)}
                eventHandlers={{
                  click: () => locateUser(u)
                }}
              >
                <Popup>
                  <div style={{ padding: '10px', minWidth: '180px' }}>
                    <p style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '13px', marginBottom: '10px', color: '#0f172a' }}>
                      {u.nomComplet || (u.nom ? `${u.nom} ${u.prenom || ""}` : "Anonyme")}
                    </p>
                    <div style={{ fontSize: '11px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, color: '#64748b' }}>Type:</span>
                      <span style={{ fontWeight: 900, color: vehicle === 'vtc' ? '#6366f1' : '#f97316' }}>
                        {vehicle.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#64748b' }}>Cash:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <DollarSign size={12} style={{ color: '#10b981' }} />
                        <span style={{ fontWeight: 900, color: '#10b981' }}>{cash.toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#64748b' }}>Bonus:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Gift size={12} style={{ color: '#f59e0b' }} />
                        <span style={{ fontWeight: 900, color: '#f59e0b' }}>{bonus.toLocaleString()}</span>
                      </div>
                    </div>
                    {hasLowBalance && (
                      <div style={{
                        marginTop: '8px',
                        padding: '6px',
                        background: '#fee2e2',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <AlertCircle size={12} style={{ color: '#dc2626' }} />
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626' }}>Solde faible</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </RLMapContainer>
      </div>

      {/* ✅ PANNEAU DE CONTRÔLE */}
      <div style={{
        position: 'relative',
        background: 'white',
        borderTopLeftRadius: '32px',
        borderTopRightRadius: '32px',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.1)',
        height: isPanelExpanded ? '93vh' : '36vh',
        minHeight: '288px',
        transition: 'height 0.4s ease',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        marginBottom: '10px'
      }}>
        
        {/* TITRE ET STATISTIQUES */}
        <div style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          color: 'white',
          borderTopLeftRadius: '32px',
          borderTopRightRadius: '32px',
          padding: '20px',
          flexShrink: 0
        }}>
          {/* Drag Handle */}
          <div
            onClick={() => setIsPanelExpanded(!isPanelExpanded)}
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '12px',
              cursor: 'pointer'
            }}
          >
            <div style={{
              width: '48px',
              height: '5px',
              background: 'rgba(255,255,255,0.3)',
              borderRadius: '10px'
            }}></div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 900,
              textTransform: 'uppercase',
              fontStyle: 'italic',
              margin: 0
            }}>
              Gestion <span style={{ color: '#e0e7ff' }}>Jetons</span>
            </h2>
            <div style={{ cursor: 'pointer' }} onClick={() => setIsPanelExpanded(!isPanelExpanded)}>
              {isPanelExpanded ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.25)',
              padding: '12px',
              borderRadius: '16px',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <Users size={14} color="white" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{stats.total}</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700 }}>LIVREURS</div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.25)',
              padding: '12px',
              borderRadius: '16px',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <Wallet size={14} color="white" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{(stats.totalCash / 1000).toFixed(0)}K</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700 }}>CASH</div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.25)',
              padding: '12px',
              borderRadius: '16px',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <Gift size={14} color="white" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{(stats.totalBonus / 1000).toFixed(0)}K</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700 }}>BONUS</div>
            </div>
          </div>

          {/* Alert Low Balance */}
          {lowBalanceCount > 0 && (
            <div style={{
              background: 'rgba(251, 191, 36, 0.25)',
              padding: '8px 12px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: '1px solid rgba(255,255,255,0.3)'
            }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: '11px', fontWeight: 700 }}>
                {lowBalanceCount} solde(s) faible(s) (moins de 5000 F)
              </span>
            </div>
          )}
        </div>

        {/* CONTENEUR DE CONTENU DÉFILANT */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          background: '#f8fafc'
        }}>
          
          {/* SEARCH & FILTERS */}
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8'
                }}
              />
              <input
                type="text"
                placeholder="Rechercher par nom ou téléphone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 44px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Filter Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'all', label: 'Tous', icon: null },
                { id: 'moto', label: 'Motes', icon: <Bike size={12} /> },
                { id: 'vtc', label: 'VTC', icon: <Car size={12} /> },
                { id: 'taxi', label: 'Taxi', icon: <Car size={12} /> }
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setFilterType(filter.id)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '10px',
                    border: 'none',
                    background: filterType === filter.id
                      ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                      : '#f1f5f9',
                    color: filterType === filter.id ? 'white' : '#64748b',
                    fontSize: '11px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                >
                  {filter.icon}
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* USERS LIST */}
          <div style={{ padding: '13px', paddingBottom: '80px' }}>
            {filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontSize: '13px', fontWeight: 700, fontStyle: 'italic' }}>
                  Aucun livreur trouvé
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredUsers.map((u) => {
                  const cash = Number(u.solde) || 0;
                  const bonus = parseInt(u.jetons, 10) || 0;
                  const totalBalance = cash + bonus;
                  const hasLowBalance = totalBalance < 5000;
                  const isSelected = selectedUserId === u.id;
                  const vehicle = u.typeVehicule || (u.vehicleType === "antara" ? "moto" : "moto");

                  return (
                    <div
                      key={u.id}
                      style={{
                        background: 'white',
                        borderRadius: '20px',
                        padding: '16px',
                        border: isSelected ? '2px solid #6366f1' : '2px solid #e2e8f0',
                        boxShadow: isSelected ? '0 4px 20px rgba(99,102,241,0.2)' : 'none',
                        transition: 'all 0.3s'
                      }}
                    >
                      {/* User Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '11px',
                          marginBottom: '12px',
                          cursor: 'pointer'
                        }}
                        onClick={() => locateUser(u)}
                      >
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: vehicle === 'vtc'
                            ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'
                            : vehicle === 'taxi'
                              ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
                              : 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
                          border: `2px solid ${vehicle === 'vtc' ? '#60a5fa' : vehicle === 'taxi' ? '#fbbf24' : '#fb923c'}`
                        }}>
                          {vehicle === 'vtc' || vehicle === 'taxi' ?
                            <Car size={22} style={{ color: vehicle === 'vtc' ? '#1e40af' : '#d97706' }} /> :
                            <Bike size={22} style={{ color: '#c2410c' }} />
                          }
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <h3 style={{
                              fontSize: '14px',
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              fontStyle: 'italic',
                              margin: 0,
                              color: '#0f172a'
                            }}>
                              {u.nomComplet || (u.nom ? `${u.nom} ${u.prenom || ""}` : "Anonyme")}
                            </h3>
                            {hasLowBalance && <AlertCircle size={14} style={{ color: '#f59e0b' }} />}
                          </div>
                          <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, margin: 0 }}>
                            {u.telephone || "N/A"}
                          </p>
                        </div>

                        <span style={{
                          fontSize: '9px',
                          fontWeight: 900,
                          padding: '4px 8px',
                          borderRadius: '8px',
                          background: vehicle === 'vtc' ? '#dbeafe' : vehicle === 'taxi' ? '#fef3c7' : '#fed7aa',
                          color: vehicle === 'vtc' ? '#1e40af' : vehicle === 'taxi' ? '#d97706' : '#c2410c',
                          textTransform: 'uppercase',
                          fontStyle: 'italic'
                        }}>
                          {vehicle}
                        </span>
                      </div>

                      {/* MODIFICATION DES SOLDES */}
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px dashed #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        {/* Cash Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                            <Wallet size={14} style={{ color: '#10b981' }} />
                            <span>Cash: <strong style={{ color: '#10b981' }}>{cash.toLocaleString()} F</strong></span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              onClick={() => updateBalance(u.id, "solde", -1000)}
                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 900, border: '1px solid #ef4444', color: '#ef4444', background: 'none', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              -1000
                            </button>
                            <button 
                              onClick={() => updateBalance(u.id, "solde", 1000)}
                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 900, border: 'none', color: 'white', background: '#10b981', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              +1000
                            </button>
                          </div>
                        </div>

                        {/* Bonus Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                            <Gift size={14} style={{ color: '#f59e0b' }} />
                            <span>Bonus: <strong style={{ color: '#f59e0b' }}>{bonus.toLocaleString()}</strong></span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              onClick={() => updateBalance(u.id, "jetons", -1000)}
                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 900, border: '1px solid #ef4444', color: '#ef4444', background: 'none', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              -1000
                            </button>
                            <button 
                              onClick={() => updateBalance(u.id, "jetons", 1000)}
                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 900, border: 'none', color: 'white', background: '#f59e0b', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              +1000
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <AdminBottomMenu />
    </div>
  );
}