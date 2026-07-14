import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Star } from 'lucide-react';
import { useCart } from '../Context/CartContext';
import { toast } from 'react-toastify'; // Remplacement de alert
import './ProductCard.css';
import './ALL_PREMIUM_COMPACT.css';

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  // Redirection vers le détail du produit
  const handleCardClick = () => {
    navigate(`/product/${product.id}`);
  };

  // Ajout rapide au panier
  const handleQuickAdd = (e) => {
    e.stopPropagation();
    try {
      addToCart(product, 1);
      // Utilisation de toast au lieu de alert pour une expérience premium
      toast.success(`${product.nom} ajouté au panier !`, {
        position: "bottom-right",
        autoClose: 2000,
        hideProgressBar: true,
      });
    } catch (error) {
      toast.error("Erreur lors de l'ajout");
    }
  };

  // Calcul du prix (sécurité pour éviter NaN si prix est manquant)
  const currentPrice = product.isPromo ? (product.prixPromo || 0) : (product.prix || 0);

  return (
    <div className="product-card" onClick={handleCardClick}>
      <div className="card-image-wrapper">
        <img 
          src={product.images?.[0] || product.image || '/placeholder-product.png'} 
          alt={product.nom} 
          loading="lazy"
        />
        {product.isPromo && product.prix > 0 && (
          <span className="promo-badge">
            -{Math.round((1 - (product.prixPromo / product.prix)) * 100)}%
          </span>
        )}
      </div>

      <div className="card-content">
        <div className="card-vendor">{product.vendorName || "Boutique Mambo"}</div>
        <h3 className="card-title">{product.nom}</h3>
        
        <div className="card-rating">
          <Star size={12} fill="#fbbf24" color="#fbbf24" />
          <span>{product.rating?.toFixed(1) || '0.0'}</span>
          <span className="card-sales">({product.totalVentes || 0})</span>
        </div>

        <div className="card-footer">
          <div className="card-price-container">
            <span className="card-current-price">{currentPrice.toLocaleString()} F</span>
            {product.isPromo && (
              <span className="card-old-price">{(product.prix || 0).toLocaleString()} F</span>
            )}
          </div>
          
          <button 
            className="quick-add-btn" 
            onClick={handleQuickAdd}
            aria-label="Ajouter au panier"
          >
            <ShoppingCart size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}