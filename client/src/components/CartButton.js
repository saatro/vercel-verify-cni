import { useNavigate } from 'react-router-dom';
import { useCart } from '../Context/CartContext';
import { ShoppingCart } from 'lucide-react';
import './CartButton.css';

export default function CartButton() {
  const navigate = useNavigate();
  const { cart } = useCart();

  // Calcul du nombre total d'articles (somme des quantités)
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);

  return (
    <button className="cart-floating-button" onClick={() => navigate('/cart')}>
      <div className="cart-icon-wrapper">
        <ShoppingCart size={24} color="#ffffff" />
        {itemCount > 0 && (
          <span className="cart-badge">{itemCount}</span>
        )}
      </div>
    </button>
  );
}