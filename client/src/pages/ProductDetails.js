/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, limit, getDocs } from "firebase/firestore";
import {
  ChevronLeft,
  Loader2,
  ShoppingCart,
  ShieldCheck,
  Store,
  ChevronRight,
} from "lucide-react";
import { useCart } from "../Context/CartContext";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./ProductDetails.css";

/** Alias type produit */
function normalizeType(p) {
  const raw = (p?.type || p?.categorie || "").toLowerCase().trim();
  if (raw === "supermarche" || raw === "supermarket") return "supermarket";
  if (raw === "resto" || raw === "fastfood") return "resto_fastfood";
  return raw;
}

function getVendorId(productData) {
  if (!productData) return null;
  return (
    productData.vendeurId ||
    productData.vendorId ||
    productData.uid ||
    productData.storeId ||
    productData.sellerId ||
    productData.userId ||
    null
  );
}

export default function ProductDetails() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart, cart } = useCart();

  const [product, setProduct] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchProductData = async () => {
      const cleanProductId = productId ? productId.replace(/\//g, "").trim() : null;
      if (!cleanProductId) {
        toast.error("Identifiant du produit invalide");
        setLoading(false);
        navigate("/marketplace");
        return;
      }

      try {
        setLoading(true);
        const pDoc = await getDoc(doc(db, "products", cleanProductId));

        if (!pDoc.exists()) {
          toast.error("Ce produit n'existe plus ou a été retiré");
          if (isMounted) {
            setProduct(null);
            setLoading(false);
          }
          return;
        }

        const data = pDoc.data();
        const full = {
          id: pDoc.id,
          ...data,
          imageUrl: data.images?.[0] || data.image || data.imageUrl || null,
        };

        if (isMounted) setProduct(full);

        // Enrichissement vendeur
        const vid = getVendorId(full);
        if (vid) {
          try {
            const vSnap = await getDoc(doc(db, "users", vid));
            if (vSnap.exists() && isMounted) {
              const vd = vSnap.data();
              setVendor({
                id: vid,
                nom: vd.enseigne || vd.nomBoutique || vd.nomComplet || vd.nom || "Boutique Mambo",
                logo: vd.photoURL || vd.logo || null,
              });
            }
          } catch (_) {}
        }

        // Suggestions même catégorie
        try {
          const t = normalizeType(full);
          const qSug = query(collection(db, "products"), limit(12));
          const sugSnap = await getDocs(qSug);
          if (isMounted) {
            const list = sugSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter(
                (p) =>
                  p.id !== full.id &&
                  p.nom &&
                  (normalizeType(p) === t || !t) &&
                  (p.images?.[0] || p.image || p.imageUrl)
              )
              .slice(0, 6);
            setSuggestions(list);
          }
        } catch (_) {}
      } catch (e) {
        console.error("Erreur fiche produit:", e);
        toast.error("Impossible de charger les détails du produit");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProductData();
    return () => {
      isMounted = false;
    };
  }, [productId, navigate]);

  const images = useMemo(() => {
    if (!product) return [];
    if (Array.isArray(product.images) && product.images.length) return product.images;
    const one = product.imageUrl || product.image;
    return one ? [one] : [];
  }, [product]);

  const isPromo =
    product?.isPromo &&
    product?.prixPromo &&
    Number(product.prixPromo) < Number(product.prix);
  const currentPrice = isPromo ? product.prixPromo : product?.prix;
  const productType = normalizeType(product);
  const isSupermarket = productType === "supermarket";
  const cartCount = Array.isArray(cart) ? cart.length : 0;

  const handleAddToCart = () => {
    if (!product) return;
    addToCart({
      ...product,
      quantity: 1,
      image: images[0] || "https://placehold.co/300x300/1e293b/94a3b8/png?text=Produit",
      vendorId: getVendorId(product),
      vendeurId: getVendorId(product),
    });
    toast.success(`${product.nom} ajouté au panier !`);
  };

  if (loading) {
    return (
      <div className="product-details-page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: 12, color: "#64748b" }}>
        <Loader2 className="animate-spin" color="#7c3aed" size={32} />
        <p style={{ fontSize: 14, fontWeight: 500 }}>Chargement du produit…</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="product-details-page" style={{ padding: "40px 20px", textAlign: "center" }}>
        <p style={{ color: "#ef4444", marginBottom: 16, fontWeight: 600 }}>Fiche produit indisponible</p>
        <button
          onClick={() => navigate("/marketplace")}
          style={{ padding: "10px 20px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
        >
          Retour au marché
        </button>
      </div>
    );
  }

  const vendorId = getVendorId(product);

  return (
    <div className="product-details-page">
      <ToastContainer theme="light" position="top-center" autoClose={1500} hideProgressBar />

      <header className="details-header-premium">
        <button type="button" className="back-circle-btn" onClick={() => navigate(-1)} aria-label="Retour">
          <ChevronLeft size={22} color="#1e293b" />
        </button>
        <h1 className="header-center-title">Détails</h1>
        <button type="button" className="cart-circle-btn" style={{ position: "relative" }} onClick={() => navigate("/cart")} aria-label="Panier">
          <ShoppingCart size={18} color="#1e293b" />
          {cartCount > 0 && (
            <span style={{ position: "absolute", top: 4, right: 4, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 900, borderRadius: 99, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {cartCount}
            </span>
          )}
        </button>
      </header>

      <div className="details-container">
        {/* Galerie */}
        <section className="images-section-v4">
          <div className="main-image-container">
            <img
              src={images[activeImgIndex] || "https://placehold.co/600x600/f1f5f9/94a3b8/png?text=Produit"}
              alt={product.nom}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://placehold.co/600x600/f1f5f9/94a3b8/png?text=Produit";
              }}
            />
            <span className="category-tag-float">
              {product.type || product.categorie || "Général"}
            </span>
          </div>
          {images.length > 1 && (
            <div className="thumbnails-row">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  className={`thumb-box ${i === activeImgIndex ? "active" : ""}`}
                  onClick={() => setActiveImgIndex(i)}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Infos */}
        <section>
          <h2 className="product-title-v4">{product.nom}</h2>

          <div className="price-container-v4">
            <span className="main-price">
              {Number(currentPrice || 0).toLocaleString()}
              <span> F</span>
            </span>
            {isPromo && (
              <span className="old-price-v4">
                {Number(product.prix || 0).toLocaleString()} F
              </span>
            )}
            {product.unite && String(product.unite).trim() && String(product.unite).toLowerCase() !== "n/a" && String(product.unite).toLowerCase() !== "pièce" && (
              <span style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>
                / {product.unite}
              </span>
            )}
          </div>

          {product.stock !== undefined && Number(product.stock) <= 0 && (
            <span className="stock-alert">Rupture de stock</span>
          )}

          {/* Vendeur */}
          {(vendor || product.nomBoutique) && (
            <div
              className="vendor-strip-premium"
              onClick={() => vendorId && navigate(`/store/${vendorId}`)}
              role="button"
              tabIndex={0}
            >
              {vendor?.logo ? (
                <img src={vendor.logo} alt="" className="v-logo" />
              ) : (
                <div className="v-logo" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Store size={20} color="#7c3aed" />
                </div>
              )}
              <div className="v-info">
                <span className="v-name">{vendor?.nom || product.nomBoutique || "Boutique Mambo"}</span>
                <span className="v-badge">
                  <ShieldCheck size={12} /> Vendeur Mambo
                </span>
              </div>
              <ChevronRight size={18} color="#94a3b8" />
            </div>
          )}

          {/* Fiche technique dynamique selon l'activité */}
          {(() => {
            const t = productType;
            const specs = product.detailsSpecifiques || {};
            const rows = [];
            if (t === "supermarket") {
              if (product.marque) rows.push(["Marque", product.marque]);
              if (product.poidsVolume) rows.push(["Contenance", product.poidsVolume]);
              if (product.temperature) rows.push(["Conservation", product.temperature]);
              if (product.datelimit) rows.push(["DLC / DLUO", product.datelimit, true]);
              if (product.conditionnement) rows.push(["Conditionnement", product.conditionnement]);
              if (product.unite) rows.push(["Unité", product.unite]);
            } else if (t === "vehicule") {
              [["marque_auto","Marque"],["modele_annee","Modèle"],["boite","Boîte"],["energie","Carburant"],["kilometrage","Km"],["etat_auto","État"]].forEach(([k,l]) => {
                const v = specs[k] || product[k];
                if (v) rows.push([l, String(v)]);
              });
            } else if (t === "immobilier") {
              [["type_immo","Bien"],["transaction","Contrat"],["pieces","Pièces"],["surface","Surface m²"],["localisation","Quartier"]].forEach(([k,l]) => {
                if (specs[k]) rows.push([l, String(specs[k])]);
              });
            } else if (t === "resto_fastfood") {
              [["tempsPrep","Préparation"],["portion","Portion"],["epice","Épices"],["ingredients","Ingrédients"]].forEach(([k,l]) => {
                const v = product[k] || specs[k];
                if (v) rows.push([l, String(v)]);
              });
            } else {
              Object.entries(specs).forEach(([k, v]) => {
                if (v) rows.push([k.replace(/_/g, " "), String(v)]);
              });
            }
            if (!rows.length && !product.allergenes) return null;
            return (
              <div className="specs-grid-v4">
                <div className="specs-grid-title">Fiche technique</div>
                {rows.map(([label, value, danger]) => (
                  <div key={label} className="spec-item">
                    <span className="spec-label">{label}</span>
                    <span className={`spec-value${danger ? " danger" : ""}`}>{value}</span>
                  </div>
                ))}
                {product.allergenes && (
                  <div className="spec-allergenes">
                    <ShieldCheck size={14} />
                    <span><strong>Allergènes :</strong> {product.allergenes}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {product.description && (
            <div className="description-container-v4">
              <div className="desc-label">Description</div>
              <p className="desc-content">{product.description}</p>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="suggestions-section-v4">
              <div className="suggestion-header">
                <h3>Vous aimerez aussi</h3>
              </div>
              <div className="suggestion-scroll-v4">
                {suggestions.map((s) => {
                  const img = s.images?.[0] || s.imageUrl || s.image;
                  return (
                    <div
                      key={s.id}
                      className="suggestion-card-v4"
                      onClick={() => navigate(`/product/${s.id}`)}
                    >
                      <div className="s-img-holder">
                        <img src={img} alt={s.nom} />
                      </div>
                      <h4>{s.nom}</h4>
                      <p>{Number(s.prixPromo || s.prix || 0).toLocaleString()} F</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="action-footer-fixed">
        <div className="action-price-summary">
          <small>Total</small>
          <strong>{Number(currentPrice || 0).toLocaleString()} F</strong>
        </div>
        <button
          type="button"
          className="buy-now-btn"
          onClick={handleAddToCart}
          disabled={product.stock !== undefined && Number(product.stock) <= 0}
        >
          <ShoppingCart size={18} />
          Ajouter au panier
        </button>
      </div>
    </div>
  );
}
