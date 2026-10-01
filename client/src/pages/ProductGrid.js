/* eslint-disable no-unused-vars */
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ShoppingCart, Store, Zap, AlertTriangle, ChevronRight } from "lucide-react";
import { useCart } from "../Context/CartContext";
import { auth } from "../firebase"; // <-- Import de l'authentification Firebase
import { toast } from "react-toastify";
import "./ProductGrid.css";

const CATEGORY_META = {
  boutique:         { label: "Boutique",      emoji: "📦", color: "#10b981" },
  deal_particulier: { label: "Particulier",   emoji: "🤝", color: "#6366f1" },
  en_ligne:         { label: "En Ligne",      emoji: "💻", color: "#7c3aed" },
  resto:            { label: "Resto (Plats)", emoji: "🍲", color: "#f97316" },
  "fast-food":      { label: "Fast-Food",     emoji: "🍔", color: "#f59e0b" },
  supermarket:      { label: "Supermarché",   emoji: "🛒", color: "#0ea5e9" },
  vehicule:         { label: "Véhicules",     emoji: "🚗", color: "#1c93e4" },
  immobilier:       { label: "Immobilier",    emoji: "🏠", color: "#ec4899" },
  sante:            { label: "Santé",         emoji: "💊", color: "#14b8a6" },
};

const CATEGORY_ORDER = [
  "boutique",
  "resto",
  "fast-food",
  "supermarket",
  "deal_particulier",
  "en_ligne",
  "sante",
  "vehicule",
  "immobilier",
];

function normalizeType(p) {
  const raw = (p?.type || p?.categorie || "").toLowerCase().trim();

  if (raw.includes("supermarche") || raw.includes("supermarket") || raw.includes("epicerie") || raw.includes("courses")) {
    return "supermarket";
  }
  if (
    raw.includes("fastfood") ||
    raw.includes("fast-food") ||
    raw.includes("fast_food") ||
    raw.includes("burger") ||
    raw.includes("sandwich") ||
    raw.includes("tacos") ||
    raw.includes("pizza") ||
    raw.includes("shawarma")
  ) {
    return "fast-food";
  }
  if (
    raw.includes("resto") ||
    raw.includes("restaurant") ||
    raw.includes("plat") ||
    raw.includes("foutou") ||
    raw.includes("attieke") ||
    raw.includes("riz") ||
    raw.includes("foufou") ||
    raw.includes("placali")
  ) {
    return "resto";
  }
  if (raw.includes("particulier") || raw.includes("deal") || raw.includes("occasion")) {
    return "deal_particulier";
  }
  if (raw.includes("online") || raw.includes("en_ligne") || raw.includes("web")) {
    return "en_ligne";
  }
  if (
    raw.includes("sante") ||
    raw.includes("pharmacie") ||
    raw.includes("parapharmacie") ||
    raw.includes("health") ||
    raw.includes("medical") ||
    raw.includes("indigena") ||
    raw.includes("autre")
  ) {
    return "sante";
  }
  if (
    raw.includes("vehicule") ||
    raw.includes("voiture") ||
    raw.includes("moto") ||
    raw.includes("antara") ||
    raw.includes("saloni") ||
    raw.includes("auto")
  ) {
    return "vehicule";
  }
  if (
    raw.includes("immobilier") ||
    raw.includes("maison") ||
    raw.includes("appartement") ||
    raw.includes("studio") ||
    raw.includes("location")
  ) {
    return "immobilier";
  }
  if (
    raw.includes("boutique") ||
    raw.includes("shop") ||
    raw.includes("store") ||
    raw.includes("vetement") ||
    raw.includes("mode")
  ) {
    return "boutique";
  }

  if (CATEGORY_META[raw]) return raw;
  if (!raw || raw === "autre") return "sante";
  return "boutique";
}

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

