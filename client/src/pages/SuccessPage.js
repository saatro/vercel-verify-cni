import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle, Package, ArrowRight, ShoppingBag, Home } from 'lucide-react';
import Confetti from 'react-confetti';

export default function SuccessPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) return;
      const snap = await getDoc(doc(db, 'orders', orderId));
      if (snap.exists()) {
        setOrder(snap.data());
      }
    };
    fetchOrder();

    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [orderId]);

  return (
    <div className="success-page-container">
      <Confetti
        width={windowSize.width}
        height={windowSize.height}
        numberOfPieces={150}
        recycle={false}
        colors={['#10b981', '#34d399', '#059669', '#ffffff']}
      />

      <div className="success-content fade-in">
        <div className="success-icon-wrapper">
          <div className="icon-circle">
            <CheckCircle size={60} color="#ffffff" strokeWidth={3} />
          </div>
          <div className="pulse-ring"></div>
        </div>

        <h1 className="success-title">Commande Confirmée !</h1>
        <p className="success-subtitle">
          Merci pour votre confiance. Votre commande est en cours de traitement.
        </p>

        {order && (
          <div className="order-summary-card">
            <div className="summary-header">
              <Package size={20} />
              <span>Récapitulatif #{orderId?.slice(-6).toUpperCase()}</span>
            </div>
            <div className="summary-body">
              <div className="summary-row">
                <span>Montant total :</span>
                <strong>{(order.total || 0).toLocaleString()} F CFA</strong>
              </div>
              <div className="summary-row">
                <span>Mode de paiement :</span>
                <span className="payment-tag">{order.paymentMethod || 'Espèces'}</span>
              </div>
            </div>
          </div>
        )}

        <div className="success-actions">
          <button 
            className="btn-track-order"
            onClick={() => navigate(`/tracking/${orderId}`)}
          >
            <span>Suivre ma commande</span>
            <ArrowRight size={20} />
          </button>

          <div className="secondary-actions">
            <button onClick={() => navigate('/')} className="btn-outline">
              <Home size={18} />
              <span>Accueil</span>
            </button>
            <button onClick={() => navigate('/boutiques')} className="btn-outline">
              <ShoppingBag size={18} />
              <span>Boutiques</span>
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .success-page-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          padding: 20px;
          font-family: 'Inter', sans-serif;
        }

        .success-content {
          max-width: 450px;
          width: 100%;
          text-align: center;
          background: white;
          padding: 40px 30px;
          border-radius: 24px;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.05);
        }

        .success-icon-wrapper {
          position: relative;
          display: flex;
          justify-content: center;
          margin-bottom: 30px;
        }

        .icon-circle {
          width: 100px;
          height: 100px;
          background: #10b981;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
          box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
        }

        .pulse-ring {
          position: absolute;
          width: 100px;
          height: 100px;
          background: #10b981;
          border-radius: 50%;
          opacity: 0.3;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        .success-title {
          font-size: 24px;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 12px;
        }

        .success-subtitle {
          color: #64748b;
          font-size: 15px;
          line-height: 1.6;
          margin-bottom: 30px;
        }

        .order-summary-card {
          background: #f1f5f9;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 35px;
          text-align: left;
        }

        .summary-header {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 15px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 10px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 15px;
          color: #334155;
        }

        .payment-tag {
          font-size: 12px;
          background: #cbd5e1;
          padding: 2px 8px;
          border-radius: 6px;
          font-weight: 600;
        }

        .btn-track-order {
          width: 100%;
          background: #1e293b;
          color: white;
          border: none;
          padding: 16px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 15px;
        }

        .btn-track-order:active {
          transform: scale(0.98);
        }

        .secondary-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .btn-outline {
          background: transparent;
          border: 1.5px solid #e2e8f0;
          padding: 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #64748b;
          font-weight: 600;
          cursor: pointer;
          transition: 0.2s;
        }

        .btn-outline:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .fade-in {
          animation: fadeIn 0.6s ease-out forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}