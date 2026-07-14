import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { MapPin, CheckCircle, XCircle, AlertTriangle, Navigation, Search, Filter, ArrowLeft } from "lucide-react";
import AdminBottomMenu from "../components/AdminBottomMenu";

export default function GpsDiagnostic() {
  const [livreurs, setLivreurs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const q = query(
      collection(db, "users"), 
      where("role", "in", ["livreur", "livreur-alepe"])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLivreurs(data);
    });
    return unsubscribe;
  }, []);

  const getStatus = (livreur) => {
    if (!livreur.lat || !livreur.lng) {
      return { 
        type: "missing",
        text: "GPS manquant", 
        color: "text-red-600 border-red-200 bg-red-50",
        icon: <XCircle size={20} className="text-red-500" />
      };
    }
    if (typeof livreur.lat !== 'number' || typeof livreur.lng !== 'number') {
      return { 
        type: "invalid",
        text: "GPS invalide (format)", 
        color: "text-amber-600 border-amber-200 bg-amber-50",
        icon: <AlertTriangle size={20} className="text-amber-500" />
      };
    }
    return { 
      type: "ok",
      text: "GPS OK", 
      color: "text-green-600 border-green-200 bg-green-50",
      icon: <CheckCircle size={20} className="text-green-500" />
    };
  };

  const stats = useMemo(() => {
    let ok = 0, invalid = 0, missing = 0;
    livreurs.forEach(l => {
      const status = getStatus(l);
      if (status.type === "ok") ok++;
      else if (status.type === "invalid") invalid++;
      else missing++;
    });
    return { total: livreurs.length, ok, invalid, missing };
  }, [livreurs]);

  const filteredLivreurs = useMemo(() => {
    return livreurs.filter(l => {
      const matchesSearch = 
        (l.nomComplet || l.nom || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.telephone || "").includes(searchTerm);
      
      const status = getStatus(l);
      const matchesStatus = 
        statusFilter === "all" || 
        (statusFilter === "ok" && status.type === "ok") ||
        (statusFilter === "invalid" && status.type === "invalid") ||
        (statusFilter === "missing" && status.type === "missing");

      return matchesSearch && matchesStatus;
    });
  }, [livreurs, searchTerm, statusFilter]);

  const formatGpsDate = (dateField) => {
    if (!dateField) return "N/A";
    try {
      const d = dateField.seconds ? new Date(dateField.seconds * 1000) : new Date(dateField);
      return d.toLocaleString('fr-FR');
    } catch (e) {
      return "Format invalide";
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      overflow: 'hidden'
    }}>
      
      {/* ZONE FIXE SUPÉRIEURE : RETOUR + EN-TÊTE + STATS + RECHERCHE */}
      <div className="flex-shrink-0 w-full max-w-6xl px-6 pt-6 mx-auto">
        
        {/* Bouton Retour */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 hover:text-indigo-600 font-bold text-xs uppercase tracking-wide rounded-xl shadow-sm border border-slate-200 transition-all active:scale-95"
          >
            <ArrowLeft size={14} />
            Retour
          </button>
        </div>

        {/* En-tête & Tableaux KPI */}
        <div className="p-6 mb-4 bg-white shadow-lg rounded-3xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 shadow-md bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <MapPin size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl italic font-black tracking-tight uppercase text-slate-900">
                GPS Diagnostic
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Analyse de l'intégrité de géolocalisation des terminaux livreurs
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <button 
              onClick={() => setStatusFilter("all")}
              className={`p-3 border-2 rounded-xl text-left transition-all ${statusFilter === "all" ? "border-slate-900 bg-slate-900 text-white" : "bg-slate-50 border-slate-200 text-slate-900 hover:border-slate-400"}`}
            >
              <div className="text-2xl font-black">{stats.total}</div>
              <div className={`text-xxs font-bold uppercase tracking-wider ${statusFilter === "all" ? "text-slate-300" : "text-slate-500"}`}>Tous</div>
            </button>

            <button 
              onClick={() => setStatusFilter("ok")}
              className={`p-3 border-2 rounded-xl text-left transition-all ${statusFilter === "ok" ? "border-green-600 bg-green-600 text-white" : "bg-green-50 border-green-200 text-green-700 hover:border-green-400"}`}
            >
              <div className="text-2xl font-black">{stats.ok}</div>
              <div className={`text-xxs font-bold uppercase tracking-wider ${statusFilter === "ok" ? "text-green-200" : "text-green-600"}`}>GPS OK</div>
            </button>

            <button 
              onClick={() => setStatusFilter("invalid")}
              className={`p-3 border-2 rounded-xl text-left transition-all ${statusFilter === "invalid" ? "border-amber-600 bg-amber-600 text-white" : "bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400"}`}
            >
              <div className="text-2xl font-black">{stats.invalid}</div>
              <div className={`text-xxs font-bold uppercase tracking-wider ${statusFilter === "invalid" ? "text-amber-200" : "text-amber-600"}`}>Invalide</div>
            </button>

            <button 
              onClick={() => setStatusFilter("missing")}
              className={`p-3 border-2 rounded-xl text-left transition-all ${statusFilter === "missing" ? "border-red-600 bg-red-600 text-white" : "bg-red-50 border-red-200 text-red-700 hover:border-red-400"}`}
            >
              <div className="text-2xl font-black">{stats.missing}</div>
              <div className={`text-xxs font-bold uppercase tracking-wider ${statusFilter === "missing" ? "text-red-200" : "text-red-600"}`}>Manquant</div>
            </button>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="flex flex-col items-center gap-3 p-3 mb-4 bg-white shadow-sm rounded-2xl sm:flex-row">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute -translate-y-1/2 left-4 top-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Rechercher par nom, téléphone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-semibold text-sm transition-colors"
            />
          </div>
          {statusFilter !== "all" && (
            <button 
              onClick={() => setStatusFilter("all")}
              className="flex items-center justify-center w-full gap-2 px-4 py-2 font-black text-indigo-700 uppercase transition-colors rounded-lg sm:w-auto bg-indigo-50 text-xxs hover:bg-indigo-100"
            >
              <Filter size={12} />
              Effacer filtre
            </button>
          )}
        </div>
      </div>

      {/* ✅ ZONE CONTENU SCROLLABLE SÉCURISÉE */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: '100px' // Évite la superposition avec le menu du bas
      }} className="w-full max-w-6xl px-6 mx-auto">
        
        <div className="space-y-4">
          {filteredLivreurs.map(livreur => {
            const status = getStatus(livreur);
            const vehicle = livreur.typeVehicule || "moto";

            return (
              <div 
                key={livreur.id} 
                className="p-5 transition-all bg-white border-2 shadow-sm rounded-2xl border-slate-100 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start flex-1 gap-4">
                    
                    <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-inner ${
                      vehicle === 'vtc' 
                        ? 'bg-gradient-to-br from-indigo-500 to-blue-600' 
                        : vehicle === 'taxi'
                          ? 'bg-gradient-to-br from-amber-400 to-amber-600'
                          : 'bg-gradient-to-br from-orange-500 to-red-600'
                    }`}>
                      {(livreur.nomComplet || livreur.nom || "?").charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-base italic font-black uppercase truncate text-slate-900">
                          {livreur.nomComplet || livreur.nom || "Utilisateur sans nom"}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-xxs font-black uppercase tracking-wider ${
                          vehicle === 'vtc' ? 'bg-indigo-100 text-indigo-700' : 
                          vehicle === 'taxi' ? 'bg-amber-100 text-amber-800' : 
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {vehicle}
                        </span>
                        {livreur.isOnline && (
                          <span className="px-2 py-0.5 text-xxs font-black text-green-700 uppercase bg-green-100 rounded tracking-wider animate-pulse">
                            En ligne
                          </span>
                        )}
                        {livreur.role === "livreur-alepe" && (
                          <span className="px-2 py-0.5 text-xxs font-black text-purple-700 uppercase bg-purple-100 rounded tracking-wider">
                            Alépé
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 md:grid-cols-4 border-b border-slate-100 pb-3">
                        <div>
                          <div className="font-bold tracking-wider uppercase text-xxs text-slate-400">Téléphone</div>
                          <div className="text-xs font-bold text-slate-800">{livreur.telephone || "N/A"}</div>
                        </div>
                        <div>
                          <div className="font-bold tracking-wider uppercase text-xxs text-slate-400">Email</div>
                          <div className="text-xs font-bold truncate text-slate-800">{livreur.email || "N/A"}</div>
                        </div>
                        <div>
                          <div className="font-bold tracking-wider uppercase text-xxs text-slate-400">Cash</div>
                          <div className="text-xs font-black text-emerald-600">{(livreur.solde || 0).toLocaleString()} F</div>
                        </div>
                        <div>
                          <div className="font-bold tracking-wider uppercase text-xxs text-slate-400">Bonus</div>
                          <div className="text-xs font-black text-amber-500">{(livreur.soldeJetons || 0).toLocaleString()} J</div>
                        </div>
                      </div>

                      <div className={`mt-3 p-3 rounded-xl border ${status.color}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {status.icon}
                          <span className="text-xs font-black tracking-wide uppercase">
                            {status.text}
                          </span>
                        </div>
                        
                        {livreur.lat && livreur.lng ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs border-b border-black/5 pb-0.5">
                              <span className="font-semibold text-slate-600">Latitude:</span>
                              <span className="font-mono font-bold text-slate-900">{livreur.lat}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs border-b border-black/5 pb-0.5">
                              <span className="font-semibold text-slate-600">Longitude:</span>
                              <span className="font-mono font-bold text-slate-900">{livreur.lng}</span>
                            </div>
                            {livreur.gpsAccuracy !== undefined && (
                              <div className="flex items-center justify-between text-xs border-b border-black/5 pb-0.5">
                                <span className="font-semibold text-slate-600">Précision:</span>
                                <span className="font-bold text-slate-900">±{Math.round(livreur.gpsAccuracy)}m</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-600">Dernière MAJ:</span>
                              <span className="font-bold text-slate-900">
                                {formatGpsDate(livreur.lastGpsUpdate || livreur.updatedAt)}
                              </span>
                            </div>
                            
                            {typeof livreur.lat === 'number' && typeof livreur.lng === 'number' && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=lat,lng{livreur.lat},${livreur.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center w-full gap-2 py-2 mt-2 text-xs font-black text-white uppercase transition-all bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
                              >
                                <Navigation size={12} className="fill-white" />
                                Ouvrir Google Maps
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs italic font-semibold text-slate-500">
                            Aucun repère géographique transmis.
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredLivreurs.length === 0 && (
          <div className="p-12 text-center bg-white border-2 border-dashed shadow-md rounded-2xl border-slate-200">
            <div className="mb-2 text-4xl">🔍</div>
            <h3 className="mb-1 text-base font-black uppercase text-slate-900">Aucun résultat</h3>
            <p className="max-w-xs mx-auto text-xs font-semibold text-slate-500">
              Ajustez vos filtres ou vos termes de recherche pour cibler de nouveaux profils.
            </p>
          </div>
        )}
      </div>

      {/* MENU DE NAVIGATION BAS FIXE */}
      <AdminBottomMenu />
    </div>
  );
}