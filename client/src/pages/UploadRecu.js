import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ExternalLink, Zap, MessageCircle, Check
} from 'lucide-react';
import './UploadRecu.css';

const ADMIN_PHONE = '0778073456';
const WAVE_LINK = 'https://pay.wave.com/m/M_ci_fAQd8MgriWne/c/ci/';

export default function UploadRecu() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [whatsappOpened, setWhatsappOpened] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate('/acces');
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setUserData({ id: user.uid, ...snap.data() });
    });
    return unsub;
  }, [navigate]);

  const openWhatsApp = () => {
    const userIdentifier = userData 
      ? `\n(Livreur: ${userData.nomComplet || userData.nom || 'Inconnu'} | Tél: ${userData.telephone || 'Non renseigné'} | UID: ${userData.id})` 
      : '';
    
    const text = `Bonjour Assistance MAMBO,\nJe prépare mon rechargement de solde via Wave.${userIdentifier}\n\nVoici le reçu de ma transaction pour le contrôle et le crédit immédiat de mon solde.`;
    
    window.open(`https://wa.me/225${ADMIN_PHONE}?text=${encodeURIComponent(text)}`, '_blank');
    setWhatsappOpened(true);
  };

  const handleWavePay = () => {
    window.open(WAVE_LINK, '_blank');
  };

  return (
    <div className="ur-root">
      <button className="ur-back" onClick={() => navigate(-1)}>
        <ChevronLeft size={20} />
      </button>

      <div className="ur-card ur-animate-in">
        <div className="ur-badge"><Zap size={12} fill="currentColor" /> Rechargement Solde</div>
        <h1 className="ur-title">Rechargement</h1>
        <p className="ur-subtitle">Ouvrez la discussion WhatsApp puis effectuez votre paiement sur Wave.</p>

        {/* TIMELINE SIMPLIFIÉE : ORDRE INVERSÉ */}
        <div className="ur-timeline">
          
          {/* ÉTAPE 1 : OUVRIR WHATSAPP */}
          <div className={`ur-time-item ${whatsappOpened ? 'ur-time-done' : 'ur-time-active'}`}>
            <div className="ur-time-badge">
              {whatsappOpened ? <Check size={14} /> : 1}
            </div>
            <div className="ur-time-content">
              <h3>1. Préparer WhatsApp</h3>
              <p>Ouvrez la discussion avec l'assistance pour recevoir le reçu.</p>
              <button 
                className="ur-inline-btn ur-btn-wa" 
                onClick={openWhatsApp}
              >
                <MessageCircle size={14} /> Ouvrir la discussion WhatsApp
              </button>
            </div>
          </div>

          {/* ÉTAPE 2 : PAIEMENT WAVE */}
          <div className={`ur-time-item ${!whatsappOpened ? 'ur-time-locked' : 'ur-time-active'}`}>
            <div className="ur-time-badge">2</div>
            <div className="ur-time-content">
              <h3>2. Payer et Transmettre</h3>
              <p>Payez sur Wave puis partagez directement le reçu complet dans la discussion.</p>
              <button 
                className="ur-wave-btn-timeline" 
                onClick={handleWavePay}
                disabled={!whatsappOpened}
              >
                <ExternalLink size={14} /> Ouvrir Wave & Payer
              </button>
            </div>
          </div>

        </div>

        <p className="ur-footer-notice">
          Le contrôle du reçu complet depuis l'interface Wave garantit le crédit automatique et rapide de votre solde.
        </p>
      </div>
    </div>
  );
}