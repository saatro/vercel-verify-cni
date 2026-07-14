import { useState, useEffect } from 'react';
import { Download, X, Zap, Smartphone } from 'lucide-react';
import './InstallPWAButton.css';

export default function InstallPWAButton({ show, onDone }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isSWReady, setIsSWReady] = useState(false); // État du Service Worker
  const [forceShowModal, setForceShowModal] = useState(false); // Force l'ouverture automatique

  // Alternative professionnelle : Exécuter onDone de manière sécurisée si la prop est manquante
  const safeOnDone = () => {
    if (typeof onDone === 'function') {
      onDone();
    } else {
      console.warn("⚠️ Mambo PWA Warning: 'onDone' n'est pas fourni ou n'est pas une fonction valide.");
    }
  };

  useEffect(() => {
    // Optimisation détection iOS (inclut les iPad récents avec puce M1/M2)
    const isIOSDevice = 
      (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    setIsIOS(isIOSDevice);

    // Si c'est iOS, on peut proposer l'installation immédiatement à l'ouverture
    if (isIOSDevice) {
      setForceShowModal(true);
    }

    // Vérifier si le Service Worker est bien enregistré et actif
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        setIsSWReady(true);
        console.log('⚙️ Service Worker actif');
      });
    }

    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setCanInstall(true);
      setForceShowModal(true); // FORCE l'affichage de la modale dès que le prompt est disponible
      console.log('✅ Prompt PWA capturé et modale affichée');
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Vérifie si l'application est déjà installée et lancée en mode standalone
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setCanInstall(false);
      setForceShowModal(false);
    }

    // Gestion alternative : Si après 4 secondes le prompt natif n'a pas répondu
    // On force l'ouverture pour proposer l'installation manuelle via le menu du navigateur
    const fallbackTimeout = setTimeout(() => {
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setForceShowModal(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(fallbackTimeout);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    // Si le prompt natif n'est pas disponible, on guide l'utilisateur sur Chrome/Android
    if (!installPrompt) {
      alert(
        "L'installation automatique est bloquée ou non supportée par votre navigateur.\n\n" +
        "Pour l'installer manuellement :\n" +
        "1. Appuyez sur les trois points (⋮ ou ⋯) en haut ou en bas à droite.\n" +
        "2. Sélectionnez 'Ajouter à l'écran d'accueil' ou 'Installer l'application'."
      );
      return;
    }

    try {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setInstallPrompt(null);
        setCanInstall(false);
        setForceShowModal(false);
        safeOnDone(); // Utilisation de la fonction sécurisée
      }
    } catch (error) {
      console.error('❌ Erreur installation:', error);
    }
  };

  // La modale s'affiche si la propriété parente "show" est vraie OU si notre déclencheur automatique "forceShowModal" s'active
  if (!show && !forceShowModal) return null;

  return (
    <>
      <div className="pwa-modal-overlay">
        <div className="pwa-modal-card">
          <button className="pwa-close-btn" onClick={() => { setForceShowModal(false); safeOnDone(); }}>
            <X size={20} />
          </button>

          <div className="pwa-modal-header">
            <div className="pwa-app-logo-container">
              {/* Utilisation stricte de l'image de l'application depuis le répertoire public sans altération */}
              <img src="/logo192.png" alt="MAMBO Logo" className="pwa-app-logo-img" />
            </div>
          
            <p>Accédez plus vite à vos commandes et valisez vos paiements Wave en un clin d'œil.</p>
          </div>

          {/* Affichage intelligent : on attend le prompt OU le Service Worker */}
          {!isIOS && !canInstall && !isSWReady && (
            <div className="pwa-wait-notice">
              ⏳ Préparation de l'application...
            </div>
          )}

          <div className="pwa-benefits">
            <div className="benefit-item">
              <Zap size={20} className="benefit-icon" />
              <div>
                <span className="benefit-title">Navigation fluide</span>
                <p>Moins de chargements, plus de rapidité.</p>
              </div>
            </div>
        
            <div className="benefit-item">
              <Smartphone size={20} className="benefit-icon" />
              <div>
                <span className="benefit-title">Multi-tâches Wave</span>
                <p>Passez facilement de Wave à MAMBO sans perdre votre session.</p>
              </div>
            </div>
          </div>

          <button 
            onClick={handleInstallClick} 
            className="pwa-main-install-btn"
            style={{ opacity: 1, cursor: "pointer" }}
          >
            <Download size={20} />
            {isIOS ? "Voir les instructions" : "Installer l'application"}
          </button>
          
          <button onClick={() => { setForceShowModal(false); safeOnDone(); }} className="pwa-later-btn">
            Plus tard, continuer ici
          </button>
        </div>
      </div>

      {showIOSInstructions && (
        <div className="ios-install-modal-overlay" onClick={() => setShowIOSInstructions(false)}>
          <div className="ios-install-modal" onClick={(e) => e.stopPropagation()}>
             <div className="ios-modal-handle"></div>
             <h3>Ajouter à l'écran d'accueil</h3>
             <p className="ios-subtitle">Sur iPhone/iPad, Safari ne permet pas l'installation automatique.</p>
             <div className="ios-step-list">
                <div className="ios-step-item">1. Appuyez sur le bouton <b>Partager</b> (en bas) <span className="blue-icon">⬆️</span></div>
                <div className="ios-step-item">2. Faites défiler et choisissez <b>"Sur l'écran d'accueil"</b> <span className="plus-icon">➕</span></div>
                <div className="ios-step-item">3. Valisez en haut à droite sur <b>"Ajouter"</b></div>
             </div>
             <button onClick={() => { setShowIOSInstructions(false); setForceShowModal(false); safeOnDone(); }} className="ios-done-btn">C'est fait !</button>
          </div>
        </div>
      )}
    </>
  );
}