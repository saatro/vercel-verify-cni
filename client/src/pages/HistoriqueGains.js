import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy 
} from "firebase/firestore";
import { 
  TrendingUp, 
  Calendar, 
  ChevronLeft, 
  Loader2, 
  Wallet
} from "lucide-react"; // Retrait de AlertTriangle (inutilisé)
import { useNavigate } from "react-router-dom";

export default function HistoriqueGains() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [gains, setGains] = useState([]);
  const [totalGains, setTotalGains] = useState(0);

  useEffect(() => {
    const fetchGains = async () => {
      if (!auth.currentUser) return;

      try {
        const q = query(
          collection(db, "courses"),
          where("livreurId", "==", auth.currentUser.uid),
          where("status", "==", "termine"),
          orderBy("createdAt", "desc")
        );

        const querySnapshot = await getDocs(q);
        const gainsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setGains(gainsData);
        const total = gainsData.reduce((acc, curr) => acc + (curr.prixLivraison || 0), 0);
        setTotalGains(total);
      } catch (error) {
        console.error("Erreur lors de la récupération des gains:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGains();
  }, []); // Dépendances stables

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="text-indigo-600 animate-spin" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 bg-white border-b">
        <button onClick={() => navigate(-1)} className="p-2 mb-4 rounded-full hover:bg-slate-100">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-black uppercase">Mes <span className="text-indigo-600">Gains</span></h1>
      </div>

      <div className="p-6">
        <div className="p-6 mb-6 text-white shadow-xl bg-slate-900 rounded-3xl">
          <div className="flex items-center gap-3 mb-2 opacity-70">
            <Wallet size={18} />
            <span className="text-xs font-bold tracking-wider uppercase">Total accumulé</span>
          </div>
          <div className="text-4xl font-black">{totalGains.toLocaleString()} FCFA</div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4 text-slate-400">
            <TrendingUp size={18} />
            <span className="text-xs font-black uppercase">Détails des courses</span>
          </div>

          {gains.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-bold text-slate-400">Aucun gain enregistré pour le moment.</p>
            </div>
          ) : (
            gains.map((gain) => (
              <div key={gain.id} className="p-5 bg-white border-2 shadow-sm border-slate-100 rounded-3xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar size={14} />
                    <span className="text-[10px] font-bold">
                      {gain.createdAt?.toDate().toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <span className="px-3 py-1 text-[10px] font-black text-emerald-600 bg-emerald-50 rounded-full uppercase">
                    + {gain.prixLivraison} FCFA
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-600">Course #{gain.id.slice(0, 8)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}