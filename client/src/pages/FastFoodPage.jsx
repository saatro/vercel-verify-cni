/* eslint-disable no-unused-vars */
// FastFoodPage.jsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { collection, query, onSnapshot, getDoc, doc, where } from "firebase/firestore";
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
  Star,
  Store,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { useCart } from "../Context/CartContext";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./MarketplaceFull.css"; // Utilise la même charte graphique
import logoImg from "../assets/MAMBO PREMIUM.png";

// Sous-filtres rapides pour les types de fast-food
const FASTFOOD_FILTERS = [
  { id: "all",       label: "Tout",      emoji: "🍔" },
  { id: "burger",    label: "Burgers",   emoji: "🍟" },
  { id: "tacos",     label: "Tacos",     emoji: "🌯" },
  { id: "sandwich",  label: "Sandwichs", emoji: "🥪" },
  { id: "pizza",     label: "Pizzas",    emoji: "🍕" },
  { id: "shawarma",  label: "Shawarmas", emoji: "🥙" },
  { id: "boisson",   label: "Boissons",  emoji: "🥤" },
];

function getVendorId(product) {
  return (
    product.vendeurId ||
    product.vendorId ||
    product.uid ||
    product.storeId ||
    product.sellerId ||
    product.userId ||
    null
  );
}

