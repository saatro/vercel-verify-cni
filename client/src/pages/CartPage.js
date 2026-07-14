import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, serverTimestamp, addDoc
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  ArrowLeft, Camera, ShieldCheck, Trash2, X, Info, MapPin
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import { useCart } from '../Context/CartContext';
import { auth, db } from '../firebase';
import confetti from 'canvas-confetti';
import 'react-toastify/dist/ReactToastify.css';
import './CartPage.css';

import headerImg from '../assets/mon-header.jpg';
import qrCodeImg from '../assets/ton-qr-wave.png';

// CORRECTIONS APPORTÉES DANS CE FICHIER :
// 1. Suppression de la récupération de la clé Gemini côté client (elle ne
//    quitte plus jamais le serveur — voir Cloud Function `verifyWaveReceipt`).
// 2. Suppression du bouton caché "Simuler la validation IA" (secretTapCount /
//    showSimulateBtn) : c'était un contournement total du paiement, présent
//    dans le bundle livré à tous les utilisateurs.
// 3. La commande est créée d'abord en statut "en_attente_paiement" (le
//    montant vient du panier serveur-side de confiance à ce stade), puis
//    c'est la Cloud Function qui vérifie le reçu ET marque la commande payée
//    de façon atomique. Le client ne peut plus jamais s'auto-valider.

