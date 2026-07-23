
import confetti from 'canvas-confetti';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection, doc, getDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import {
  ArrowLeft,
  MapPin,
  MessageSquare,
  ShieldCheck, Trash2,
  UserPlus,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useCart } from '../Context/CartContext';
import { auth, db } from '../firebase';
import './CartPage.css';

import headerImg from '../assets/mon-header.jpg';
import qrCodeImg from '../assets/ton-qr-wave.png';

export default function CartPage() {
  const navigate = useNavigate();

  const { cart, removeFromCart, clearCart } = useCart();

  const [isProcessing, setIsProcessing] = useState(false);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [activeTab, setActiveTab] = useState('link');
  const [currentOrderDocId, setCurrentOrderDocId] = useState(null);

  // Option Payer à la Livraison
  const [payOnDelivery, setPayOnDelivery] = useState(false);

  // Infos de livraison
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');

  const total = useMemo(() => {
    return cart.reduce((acc, item) => acc + (Number(item.prix || 0) * (item.quantity || 1)), 0);
  }, [cart]);

  const isSupermarketOrder = useMemo(() =>
    cart.some(item =>
      (item.type || "").toLowerCase() === "supermarche" ||
      (item.categorie || "").toLowerCase().includes("supermarche") ||
      (item.nomBoutique || "").toUpperCase().includes("SUPER") ||
      (item.nomBoutique || "").toUpperCase().includes("MARCHE")
    ),
    [cart]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setUserProfile(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserProfile(data);
          setDeliveryName(prev => prev || data.nom || data.nomComplet || '');
          setDeliveryPhone(prev => prev || data.telephone || '');
          setDeliveryAddress(prev => prev || data.adresse || '');
        }
      } catch (e) {
        console.warn('Erreur chargement profil client :', e);
      }
    });
    return unsubscribe;
  }, []);

  // Écouteur en temps réel de la commande créée. 
  useEffect(() => {
    if (!currentOrderDocId) return;

    const unsub = onSnapshot(doc(db, "orders", currentOrderDocId), (docSnap) => {
      if (docSnap.exists()) {
        const orderData = docSnap.data();

        if (orderData.status === "en_attente_coursier" || orderData.status === "paye") {
          setIsProcessing(false);
          setShowWaveModal(false);

          if (typeof confetti === 'function') {
            confetti({ particleCount: 150, spread: 70 });
          }
          if (typeof clearCart === 'function') {
            clearCart();
          }

          toast.success("Paiement validé par WhatsApp !");

          navigate('/espacecoursier', {
            state: {
              isAutoAssign: true,
              prefillName: orderData.clientName,
              prefillPhone: orderData.clientPhone,
              targetDestination: orderData.deliveryAddress,
              totalColis: orderData.amount,
              itemName: `Commande ${orderData.orderId}`,
              orderReference: orderData.orderId,
              whatsappReceiptValidated: true
            }
          });
        }
      }
    });

    return () => unsub();
  }, [currentOrderDocId, navigate, clearCart]);

  const ensureDeliveryInfo = () => {
    if (!deliveryAddress.trim()) {
      toast.error("Veuillez indiquer votre adresse de livraison.");
      return false;
    }
    if (!deliveryPhone.trim()) {
      toast.error("Veuillez indiquer un numéro de téléphone.");
      return false;
    }
    return true;
  };

  const buildRecipientFields = () => {
    const clientName = deliveryName.trim() || userProfile?.nom || userProfile?.nomComplet || user?.displayName || 'Client Mambo';
    const clientPhone = deliveryPhone.trim() || userProfile?.telephone || user?.phoneNumber || '';
    const address = deliveryAddress.trim();
    return {
      clientName,
      nomClient: clientName,
      clientPhone,
      telephoneClient: clientPhone,
      deliveryAddress: address,
      adresseLivraison: address,
      adresse: address,
    };
  };

  // Initialise la commande en "en_attente_paiement" et ouvre la modale WhatsApp
  const handleInitiateOnlinePayment = async () => {
    if (!user || cart.length === 0) return;
    if (!ensureDeliveryInfo()) return;

    setIsProcessing(true);

    try {
      const orderRef = `MG-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
      const vendorIds = [...new Set(cart.map(i => i.vendorId).filter(Boolean))];
      const recipient = buildRecipientFields();

      const orderData = {
        orderId: orderRef,
        amount: total,
        status: "en_attente_paiement",
        userId: user.uid,
        clientId: user.uid,
        createdAt: serverTimestamp(),
        items: [...cart],
        type: isSupermarketOrder ? "supermarche" : "boutique",
        vendorIds,
        vendorId: vendorIds[0] || null,
        ...recipient,
      };

      const docRef = await addDoc(collection(db, "orders"), orderData);
      setCurrentOrderDocId(docRef.id);
      setShowWaveModal(true);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'initialisation de la commande.");
      setIsProcessing(false);
    }
  };

  const handleCashOnDelivery = async () => {
    if (!user || cart.length === 0) return;
    if (!ensureDeliveryInfo()) return;

    setIsProcessing(true);

    try {
      const orderRef = `MG-COD-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
      const vendorIds = [...new Set(cart.map(i => i.vendorId).filter(Boolean))];
      const recipient = buildRecipientFields();

      const orderData = {
        orderId: orderRef,
        amount: total,
        status: "en_attente_livreur",
        userId: user.uid,
        clientId: user.uid,
        createdAt: serverTimestamp(),
        items: [...cart],
        type: isSupermarketOrder ? "supermarche" : "boutique",
        vendorIds,
        vendorId: vendorIds[0] || null,
        paymentMethod: "cash_on_delivery",
        payOnDelivery: true,
        note: "Paiement à la livraison",
        ...recipient,
      };

      await addDoc(collection(db, "orders"), orderData);
      toast.success("Commande créée ! Le vendeur va vous contacter pour assigner un livreur.");
      if (typeof clearCart === 'function') clearCart();

      navigate('/espacecoursier', {
        state: {
          isAutoAssign: true,
          prefillName: recipient.clientName,
          prefillPhone: recipient.clientPhone,
          targetDestination: recipient.deliveryAddress,
          totalColis: total,
          itemName: `Commande ${orderRef}`,
          orderReference: orderRef,
        }
      });
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'creation de la commande");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenWhatsAppAssist = () => {
    const phone = "2250778073456";
    const text = encodeURIComponent(`Bonjour Mambo Assist, voici mon reçu de paiement Wave pour ma commande.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <div className="cart-page">
      <ToastContainer theme="dark" position="top-center" />

      <header className="cart-header-immersive">
        <img src={headerImg} alt="Header" className="header-img" />
        <button className="back-btn-blur" onClick={() => navigate(-1)}><ArrowLeft /></button>
        <div className="header-content">
          <h1>Mon Panier</h1>
          <p>{cart.length} article{cart.length > 1 ? 's' : ''}</p>
        </div>
      </header>

      <main className="cart-content">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <p>Votre panier est vide</p>
            <button onClick={() => navigate('/espacecoursier')}>Retour aux commandes</button>
          </div>
        ) : (
          <>
            <div className="cart-items-list">
              {cart.map((item, idx) => (
                <div key={idx} className="cart-item-card premium-card">
                  <div className="cart-item-main">
                    <img src={item.image || item.imageUrl} className="item-thumb-large" alt="" />
                    <div className="item-details-rich">
                      <h3>{item.nom}</h3>
                      <p>{item.quantity || 1} x {Number(item.prix).toLocaleString()} F</p>
                    </div>
                    <button onClick={() => removeFromCart(item)} className="trash-mini">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <section className="delivery-info-section" style={{ padding: '16px', background: '#fff', borderRadius: '16px', margin: '0 16px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#475569' }}>
                <MapPin size={18} />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>INFOS DE LIVRAISON</h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Nom complet *"
                  value={deliveryName}
                  onChange={(e) => setDeliveryName(e.target.value)}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                />
                <input
                  type="tel"
                  placeholder="Numéro de téléphone *"
                  value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                />
                <input
                  type="text"
                  placeholder="Adresse de livraison *"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                />
              </div>
            </section>

            <section className="cart-summary-section">
              <div className="total-box">
                <div className="total-label">TOTAL À RÉGLER</div>
                <div className="total-amount">{total.toLocaleString()} F</div>
              </div>

              {!isSupermarketOrder && (
                <label className="cod-checkbox">
                  <input
                    type="checkbox"
                    checked={payOnDelivery}
                    onChange={(e) => setPayOnDelivery(e.target.checked)}
                  />
                  <span>Payer à la livraison (COD)</span>
                </label>
              )}

              <button
                className="checkout-btn-main"
                onClick={payOnDelivery ? handleCashOnDelivery : handleInitiateOnlinePayment}
                disabled={isProcessing}
              >
                {isSupermarketOrder
                  ? 'COMMANDER ET PAYER VIA WAVE'
                  : payOnDelivery
                    ? 'COMMANDER + PAYER À LA LIVRAISON'
                    : 'PAYER MAINTENANT PAR WAVE'
                }
              </button>
            </section>
          </>
        )}
      </main>

      {showWaveModal && (
        <div className="wave-modal-overlay">
          <div className="wave-modal-content">
            <div className="modal-header-brand">
              <ShieldCheck color="#10b981" />
              <div className="header-titles">
                <span className="italic main-title text-[10px]">SÉCURISÉ PAR MAMBO IA</span>
                <span className="font-black total-top">{total.toLocaleString()} F CFA</span>
              </div>
              <X onClick={() => setShowWaveModal(false)} className="close-x" />
            </div>

            <div className="p-4 text-center wave-body">

              <div className="p-4 mb-4 text-left border bg-emerald-500/10 border-emerald-500/30 rounded-2xl">
                <p className="text-[10px] font-black text-emerald-500 uppercase mb-1 flex items-center gap-1.5 tracking-wider">
                  <UserPlus size={15} /> ÉTAPE 1 : ENREGISTRER LE CONTACT
                </p>
                <p className="text-[12px] text-slate-100 font-medium leading-normal mb-2">
                  Ajoutez ce contact à votre répertoire afin de pouvoir lui partager votre reçu complet depuis Wave :
                </p>
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50 flex justify-between items-center">
                  <span className="font-mono text-white text-[13px] font-bold select-all">+225 07 78 07 34 56</span>
                  <span className="text-[9px] bg-emerald-500 text-slate-900 px-2 py-0.5 rounded-md font-extrabold uppercase">Mambo Assist</span>
                </div>
              </div>

              <div className="mb-6 payment-toggle">
                <button className={activeTab === 'link' ? 'active' : ''} onClick={() => setActiveTab('link')}>Lien Direct</button>
                <button className={activeTab === 'qr' ? 'active' : ''} onClick={() => setActiveTab('qr')}>QR Code Marchand</button>
              </div>

              {activeTab === 'link' ? (
                <button className="mb-6 wave-link-btn" onClick={() => window.open(`https://pay.wave.com/m/M_ci_fAQd8MgriWne/c/ci/`, '_blank')}>
                  OUVRIR WAVE ET PAYER
                </button>
              ) : (
                <img src={qrCodeImg} alt="QR" className="w-32 h-32 mx-auto mb-6" />
              )}

              <div className="p-4 text-left border bg-slate-800/40 border-slate-700/50 rounded-2xl">
                <p className="text-[10px] font-black text-emerald-400 uppercase mb-1 flex items-center gap-1.5 tracking-wider">
                  <MessageSquare size={15} /> ÉTAPE 2 : PARTAGER LE REÇU OFFICIEL
                </p>
                <p className="text-[12px] text-slate-200 leading-relaxed mb-3">
                  Une fois le paiement effectué dans Wave, cliquez sur <strong>Partager le reçu</strong> et sélectionnez <strong>Mambo Assist</strong> sur WhatsApp. Notre système valide automatiquement votre transfert à sa réception.
                </p>

                <button
                  onClick={handleOpenWhatsAppAssist}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-[13px] transition-colors"
                >
                  <MessageSquare size={16} />
                  Ouvrir WhatsApp Mambo Assist
                </button>
              </div>

              <div className="mt-5 terminal-feedback">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    Analyse WhatsApp en direct...
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Votre coursier recevra instantanément la liste et le reçu validé dès réception du message.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
