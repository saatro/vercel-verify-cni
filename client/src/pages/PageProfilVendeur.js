import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { 
  User, 
  Store, 
  Truck, 
  Home, 
  Settings, 
  LogOut, 
  Package,
  Camera,
  MapPin,
  CheckCircle
} from "lucide-react";

export default function LayoutDynamique({ children }) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserRole = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role);
        }
      }
      setLoading(false);
    };
    fetchUserRole();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen">Chargement...</div>;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {/* Zone de contenu Scrollable */}
      <main className="flex-1 pb-24 overflow-y-auto">
        {children}
      </main>

      {/* Barre de Navigation Style Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        
        {/* Accueil (Commun) */}
        <button onClick={() => navigate("/")} className="flex flex-col items-center gap-1 transition-colors text-slate-400 focus:text-emerald-600">
          <Home size={24} />
          <span className="text-[10px] font-bold uppercase">Accueil</span>
        </button>

        {/* Bouton Central Dynamique */}
        {role === "vendeur" && (
          <button onClick={() => navigate("/mes-produits")} className="flex flex-col items-center gap-1 text-slate-400 focus:text-emerald-600">
            <Package size={24} />
            <span className="text-[10px] font-bold uppercase">Produits</span>
          </button>
        )}

        {role === "livreur" && (
          <button onClick={() => navigate("/mes-courses")} className="flex flex-col items-center gap-1 text-slate-400 focus:text-emerald-600">
            <Truck size={24} />
            <span className="text-[10px] font-bold uppercase">Courses</span>
          </button>
        )}

        {/* Profil (S'adapte selon le rôle) */}
        <button onClick={() => navigate("/profil")} className="flex flex-col items-center gap-1 text-emerald-600">
          {role === "vendeur" ? <Store size={24} /> : <User size={24} />}
          <span className="text-[10px] font-bold uppercase">Profil</span>
        </button>

        <button onClick={() => navigate("/reglages")} className="flex flex-col items-center gap-1 text-slate-400 focus:text-emerald-600">
          <Settings size={24} />
          <span className="text-[10px] font-bold uppercase">Réglages</span>
        </button>
      </nav>
    </div>
  );
}

// --- COMPOSANT PROFIL VENDEUR ---
export function PageProfilVendeur() {
  const [boutique, setBoutique] = useState({
    nom: "Ma Boutique Bio",
    emplacement: "Marché Central",
    chiffre: "150,000 FCFA",
    couleur: "#10b981"
  });

  return (
    <div className="p-4 space-y-6">
      {/* Header Profil Vendeur */}
      <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-center w-20 h-20 mb-4 border rounded-full bg-white/20 backdrop-blur-md border-white/30">
            <Store size={40} />
          </div>
          <h2 className="text-2xl font-black">{boutique.nom}</h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-emerald-100">
            <MapPin size={14} />
            <span>{boutique.emplacement}</span>
          </div>
        </div>
        <CheckCircle className="absolute -right-4 -bottom-4 text-white/10" size={120} />
      </div>

      {/* Statistiques Rapides */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-6 bg-white border shadow-sm rounded-3xl border-slate-100">
          <p className="text-slate-400 text-[10px] font-black uppercase">Ventes du mois</p>
          <p className="text-xl font-black text-slate-800">{boutique.chiffre}</p>
        </div>
        <div className="p-6 bg-white border shadow-sm rounded-3xl border-slate-100">
          <p className="text-slate-400 text-[10px] font-black uppercase">Commandes</p>
          <p className="text-xl font-black text-slate-800">24</p>
        </div>
      </div>

      {/* Actions Vendeur */}
      <div className="space-y-3">
        <button className="flex items-center justify-between w-full p-5 font-bold bg-white border rounded-2xl border-slate-100 text-slate-700">
          <div className="flex items-center gap-3">
            <Package className="text-emerald-500" />
            <span>Ajouter un produit</span>
          </div>
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100">+</span>
        </button>
        
        <button className="flex items-center justify-between w-full p-5 font-bold bg-white border rounded-2xl border-slate-100 text-slate-700">
          <div className="flex items-center gap-3">
            <Camera className="text-blue-500" />
            <span>Modifier la vitrine</span>
          </div>
        </button>
      </div>

      {/* Bouton de déconnexion */}
      <button 
        onClick={() => auth.signOut()}
        className="flex items-center justify-center w-full gap-2 p-5 text-xs font-black tracking-widest text-red-500 uppercase border border-red-100 bg-red-50 rounded-2xl"
      >
        <LogOut size={18} />
        Déconnexion
      </button>
    </div>
  );
}