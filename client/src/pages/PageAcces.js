import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db, messaging } from "../firebase"; 
import { onAuthStateChanged } from "firebase/auth";
import { getToken } from "firebase/messaging";

// Icons
import { 
  Menu, MapPin, X, Home, ShoppingBag, LogOut, LogIn, 
  UserCircle, Navigation, Search 
} from "lucide-react";

// Assets originaux préservés
import clientIcon from "../assets/client-icon.png";
import coursierIcon from "../assets/coursier-icon.png"; 
import livreurIcon from "../assets/livreur-icon.png";
import vendeurIcon from "../assets/vendeur-icon.png"; 
import backgroundImage from "../assets/background-portrait.jpg"; 

import "./PageAcces.css"; 

const LOGO_PREMIUM = "/MAMBO PREMIUM.png"; 

export default function PageAcces() {
  const navigate = useNavigate();
  const isMounted = useRef(true);
  
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showUI, setShowUI] = useState(false);
  const [showLogo, setShowLogo] = useState(false); 
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [showGeoModal, setShowGeoModal] = useState(false);
  const [adminTapCount, setAdminTapCount] = useState(0);

  const [userAddress, setUserAddress] = useState("Localisation...");
  const [isLocating, setIsLocating] = useState(false);
  const [destination, setDestination] = useState(""); 

  // Configuration de la référence de montage pour tuer les tâches asynchrones en arrière-plan
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // --- NOTIFICATIONS (FCM) ---
  const setupNotifications = useCallback(async (user) => {
    if (!user) return;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const permission = await Notification.requestPermission();
      if (permission === 'granted' && messaging) {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(messaging, {
          vapidKey: process.env.REACT_APP_VAPID_KEY,
          serviceWorkerRegistration: registration
        });
        if (token && isMounted.current) {
          await updateDoc(doc(db, 'users', user.uid), { 
            fcmToken: token, lastTokenUpdate: new Date().toISOString()
          });
        }
      }
    } catch (error) { console.error("FCM Error:", error); }
  }, []);

  // --- GÉO-LOCALISATION ---
  const getAddressFromCoords = useCallback(async (lat, lon) => {
    if (!isMounted.current) return;
    setIsLocating(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
      const data = await res.json();
      if (data && data.address && isMounted.current) {
        const a = data.address;
        const localite = a.village || a.suburb || a.town || "";
        const commune = a.city || "Abidjan";
        setUserAddress(localite ? `${localite}, ${commune}` : `${commune}, Côte d'Ivoire`);
      }
    } catch (error) { 
      if (isMounted.current) setUserAddress("Abidjan, Côte d'Ivoire"); 
    } finally { 
      if (isMounted.current) setIsLocating(false); 
    }
  }, []);

  const triggerGeolocationFetch = useCallback(() => {
    if (!navigator.geolocation) {
      setUserAddress("Abidjan, Côte d'Ivoire");
      return;
    }
    if (isMounted.current) setIsLocating(true);
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        localStorage.setItem("lastCoords", JSON.stringify({ latitude, longitude }));
        getAddressFromCoords(latitude, longitude);
      },
      () => {
        const cached = localStorage.getItem("lastCoords");
        if (cached) {
          const { latitude, longitude } = JSON.parse(cached);
          getAddressFromCoords(latitude, longitude);
        } else {
          if (isMounted.current) {
            setUserAddress("Abidjan, Côte d'Ivoire");
            setIsLocating(false);
          }
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [getAddressFromCoords]);

  const activatePermissions = () => {
    setShowGeoModal(false);
    localStorage.setItem('geoAsked', 'true');
    triggerGeolocationFetch();
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (isMounted.current) {
        setCurrentUser(user);
        setIsAuthChecking(false);
        if (user && Notification.permission === 'granted') setupNotifications(user);
      }
    });

    // Synchronisation calée sur la fin de l'animation réduite du Splash Screen (2000ms)
    const uiTimer = setTimeout(() => {
      if (!isMounted.current) return;
      setShowUI(true);
      const hasGeoBeenAsked = localStorage.getItem('geoAsked');
      if (hasGeoBeenAsked === 'true') {
        triggerGeolocationFetch();
      } else {
        setShowGeoModal(true);
      }
    }, 2000); 

    const logoTimer = setTimeout(() => { 
      if (isMounted.current) setShowLogo(true); 
    }, 2100);

    return () => { unsubAuth(); clearTimeout(uiTimer); clearTimeout(logoTimer); };
  }, [setupNotifications, triggerGeolocationFetch]);

  const handleQuickSearch = (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
      if (!destination.trim()) return;
      navigate(currentUser ? "/client-home" : "/login-client", { state: { targetDestination: destination } });
    }
  };

  const goToMarket = () => {
    navigate(currentUser ? "/marketplace-full" : "/login-marketplace");
  };

  const handleLogoTap = () => {
    const nextCount = adminTapCount + 1;
    if (nextCount >= 6) {
      setAdminTapCount(0);
      navigate("/admin-login");
    } else {
      setAdminTapCount(nextCount);
      setTimeout(() => {
        if (isMounted.current) setAdminTapCount(0);
      }, 2000);
    }
  };

  if (isAuthChecking) return null; 

  return (
    <div className="acces-page">
      <div className="bg-static-layer" style={{ backgroundImage: `url(${backgroundImage})` }} />

      {/* Side Navigation */}
      <div className={`side-nav-overlay ${isSideNavOpen ? "visible" : ""}`} onClick={() => setIsSideNavOpen(false)}></div>
      <div className={`side-nav ${isSideNavOpen ? "open" : ""}`}>
        <div className="side-nav-profile-header">
          <button className="close-nav-btn" onClick={() => setIsSideNavOpen(false)}><X size={20} /></button>
          {currentUser ? (
            <div className="user-profile-data">
              <div className="user-avatar-container">
                {currentUser.photoURL ? <img src={currentUser.photoURL} alt="Profil" className="user-img-main" /> : <div className="user-initial-avatar">{currentUser.displayName?.charAt(0) || "U"}</div>}
              </div>
              <div className="user-details"><span className="user-full-name">{currentUser.displayName || "Utilisateur"}</span></div>
            </div>
          ) : (
            <div className="guest-profile-data">
              <div className="guest-avatar"><UserCircle size={50} color="#666" /></div>
              <div className="user-details"><span className="user-full-name">Mode Invité</span></div>
            </div>
          )}
        </div>
        <div className="side-nav-links">
          <button onClick={() => { setIsSideNavOpen(false); navigate("/"); }}><Home size={22} /> Accueil</button>
          <button onClick={() => { setIsSideNavOpen(false); goToMarket(); }}><ShoppingBag size={22} /> Le Marché</button>
          <div className="side-nav-divider"></div>
          {currentUser ? (
            <button className="logout-btn-premium" onClick={() => { setIsSideNavOpen(false); auth.signOut(); }}><LogOut size={20} /> Déconnexion</button>
          ) : (
            <button className="login-nav-btn-premium" onClick={() => { setIsSideNavOpen(false); navigate("/login-marketplace"); }}><LogIn size={20} /> Connexion</button>
          )}
        </div>
      </div>

      <header className="mambo-header-badge">
        <div className="header-identity-block">
          <img src={LOGO_PREMIUM} alt="MAMBO" className="header-logo-img" onClick={handleLogoTap} style={{ opacity: showLogo ? 1 : 0 }} />
          <div className={`location-badge ${showUI ? "visible" : ""}`}>
            {isLocating ? <Navigation size={10} className="spinner-geo" /> : <MapPin size={10} />}
            <span>{userAddress}</span>
          </div>
        </div>
        <button className={`menu-trigger-btn ${showUI ? "visible" : ""}`} onClick={() => setIsSideNavOpen(true)}>
          <Menu size={32} />
        </button>
      </header>

      <section className={`fixed-selection-zone ${showUI ? "fade-in" : ""}`}>
        <h1 className="acces-title">Choisissez votre espace</h1>
        
        <div className="acces-grid-container">
            <div className="acces-btn" onClick={() => navigate(currentUser ? "/client-home" : "/login-client")}>
              <div className="icon-container"><img src={clientIcon} alt="Client" /></div>
              <span className="acces-label">Courses</span>
            </div>
            <div className="acces-btn" onClick={() => navigate("/login-coursier")}>
              <div className="icon-container"><img src={coursierIcon} alt="Coursier" /></div>
              <span className="acces-label">Coursiers</span>
            </div>
            {/* ALTERNATIVE PROFESSIONNELLE : Remplacement du paramètre en dur ':zone' par une valeur par défaut cohérente */}
            <div className="acces-btn" onClick={() => navigate("/login-livreur/abidjan")}> 
              <div className="icon-container"><img src={livreurIcon} alt="Livreur" /></div>
              <span className="acces-label">Chauffeurs</span>
            </div>
            <div className="acces-btn" onClick={() => navigate("/vendeur-login")}>
              <div className="icon-container"><img src={vendeurIcon} alt="Boutique" /></div>
              <span className="acces-label">Commerçants</span>
            </div>
        </div>

        <div className="quick-search-container">
  <div className="quick-search-wrapper">
    <Search size={18} className="search-icon" />

    <input
      className="quick-search-input"
      type="text"
      placeholder="Où allez-vous ?"
      value={destination}
      onChange={(e) => setDestination(e.target.value)}
      onKeyDown={handleQuickSearch}
    />

    <button
      className="search-confirm-btn"
      onClick={handleQuickSearch}
    >
      Rechercher
    </button>
  </div>
</div>
        <div className="market-button-wrapper">
            <button className="voir-plus-btn premium-market" onClick={goToMarket}>
                <ShoppingBag size={17} className="market-bag-icon" />
                <span>Aller au Marché</span>
            </button>
        </div>
      </section>

      {showGeoModal && (
        <div className="geo-modal-overlay" onClick={() => setShowGeoModal(false)}>
          <div className="geo-modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="geo-modal-icons">
              <div className="icon-circle"><MapPin className="w-5 h-5" /></div>
            </div>
            <h3>Services de proximité</h3>
            <p>Mambo utilise votre <strong>localisation</strong> pour le suivi en temps réel.</p>
            <div className="geo-modal-actions">
              <button className="geo-btn-cancel" onClick={() => setShowGeoModal(false)}>Plus tard</button>
              <button className="geo-btn-confirm" onClick={activatePermissions}>J'accepte</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}