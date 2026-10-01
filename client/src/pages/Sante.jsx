// src/pages/Sante.jsx
import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, getDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Shield, ShoppingCart, Zap, Star, Store, AlertTriangle } from "lucide-react";
import { useCart } from "../Context/CartContext";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./MarketplaceFull.css";

export default function Sante() {
  const navigate = useNavigate();
  const { addToCart, cart } = useCart();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          const t = (p.type || p.categorie || "").toLowerCase().trim();
          return (t === "sante" || t === "pharmacie" || t === "health" || t === "medical") && p.nom && (p.imageUrl || p.image || p.images?.[0]);
        });

        const enriched = await Promise.all(raw.map(async p => {
          if (p.nomBoutique) return p;
          const actualVendorId = p.vendeurId || p.vendorId;
          if (!actualVendorId) return { ...p, nomBoutique: "Mambo Santé" };

          if (vendorCache[actualVendorId]) return {
            ...p,
            nomBoutique: vendorCache[actualVendorId],
            logoBoutique: vendorCache[`${actualVendorId}_logo`] || null,
          };

          try {
            const v = await getDoc(doc(db, "users", actualVendorId));
            if (v.exists()) {
              const vendorData = v.data();
              vendorCache[actualVendorId] = vendorData.enseigne || vendorData.nomBoutique || "Pharmacie Mambo";
              vendorCache[`${actualVendorId}_logo`] = vendorData.photoURL || vendorData.logo || null;
              return { 
                ...p, 
                nomBoutique: vendorCache[actualVendorId], 
                logoBoutique: vendorCache[`${actualVendorId}_logo`] 
              };
            }
          } catch (e) {
            console.error("Erreur enrichissement vendeur:", e);
          }
          return { ...p, nomBoutique: "Mambo Santé" };
        }));

        setProducts(enriched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      } catch (err) {
        console.error(err);
        toast.error("Erreur de chargement des produits de santé");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const filtered = products.filter(p => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return [p.nom, p.nomBoutique, p.marque, p.description].some(v => v?.toLowerCase().includes(term));
  });

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

  return (
    <div className="mf-root">
      <ToastContainer position="top-center" autoClose={1500} hideProgressBar/>

      {/* HEADER */}
      <header className="market-header-modern" style={{ background: "#06b6d4" }}>
        <div className="header-top-row">
          <button className="nav-icon-btn" onClick={() => navigate("/marche")}><ArrowLeft size={22}/></button>
          <div className="brand-central" style={{ color: "#fff" }}>
            <Shield size={24} style={{ marginRight: 8 }}/>
            <span className="brand-market" style={{ color: "#fff" }}>ESPACE SANTÉ</span>
          </div>
          <button className="nav-icon-btn" onClick={() => navigate("/cart")}>
            <ShoppingCart size={22}/>
            {cart.length > 0 && <span className="mf-nav-badge">{cart.length}</span>}
          </button>
        </div>

        <div className="header-search-row">
          <div className="modern-search-bar">
            <Search size={17} className="s-icon"/>
            <input type="text"
              placeholder="Rechercher un produit de santé, pharmacie..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}/>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="market-main-scroll" style={{ padding: "16px" }}>
        {loading ? (
          <div className="mf-skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mf-skeleton"><div className="mf-skeleton-img"/></div>
            ))}
          </div>
        ) : (
          <div className="market-grid-container">
            {filtered.length > 0 ? (
              <div className="product-grid-container product-grid-flat">
                <div className="vendor-scroll-row vendor-scroll-row-wrap">
                  {filtered.map(product => {
                    const isOutOfStock = product.stock !== undefined && Number(product.stock) <= 0;
                    const isPromo = product.isPromo && product.prixPromo && Number(product.prixPromo) < Number(product.prix);
                    const currentPrice = isPromo ? product.prixPromo : product.prix;
                    const discountPercent = isPromo ? Math.round(((Number(product.prix) - Number(product.prixPromo)) / Number(product.prix)) * 100) : 0;
                    const displayImage = product.images?.[0] || product.imageUrl || product.image || "https://placehold.co/300x300/1e293b/94a3b8/png?text=Sante";
                    const boutique = product.nomBoutique || product.enseigne || null;

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
                              <AlertTriangle size={20}/>
                              <span>Rupture</span>
                            </div>
                          )}
                          <img src={displayImage} alt={product.nom} className="product-image" loading="lazy"/>
                        </div>
                        <div className="product-content">
                          {boutique && (
                            <div className="product-vendor-line" style={{ color: "#06b6d4" }}>
                              <Store size={10}/>
                              <span>{boutique}</span>
                            </div>
                          )}
                          <h3 className="product-title">{product.nom || "Article santé"}</h3>
                          <div className="product-meta-row">
                            <div className="rating">
                              <Star size={12} fill="#fbbf24" color="#fbbf24"/>
                              <span>{(product.rating || 4.8).toFixed(1)}</span>
                            </div>
                          </div>
                          <div className="price-block">
                            <div style={{ display: "flex", alignItems: "baseline" }}>
                              <span className="current-price" style={{ marginRight: 4 }}>
                                {Number(currentPrice || 0).toLocaleString()}<small> F</small>
                              </span>
                            </div>
                            {isPromo && <div className="old-price">{Number(product.prix || 0).toLocaleString()} F</div>}
                          </div>
                          <div className="card-actions">
                            <button type="button" className="btn-cart" onClick={(e) => { e.stopPropagation(); addToCart({...product, quantity:1}); toast.success("Ajouté au panier !"); }} disabled={isOutOfStock}>
                              <ShoppingCart size={16}/>
                            </button>
                            <button type="button" className="btn-buy" style={{ background: "#06b6d4" }} onClick={(e) => { e.stopPropagation(); handleBuyNow(product); }} disabled={isOutOfStock}>
                              <Zap size={14}/>
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
                <Shield size={56} opacity={0.15}/>
                <p>Aucun produit de santé disponible pour le moment.</p>
                <button className="btn-reset-cat" onClick={() => setSearchTerm("")}>Réinitialiser la recherche</button>
              </div>
            )}
          </div>
        )}
      </main>

      {cart.length > 0 && (
        <div className="mf-cart-float" onClick={() => navigate("/cart")} style={{ background: "#06b6d4" }}>
          <ShoppingCart size={18}/>
          <span className="mf-cart-float-count">{cart.length}</span>
          <span className="mf-cart-float-sep"/>
          <span className="mf-cart-float-label">Voir le panier →</span>
        </div>
      )}
    </div>
  );
}