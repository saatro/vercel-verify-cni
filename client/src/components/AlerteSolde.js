import { AlertTriangle, ArrowRight } from 'lucide-react';

export default function AlerteSolde({ solde, onRechargeClick }) {
    if (solde >= 500) return null;

    return (
        <div className="mt-2 animate-bounce">
            <div className="flex items-center justify-between p-3 bg-white border-l-4 border-red-500 shadow-2xl rounded-r-2xl">
                <div className="flex items-center">
                    <div className="p-2 mr-3 bg-red-100 rounded-full">
                        <AlertTriangle className="text-red-600" size={18} />
                    </div>
                    <div>
                        <p className="text-red-800 font-black text-[9px] uppercase tracking-tighter">Solde insuffisant</p>
                        <p className="text-sm font-bold text-red-600">{solde.toLocaleString()} F</p>
                    </div>
                </div>
                <button
                    onClick={onRechargeClick}
                    className="flex items-center gap-1 px-3 py-2 text-[10px] font-black text-white bg-red-600 rounded-xl active:scale-95 transition-transform"
                >
                    RECHARGER <ArrowRight size={12} />
                </button>
            </div>
        </div>
    );
}