export default function ProductGrid({
  products,
  onProductClick,
  onBuyClick,
  groupByCategory = false,
}) {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const groupedByCategory = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      const key = normalizeType(p);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    const keys = [
      ...CATEGORY_ORDER.filter((k) => map[k]?.length),
      ...Object.keys(map).filter((k) => !CATEGORY_ORDER.includes(k) && map[k]?.length),
    ];
    return keys.map((key) => ({
      key,
      meta: CATEGORY_META[key] || {
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
        emoji: "✨",
        color: "#64748b",
      },
      products: map[key],
    }));
  }, [products]);

  if (!products || products.length === 0) {
    return (
      <div className="no-products-found">
        <ShoppingCart size={48} strokeWidth={1.5} />
        <p>Aucun produit disponible pour le moment</p>
      </div>
    );
  }

  const handleProductClick = (product) => {
    if (onProductClick) {
      onProductClick(product);
      return;
    }
    const vendorId = getVendorId(product);
    if (vendorId && product.id) navigate(`/store/${vendorId}/${product.id}`);
    else if (product.id) navigate(`/product/${product.id}`);
    else toast.error("Produit introuvable");
  };

  // --- VÉRIFICATION DE CONNEXION POUR L'AJOUT AU PANIER ---
  const handleQuickAdd = (e, product) => {
    e.stopPropagation();

    // Si l'utilisateur n'est pas connecté, on le redirige vers la connexion marketplace
    if (!auth.currentUser) {
      toast.info("Veuillez vous connecter pour ajouter des articles au panier.");
      navigate("/login-marketplace");
      return;
    }

    if (product.stock !== undefined && Number(product.stock) <= 0) return;
    const vid = getVendorId(product);
    addToCart({ ...product, vendorId: vid, vendeurId: vid }, 1);
    toast.success(
      <div>
        <strong>{product.nom}</strong>
        <br />
        <small>Ajouté au panier</small>
      </div>,
      { icon: <ShoppingCart size={20} />, theme: "dark" }
    );
  };

  // --- VÉRIFICATION DE CONNEXION POUR L'ACHAT RAPIDE ---
  const handleQuickBuy = (e, product) => {
    e.stopPropagation();

    // Si l'utilisateur n'est pas connecté, redirection obligatoire vers le login
    if (!auth.currentUser) {
      toast.info("Veuillez vous connecter pour passer commande.");
      navigate("/login-marketplace");
      return;
    }

    if (product.stock !== undefined && Number(product.stock) <= 0) return;
    if (onBuyClick) {
      onBuyClick(product);
      return;
    }
    const vid = getVendorId(product);
    addToCart({ ...product, vendorId: vid, vendeurId: vid }, 1);
    navigate("/cart");
  };

  const renderCard = (product) => {
    const isOutOfStock =
      product.stock !== undefined && Number(product.stock) <= 0;
    const isPromo =
      product.isPromo &&
      product.prixPromo &&
      Number(product.prixPromo) < Number(product.prix);
    const currentPrice = isPromo ? product.prixPromo : product.prix;
    const discountPercent = isPromo
      ? Math.round(
          ((Number(product.prix) - Number(product.prixPromo)) /
            Number(product.prix)) *
            100
        )
      : 0;
    const displayImage =
      product.images?.[0] ||
      product.imageUrl ||
      product.image ||
      "https://placehold.co/300x300/1e293b/94a3b8/png?text=Produit";
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
              <AlertTriangle size={20} />
              <span>Rupture</span>
            </div>
          )}
          <img
            src={displayImage}
            alt={product.nom}
            className="product-image"
            loading="lazy"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src =
                "https://placehold.co/300x300/1e293b/94a3b8/png?text=Produit";
            }}
          />
        </div>
        <div className="product-content">
          {boutique && (
            <div className="product-vendor-line">
              <Store size={10} />
              <span>{boutique}</span>
            </div>
          )}
          <h3 className="product-title">{product.nom || "Article sans nom"}</h3>
          <div className="product-meta-row">
            {product.totalVentes > 0 && (
              <span className="sales-count">{product.totalVentes} vendus</span>
            )}
          </div>
          <div className="price-block">
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="current-price" style={{ marginRight: 4 }}>
                {Number(currentPrice || 0).toLocaleString()}
                <small> F</small>
              </span>
              {product.unite &&
                String(product.unite).trim() &&
                String(product.unite).toLowerCase() !== "n/a" && (
                  <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>
                    / {product.unite}
                  </span>
                )}
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
  };

  if (groupByCategory) {
    return (
      <div className="product-grid-container product-grid-by-category">
        {groupedByCategory.map(({ key, meta, products: list }) => (
          <section key={key} className="vendor-section category-section">
            <div className="vendor-section-header category-section-header">
              <h3 className="vendor-section-title" style={{ color: meta.color }}>
                <span className="category-row-emoji">{meta.emoji}</span>
                <span>{meta.label}</span>
                <span
                  className="category-row-count"
                  style={{ background: `${meta.color}18`, color: meta.color }}
                >
                  {list.length}
                </span>
              </h3>
              <span className="category-row-hint" style={{ color: meta.color }}>
                glisser <ChevronRight size={14} />
              </span>
            </div>
            <div className="vendor-scroll-row">{list.map(renderCard)}</div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="product-grid-container product-grid-flat">
      <div className="vendor-scroll-row vendor-scroll-row-wrap">
        {products.map(renderCard)}
      </div>
    </div>
  );
}