import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

import {
  AlertCircle,
  Box,
  Car,
  Check,
  CheckCircle,
  ChevronRight,
  Handshake,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  X
} from "lucide-react";

export default function TrackingModal({
  mission,
  distanceKm,
  durationMin,
  isModalExpanded,
  setIsModalExpanded
}) {
  const navigate = useNavigate();

  const isExterne = mission?.zone !== "abidjan" || 
                   mission?.isExterneZone === true || 
                   mission?.assignedLivreurRole === "livreur-externe";

  // Redirection automatique
  useEffect(() => {
    if (mission && (mission.status === "expired" || mission.status === "cancelled")) {
      const timer = setTimeout(() => navigate("/"), 3000);
      return () => clearTimeout(timer);
    }
  }, [mission, navigate]);

  if (!mission) return null;

  const status = mission.status;
  const isNegotiating = mission.negotiationStatus === 'counter_offer';
  const isApproaching = status === "assigned" || status === "accepted";
  const isAtPickup = status === "arrived_at_pickup";
  const isInTransit = status === "in_transit";

  const handleAcceptCounterOffer = async () => {
    if (!mission?.id) return;

    try {
      await updateDoc(doc(db, "courses", mission.id), {
        negotiationStatus: 'accepted',
        finalPrice: mission.price,
        negotiationHistory: arrayUnion({
          type: 'client_accept',
          amount: mission.price,
          timestamp: new Date().toISOString(),
          message: 'Client a accepté la contre-offre'
        })
      });
    } catch (error) {
      console.error("Erreur acceptation :", error);
    }
  };

  const handleRejectCounterOffer = async () => {
    if (!mission?.id) return;
    try {
      await updateDoc(doc(db, "courses", mission.id), {
        status: 'cancelled',
        negotiationStatus: 'rejected',
        cancelledBy: 'client'
      });
      setTimeout(() => navigate("/"), 2000);
    } catch (error) {
      console.error(error);
    }
  };

  const getStepInfo = () => {
    if (isNegotiating) return {
      label: "Négociation en cours",
      icon: <Handshake size={20} className="text-purple-600" />
    };
    if (isApproaching) return {
      label: "Le chauffeur arrive",
      icon: <Car size={20} />
    };
    if (isAtPickup) return {
      label: "Chauffeur sur place",
      icon: <Box size={20} />
    };
    if (isInTransit) return {
      label: "Livraison en cours",
      icon: <Navigation size={20} />
    };
    return {
      label: "Recherche...",
      icon: <Loader2 size={20} className="animate-spin" />
    };
  };

  const stepInfo = getStepInfo();

  // Écran Succès
  if (status === "completed") {
    return (
      <div className="absolute left-4 right-4 bottom-8 z-[1000] max-w-md mx-auto animate-in zoom-in duration-300">
        <div className="bg-slate-900 rounded-[40px] p-8 text-white text-center shadow-2xl">
          <div className="flex items-center justify-center w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="mb-2 text-2xl italic font-black uppercase">Course Terminée !</h2>
          <p className="mb-8 text-xs font-bold tracking-widest uppercase text-slate-400">
            Merci de votre confiance
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-5 font-black tracking-tighter uppercase transition-transform bg-indigo-600 shadow-lg rounded-3xl shadow-indigo-500/30 active:scale-95"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  // Écran Annulé
  if (status === "cancelled") {
    return (
      <div className="absolute left-4 right-4 bottom-8 z-[1000] max-w-md mx-auto animate-in zoom-in duration-300">
        <div className="bg-white rounded-[40px] p-8 text-center shadow-2xl border-2 border-red-200">
          <AlertCircle size={40} className="mx-auto mb-4 text-red-500" />
          <h2 className="mb-2 text-2xl font-black uppercase text-slate-900">Course Annulée</h2>
          <p className="mb-8 text-xs font-bold text-slate-500">
            La course a été annulée
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-5 mt-4 font-black text-white uppercase bg-slate-900 rounded-3xl active:scale-95"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute left-4 right-4 z-[1000] max-w-md mx-auto transition-all duration-500 ease-out bottom-8 bg-white/95 backdrop-blur-2xl rounded-[40px] shadow-2xl border border-white/50 overflow-hidden"
      style={{ maxHeight: isModalExpanded ? '75vh' : '40vh' }}
    >
      {/* Poignée */}
      <div
        className="flex items-center justify-center py-4 cursor-pointer active:bg-slate-100"
        onClick={() => setIsModalExpanded(!isModalExpanded)}
      >
        <div className={`w-12 h-1.5 rounded-full transition-colors ${isModalExpanded ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
      </div>

      <div className="px-6 pb-6 overflow-y-auto" style={{ maxHeight: isModalExpanded ? 'calc(75vh - 70px)' : 'calc(40vh - 70px)' }}>
        {/* Négociation */}
        {isNegotiating && (
          <div className="relative p-4 mb-4 overflow-hidden border-2 border-purple-200 bg-purple-50 rounded-2xl">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <Handshake size={64} className="text-purple-900" />
            </div>

            <div className="relative z-10 flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-purple-200 rounded-lg">
                <Handshake size={14} className="text-purple-700" />
              </div>
              <h3 className="text-sm font-black text-purple-900 uppercase">Contre-proposition</h3>
            </div>

            <p className="relative z-10 mb-3 text-xs font-bold text-purple-800">Le chauffeur propose un nouveau tarif.</p>

            <div className="relative z-10 flex items-center justify-between p-3 mb-3 bg-white border border-purple-100 shadow-sm rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Nouveau Prix</span>
              <span className="text-2xl font-black text-purple-600">{mission.price?.toLocaleString()} F</span>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-2">
              <button
                onClick={handleRejectCounterOffer}
                className="py-2.5 font-bold text-red-600 bg-white border-2 border-red-200 rounded-xl text-xs uppercase hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
              >
                <X size={14} /> Refuser
              </button>
              <button
                onClick={handleAcceptCounterOffer}
                className="py-2.5 font-bold text-white bg-purple-600 rounded-xl text-xs uppercase shadow-lg shadow-purple-200 hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
              >
                <Check size={14} /> Accepter
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-3xl text-white shadow-lg transition-all ${isNegotiating ? 'bg-purple-500' : isInTransit ? 'bg-green-500' : 'bg-indigo-600'}`}>
              {stepInfo.icon}
            </div>
            <div>
              <h3 className="mb-1 text-lg italic font-black leading-none uppercase text-slate-900">
                {mission.assignedLivreurName || "Recherche..."}
              </h3>
              <div className="flex items-center gap-1">
                <span className={`flex w-2 h-2 rounded-full animate-pulse ${isNegotiating ? 'bg-purple-500' : 'bg-green-500'}`}></span>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  {stepInfo.label}
                </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs font-bold leading-none uppercase text-slate-400">Prix</p>
            <p className={`text-xl italic font-black ${isNegotiating ? 'text-purple-600' : 'text-slate-900'}`}>
              {(mission.price || 0).toLocaleString()}F
            </p>
          </div>
        </div>

        {/* Distance / Temps */}
        {!isNegotiating && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-4 border border-indigo-100 bg-indigo-50/50 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Navigation size={14} className="text-indigo-600" />
                <span className="text-[9px] font-black text-indigo-600 uppercase">Distance</span>
              </div>
              <p className="text-2xl italic font-black text-slate-900">
                {distanceKm}<span className="ml-1 text-sm text-slate-500">km</span>
              </p>
            </div>

            <div className="p-4 border border-amber-100 bg-amber-50/50 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 size={14} className="text-amber-600" />
                <span className="text-[9px] font-black text-amber-600 uppercase">Arrivée</span>
              </div>
              <p className="text-2xl italic font-black text-slate-900">
                {durationMin}<span className="ml-1 text-sm text-slate-500">min</span>
              </p>
            </div>
          </div>
        )}

        {/* Détails étendus */}
        {isModalExpanded && !isNegotiating && (
          <div className="animate-in fade-in slide-in-from-bottom-2">
            <div className="p-4 mb-5 border bg-slate-100/50 rounded-2xl border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-slate-500 uppercase">Statut Livraison</span>
                <span className="text-[10px] font-black text-indigo-600 italic uppercase">
                  {isInTransit ? "En route" : isAtPickup ? "Chargement" : "Approche"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-1.5 flex-1 rounded-full transition-all ${isApproaching || isAtPickup || isInTransit ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                <div className={`h-1.5 flex-1 rounded-full transition-all ${isAtPickup || isInTransit ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                <div className={`h-1.5 flex-1 rounded-full transition-all ${isInTransit ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          {!isNegotiating && mission.assignedLivreurPhone && (
            <a
              href={`tel:${mission.assignedLivreurPhone}`}
              className="flex-1 flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase shadow-xl active:scale-95"
            >
              <Phone size={16} /> Appeler
            </a>
          )}
          <button
            onClick={() => navigate(-1)}
            className={`${isNegotiating ? 'flex-1' : 'px-6'} flex items-center justify-center bg-white border-2 border-slate-200 text-slate-900 rounded-2xl font-black text-[11px] uppercase active:scale-95 py-4`}
          >
            {isNegotiating ? 'Fermer' : 'Retour'}
          </button>
        </div>
      </div> 
    </div>
  );
}