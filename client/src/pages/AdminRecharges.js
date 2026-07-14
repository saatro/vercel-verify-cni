import { useEffect, useState } from "react";
import { db } from "../firebase";
import { 
  collection, query, where, onSnapshot, doc, 
  updateDoc, increment, runTransaction, serverTimestamp 
} from "firebase/firestore";
import { Check, X, CreditCard, User, AlertCircle, Loader, ShieldCheck } from "lucide-react"; // Ajout de ShieldCheck
import { toast } from "react-toastify";

export default function AdminRecharges() {
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On récupère les dépôts "En attente"
    const q = query(collection(db, "pending-deposit"), where("status", "==", "En attente"));
    
    const unsub = onSnapshot(q, (snap) => {
      setDemandes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleApprove = async (deposit) => {
    const confirmApprove = window.confirm(`Valider la recharge de ${deposit.montant} F pour ${deposit.livreurNom} ?`);
    if (!confirmApprove) return;

    try {
      await runTransaction(db, async (transaction) => {
        const livreurRef = doc(db, "users", deposit.livreurId);
        const depositRef = doc(db, "pending-deposit", deposit.id);

        const livreurSnap = await transaction.get(livreurRef);
        if (!livreurSnap.exists()) throw "Le livreur n'existe plus !";

        // 1. Créditer le compte (on utilise 'solde' comme dans ta transaction)
        transaction.update(livreurRef, {
          solde: increment(deposit.montant)
        });

        // 2. Valider le dépôt
        transaction.update(depositRef, {
          status: "validé",
          validatedAt: serverTimestamp()
        });
      });

      toast.success("Compte crédité avec succès !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la validation.");
    }
  };

  const handleReject = async (deposit) => {
    const motif = prompt("Motif du refus :");
    if (!motif) return;

    try {
      const depositRef = doc(db, "pending-deposit", deposit.id);
      await updateDoc(depositRef, {
        status: "rejeté",
        motifRefus: motif,
        rejectedAt: serverTimestamp()
      });
      toast.info("Dépôt rejeté.");
    } catch (e) {
      toast.error("Erreur.");
    }
  };

  if (loading) return <div className="p-10 text-center"><Loader className="mx-auto animate-spin" /></div>;

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="flex items-center gap-2 mb-6 text-2xl font-black text-gray-800">
          <CreditCard className="text-indigo-600" /> VALIDATION DES RECHARGES
        </h2>

        <div className="grid gap-4">
          {demandes.length === 0 && (
            <div className="p-12 text-center bg-white border-2 border-gray-200 border-dashed rounded-2xl">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-bold tracking-widest text-gray-400 uppercase">Aucune demande en attente</p>
            </div>
          )}

          {demandes.map((d) => (
            <div key={d.id} className="flex flex-col items-center justify-between gap-4 p-5 transition-all bg-white border border-gray-100 shadow-sm rounded-2xl md:flex-row hover:shadow-md">
              <div className="flex items-center flex-1 gap-4">
                <div className="flex items-center justify-center w-12 h-12 text-indigo-600 rounded-full bg-indigo-50">
                  <User size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">{d.livreurNom || "Livreur Inconnu"}</h4>
                  
                  {/* --- AJOUT DE LA LIGNE IA ICI --- */}
                  {d.aiVerified && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full w-fit border border-green-100">
                      <ShieldCheck size={10} /> ANALYSÉ PAR IA ({d.vendor || "Reçu"})
                    </div>
                  )}
                  {/* ------------------------------- */}

                  <p className="mt-1 text-xs font-medium text-gray-500">Ref: {d.reference || "N/A"}</p>
                </div>
              </div>

              <div className="px-6 text-center md:text-right">
                <p className="text-xl font-black text-green-600">+{d.montant?.toLocaleString()} F</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase italic">
                    {d.createdAt?.toDate().toLocaleString()}
                </p>
              </div>

              <div className="flex w-full gap-2 md:w-auto">
                <button 
                  onClick={() => handleApprove(d)}
                  className="flex-1 p-3 text-white transition-all bg-green-500 shadow-lg md:flex-none rounded-xl hover:bg-green-600 shadow-green-100 active:scale-90"
                >
                  <Check size={20} className="mx-auto" />
                </button>
                <button 
                  onClick={() => handleReject(d)}
                  className="flex-1 p-3 text-red-500 transition-all bg-red-100 md:flex-none rounded-xl hover:bg-red-200 active:scale-90"
                >
                  <X size={20} className="mx-auto" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}