import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { 
  User, 
  Phone, 
  ShieldCheck, 
  LogOut, 
  Package, 
  TrendingUp, 
  Clock, 
  HelpCircle, 
  PhoneCall, 
  CheckCircle,
  ExternalLink,
  ArrowLeft
} from 'lucide-react';

export default function ProfileLivreur() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    livraisonsEffectuees: 0,
    gainTotal: 0,
    enCours: 0
  });
  const [showAssistanceModal, setShowAssistanceModal] = useState(false);

  const navigate = useNavigate();

  // Numéro et lien d'enregistrement du contact assistance Wave
  const ASSISTANCE_PHONE = "+2250700000000"; // Remplacez par le numéro réel
  const WAVE_ME_LINK = `https://wave.com/m/${ASSISTANCE_PHONE}`; // Lien direct vcard / Wave / WhatsApp

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
          navigate('/login-livreur');
        }
        return;
      }

      if (isMounted) {
        setUser(currentUser);
      }

      // Récupération des statistiques Firestore
      try {
        const q = query(
          collection(db, 'livraisons'),
          where('livreurId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);

        if (isMounted) {
          let countCompleted = 0;
          let countPending = 0;
          let totalGains = 0;

          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.statut === 'livré') {
              countCompleted += 1;
              totalGains += data.tarif || 0;
            } else if (data.statut === 'en_cours') {
              countPending += 1;
            }
          });

          setStats({
            livraisonsEffectuees: countCompleted,
            gainTotal: totalGains,
            enCours: countPending
          });
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des statistiques :", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login-livreur');
    } catch (error) {
      console.error("Erreur de déconnexion :", error);
    }
  };

  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-b-2 border-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen pb-12 overflow-y-auto bg-gray-100">
      {/* En-tête / Bannière avec Bouton Retour */}
      <div className="relative flex-shrink-0 w-full h-32 px-4 pt-4 bg-blue-600">
        <button
          onClick={handleGoBack}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-white/90 backdrop-blur-sm rounded-xl shadow-sm hover:bg-white transition-all active:scale-95"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour</span>
        </button>
      </div>

      {/* Carte Profil */}
      <div className="max-w-4xl px-4 mx-auto sm:px-6 lg:px-8">
        <div className="relative p-6 mb-6 -mt-16 bg-white shadow-sm rounded-2xl">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="flex items-center justify-center w-20 h-20 text-blue-600 bg-blue-100 border-4 border-white rounded-full shadow-md">
              <User className="w-10 h-10" />
            </div>
            
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-xl font-bold text-gray-900">
                {user?.displayName || "Livreur Partenaire"}
              </h1>
              <p className="flex items-center justify-center gap-1 mt-1 text-sm text-gray-500 sm:justify-start">
                <Phone className="w-4 h-4" /> {user?.phoneNumber || user?.email || "Non spécifié"}
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <ShieldCheck className="w-3.5 h-3.5" /> Compte Vérifié
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 mt-4 text-sm font-medium text-red-600 transition-colors border border-red-200 sm:mt-0 hover:bg-red-50 rounded-xl"
            >
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>

        {/* Grille de Statistiques */}
        <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-3">
          <div className="flex items-center gap-4 p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="p-3 text-blue-600 bg-blue-50 rounded-xl">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Effectuées</p>
              <p className="text-2xl font-bold text-gray-900">{stats.livraisonsEffectuees}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">En Cours</p>
              <p className="text-2xl font-bold text-gray-900">{stats.enCours}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="p-3 text-green-600 bg-green-50 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Gains Totaux</p>
              <p className="text-2xl font-bold text-gray-900">{stats.gainTotal.toLocaleString()} FCFA</p>
            </div>
          </div>
        </div>

        {/* Section Validation Paiements & Assistance */}
        <div className="p-6 mb-6 text-white shadow-md bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CheckCircle className="w-5 h-5" /> Confirmation des paiements Wave
              </h2>
              <p className="max-w-xl mt-1 text-sm opacity-90">
                Pour valider vos rechargements ou versements, enregistrez le contact du service assistance afin de procéder au contrôle complet de vos reçus directement depuis Wave.
              </p>
            </div>
            <button
              onClick={() => setShowAssistanceModal(true)}
              className="whitespace-nowrap px-5 py-2.5 bg-white text-blue-600 hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm"
            >
              Enregistrer l'Assistance
            </button>
          </div>
        </div>
      </div>

      {/* Modal d'instructions Assistance Wave */}
      {showAssistanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md p-6 bg-white shadow-xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="flex items-center gap-2 mb-2 text-lg font-bold text-gray-900">
              <HelpCircle className="w-5 h-5 text-blue-600" />
              Procédure de Vérification Wave
            </h3>
            
            <p className="mb-4 text-sm text-gray-600">
              Afin d'assurer le suivi des transactions et la vérification complète des reçus depuis l'interface Wave, veuillez suivre ces étapes :
            </p>

            <ol className="mb-6 space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="flex items-center justify-center flex-shrink-0 w-6 h-6 text-xs font-bold text-blue-600 bg-blue-100 rounded-full">1</span>
                <span>Ajoutez le numéro <strong>{ASSISTANCE_PHONE}</strong> à vos contacts sous le nom <strong>"Assistance Validation"</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex items-center justify-center flex-shrink-0 w-6 h-6 text-xs font-bold text-blue-600 bg-blue-100 rounded-full">2</span>
                <span>Ouvrez votre application <strong>Wave</strong> et accédez à votre reçu complet de paiement.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex items-center justify-center flex-shrink-0 w-6 h-6 text-xs font-bold text-blue-600 bg-blue-100 rounded-full">3</span>
                <span>Transférez ou partagez le reçu au contact Assistance pour confirmation immédiate.</span>
              </li>
            </ol>

            <div className="flex flex-col gap-2">
              <a
                href={WAVE_ME_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-medium rounded-xl text-sm hover:bg-blue-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Ouvrir l'Assistance Wave
              </a>
              <a
                href={`tel:${ASSISTANCE_PHONE}`}
                className="flex items-center justify-center w-full gap-2 py-2 text-sm font-medium text-blue-600 transition-colors border border-blue-100 bg-gray-50 rounded-xl hover:bg-blue-50"
              >
                <PhoneCall className="w-4 h-4" /> Appeler le Contact
              </a>
              <button
                onClick={() => setShowAssistanceModal(false)}
                className="w-full py-2 mt-1 text-sm font-medium text-gray-700 transition-colors bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}