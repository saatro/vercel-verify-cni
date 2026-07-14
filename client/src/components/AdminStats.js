import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { TrendingUp, ShoppingBag, Users, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function AdminStats() {
  const [stats, setStats] = useState({
    totalGains: 0,
    coursesTerminees: 0,
    livreursActifs: 0,
    rechargesEnAttente: 0
  });

  useEffect(() => {
    // 1. Écouter les livraisons pour le CA et le volume
    const unsubLivraisons = onSnapshot(collection(db, "livraisons"), (snap) => {
      const docs = snap.docs.map(d => d.data());
      const terminees = docs.filter(d => d.status === "completed");
      const total = terminees.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
      
      setStats(prev => ({ 
        ...prev, 
        totalGains: total, 
        coursesTerminees: terminees.length 
      }));
    });

    // 2. Écouter les livreurs connectés
    const qLivreurs = query(collection(db, "users"), where("role", "==", "livreur"));
    const unsubLivreurs = onSnapshot(qLivreurs, (snap) => {
      setStats(prev => ({ ...prev, livreursActifs: snap.size }));
    });

    // 3. Écouter les recharges à valider
    const qRecharges = query(collection(db, "pending-deposit"), where("status", "==", "En attente"));
    const unsubRecharges = onSnapshot(qRecharges, (snap) => {
      setStats(prev => ({ ...prev, rechargesEnAttente: snap.size }));
    });

    return () => {
      unsubLivraisons();
      unsubLivreurs();
      unsubRecharges();
    };
  }, []);

  const cards = [
    { 
      label: "Chiffre d'Affaires", 
      value: `${stats.totalGains.toLocaleString()} F`, 
      icon: <TrendingUp className="text-emerald-500" />, 
      color: "bg-emerald-50",
      trend: "+12% vs hier" 
    },
    { 
      label: "Courses Livrées", 
      value: stats.coursesTerminees, 
      icon: <ShoppingBag className="text-blue-500" />, 
      color: "bg-blue-50",
      trend: "Total historique" 
    },
    { 
      label: "Livreurs Inscrits", 
      value: stats.livreursActifs, 
      icon: <Users className="text-indigo-500" />, 
      color: "bg-indigo-50",
      trend: "Prêts à livrer" 
    },
    { 
      label: "Recharges à Valider", 
      value: stats.rechargesEnAttente, 
      icon: <Wallet className="text-amber-500" />, 
      color: "bg-amber-50",
      trend: stats.rechargesEnAttente > 0 ? "Action requise" : "À jour" 
    },
  ];

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-black tracking-tight text-gray-800 uppercase">
        Performance Globale
      </h2>
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => (
          <div key={index} className="p-6 bg-white border border-gray-100 shadow-sm rounded-3xl transition-hover hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-2xl ${card.color}`}>
                {card.icon}
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${card.label === "Recharges à Valider" && stats.rechargesEnAttente > 0 ? "bg-red-100 text-red-600 animate-pulse" : "bg-gray-100 text-gray-500"}`}>
                {card.trend}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <h3 className="mt-1 text-2xl font-black text-gray-900">{card.value}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}