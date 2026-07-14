/* eslint-disable no-unused-vars */
// MarketplaceFull.jsx
// Fix shrunk : useRef sur le scroll container + useCallback stable
// Layout : position:fixed header + flex main scroll

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { collection, query, onSnapshot, getDoc, doc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Filter,
  Menu,
  X,
  Home,
  ShoppingBag,
  Settings,
  LogIn,
  LogOut,
  UserCircle,
  ShoppingCart,
  ChevronRight,
} from "lucide-react";
import ProductGrid from "./ProductGrid";
import { useCart } from "../Context/CartContext";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./MarketplaceFull.css";
import logoImg from "../assets/MAMBO PREMIUM.png";

// ── Catégories ─────────────────────────────────────────────────────────────────
const APP_CATEGORIES = [
  { id: "Tout",             label: "Tout",        emoji: "✨", color: "#64748b" },
  { id: "boutique",         label: "Boutique",    emoji: "📦", color: "#10b981" },
  { id: "resto_fastfood",   label: "Resto",       emoji: "🍔", color: "#f59e0b", route: "/resto" },
  { id: "en_ligne",         label: "En Ligne",    emoji: "💻", color: "#7c3aed" },
  { id: "deal_particulier", label: "Particulier", emoji: "🤝", color: "#6366f1" },
  { id: "vehicule",         label: "Véhicules",   emoji: "🚗", color: "#1c93e4", route: "/vehicule" },
  { id: "immobilier",       label: "Immobilier",  emoji: "🏠", color: "#ec4899", route: "/immobilier" },
  { id: "supermarket",      label: "Supermarché", emoji: "🛒", color: "#0ea5e9", route: "/supermarket" },
];

// Catégories spécialisées à exclure du flux général "Tout" pour garder le flux propre
const EXCLUDED_FROM_ALL = ["supermarket", "resto_fastfood", "immobilier", "vehicule"];

