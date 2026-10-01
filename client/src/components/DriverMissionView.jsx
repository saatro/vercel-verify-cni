import { CheckCircle2, ChevronRight, Loader2, MapPin, Phone, User } from "lucide-react";
import { useState } from "react";

export default function DriverMissionView({ mission, onUpdateStatus, onValidatePickupCode }) {
    const [pickupCodeInput, setPickupCodeInput] = useState("");
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const updateMissionStatus = async (newStatus, e) => {
        e.preventDefault();
        setIsProcessing(true);
        try {
            await onUpdateStatus(mission.id, newStatus);
        } catch (error) {
            console.error("Erreur lors de la mise à jour du statut :", error);
        } finally {
            setIsProcessing(false);
        }
    };

    

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="p-4 bg-white border-b shadow-sm border-slate-200">
                <h2 className="text-sm font-black tracking-wider uppercase text-slate-800">Interface Livreur</h2>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
                <div className="max-w-md mx-auto overflow-hidden bg-white border shadow-xl rounded-3xl border-slate-100">
                    {mission ? (
                        <div className="p-5">
                            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-10 h-10 font-bold text-indigo-600 bg-indigo-100 rounded-full">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-400">Client</p>
                                        <p className="text-sm font-bold text-slate-800">{mission.clientName || "Client standard"}</p>
                                    </div>
                                </div>
                                {mission.clientPhone && (
                                    <a
                                        href={`tel:${mission.clientPhone}`}
                                        className="flex items-center justify-center w-10 h-10 transition-colors rounded-full text-emerald-600 bg-emerald-100 hover:bg-emerald-200"
                                    >
                                        <Phone size={18} />
                                    </a>
                                )}
                            </div>

                            <div className="mb-6 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex items-center justify-center rounded-lg w-7 h-7 text-slate-500 bg-slate-200 shrink-0">
                                        <MapPin size={15} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ramassage</p>
                                        <p className="text-xs font-bold text-slate-800">{mission.pickupAddress || "Non spécifiée"}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="flex items-center justify-center rounded-lg w-7 h-7 text-emerald-600 bg-emerald-100 shrink-0">
                                        <ChevronRight size={15} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination</p>
                                        <p className="text-xs font-bold text-slate-800">{mission.destination || "Non spécifiée"}</p>
                                    </div>
                                </div>
                            </div>

                            {mission.status === "accepted" && (
                                <button
                                    onClick={(e) => updateMissionStatus("arrived_at_pickup", e)}
                                    disabled={isProcessing}
                                    className="flex items-center justify-center w-full gap-2 py-4 mb-3 font-black text-white uppercase transition-all shadow-lg bg-amber-500 rounded-2xl active:scale-95"
                                >
                                    <MapPin size={18} /> ARRIVÉ AU POINT DE RAMASSAGE
                                </button>
                            )}

                            {mission.status === "arrived_at_pickup" && (
                                <div className="p-4 mb-4 border border-indigo-100 bg-indigo-50/50 rounded-2xl">
                                   
                                </div>
                            )}

                            {mission.status === "in_transit" && (
                                <button
                                    onClick={(e) => updateMissionStatus("completed", e)}
                                    disabled={isProcessing}
                                    className="flex items-center justify-center w-full gap-2 py-4 mb-3 font-black text-white uppercase transition-all shadow-lg bg-emerald-600 rounded-2xl active:scale-95"
                                >
                                    <CheckCircle2 size={18} /> TERMINER LA COURSE
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-slate-400">
                            <p className="text-xs font-bold tracking-wider uppercase">En attente de courses...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}