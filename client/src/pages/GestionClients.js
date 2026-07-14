import { collection, onSnapshot, query, where } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity,
  Award,
  ChevronDown, ChevronUp,
  Clock,
  DollarSign,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  Star,
  TrendingUp,
  Users,
  X,
  Navigation // Ajouté pour l'icône de localisation
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db } from "../firebase";

import clientCourseImg from "../assets/clientCourse.png";
import AdminBottomMenu from "../components/AdminBottomMenu";

// ✅ CLIENT ICON
const clientIcon = L.divIcon({
  html: `<div style="width: 32px; height: 32px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(99,102,241,0.3);"><img src="${clientCourseImg}" style="width: 20px; height: 20px;"/></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: ''
});

// ✅ DESTINATION ICON (Utilisé maintenant)
const destIcon = L.divIcon({
  html: `<div style="color: #ef4444;"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  className: ''
});

function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 15, { duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

// ✅ MODAL DÉTAILLÉ DU CLIENT
function ClientDetailModal({ client, courses, onClose }) {
  const clientCourses = courses.filter(c => c.userId === client.id);
  const completedCourses = clientCourses.filter(c => c.status === "completed");
  const totalSpent = completedCourses.reduce((sum, c) => sum + (c.price || 0), 0);
  const avgPrice = completedCourses.length > 0 ? totalSpent / completedCourses.length : 0;

  const [selectedCourse, setSelectedCourse] = useState(null);

  const statusColors = {
    pending: { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    assigned: { bg: '#dbeafe', color: '#2563eb', label: 'Assignée' },
    accepted: { bg: '#dbeafe', color: '#2563eb', label: 'Acceptée' },
    arrived_at_pickup: { bg: '#dcfce7', color: '#16a34a', label: 'Sur place' },
    in_transit: { bg: '#dcfce7', color: '#16a34a', label: 'En transit' },
    completed: { bg: '#d1fae5', color: '#047857', label: 'Terminée' },
    cancelled: { bg: '#fee2e2', color: '#dc2626', label: 'Annulée' }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '32px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* HEADER */}
        <div style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          padding: '24px',
          color: 'white',
          position: 'relative'
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 900,
              border: '3px solid rgba(255,255,255,0.4)'
            }}>
              {client.nomComplet?.charAt(0) || client.nom?.charAt(0) || "C"}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 4px 0', textTransform: 'uppercase' }}>
                {client.nomComplet || client.nom || "Client"}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', opacity: 0.95 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={12} />
                  <span style={{ fontWeight: 700 }}>{client.telephone || "N/A"}</span>
                </div>
                {client.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={12} />
                    <span style={{ fontWeight: 700 }}>{client.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BADGES */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {completedCourses.length >= 10 && (
              <div style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(251, 191, 36, 0.25)',
                border: '1px solid rgba(251, 191, 36, 0.5)',
                fontSize: '10px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Award size={12} />
                CLIENT FIDÈLE
              </div>
            )}
            {totalSpent >= 50000 && (
              <div style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(139, 92, 246, 0.25)',
                border: '1px solid rgba(139, 92, 246, 0.5)',
                fontSize: '10px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Star size={12} />
                VIP
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
              borderRadius: '16px',
              padding: '14px',
              border: '2px solid #93c5fd',
              textAlign: 'center'
            }}>
              <Package size={16} style={{ color: '#1e40af', margin: '0 auto 6px' }} />
              <p style={{ fontSize: '20px', fontWeight: 900, color: '#1e3a8a', margin: '0 0 2px 0' }}>
                {clientCourses.length}
              </p>
              <p style={{ fontSize: '8px', fontWeight: 700, color: '#3b82f6', margin: 0 }}>TOTAL</p>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
              borderRadius: '16px',
              padding: '14px',
              border: '2px solid #86efac',
              textAlign: 'center'
            }}>
              <Activity size={16} style={{ color: '#047857', margin: '0 auto 6px' }} />
              <p style={{ fontSize: '20px', fontWeight: 900, color: '#065f46', margin: '0 0 2px 0' }}>
                {completedCourses.length}
              </p>
              <p style={{ fontSize: '8px', fontWeight: 700, color: '#10b981', margin: 0 }}>TERMINÉ</p>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '16px',
              padding: '14px',
              border: '2px solid #fbbf24',
              textAlign: 'center'
            }}>
              <DollarSign size={16} style={{ color: '#d97706', margin: '0 auto 6px' }} />
              <p style={{ fontSize: '20px', fontWeight: 900, color: '#b45309', margin: '0 0 2px 0' }}>
                {(totalSpent / 1000).toFixed(0)}K
              </p>
              <p style={{ fontSize: '8px', fontWeight: 700, color: '#f59e0b', margin: 0 }}>DÉPENSÉ</p>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
              borderRadius: '16px',
              padding: '14px',
              border: '2px solid #c4b5fd',
              textAlign: 'center'
            }}>
              <TrendingUp size={16} style={{ color: '#6b21a8', margin: '0 auto 6px' }} />
              <p style={{ fontSize: '20px', fontWeight: 900, color: '#581c87', margin: '0 0 2px 0' }}>
                {avgPrice.toFixed(0)}
              </p>
              <p style={{ fontSize: '8px', fontWeight: 700, color: '#7c3aed', margin: 0 }}>MOYENNE</p>
            </div>
          </div>

          {/* HISTORIQUE DES COURSES */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <h3 style={{
              fontSize: '11px',
              fontWeight: 900,
              color: '#64748b',
              margin: '0 0 12px 0',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Clock size={14} />
              Historique ({clientCourses.length})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {clientCourses.length === 0 ? (
                <p style={{
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontStyle: 'italic',
                  padding: '40px 20px'
                }}>
                  Aucune course
                </p>
              ) : (
                clientCourses.map(course => {
                  const statusInfo = statusColors[course.status] || statusColors.pending;
                  const date = course.createdAt?.toDate ? course.createdAt.toDate().toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  }) : 'N/A';

                  return (
                    <div
                      key={course.id}
                      style={{
                        background: '#f8fafc',
                        borderRadius: '16px',
                        padding: '14px',
                        border: '2px solid #e2e8f0',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSelectedCourse(selectedCourse === course.id ? null : course.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{
                            fontSize: '12px',
                            fontWeight: 900,
                            color: '#0f172a',
                            margin: '0 0 4px 0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <MapPin size={12} className="text-indigo-600" />
                            {course.destination || "Destination inconnue"}
                          </p>
                          <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>
                            {date}
                          </p>
                        </div>
                        <div style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: statusInfo.bg,
                          fontSize: '9px',
                          fontWeight: 900,
                          color: statusInfo.color
                        }}>
                          {statusInfo.label}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#64748b' }}>
                          <span>
                            <strong style={{ color: '#0f172a' }}>{course.vehicleType?.toUpperCase()}</strong>
                          </span>
                          <span>
                            {course.courseMode?.toUpperCase()}
                          </span>
                        </div>
                        <p style={{
                          fontSize: '16px',
                          fontWeight: 900,
                          color: course.status === 'completed' ? '#10b981' : '#6366f1',
                          margin: 0
                        }}>
                          {course.price?.toLocaleString()}F
                        </p>
                      </div>

                      {/* DÉTAILS SUPPLÉMENTAIRES */}
                      {selectedCourse === course.id && (
                        <div style={{
                          marginTop: '12px',
                          paddingTop: '12px',
                          borderTop: '1px solid #e2e8f0'
                        }}>
                          {course.pickupAddress && (
                            <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 6px 0' }}>
                              <strong>Départ:</strong> {course.pickupAddress}
                            </p>
                          )}
                          {course.assignedLivreurName && (
                            <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>
                              <strong>Chauffeur:</strong> {course.assignedLivreurName}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GestionClients() {
  const [clients, setClients] = useState([]);
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    const unsubClients = onSnapshot(
      query(collection(db, "users"), where("role", "==", "client")),
      (snap) => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubCourses = onSnapshot(
      collection(db, "courses"),
      (snap) => setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubClients(); unsubCourses(); };
  }, []);

  const stats = useMemo(() => {
    const totalSpent = courses
      .filter(c => c.status === "completed")
      .reduce((sum, c) => sum + (c.price || 0), 0);

    const totalCourses = courses.length;
    const completedCourses = courses.filter(c => c.status === "completed").length;

    return {
      total: clients.length,
      totalSpent,
      totalCourses,
      completedCourses
    };
  }, [clients, courses]);

  const filteredClients = useMemo(() => {
    let filtered = clients.filter(c => {
      const matchesSearch = (c.nomComplet || c.nom || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.telephone || "").includes(search) ||
        (c.email || "").toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });

    if (filterType === "active") {
      filtered = filtered.filter(c =>
        courses.some(course => course.userId === c.id && course.status === "completed")
      );
    } else if (filterType === "vip") {
      filtered = filtered.filter(c => {
        const clientSpent = courses
          .filter(course => course.userId === c.id && course.status === "completed")
          .reduce((sum, course) => sum + (course.price || 0), 0);
        return clientSpent >= 50000;
      });
    }

    return filtered;
  }, [clients, courses, search, filterType]);

  // ✅ LOCATE CLIENT (Utilisé maintenant)
  const locateClient = (client) => {
    const lastCourse = courses
      .filter(c => c.userId === client.id && c.pickupLocation?.lat)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];

    if (lastCourse?.pickupLocation) {
      setMapCenter([lastCourse.pickupLocation.lat, lastCourse.pickupLocation.lng]);
      setIsPanelExpanded(false);
    }
  };

  const DEFAULT_CENTER = [5.348, -4.03];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc'
    }}>
      <ToastContainer position="top-center" theme="dark" autoClose={2000} />

      {/* ✅ MAP */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapController center={mapCenter} />

          {/* AFFICHER LES POSITIONS ET DESTINATIONS */}
          {filteredClients.map(client => {
            const lastCourse = courses
              .filter(c => c.userId === client.id && c.pickupLocation?.lat)
              .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];

            if (!lastCourse?.pickupLocation) return null;

            return (
              <div key={client.id}>
                {/* Position actuelle (Pickup) */}
                <Marker
                  position={[lastCourse.pickupLocation.lat, lastCourse.pickupLocation.lng]}
                  icon={clientIcon}
                  eventHandlers={{ click: () => setSelectedClient(client) }}
                >
                  <Popup>
                    <div style={{ padding: '8px', minWidth: '150px' }}>
                      <p style={{ fontWeight: 900, fontSize: '12px', margin: '0 0 6px 0' }}>
                        {client.nomComplet || client.nom}
                      </p>
                      <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>
                        Départ: {lastCourse.pickupAddress || "Position inconnue"}
                      </p>
                    </div>
                  </Popup>
                </Marker>

                {/* Destination de la dernière course (Utilisation de destIcon) */}
                {lastCourse.dropoffLocation?.lat && (
                   <Marker 
                    position={[lastCourse.dropoffLocation.lat, lastCourse.dropoffLocation.lng]}
                    icon={destIcon}
                   >
                     <Popup>Destination: {lastCourse.destination}</Popup>
                   </Marker>
                )}
              </div>
            );
          })}
        </MapContainer>
      </div>

      {/* ✅ PANNEAU RETRACTABLE AVEC SCROLL DIRECTIONNEL FIXÉ */}
      <div style={{
        background: 'white',
        borderTopLeftRadius: '32px',
        borderTopRightRadius: '32px',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.1)',
        maxHeight: isPanelExpanded ? '80vh' : '42vh',
        minHeight: isPanelExpanded ? '85vh' : '115px',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1000
      }}>
        {/* HEADER ET CONTROLEUR DE GLISSEMENT */}
        <div style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          color: 'white',
          borderTopLeftRadius: '32px',
          borderTopRightRadius: '32px',
          padding: '20px',
          flexShrink: 0
        }}>
          <div
            onClick={() => setIsPanelExpanded(!isPanelExpanded)}
            style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', cursor: 'pointer', padding: '4px 0' }}
          >
            <div style={{ width: '48px', height: '5px', background: 'rgba(255,255,255,0.4)', borderRadius: '10px' }}></div>
          </div>

          <div 
            onClick={() => setIsPanelExpanded(!isPanelExpanded)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', cursor: 'pointer' }}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 900, textTransform: 'uppercase', fontStyle: 'italic', margin: 0 }}>
              Gestion <span style={{ color: '#e0e7ff' }}>Clients</span>
            </h2>
            {isPanelExpanded ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div style={{ background: 'rgba(255,255,255,0.25)', padding: '12px', borderRadius: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
              <Users size={14} color="white" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{stats.total}</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700 }}>CLIENTS</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.25)', padding: '12px', borderRadius: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
              <Package size={14} color="white" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{stats.totalCourses}</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700 }}>COURSES</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.25)', padding: '12px', borderRadius: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
              <Activity size={14} color="white" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{stats.completedCourses}</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700 }}>TERMINÉ</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.25)', padding: '12px', borderRadius: '16px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
              <DollarSign size={14} color="white" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{(stats.totalSpent / 1000).toFixed(0)}K</div>
              <div style={{ fontSize: '9px', opacity: 0.95, fontWeight: 700 }}>TOTAL</div>
            </div>
          </div>
        </div>

        {/* RECHERCHE & FILTRES */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Rechercher par nom, tél, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 600,
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'all', label: 'Tous' },
              { id: 'active', label: 'Actifs' },
              { id: 'vip', label: 'VIP (50K+)' }
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setFilterType(filter.id)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '10px',
                  border: 'none',
                  background: filterType === filter.id ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : '#f1f5f9',
                  color: filterType === filter.id ? 'white' : '#64748b',
                  fontSize: '11px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  cursor: 'pointer'
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* ✅ LISTE CLIENTS RE-CONFIGURÉE (Le scroll fonctionne parfaitement ici) */}
        <div style={{ 
          flex: 1, 
          minHeight: 0, // IMPORTANT : Débloque le calcul de hauteur flexbox pour le scroll
          overflowY: isPanelExpanded ? 'auto' : 'hidden', 
          padding: '27x', 
          background: '#f8fafc',
          WebkitOverflowScrolling: 'touch'
        }}>
          {filteredClients.map(client => {
            const clientCourses = courses.filter(c => c.userId === client.id);
            const completedCount = clientCourses.filter(c => c.status === "completed").length;
            const totalSpent = clientCourses
              .filter(c => c.status === "completed")
              .reduce((sum, c) => sum + (c.price || 0), 0);

            return (
              <div
                key={client.id}
                style={{
                  background: 'white',
                  borderRadius: '20px',
                  padding: '16px',
                  border: '2px solid #e2e8f0',
                  marginBottom: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                    display: 'flex', alignItems: 'center', justifycontent: 'center',
                    fontSize: '20px', fontWeight: 900, color: '#1e40af',
                    // Centrage du texte de l'initiale
                    justifyContent: 'center'
                  }}>
                    {client.nomComplet?.charAt(0) || "C"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', margin: 0 }}>
                      {client.nomComplet || client.nom}
                    </h3>
                  </div>
                  
                  {/* BOUTON LOCALISER */}
                  <button
                    onClick={() => locateClient(client)}
                    style={{
                      background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer'
                    }}
                  >
                    <Navigation size={14} color="#6366f1" />
                  </button>

                  <button
                    onClick={() => setSelectedClient(client)}
                    style={{
                      padding: '8px 14px', borderRadius: '10px', border: 'none',
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      color: 'white', fontSize: '10px', fontWeight: 900, cursor: 'pointer'
                    }}
                  >
                    VOIR
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '10px' }}>
                    <p style={{ fontSize: '9px', fontWeight: 900, color: '#64748b', margin: '0 0 4px 0' }}>COURSES</p>
                    <p style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', margin: 0 }}>{completedCount}</p>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '10px' }}>
                    <p style={{ fontSize: '9px', fontWeight: 900, color: '#64748b', margin: '0 0 4px 0' }}>DÉPENSES</p>
                    <p style={{ fontSize: '16px', fontWeight: 900, color: '#10b981', margin: 0 }}>
                      {(totalSpent / 1000).toFixed(1)}K
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AdminBottomMenu />

      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          courses={courses}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}