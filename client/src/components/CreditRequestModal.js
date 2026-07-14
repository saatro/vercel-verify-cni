import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { toast } from "react-toastify";
import { X, HandCoins, Loader2, AlertTriangle } from "lucide-react";

// Importation des constantes pour le statut
// Note : Si tu n'as pas de statut spécifique pour les prêts dans constants.js, 
// PENDING ('pending') est le standard.
import { COURSE_STATUS } from "../utils/constants";

export default function CreditRequestModal({ isOpen, onClose, userData }) {
  const [montant, setMontant] = useState("");
  const [raison, setRaison] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const amount = parseInt(montant);
    
    // Validation
    if (!amount || amount < 1000) {
      toast.error("Montant minimum : 1 000 F");
      return;
    }
    
    if (amount > 50000) {
      toast.error("Montant maximum : 50 000 F");
      return;
    }
    
    if (!raison || raison.trim().length < 5) {
      toast.error("Veuillez préciser la raison (min 5 caractères)");
      return;
    }

    setIsSubmitting(true);

    try {
      // ✅ Données nettoyées et synchronisées avec tes constantes
      const creditData = {
        livreurId: auth.currentUser.uid,
        livreurName: userData?.nomComplet || userData?.nom || "Livreur",
        livreurPhone: userData?.telephone || "Non renseigné",
        montant: amount,
        raison: raison.trim(),
        status: COURSE_STATUS.PENDING, // Utilisation de la constante 'pending'
        createdAt: serverTimestamp(),
        typeVehicule: userData?.typeVehicule || "Non spécifié",
        soldeActuel: userData?.solde || 0,
        typeDocument: "demande_pret" // Pour filtrer facilement côté Admin
      };

      await addDoc(collection(db, "prets"), creditData);
      
      toast.success("Demande envoyée à l'administration !");
      
      // Reset et fermeture
      setMontant("");
      setRaison("");
      onClose();
      
    } catch (error) {
      console.error("Erreur prêt:", error);
      toast.error("Erreur lors de l'envoi");
    } finally {
      setIsSubmitting(false);
    }
  };

  const montantsSuggeres = [5000, 10000, 15000, 20000];

  return (
    <div 
      className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="relative p-6 text-white bg-gradient-to-br from-indigo-600 to-purple-700">
          <button 
            onClick={onClose}
            className="absolute p-2 transition-colors rounded-full top-4 right-4 bg-white/20 hover:bg-white/30"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-2xl bg-white/20">
              <HandCoins size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase">Demande de Prêt</h2>
              <p className="text-sm opacity-80">Support financier professionnel</p>
            </div>
          </div>

          <div className="p-3 mt-4 border-2 rounded-2xl bg-white/10 border-white/20 backdrop-blur-md">
            <p className="text-[10px] font-black uppercase opacity-70 tracking-widest">Solde Actuel</p>
            <p className="text-2xl font-black">{(userData?.solde || 0).toLocaleString()} F</p>
          </div>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* MONTANT */}
          <div>
            <label className="block mb-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Montant souhaité (FCFA)
            </label>
            <div className="relative">
                <input
                type="number"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="Ex: 15000"
                className="w-full px-4 py-4 text-xl font-black transition-all border-2 outline-none rounded-2xl border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                disabled={isSubmitting}
                />
                <div className="absolute font-black -translate-y-1/2 right-4 top-1/2 text-slate-300">F</div>
            </div>
            
            <div className="grid grid-cols-4 gap-2 mt-3">
              {montantsSuggeres.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMontant(m.toString())}
                  className={`py-2 text-[11px] font-black rounded-xl transition-all border-2 ${
                    parseInt(montant) === m
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                      : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200'
                  }`}
                  disabled={isSubmitting}
                >
                  {(m/1000)}K
                </button>
              ))}
            </div>
          </div>

          {/* RAISON */}
          <div>
            <label className="block mb-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Motif de la demande
            </label>
            <textarea
              value={raison}
              onChange={(e) => setRaison(e.target.value)}
              placeholder="Décrivez brièvement votre besoin..."
              rows={3}
              className="w-full px-4 py-3 text-sm font-bold transition-all border-2 outline-none resize-none rounded-2xl border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              disabled={isSubmitting}
              maxLength={200}
            />
            <div className="flex justify-end mt-1">
                <span className={`text-[10px] font-black ${raison.length >= 200 ? 'text-red-500' : 'text-slate-300'}`}>
                    {raison.length}/200
                </span>
            </div>
          </div>

          {/* INFO BOX */}
          <div className="flex items-start gap-3 p-4 border rounded-2xl bg-amber-50/50 border-amber-100">
            <AlertTriangle className="text-amber-500 shrink-0" size={18} />
            <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
              Le remboursement s'effectuera par prélèvements automatiques sur vos prochaines commissions de courses.
            </p>
          </div>

          {/* ACTIONS */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 font-black transition-colors text-slate-500 bg-slate-50 rounded-2xl hover:bg-slate-100"
              disabled={isSubmitting}
            >
              Plus tard
            </button>
            <button
              type="submit"
              className="flex items-center justify-center flex-[1.5] gap-2 py-4 font-black text-white transition-all bg-indigo-600 rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span className="text-xs tracking-widest uppercase">Traitement...</span>
                </>
              ) : (
                <>
                  <HandCoins size={18} />
                  <span className="text-xs tracking-widest uppercase">Confirmer</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}