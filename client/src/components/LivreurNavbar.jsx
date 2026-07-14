import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Radar, History, Wallet, User } from 'lucide-react';

export default function LivreurNavbar() {
    const navigate = useNavigate();
    const location = useLocation();

    // Configuration des onglets pour éviter la répétition de code
    const tabs = [
        { id: 'radar', label: 'Radar', icon: Radar, path: '/livreur-alepe' },
        { id: 'gains', label: 'Gains', icon: History, path: '/historique-gains' },
        { id: 'recharge', label: 'Recharge', icon: Wallet, path: '/upload-recu' },
        { id: 'profil', label: 'Profil', icon: User, path: '/profil-livreur' },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-[2001] bg-white/80 backdrop-blur-md border-t border-slate-100 px-2 pb-6 pt-3 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-around max-w-md mx-auto">
                {tabs.map((tab) => {
                    const active = location.pathname === tab.path;
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => navigate(tab.path)}
                            className={`relative flex flex-col items-center min-w-[64px] transition-all duration-300 active:scale-90 ${
                                active ? 'text-indigo-600' : 'text-slate-400'
                            }`}
                        >
                            {/* Petite barre indicatrice au-dessus de l'icône active */}
                            {active && (
                                <div className="absolute -top-[12px] w-8 h-1 bg-indigo-600 rounded-full animate-in fade-in zoom-in" />
                            )}
                            
                            <Icon 
                                size={24} 
                                strokeWidth={active ? 2.5 : 2} 
                                className={active ? 'drop-shadow-[0_0_8px_rgba(79,70,229,0.3)]' : ''}
                            />
                            
                            <span className={`text-[10px] mt-1 font-black uppercase tracking-tighter ${
                                active ? 'opacity-100' : 'opacity-60'
                            }`}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}