export default function FastFoodPage() {
  const navigate = useNavigate();
  const { addToCart, cart } = useCart();
  const scrollRef = useRef(null);

  const [products, setProducts]       = useState([]);
  const [searchTerm, setSearchTerm]   = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading]         = useState(true);
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isShrunk, setIsShrunk]       = useState(false);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    setIsShrunk(scrollRef.current.scrollTop > 50);
  }, []);

  // Récupération des produits Fast-Food depuis Firebase
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
        }).filter(p => {
          const rawType = (p.type || p.categorie || "").toLowerCase();
          // Filtrer uniquement ce qui correspond au fast-food
          return (
            rawType.includes("fastfood") ||
            rawType.includes("fast-food") ||
            rawType.includes("burger") ||
            rawType.includes("sandwich") ||
            rawType.includes("tacos") ||
            rawType.includes("pizza") ||
            rawType.includes("shawarma")
          );
        });

        const enriched = await Promise.all(raw.map(async p => {
          if (p.nomBoutique) return p;
          const actualVendorId = getVendorId(p);
          if (!actualVendorId) return { ...p, nomBoutique: "Mambo Fast-Food" };

          if (vendorCache[actualVendorId]) return {
            ...p,
            nomBoutique: vendorCache[actualVendorId],
          };

          try {
            const v = await getDoc(doc(db, "users", actualVendorId));
            if (v.exists()) {
              const vendorData = v.data();
              vendorCache[actualVendorId] = vendorData.enseigne || vendorData.nomBoutique || "Fast-Food Mambo";
              return { ...p, nomBoutique: vendorCache[actualVendorId] };
            }
          } catch (e) {
            console.error("Erreur récupération vendeur:", e);
          }
          return { ...p, nomBoutique: "Mambo Fast-Food" };
        }));

        setProducts(enriched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      } catch (err) {
        console.error(err);
        toast.error("Erreur de chargement des fast-foods");
      } finally {
        setLoading(false);
      }
    });

    return () => { unsub(); unsubAuth(); };
  }, []);

  // Filtrage par recherche et sous-catégories
  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return products.filter(p => {
      const nameAndDesc = `${p.nom || ""} ${p.description || ""} ${p.type || ""} ${p.categorie || ""}`.toLowerCase();
      
      let matchSub = true;
      if (activeFilter !== "all") {
        matchSub = nameAndDesc.includes(activeFilter);
      }

      const matchTerm = !term || nameAndDesc.includes(term);

      return matchSub && matchTerm;
    });
  }, [products, searchTerm, activeFilter]);

  const handleProductClick = (product) => {
    const vendorId = getVendorId(product);
    if (vendorId && product.id) navigate(`/store/${vendorId}/${product.id}`);
    else if (product.id) navigate(`/product/${product.id}`);
  };

  const handleQuickAdd = (e, product) => {
    e.stopPropagation();
    if (product.stock !== undefined && Number(product.stock) <= 0) return;
    const vid = getVendorId(product);
    addToCart({ ...product, vendorId: vid, vendeurId: vid }, 1);
    toast.success(`${product.nom} ajouté au panier !`, { autoClose: 1200 });
  };

  const handleQuickBuy = (e, product) => {
    e.stopPropagation();
    if (product.stock !== undefined && Number(product.stock) <= 0) return;
    const vid = getVendorId(product);
    addToCart({ ...product, vendorId: vid, vendeurId: vid }, 1);
    navigate("/cart");
  };

  return (
    <div className="mf-root">
      <ToastContainer position="top-center" autoClose={1500} hideProgressBar />

      {/* Menu Latéral */}
      <div className={`side-nav-overlay ${isSideNavOpen ? "visible" : ""}`} onClick={() => setIsSideNavOpen(false)} />
      <div className={`side-nav ${isSideNavOpen ? "open" : ""}`}>
        <div className="side-nav-profile-header">
          <button className="close-nav-btn" onClick={() => setIsSideNavOpen(false)}><X size={24} /></button>
          <div className="user-profile-summary">
            {currentUser ? (
              <>
                <div className="user-avatar-main">
                  {currentUser.photoURL ? <img src={currentUser.photoURL} alt="" /> : <UserCircle size={40} />}
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
          <button onClick={() => navigate("/")}><Home size={20} /> Accueil</button>
          <button onClick={() => navigate("/market")}><ShoppingBag size={20} /> Le Marché</button>
          <button onClick={() => navigate("/cart")}>
            <ShoppingCart size={20} /> Mon Panier
            {cart.length > 0 && <span className="mf-nav-badge">{cart.length}</span>}
          </button>
          {currentUser && <button onClick={() => navigate("/profil-client")}><Settings size={20} /> Mon Profil</button>}
          {!currentUser
            ? <button className="nav-auth-btn login" onClick={() => navigate("/login-marketplace")}><LogIn size={20} /> Connexion</button>
            : <button className="nav-auth-btn logout" onClick={() => auth.signOut()}><LogOut size={20} /> Déconnexion</button>
          }
        </div>
      </div>

      {/* En-tête de la page */}
      <header className={`market-header-modern ${isShrunk ? "shrunk" : ""}`}>
        <div className="header-top-row">
          <button className="nav-icon-btn" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>

          <div className="brand-central">
            <img src={logoImg} alt="Mambo" className={`brand-logo-img ${isShrunk ? "logo-small" : ""}`} />
            <span className="brand-market" style={{ color: "#f59e0b" }}>FAST-FOOD</span>
          </div>

          <button className="nav-icon-btn menu-trigger" onClick={() => setIsSideNavOpen(true)}>
            {currentUser?.photoURL
              ? <img src={currentUser.photoURL} className="avatar-small" alt="" />
              : <Menu size={22} />}
          </button>
        </div>

        <div className="header-search-row">
          <div className="modern-search-bar">
            <Search size={17} className="s-icon" />
            <input
              type="text"
              placeholder="Rechercher un burger, un tacos, un sandwich..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <button className="s-filter" onClick={() => searchTerm && setSearchTerm("")}>
              {searchTerm ? <X size={15} /> : <Filter size={15} />}
            </button>
          </div>
        </div>

        {/* Barre de sous-filtres spécifiques */}
        <div className="category-bar">
          {FASTFOOD_FILTERS.map(f => {
            const isActive = activeFilter === f.id;
            return (
              <span
                key={f.id}
                className={`cat-pill ${isActive ? "active" : ""}`}
                style={isActive ? {
                  background: "#f59e0b",
                  borderColor: "#f59e0b",
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(245, 158, 11, 0.4)",
                } : {}}
                onClick={() => setActiveFilter(f.id)}
              >
                <span className="cat-emoji">{f.emoji}</span>
                {f.label}
              </span>
            );
          })}
        </div>
      </header>

      {/* Contenu principal */}
      <main ref={scrollRef} className="market-main-scroll" onScroll={handleScroll}>
        {loading ? (
          <div className="mf-skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mf-skeleton">
                <div className="mf-skeleton-img" />
                <div style={{ padding: "10px 12px" }}>
                  <div className="mf-skeleton-line" style={{ width: "55%", height: 8, marginBottom: 6 }} />
                  <div className="mf-skeleton-line" style={{ width: "80%", height: 11, marginBottom: 8 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="market-grid-container">
            {filteredProducts.length > 0 ? (
              <div className="product-grid-container product-grid-flat">
                <div className="vendor-scroll-row vendor-scroll-row-wrap">
                  {filteredProducts.map(product => {
                    const isOutOfStock = product.stock !== undefined && Number(product.stock) <= 0;
                    const isPromo = product.isPromo && product.prixPromo && Number(product.prixPromo) < Number(product.prix);
                    const currentPrice = isPromo ? product.prixPromo : product.prix;
                    const discountPercent = isPromo
                      ? Math.round(((Number(product.prix) - Number(product.prixPromo)) / Number(product.prix)) * 100)
                      : 0;
                    const displayImage = product.imageUrl || "https://placehold.co/300x300/1e293b/94a3b8/png?text=FastFood";
                    const boutique = product.nomBoutique;

                    return (
                      <article
                        key={product.id}
                        className={`product-card ${isOutOfStock ? "out-of-stock" : ""}`}
                        onClick={() => handleProductClick(product)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="product-image-wrapper">
                          {isPromo && <span className="promo-badge">-{discountPercent}%</span>}
                          {isOutOfStock && (
                            <div className="stock-overlay">
                              <AlertTriangle size={20} />
                              <span>Rupture</span>
                            </div>
                          )}
                          <img src={displayImage} alt={product.nom} className="product-image" loading="lazy" />
                        </div>
                        <div className="product-content">
                          {boutique && (
                            <div className="product-vendor-line">
                              <Store size={10} />
                              <span>{boutique}</span>
                            </div>
                          )}
                          <h3 className="product-title">{product.nom || "Article"}</h3>
                          <div className="product-meta-row">
                            <div className="rating">
                              <Star size={12} fill="#fbbf24" color="#fbbf24" />
                              <span>{(product.rating || 4.8).toFixed(1)}</span>
                            </div>
                          </div>
                          <div className="price-block">
                            <div style={{ display: "flex", alignItems: "baseline" }}>
                              <span className="current-price" style={{ marginRight: 4 }}>
                                {Number(currentPrice || 0).toLocaleString()}
                                <small> F</small>
                              </span>
                            </div>
                            {isPromo && (
                              <div className="old-price">
                                {Number(product.prix || 0).toLocaleString()} F
                              </div>
                            )}
                          </div>
                          <div className="card-actions">
                            <button
                              type="button"
                              className="btn-cart"
                              onClick={(e) => handleQuickAdd(e, product)}
                              disabled={isOutOfStock}
                            >
                              <ShoppingCart size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn-buy"
                              onClick={(e) => handleQuickBuy(e, product)}
                              disabled={isOutOfStock}
                            >
                              <Zap size={14} />
                              <span>Acheter</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <ShoppingBag size={56} opacity={0.15} />
                <p>{searchTerm ? `Aucun fast-food trouvé pour "${searchTerm}"` : "Aucun fast-food disponible dans cette section."}</p>
                <button className="btn-reset-cat" onClick={() => { setActiveFilter("all"); setSearchTerm(""); }}>
                  Réinitialiser les filtres
                </button>
              </div>
            )}
          </div>
        )}
        <div style={{ height: 80 }} />
      </main>

      {/* Panier Flottant */}
      {cart.length > 0 && (
        <div className="mf-cart-float" onClick={() => navigate("/cart")}>
          <ShoppingCart size={18} />
          <span className="mf-cart-float-count">{cart.length}</span>
          <span className="mf-cart-float-sep" />
          <span className="mf-cart-float-label">Voir le panier →</span>
        </div>
      )}
    </div>
  );
}