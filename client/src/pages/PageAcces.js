import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc, collection, getDocs } from "firebase/firestore";
import { auth, db, messaging } from "../firebase"; 
import { onAuthStateChanged } from "firebase/auth";
import { getToken } from "firebase/messaging";
import ProductGrid from "./ProductGrid"; 

// Icons
import { 
  Menu, MapPin, X, Home, ShoppingBag, LogOut, LogIn, 
  UserCircle, Navigation, Search, Sparkles, ArrowRight, ChevronDown, ChevronUp, GripHorizontal
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

  // État pour gérer l'expansion du panneau collé en bas
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);

  // Gestion du Drag / Glissement tactile et souris
  const dragStartY = useRef(null);
  const currentDragY = useRef(null);

  // État pour les produits du marché (ProductGrid)
  const [marketProducts, setMarketProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [userAddress, setUserAddress] = useState("Localisation...");
  const [isLocating, setIsLocating] = useState(false);
  const [destination, setDestination] = useState(""); 

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // --- CHARGEMENT DES PRODUITS DE LA MARKETPLACE ---
  useEffect(() => {
    const fetchMarketProducts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const items = [];
        querySnapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() });
        });
        if (isMounted.current) {
          setMarketProducts(items);
          setLoadingProducts(false);
        }
      } catch (error) {
        console.error("Erreur chargement produits:", error);
        if (isMounted.current) setLoadingProducts(false);
      }
    };
    fetchMarketProducts();
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

 // --- GESTION DU DRAG PROGRESSIF (GLISSEMENT DU PANNEAU) ---
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (dragStartY.current === null) return;
    currentDragY.current = e.touches[0].clientY;
    const diff = currentDragY.current - dragStartY.current;
    
    // Si le panneau est fermé, on ne veut le glisser que vers le haut (diff négatif)
    // S'il est ouvert, on le glisse vers le bas (diff positif)
    if (!isPanelExpanded && diff < 0) {
      setDragOffset(diff);
    } else if (isPanelExpanded && diff > 0) {
      setDragOffset(diff);
    } else {
      setDragOffset(diff / 2); // Effet élastique subtil
    }
  };

  const handleTouchEnd = () => {
    if (dragStartY.current !== null && currentDragY.current !== null) {
      const diff = dragStartY.current - currentDragY.current;
      // Seuil de déclenchement pour basculer d'un état à l'autre
      if (diff > 70) {
        setIsPanelExpanded(true); // Ouvre le panneau
      } else if (diff < -50) {
        setIsPanelExpanded(false); // Ferme le panneau
      }
    }
    // Réinitialisation
    dragStartY.current = null;
    currentDragY.current = null;
    setDragOffset(0);
    setIsDragging(false);
  };

  const handleMouseDown = (e) => {
    dragStartY.current = e.clientY;
    setIsDragging(true);

    const onMouseMove = (moveEvent) => {
      currentDragY.current = moveEvent.clientY;
      const diff = currentDragY.current - dragStartY.current;
      if (!isPanelExpanded && diff < 0) {
        setDragOffset(diff);
      } else if (isPanelExpanded && diff > 0) {
        setDragOffset(diff);
      } else {
        setDragOffset(diff / 2);
      }
    };

    const onMouseUp = (upEvent) => {
      if (dragStartY.current !== null && currentDragY.current !== null) {
        const diff = dragStartY.current - upEvent.clientY;
        if (diff > 50) setIsPanelExpanded(true);
        else if (diff < -50) setIsPanelExpanded(false);
      }
      dragStartY.current = null;
      currentDragY.current = null;
      setDragOffset(0);
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

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
    <div className={`acces-page ${isPanelExpanded ? "panel-expanded" : ""}`}>
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
        
        {/* --- MISE EN AVANT DE LA MARKETPLACE --- */}
        <div className="market-hero-banner" onClick={goToMarket}>
          <div className="market-hero-glow"></div>
          <div className="market-hero-content">
            <div className="market-hero-badge">
              <Sparkles size={14} /> Marketplace Officielle
            </div>
            <h2>Commandez & Faites-vous livrer</h2>
            <p>Explorez les meilleures boutiques, restos et articles directement chez vous.</p>
          </div>
          <div className="market-hero-action">
            <span className="market-cta-text">Explorer</span>
            <div className="market-cta-icon">
              <ArrowRight size={18} />
            </div>
          </div>
        </div>

        {/* --- 4 BLOCS D'ESPACES --- */}
        <h1 className="acces-title">Choisissez votre espace</h1>
        
        <div className="acces-grid-container">
            <div className="acces-btn" onClick={() => navigate(currentUser ? "/client-home" : "/login-client")}>
              <div className="icon-container"><img src={clientIcon} alt="Client" /></div>
              <span className="acces-label">Livraison</span>
            </div>
            <div className="acces-btn" onClick={() => navigate("/login-coursier")}>
              <div className="icon-container"><img src={coursierIcon} alt="Coursier" /></div>
              <span className="acces-label">Coursiers</span>
            </div>
            <div className="acces-btn" onClick={() => navigate("/login-livreur/abidjan")}> 
              <div className="icon-container"><img src={livreurIcon} alt="Livreur" /></div>
              <span className="acces-label">Livreurs</span>
            </div>
            <div className="acces-btn" onClick={() => navigate("/vendeur-login")}>
              <div className="icon-container"><img src={vendeurIcon} alt="Boutique" /></div>
              <span className="acces-label">Vendeurs</span>
            </div>
        </div>

        {/* --- BARRE DE RECHERCHE --- */}
        <div className="quick-search-container">
          <div className="quick-search-wrapper">
            <Search size={18} className="search-icon" />

            <input
              className="quick-search-input"
              type="text"
              placeholder="Où livrer ?"
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

      </section>

      {/* --- PANNEAU COLLÉ AU BAS DE LA PAGE (LIMITÉ AUX 3/4) --- */}
      <div 
        className={`bottom-retractable-panel ${isPanelExpanded ? "expanded" : "collapsed"} ${isDragging ? "is-dragging" : ""}`}
        style={{
          transform: isDragging 
            ? `translateY(calc(${isPanelExpanded ? '33vh' : 'calc(100% - 55px)'} + ${dragOffset}px))` 
            : undefined
        }}
      >
        <div 
          className="panel-toggle-bar" 
          onClick={() => {
            if (!isDragging) setIsPanelExpanded(!isPanelExpanded);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="panel-drag-indicator">
            <GripHorizontal size={20} />
          </div>
          <span className="panel-toggle-title">Le Marché</span>
          <div className="panel-toggle-icon">
            {isPanelExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </div>
        </div>

        <div className="panel-inner-content">
          <div className="productgrid-premium-header">
            <div className="header-badge-pulse"></div>
            <h2>Découvrez nos articles & boutiques</h2>
            <p>Parcourez les catégories et faites vos choix en un clin d'œil</p>
          </div>

          {loadingProducts ? (
            <div className="panel-loading">Chargement des produits du marché...</div>
          ) : (
            <ProductGrid products={marketProducts} groupByCategory={true} />
          )}
        </div>
      </div>

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