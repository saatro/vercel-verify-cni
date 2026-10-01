import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { 
  Home, 
  User, 
  Wallet, 
  Package, 
  LogOut, 
  X, 
  ChevronRight, 
  ShieldCheck,
  HelpCircle,
  MessageSquare
} from 'lucide-react';
import './SideMenu.css';

export default function SideMenu({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userData, setUserData] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubscribeMessages = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setUserData({ id: currentUser.uid, ...userDoc.data() });
          } else {
            setUserData({
              id: currentUser.uid,
              nomComplet: currentUser.displayName || 'Utilisateur',
              email: currentUser.email || currentUser.phoneNumber || ''
            });
          }

          // Écoute en temps réel des messages non lus pour ce livreur
          const q = query(
            collection(db, 'inAppMessages'),
            where('receiverId', '==', currentUser.uid),
            where('read', '==', false)
          );

          unsubscribeMessages = onSnapshot(q, (snapshot) => {
            setUnreadCount(snapshot.size);
          }, (error) => {
            console.error("Erreur écoute messages non lus :", error);
          });

        } catch (error) {
          console.error("Erreur lors de la récupération des données utilisateur :", error);
        }
      } else {
        setUserData(null);
        setUnreadCount(0);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, []);

  const handleNavigate = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (onClose) onClose();
      navigate('/login-livreur');
    } catch (error) {
      console.error("Erreur de déconnexion :", error);
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Badge ou pastille flottante visible en permanence sur l'écran (hors du menu) pour alerter sans ouvrir le menu */}
      {!isOpen && unreadCount > 0 && (
        <button
          onClick={() => navigate('/messagerie-livreur')}
          className="fixed bottom-6 right-6 z-[998] flex items-center gap-2 bg-red-600 text-white px-4 py-3 rounded-full shadow-2xl hover:bg-red-700 transition-all animate-bounce"
          aria-label="Nouveaux messages"
        >
          <MessageSquare className="w-5 h-5 text-white" />
          <span className="text-xs font-bold">
            {unreadCount} nouveau{unreadCount > 1 ? 'x' : ''} message{unreadCount > 1 ? 's' : ''}
          </span>
        </button>
      )}

      {/* Si le menu n'est pas ouvert, on s'arrête là */}
      {!isOpen ? null : (
        <div className="fixed inset-0 z-[9999] flex">
          {/* Overlay de fond sombre avec z-index élevé */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[9999]" 
            onClick={onClose}
          />

          {/* Panneau de menu latéral */}
          <div className="relative flex flex-col w-4/5 max-w-sm h-full bg-white shadow-2xl z-[10000] overflow-y-auto">
            
            {/* En-tête du menu */}
            <div className="flex items-center justify-between p-5 text-white bg-blue-600">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 text-lg font-bold text-white rounded-full bg-white/20 backdrop-blur-md">
                  {userData?.nomComplet ? userData.nomComplet.charAt(0).toUpperCase() : <User className="w-6 h-6" />}
                </div>
                <div>
                  <h2 className="text-base font-bold leading-tight">
                    {userData?.nomComplet || userData?.nom || "Livreur Partenaire"}
                  </h2>
                  <p className="text-xs text-blue-100 mt-0.5">
                    {userData?.telephone || userData?.email || "Connecté"}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Fermer le menu"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Badges de statut si utilisateur connecté */}
            {userData && (
              <div className="flex items-center justify-between px-5 py-3 border-b border-blue-100 bg-blue-50">
                <span className="flex items-center gap-1.5 text-xs font-medium text-blue-800">
                  <ShieldCheck className="w-4 h-4 text-blue-600" /> Compte Vérifié
                </span>
                {userData?.solde !== undefined && (
                  <span className="text-xs font-bold text-gray-700">
                    Solde: <span className="text-green-600">{userData.solde.toLocaleString()} FCFA</span>
                  </span>
                )}
              </div>
            )}

            {/* Liste des Liens de Navigation */}
            <nav className="flex-1 px-4 py-4 space-y-1">
              
              {/* Accueil */}
              <button
                onClick={() => handleNavigate('/')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive('/') 
                    ? 'bg-blue-50 text-blue-600 font-semibold' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Home className="w-5 h-5" />
                  <span>Accueil</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {/* Rechargement Solde (UploadRecu) */}
              <button
                onClick={() => handleNavigate('/upload-recu')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive('/rechargement') || isActive('/upload-recu')
                    ? 'bg-blue-50 text-blue-600 font-semibold' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                  <span>Rechargement Solde</span>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Wave</span>
              </button>

              {/* Profil Livreur (ProfileLivreur) */}
              <button
                onClick={() => handleNavigate('/profil-livreur')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive('/profil-livreur') 
                    ? 'bg-blue-50 text-blue-600 font-semibold' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <span>Mon Profil & Gains</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {/* Livraisons */}
              <button
                onClick={() => handleNavigate('/mes-courses')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive('/mes-courses')
                    ? 'bg-blue-50 text-blue-600 font-semibold' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-amber-600" />
                  <span>Mes Livraisons</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {/* Messagerie Livreur avec Badge de notification intégré */}
<button
  onClick={() => handleNavigate('/livreur/inbox')}
  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
    isActive('/livreur/inbox')
      ? 'bg-blue-50 text-blue-600 font-semibold' 
      : 'text-gray-700 hover:bg-gray-100'
  }`}
>
  <div className="flex items-center gap-3">
    <MessageSquare className="w-5 h-5 text-indigo-600" />
    <span>Messagerie</span>
  </div>
  <div className="flex items-center gap-2">
    {unreadCount > 0 && (
      <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
        {unreadCount}
      </span>
    )}
    <ChevronRight className="w-4 h-4 opacity-50" />
  </div>
</button>

            </nav>

            {/* Pied du menu : Assistance & Déconnexion */}
            <div className="p-4 space-y-2 border-t border-gray-100">
              <p className="px-2 mb-1 text-xs font-medium text-gray-400">
                Contrôle & Validation des reçus
              </p>
              <button
                onClick={() => handleNavigate('/profil-livreur')}
                className="flex items-center w-full gap-3 px-4 py-3 text-xs font-medium text-gray-600 transition-colors rounded-xl bg-gray-50 hover:bg-gray-100"
              >
                <HelpCircle className="w-4 h-4 text-blue-600" />
                <span>Profil & Assistance Wave</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center w-full gap-3 px-4 py-3 text-sm font-medium text-red-600 transition-colors rounded-xl hover:bg-red-50"
              >
                <LogOut className="w-5 h-5" />
                <span>Déconnexion</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}