// ── Skeleton ───────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="mf-skeleton">
      <div className="mf-skeleton-img"/>
      <div style={{padding:"10px 12px"}}>
        <div className="mf-skeleton-line" style={{width:"55%",height:8,marginBottom:6}}/>
        <div className="mf-skeleton-line" style={{width:"80%",height:11,marginBottom:8}}/>
        <div className="mf-skeleton-line" style={{width:"38%",height:9}}/>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function MarketplaceFull() {
  const navigate = useNavigate();
  const { addToCart, cart } = useCart();

  // ── Le ref sur le container scrollable ──
  const scrollRef = useRef(null);

  const [products,          setProducts]         = useState([]);
  const [searchTerm,        setSearchTerm]        = useState("");
  const [activeCategoryId, setActiveCategoryId]  = useState("Tout");
  const [loading,           setLoading]           = useState(true);
  const [isSideNavOpen,     setIsSideNavOpen]     = useState(false);
  const [currentUser,       setCurrentUser]       = useState(null);
  // ── isShrunk déclenché par le scroll du ref ──
  const [isShrunk,          setIsShrunk]          = useState(false);

  // ── Handler scroll — stable grâce à useCallback ──
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    setIsShrunk(scrollRef.current.scrollTop > 50);
  }, []);

  // ── Auth + produits ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, u => setCurrentUser(u));
    const vendorCache = {};

    const unsub = onSnapshot(query(collection(db, "products")), async snap => {
      try {
        const raw = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id, ...data,
            imageUrl: data.images?.[0] || data.image || data.imageUrl || null,
          };
        }).filter(p => p.nom && p.imageUrl);

        const enriched = await Promise.all(raw.map(async p => {
          if (p.nomBoutique) return p;
          
          // Unification de la clé vendeur (vendeurId ou vendorId)
          const actualVendorId = p.vendeurId || p.vendorId;
          if (!actualVendorId) return { ...p, nomBoutique: "Mambo" };

          if (vendorCache[actualVendorId]) return {
            ...p,
            nomBoutique:  vendorCache[actualVendorId],
            logoBoutique: vendorCache[`${actualVendorId}_logo`] || null,
          };

          try {
            // Lecture exclusive dans la collection unique "users"
            const v = await getDoc(doc(db, "users", actualVendorId));
            if (v.exists()) {
              const vendorData = v.data();
              vendorCache[actualVendorId]          = vendorData.enseigne || vendorData.nomBoutique || "Boutique Mambo";
              vendorCache[`${actualVendorId}_logo`] = vendorData.photoURL || vendorData.logo || null;
              
              return { 
                ...p, 
                nomBoutique: vendorCache[actualVendorId], 
                logoBoutique: vendorCache[`${actualVendorId}_logo`] 
              };
            }
          } catch (e) {
            console.error("Erreur enrichissement vendeur depuis 'users':", e);
          }
          return { ...p, nomBoutique: "Mambo" };
        }));

        setProducts(enriched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      } catch (err) { 
        console.error(err);
        toast.error("Erreur de chargement"); 
      } finally { 
        setLoading(false); 
      }
    });

    return () => { unsub(); unsubAuth(); };
  }, []);

  // ── Compteurs catégories (avec prise en compte des exclusions) ──
  const catCounts = useMemo(() => {
    const c = { Tout: 0 };
    products.forEach(p => {
      const t = (p.type || p.categorie || "").toLowerCase();
      if (t) {
        c[t] = (c[t] || 0) + 1;
        if (!EXCLUDED_FROM_ALL.includes(t)) {
          c["Tout"] += 1;
        }
      }
    });
    return c;
  }, [products]);

  // ── Filtrage avec exclusion stricte pour l'onglet "Tout" ──
  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return products.filter(p => {
      const pType = (p.type || p.categorie || "").toLowerCase();
      
      let matchCat = false;
      if (activeCategoryId === "Tout") {
        matchCat = !EXCLUDED_FROM_ALL.includes(pType);
      } else {
        matchCat = pType === activeCategoryId.toLowerCase();
      }

      const matchTerm = !term || [p.nom, p.nomBoutique, p.marque, p.description]
        .some(v => v?.toLowerCase().includes(term));
        
      return matchCat && matchTerm;
    });
  }, [products, searchTerm, activeCategoryId]);

  // ── Redirection optimisée et unifiée ──
  const handleProductClick = (product) => {
    const targetVendorId = product.vendeurId || product.vendorId;
    if (targetVendorId && product.id) {
      navigate(`/store/${targetVendorId}/${product.id}`);
    } else if (product.id) {
      navigate(`/product/${product.id}`);
    }
  };

  const handleBuyNow = (product) => {
    addToCart({ ...product, quantity: 1 });
    toast.success(`${product.nom} ajouté !`, { autoClose: 1200 });
  };

  const handleCategoryClick = (cat) => {
    if (cat.route) { navigate(cat.route); return; }
    setActiveCategoryId(cat.id);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeCat = APP_CATEGORIES.find(c => c.id === activeCategoryId);
  const activeCatColor = activeCat?.color || "#7c3aed";

  return (
    <div className="mf-root">
      <ToastContainer position="top-center" autoClose={1500} hideProgressBar/>

      {/* ── MENU LATÉRAL ── */}
      <div className={`side-nav-overlay ${isSideNavOpen ? "visible" : ""}`} onClick={() => setIsSideNavOpen(false)}/>
      <div className={`side-nav ${isSideNavOpen ? "open" : ""}`}>
        <div className="side-nav-profile-header">
          <button className="close-nav-btn" onClick={() => setIsSideNavOpen(false)}><X size={24}/></button>
          <div className="user-profile-summary">
            {currentUser ? (
              <>
                <div className="user-avatar-main">
                  {currentUser.photoURL ? <img src={currentUser.photoURL} alt=""/> : <UserCircle size={40}/>}
                </div>
                <div className="user-text">
                  <p className="u-name">{currentUser.displayName || "Client Mambo"}</p>
                  <p className="u-email">{currentUser.email}</p>
                </div>
              </>
            ) : <p className="u-guest">Bienvenue sur Mambo</p>}
          </div>
        </div>
        <div className="side-nav-links">
          <button onClick={() => navigate("/")}><Home size={20}/> Accueil</button>
          <button className="active"><ShoppingBag size={20}/> Le Marché</button>
          <button onClick={() => navigate("/cart")}>
            <ShoppingCart size={20}/> Mon Panier
            {cart.length > 0 && <span className="mf-nav-badge">{cart.length}</span>}
          </button>
          {currentUser && <button onClick={() => navigate("/profil-client")}><Settings size={20}/> Mon Profil</button>}
          {!currentUser
            ? <button className="nav-auth-btn login" onClick={() => navigate("/login-marketplace")}><LogIn size={20}/> Connexion</button>
            : <button className="nav-auth-btn logout" onClick={() => auth.signOut()}><LogOut size={20}/> Déconnexion</button>
          }
        </div>
      </div>

      {/* ── HEADER ── */}
      <header className={`market-header-modern ${isShrunk ? "shrunk" : ""}`}>
        <div className="header-top-row">
          <button className="nav-icon-btn" onClick={() => navigate(-1)}><ArrowLeft size={22}/></button>

          <div className="brand-central">
            <img src={logoImg} alt="Mambo" className={`brand-logo-img ${isShrunk ? "logo-small" : ""}`}/>
            <span className="brand-market">MARKET</span>
          </div>

          <button className="nav-icon-btn menu-trigger" onClick={() => setIsSideNavOpen(true)}>
            {currentUser?.photoURL
              ? <img src={currentUser.photoURL} className="avatar-small" alt=""/>
              : <Menu size={22}/>}
          </button>
        </div>

        <div className="header-search-row">
          <div className="modern-search-bar">
            <Search size={17} className="s-icon"/>
            <input type="text"
              placeholder="Chercher un produit, une marque…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}/>
            <button className="s-filter" onClick={() => searchTerm && setSearchTerm("")}>
              {searchTerm ? <X size={15}/> : <Filter size={15}/>}
            </button>
          </div>
        </div>

        <div className="category-bar">
          {APP_CATEGORIES.map(cat => {
            const count   = cat.id === "Tout" ? catCounts["Tout"] : (catCounts[cat.id.toLowerCase()] || 0);
            const isActive = activeCategoryId === cat.id;
            const color    = cat.color || "#7c3aed";
            return (
              <span key={cat.id}
                className={`cat-pill ${isActive ? "active" : ""}`}
                style={isActive ? {
                  background:   color,
                  borderColor:  color,
                  color:        "#fff",
                  boxShadow:    `0 4px 12px ${color}40`,
                } : {}}
                onClick={() => handleCategoryClick(cat)}
              >
                <span className="cat-emoji">{cat.emoji}</span>
                {cat.label}
                {count > 0 && (
                  <span className="cat-count"
                    style={{
                      background: isActive ? "rgba(255,255,255,.25)" : "#ede9fe",
                      color:      isActive ? "#fff" : color,
                    }}>
                    {count}
                  </span>
                )}
                {cat.route && <ChevronRight size={10} style={{marginLeft:1,opacity:.7}}/>}
              </span>
            );
          })}
        </div>

        {activeCategoryId !== "Tout" && !loading && (
          <div className="mf-cat-banner" style={{
            background:   `${activeCatColor}12`,
            borderBottom: `2px solid ${activeCatColor}30`,
          }}>
            <span style={{fontSize:11,fontWeight:700,color:activeCatColor}}>
              {activeCat?.emoji} {filtered.length} article{filtered.length !== 1 ? "s" : ""} · {activeCat?.label}
            </span>
            <button className="mf-cat-reset" style={{color:activeCatColor,borderColor:`${activeCatColor}50`}}
              onClick={() => setActiveCategoryId("Tout")}>
              Tout voir
            </button>
          </div>
        )}
      </header>

      {/* ── SCROLL CONTAINER ── */}
      <main
        ref={scrollRef}
        className="market-main-scroll"
        onScroll={handleScroll}
      >
        {loading ? (
          <div className="mf-skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i}/>)}
          </div>
        ) : (
          <div className="market-grid-container">
            {filtered.length > 0 ? (
              <ProductGrid
                products={filtered}
                onProductClick={handleProductClick}
                onBuyClick={handleBuyNow}
              />
            ) : (
              <div className="empty-state">
                <ShoppingBag size={56} opacity={0.15}/>
                <p>{searchTerm ? `Aucun résultat pour "${searchTerm}"` : "Aucun article dans cette section."}</p>
                <button className="btn-reset-cat"
                  onClick={() => { setActiveCategoryId("Tout"); setSearchTerm(""); }}>
                  Tout afficher
                </button>
              </div>
            )}
          </div>
        )}
        <div style={{height:80}}/>
      </main>

      {/* Panier flottant */}
      {cart.length > 0 && (
        <div className="mf-cart-float" onClick={() => navigate("/cart")}>
          <ShoppingCart size={18}/>
          <span className="mf-cart-float-count">{cart.length}</span>
          <span className="mf-cart-float-sep"/>
          <span className="mf-cart-float-label">Voir le panier →</span>
        </div>
      )}
    </div>
  );
}