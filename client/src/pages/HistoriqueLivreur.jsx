import { 
  Clock, 
  Loader, 
  X, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Activity, 
  Wallet 
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from "../firebase"; 
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";

/**
 * Composant HistoriqueLivreur
 * Affiche les transactions de dépôt en temps réel dans une interface soignée.
 */
const HistoriqueLivreur = ({ livreurId, onClose }) => {
  const [historique, setHistorique] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!livreurId) return;

    // 1. Définition de la requête Firestore
    const q = query(
      collection(db, "pending-deposit"),
      where("livreurId", "==", livreurId),
      orderBy("createdAt", "desc")
    );

    // 2. Écoute en temps réel (onSnapshot)
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Conversion sécurisée du timestamp
          date: doc.data().createdAt?.toDate() || new Date()
        }));
        setHistorique(docs);
        setIsLoading(false);
      } catch (err) {
        console.error("Erreur de traitement:", err);
        setError("Erreur lors du chargement des données.");
        setIsLoading(false);
      }
    }, (err) => {
      console.error("Erreur Firestore:", err);
      setError("Connexion interrompue avec la base de données.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [livreurId]);

  // Gestion dynamique des styles de badges
  const getStatusStyle = (status) => {
    const s = status?.toLowerCase();
    if (s === 'validé' || s === 'valide') {
      return { color: 'text-green-700 bg-green-100', icon: <CheckCircle className="w-3 h-3" />, label: 'Validé' };
    }
    if (s === 'rejeté' || s === 'rejete') {
      return { color: 'text-red-700 bg-red-100', icon: <XCircle className="w-3 h-3" />, label: 'Rejeté' };
    }
    return { color: 'text-amber-700 bg-amber-100 animate-pulse', icon: <Clock className="w-3 h-3" />, label: 'En attente' };
  };

  // État de chargement
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-white shadow-xl rounded-2xl">
        <Loader className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="mt-4 text-xs font-bold tracking-widest text-gray-400 uppercase animate-pulse">
          Synchronisation...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto overflow-hidden bg-white border border-gray-100 shadow-2xl rounded-2xl max-h-[85vh]">
      
      {/* HEADER FIXE */}
      <header className="flex items-center justify-between p-6 border-b bg-gray-50/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="p-3 text-white bg-indigo-600 shadow-lg shadow-indigo-200 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl italic font-black tracking-tight text-gray-900 uppercase">
              Mes Recharges
            </h3>
            <p className="text-xs font-semibold text-gray-400">Suivi des flux financiers</p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="p-2 transition-all bg-white border border-gray-100 rounded-full shadow-sm hover:bg-red-50 hover:text-red-500"
        >
          <X className="w-6 h-6" />
        </button>
      </header>

      {/* ZONE DE CONTENU SCROLLABLE */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center p-12 text-center text-red-500">
            <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium">{error}</p>
          </div>
        ) : (
          <div className="inline-block min-w-full align-middle">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-white/95 backdrop-blur text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b">
                  <th className="px-8 py-5">Date & Heure</th>
                  <th className="px-8 py-5">Montant</th>
                  <th className="px-8 py-5">Statut</th>
                  <th className="px-8 py-5">Détails / Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historique.length > 0 ? (
                  historique.map((tx) => {
                    const style = getStatusStyle(tx.status);
                    return (
                      <tr key={tx.id} className="transition-all hover:bg-indigo-50/40 group">
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-800">{tx.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                            <span className="text-[10px] font-medium text-gray-400 group-hover:text-indigo-400 transition-colors">
                                {tx.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="text-base font-black text-gray-900">
                            {tx.montant?.toLocaleString('fr-FR')} <small className="text-[10px] ml-1">FCFA</small>
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black w-fit uppercase tracking-tighter shadow-sm ${style.color}`}>
                            {style.icon} {style.label}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-xs font-medium text-gray-500 leading-relaxed max-w-[250px]">
                            {tx.status === 'rejeté' || tx.status === 'rejete' ? (
                              <span className="px-2 py-1 italic text-red-500 border border-red-100 rounded bg-red-50">
                                ⚠️ {tx.motifRefus || "Transaction non conforme"}
                              </span>
                            ) : (
                              <span className="opacity-70">{tx.reference || "Dépôt de compte"}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="4" className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="p-6 mb-4 text-gray-200 rounded-full bg-gray-50">
                           <Wallet size={64} />
                        </div>
                        <p className="text-sm italic font-bold tracking-widest text-gray-300 uppercase">
                          Aucune activité trouvée
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FOOTER OPTIONNEL */}
      <footer className="p-4 bg-gray-50 border-t text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest">
        Système de paiement sécurisé v2.0
      </footer>
    </div>
  );
};

export default HistoriqueLivreur;