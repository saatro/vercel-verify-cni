import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { 
  User, Phone, Bike, LogOut, ChevronRight, 
  Wallet, MapPin, Settings, 
  HelpCircle, ShieldCheck
} from 'lucide-react';
import { toast } from 'react-toastify';
import { auth, db } from '../firebase';
import LivreurNavbar from '../components/LivreurNavbar';

export default function ProfilLivreur() {
    const [userData, setUserData] = useState(null);
    const [stats, setStats] = useState({ total: 0, rating: 4.8 });
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            navigate('/login-livreur');
            return;
        }

        // 1. Sync User Data (Soldes, Nom, etc.)
        const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data());
            }
            setLoading(false);
        });

        // 2. Fetch Stats Rapides (Total courses terminées)
        const fetchStats = async () => {
            const q = query(
                collection(db, "livraisons"), 
                where("assignedLivreurId", "==", user.uid),
                where("status", "==", "completed")
            );
            const snap = await getDocs(q);
            setStats(prev => ({ ...prev, total: snap.size }));
        };

        fetchStats();
        return () => unsub();
    }, [navigate]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login-livreur');
        } catch (error) {
            toast.error("Erreur de déconnexion");
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-screen gap-3 bg-slate-50">
            <div className="w-5 h-5 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
            <p className="italic font-black text-slate-400">CHARGEMENT DU PROFIL...</p>
        </div>
    );

    return (
        <div className="min-h-screen pb-13 bg-slate-50">
            {/* HEADER - PHOTO & NOM */}
            <div className="bg-[#111] text-white px-8 pt-8 pb-5 rounded-b-[34px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full -mt-13 -mr-13 bg-indigo-600/10 blur-3xl"></div>
                
                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="relative">
                        <div className="w-21 h-21 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-[21px] flex items-center justify-center shadow-2xl border-4 border-white/10">
                            <User size={34} className="text-white" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-green-500 w-8 h-8 rounded-full border-4 border-[#111] flex items-center justify-center">
                            <ShieldCheck size={14} className="text-white" />
                        </div>
                    </div>
                    
                    <h1 className="mt-2 font-black tracking-tight uppercase text-1xl">
                        {userData?.nomComplet || "Livreur"}
                    </h1>
                    <p className="mt-0.5 text-xs font-bold tracking-widest text-indigo-400 uppercase opacity-80">
                        Livreur Partenaire Certifié
                    </p>
                </div>

                {/* MINI STATS CARDS */}
                <div className="grid grid-cols-3 gap-2 mt-5">
                    <div className="p-1 text-center border bg-white/5 backdrop-blur-md rounded-1xl border-white/10">
                        <p className="text-indigo-400 text-[8px] font-black uppercase">Courses</p>
                        <p className="text-xl font-black">{stats.total}</p>
                    </div>
                    <div className="p-1 text-center border bg-white/5 backdrop-blur-md rounded-1xl border-white/10">
                        <p className="text-yellow-400 text-[8px] font-black uppercase">Note</p>
                        <p className="text-xl font-black">{stats.rating}</p>
                    </div>
                    <div className="p-1 text-center border bg-white/5 backdrop-blur-md rounded-1xl border-white/10">
                        <p className="text-green-400 text-[8px] font-black uppercase">Statut</p>
                        <p className="text-[8px] font-black mt-2 leading-none">ACTIF</p>
                    </div>
                </div>
            </div>

            <div className="relative z-20 px-5 -mt-5 space-y-3">
                {/* CARD SOLDE COMBINÉ */}
                <div className="bg-white rounded-[35px] p-3 shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <div className="p-2 text-indigo-600 bg-indigo-50 rounded-1xl">
                            <Wallet size={21} />
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase">Portefeuille</p>
                            <p className="text-xl font-black text-slate-500">{(userData?.solde || 0) + (userData?.soldeJetons || 0)} F</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => navigate('/gains')}
                        className="p-2 text-white bg-slate-700 rounded-2xl"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                {/* INFORMATIONS PERSONNELLES */}
                <div className="bg-white rounded-[13px] p-3 shadow-sm border border-slate-100">
                    <h2 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-4">Informations Compte</h2>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-4">
                                <div className="p-2 transition-colors bg-slate-50 rounded-2xl text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                                    <Phone size={15} />
                                </div>
                                <div>
                                    <p className="text-[8px] font-black text-slate-300 uppercase">Téléphone</p>
                                    <p className="font-bold text-slate-700">{userData?.telephone || "N/A"}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 transition-colors bg-slate-50 rounded-2xl text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                                    <Bike size={15} />
                                </div>
                                <div>
                                    <p className="text-[8px] font-black text-slate-300 uppercase">Véhicule Actuel</p>
                                    <p className="font-bold text-slate-700">{userData?.typeVehicule || "Moto Classique"}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 transition-colors bg-slate-50 rounded-2xl text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                                    <MapPin size={15} />
                                </div>
                                <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase">Ville</p>
                                    <p className="font-bold text-slate-900">{userData?.ville || "Abidjan"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* OPTIONS SUPPLÉMENTAIRES */}
                <div className="bg-white rounded-[13px] overflow-hidden shadow-sm border border-slate-100">
                    <button className="flex items-center justify-between w-full p-1 transition-colors border-b hover:bg-slate-50 border-slate-50">
                        <div className="flex items-center gap-5">
                            <HelpCircle size={15} className="text-slate-400" />
                            <span className="font-bold text-slate-700">Aide & Assistance</span>
                        </div>
                        <ChevronRight size={15} className="text-slate-300" />
                    </button>
                    <button className="flex items-center justify-between w-full p-5 transition-colors hover:bg-slate-50">
                        <div className="flex items-center gap-4">
                            <Settings size={15} className="text-slate-400" />
                            <span className="font-bold text-slate-700">Paramètres</span>
                        </div>
                        <ChevronRight size={15} className="text-slate-300" />
                    </button>
                </div>

                {/* BOUTON DÉCONNEXION */}
                <button 
                    onClick={handleLogout} 
                    className="flex items-center justify-center w-full gap-2 p-2 font-black text-red-500 bg-red-50 rounded-[35px] hover:bg-red-100 transition-all active:scale-95"
                >
                    <LogOut size={17} /> 
                    <span className="tracking-widest uppercase">Déconnexion du compte</span>
                </button>
            </div>

            <LivreurNavbar />
        </div>
    );
}