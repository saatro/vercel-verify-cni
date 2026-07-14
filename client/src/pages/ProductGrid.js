import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ShoppingCart, Store, Zap, AlertTriangle } from 'lucide-react';
import { useCart } from '../Context/CartContext';
import { toast } from 'react-toastify';
import './ProductGrid.css';

export default function ProductGrid({
  products,
  onProductClick,
  onBuyClick
}) {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  if (!products || products.length === 0) {
    return (
      <div className="no-products-found">
        <ShoppingCart size={48} strokeWidth={1.5} />
        <p>Aucun produit disponible pour le moment</p>
      </div>
    );
  }

  // Extraction unifiée et prioritaire de l'UID du vendeur
  const getVendorId = (product) => {
    return (
      product.vendeurId ||
      product.vendorId ||
      product.uid ||
      product.storeId ||
      product.sellerId ||
      product.userId ||
      null
    );
  };

  // Récupération dynamique et sécurisée du nom réel de la boutique ou de l'utilisateur
  const getVendorName = (product) => {
    return (
      product.nomBoutique || 
      product.enseigne || 
      product.displayName || 
      product.vendeurNom || 
      "Boutique Mambo"
    );
  };

  const handleProductClick = (product) => {
    const vendorId = getVendorId(product);

    if (vendorId && product.id) {
      navigate(`/store/${vendorId}/${product.id}`);
    } else if (product.id) {
      navigate(`/product/${product.id}`);
    } else {
      toast.error("Produit introuvable");
    }
  };

  const handleQuickAdd = (e, product) => {
    e.stopPropagation();

    if (product.stock !== undefined && Number(product.stock) <= 0) return;

    addToCart(product, 1);

    toast.success(
      <div>
        <strong>{product.nom}</strong>
        <br />
        <small>Ajouté au panier</small>
      </div>,
      {
        icon: <ShoppingCart size={20} />,
        theme: "dark"
      }
    );
  };

  const handleQuickBuy = (e, product) => {
    e.stopPropagation();

    if (product.stock !== undefined && Number(product.stock) <= 0) return;

    addToCart(product, 1);
    navigate('/cart');
  };

  const handleGoToStore = (e, product) => {
    e.stopPropagation();

    const storeId = getVendorId(product);

    if (storeId) {
      navigate(`/store/${storeId}`);
    } else {
      console.warn("Aucun ID vendeur trouvé :", product);
      toast.error("Boutique introuvable.", {
        theme: "dark"
      });
    }
  };

  return (
    <div className="product-grid-container">
      {products.map((product) => {
        const isOutOfStock =
          product.stock !== undefined &&
          Number(product.stock) <= 0;

        const isPromo =
          product.isPromo &&
          product.prixPromo &&
          Number(product.prixPromo) < Number(product.prix);

        const currentPrice = isPromo
          ? product.prixPromo
          : product.prix;

        const discountPercent = isPromo
          ? Math.round(
              ((product.prix - product.prixPromo) /
                product.prix) *
                100
            )
          : 0;

        const displayImage =
          product.images?.[0] ||
          product.imageUrl ||
          product.image ||
          'https://placehold.co/300x300/1e293b/94a3b8/png?text=Produit';

        const vendorId = getVendorId(product);
        const displayVendorName = getVendorName(product);

        return (
          <article
            key={product.id}
            className={`product-card ${
              isOutOfStock ? 'out-of-stock' : ''
            }`}
            onClick={() => handleProductClick(product)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' ||
                e.key === ' '
              ) {
                handleProductClick(product);
              }
            }}
          >
            <div className="product-image-wrapper">
              {isPromo && (
                <span className="promo-badge">
                  -{discountPercent}%
                </span>
              )}

              {isOutOfStock && (
                <div className="stock-overlay">
                  <AlertTriangle size={24} />
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
                    'https://placehold.co/300x300/1e293b/94a3b8/png?text=Produit';
                }}
              />
            </div>

            <div className="product-content">
              {(displayVendorName || vendorId) && (
                <div
                  className="vendor-badge"
                  onClick={(e) =>
                    handleGoToStore(e, product)
                  }
                  style={{ cursor: 'pointer' }}
                  role="button"
                  title={`Visiter la boutique ${displayVendorName}`}
                >
                  <Store size={12} />
                  <span>{displayVendorName}</span>
                </div>
              )}

              <h3 className="product-title">
                {product.nom || 'Article sans nom'}
              </h3>

              <div className="product-meta-row">
                <div className="rating">
                  <Star
                    size={14}
                    fill="#fbbf24"
                    color="#fbbf24"
                  />
                  <span>
                    {(product.rating || 4.8).toFixed(1)}
                  </span>
                </div>

                {product.totalVentes > 0 && (
                  <span className="sales-count">
                    {product.totalVentes} vendus
                  </span>
                )}
              </div>

              <div
                className="price-block"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    flexWrap: 'wrap'
                  }}
                >
                  <span
                    className="current-price"
                    style={{ marginRight: 4 }}
                  >
                    {Number(currentPrice || 0).toLocaleString()}
                    <small> F</small>
                  </span>

                  {product.unite && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#94a3b8',
                        fontWeight: 600
                      }}
                    >
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
                  onClick={(e) =>
                    handleQuickAdd(e, product)
                  }
                  disabled={isOutOfStock}
                >
                  <ShoppingCart size={18} />
                </button>

                <button
                  type="button"
                  className="btn-buy"
                  onClick={(e) =>
                    handleQuickBuy(e, product)
                  }
                  disabled={isOutOfStock}
                >
                  <Zap size={16} />
                  <span>Acheter</span>
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}