export default function CartPage() {
  const navigate = useNavigate();

  const { cart, removeFromCart, clearCart } = useCart();

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [activeTab, setActiveTab] = useState('link');
  const [finalValidatedAmount, setFinalValidatedAmount] = useState(null);

  // Option Payer à la Livraison
  const [payOnDelivery, setPayOnDelivery] = useState(false);

  // Infos de livraison
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');

  const total = useMemo(() => {
    if (finalValidatedAmount) return Math.round(finalValidatedAmount);
    return cart.reduce((acc, item) => acc + (Number(item.prix || 0) * (item.quantity || 1)), 0);
  }, [cart, finalValidatedAmount]);

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

  // Vérifie que les infos de livraison sont bien renseignées avant de
  // permettre la validation du panier, quel que soit le mode de paiement.
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

  const goToClientHome = (recipient, orderRef, amount) => {
    navigate('/client-home', {
      state: {
        isAutoAssign: true,
        prefillName: recipient.clientName,
        prefillPhone: recipient.clientPhone,
        targetDestination: recipient.deliveryAddress,
        totalColis: amount,
        itemName: `Commande ${orderRef}`,
        orderReference: orderRef,
      }
    });
  };

  // ── Crée la commande en attente de paiement ──────────────────────────────
  // Le montant, les articles et le vendeur sont fixés ici, avant tout appel
  // de vérification — la Cloud Function relira CE document (jamais une
  // valeur envoyée directement par le client au moment de la vérification).
  const createPendingOrder = async () => {
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
    return { docRef, orderRef, recipient };
  };

  // ── Vérification du reçu Wave — appelle la Cloud Function serveur ───────
  const handleVerify = async (file) => {
    if (!user || !file) return;
    if (!ensureDeliveryInfo()) return;

    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);

    setIsProcessing(true);
    setStatusMessage("MAMBO IA analyse le reçu...");

    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result.split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      // 1. On crée d'abord la commande, montant figé côté serveur (Firestore).
      const { docRef, orderRef, recipient } = await createPendingOrder();

      // 2. La Cloud Function relit le montant depuis cette commande, appelle
      // Gemini avec la clé gardée côté serveur, vérifie l'anti-doublon et
      // marque la commande payée — tout ça de façon atomique, hors de portée
      // du navigateur.
      const functions = getFunctions();
      const verifyWaveReceipt = httpsCallable(functions, 'verifyWaveReceipt');
      const response = await verifyWaveReceipt({
        orderId: docRef.id,
        base64Image: base64,
      });

      const validatedAmount = response.data.amount;
      setFinalValidatedAmount(validatedAmount);
      setStatusMessage("✅ PAIEMENT CERTIFIÉ");

      setShowWaveModal(false);

      if (typeof confetti === 'function') {
        confetti({ particleCount: 150, spread: 70 });
      }
      if (typeof clearCart === 'function') {
        clearCart();
      }

      goToClientHome(recipient, orderRef, validatedAmount);

    } catch (e) {
      console.error(e);
      // Les erreurs de la Cloud Function (HttpsError) arrivent avec un
      // message lisible : "Montant incorrect...", "Ce reçu Wave a déjà été
      // utilisé.", etc.
      const message = e.message || "Erreur de vérification du reçu.";
      setStatusMessage(`❌ ${message}`);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashOnDelivery = async () => {
    if (!user || cart.length === 0) return;
    if (!ensureDeliveryInfo()) return;

    setIsProcessing(true);
    setStatusMessage("Création de la commande en paiement à la livraison...");

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

      goToClientHome(recipient, orderRef, total);

    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la création de la commande");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="cart-page">
      <ToastContainer theme="dark" position="top-center" />

      <header className="cart-header-immersive">
        <img src={headerImg} alt="Header" className="header-img"/>
        <button className="back-btn-blur" onClick={() => navigate(-1)}><ArrowLeft/></button>
        <div className="header-content">
          <h1>Mon Panier</h1>
          <p>{cart.length} article{cart.length > 1 ? 's' : ''}</p>
        </div>
      </header>

      <main className="cart-content">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <p>Votre panier est vide</p>
            <button onClick={() => navigate('/client-home')}>Retour aux courses</button>
          </div>
        ) : (
          <>
            <div className="cart-items-list">
              {cart.map((item, idx) => (
                <div key={idx} className="cart-item-card premium-card">
                  <div className="cart-item-main">
                    <img src={item.image || item.imageUrl} className="item-thumb-large" alt=""/>
                    <div className="item-details-rich">
                      <h3>{item.nom}</h3>
                      <p>{item.quantity || 1} x {Number(item.prix).toLocaleString()} F</p>
                    </div>
                    <button onClick={() => removeFromCart(item)} className="trash-mini">
                      <Trash2 size={16}/>
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

              <label className="cod-checkbox">
                <input
                  type="checkbox"
                  checked={payOnDelivery}
                  onChange={(e) => setPayOnDelivery(e.target.checked)}
                />
                <span>Payer à la livraison (COD)</span>
              </label>

              <button
                className="checkout-btn-main"
                onClick={payOnDelivery ? handleCashOnDelivery : () => { if (ensureDeliveryInfo()) setShowWaveModal(true); }}
                disabled={isProcessing}
              >
                {payOnDelivery ? 'COMMANDER + PAYER À LA LIVRAISON' : 'PAYER MAINTENANT PAR WAVE'}
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
              <div className="p-3 mb-4 text-left border bg-blue-500/10 border-blue-500/20 rounded-2xl">
                <p className="text-[10px] font-bold text-blue-400 uppercase mb-1 flex items-center gap-1">
                  <Info size={14}/> Étape 1 : Assistance
                </p>
                <p className="text-[11px] text-slate-300 leading-tight">
                  Enregistrez le contact <strong>+225 07 78 07 34 56</strong>
                </p>
              </div>

              <div className="mb-6 payment-toggle">
                <button className={activeTab === 'link' ? 'active' : ''} onClick={() => setActiveTab('link')}>Lien Direct</button>
                <button className={activeTab === 'qr' ? 'active' : ''} onClick={() => setActiveTab('qr')}>QR Code</button>
              </div>

              {activeTab === 'link' ? (
                <button className="mb-6 wave-link-btn" onClick={() => window.open(`https://pay.wave.com/m/M_ci_fAQd8MgriWne/c/ci/`, '_blank')}>
                  OUVRIR WAVE
                </button>
              ) : (
                <img src={qrCodeImg} alt="QR" className="w-32 h-32 mx-auto mb-6" />
              )}

              <div className="ia-upload-zone">
                <p className="text-[10px] font-bold text-emerald-500 uppercase mb-2">
                  Étape 2 : Scanner le reçu complet
                </p>
                <div className={`upload-box-ia ${isProcessing ? 'scanning' : ''}`} onClick={() => !isProcessing && document.getElementById('fileIn').click()}>
                  {previewUrl ? (
                    <img src={previewUrl} className="receipt-preview" alt="Reçu" />
                  ) : (
                    <div className="text-slate-500">
                      <Camera size={40}/>
                      <p className="text-[10px] mt-2 font-bold uppercase px-4">Capturer le reçu BLANC détaillé</p>
                    </div>
                  )}
                  {isProcessing && <div className="scanner-line"></div>}
                </div>
                <input type="file" id="fileIn" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && handleVerify(e.target.files[0])} />
              </div>

              <div className="mt-4 terminal-feedback">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  {statusMessage || "En attente du reçu Wave..."}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}