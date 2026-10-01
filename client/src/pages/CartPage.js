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
  X,
  AlertCircle,
  ShieldAlert
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

// Fonction pour hacher ou masquer les données personnelles (PII)
function hashOrMaskData(str) {
  if (!str) return '';
  const clean = String(str).trim();
  // Masquage visuel sécurisé (ex: 07 78 ** ** 56)
  if (clean.length > 4) {
    return clean.slice(0, 3) + '****' + clean.slice(-2);
  }
  return '****';
}

// Détermination du statut initial selon le type de commande
const determineInitialStatus = (type) => {
  if (type === 'supermarche') {
    return 'en_attente_commission'; // Réservé uniquement aux supermarchés
  }
  // Pour les boutiques (pas de commission, en attente du paiement de l'article)
  return 'attente_livreur'; 
};

// --- FONCTION UTILITAIRE POUR LA NOTIFICATION AUTOMATIQUE DANS LA BOÎTE DE RÉCEPTION ---
async function creerNotificationAutomatique(orderId, userId) {
  try {
    await addDoc(collection(db, 'inAppMessages'), {
      orderId: orderId,
      senderId: 'system_mambo',
      senderName: 'Mambo - Assistant Automatique',
      receiverId: userId,
      text: `Votre commande ${orderId} a bien été enregistrée et envoyée au vendeur. Mambo vous informera ici de l'évolution de votre course en temps réel.`,
      timestamp: serverTimestamp(),
      read: false
    });
  } catch (error) {
    console.error("Erreur lors de la création de la notification automatique :", error);
  }
}

export default function CartPage() {
  const navigate = useNavigate();

  const { cart, removeFromCart, clearCart } = useCart();

  const [isProcessing, setIsProcessing] = useState(false);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [activeTab, setActiveTab] = useState('link');
  const [currentOrderDocId, setCurrentOrderDocId] = useState(null);

  // Enseigne active
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  // Statut vérification vendeur (anti dropshipping)
  const [vendorStatus, setVendorStatus] = useState(null); 
  const [loadingVendor, setLoadingVendor] = useState(false);

  // COD
  const [payOnDelivery, setPayOnDelivery] = useState(false);

  // Infos livraison
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');

  const availableVendors = useMemo(() => {
    const map = new Map();
    cart.forEach(item => {
      const vId = item.vendorId || item.vendeurId || 'default';
      const vName = item.nomBoutique || "Boutique Partenaire";
      if (!map.has(vId)) {
        map.set(vId, { id: vId, name: vName, count: 0 });
      }
      map.get(vId).count += 1;
    });
    return Array.from(map.values());
  }, [cart]);

  useEffect(() => {
    if (availableVendors.length > 0) {
      if (!selectedVendorId || !availableVendors.some(v => v.id === selectedVendorId)) {
        setSelectedVendorId(availableVendors[0].id);
      }
    } else {
      setSelectedVendorId(null);
    }
  }, [availableVendors, selectedVendorId]);

  // Charger isVerified du vendeur sélectionné
  useEffect(() => {
    if (!selectedVendorId || selectedVendorId === 'default') {
      setVendorStatus(null);
      return;
    }

    let cancelled = false;
    setLoadingVendor(true);

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', selectedVendorId));
        if (cancelled) return;
        if (snap.exists()) {
          const d = snap.data();
          setVendorStatus({
            isVerified: d.isVerified === true,
            pendingAdminReview: d.pendingAdminReview === true,
            nomBoutique: d.nomBoutique || d.enseigne || '',
            categorie: d.categorie || '',
            isActive: d.isActive !== false,
            legalCertified: d.legalCertified === true,
          });
        } else {
          setVendorStatus({
            isVerified: false,
            pendingAdminReview: true,
            nomBoutique: '',
            categorie: '',
            isActive: false,
            legalCertified: false,
          });
        }
      } catch (e) {
        console.warn('Erreur statut vendeur:', e);
        if (!cancelled) {
          setVendorStatus({
            isVerified: false,
            pendingAdminReview: true,
            nomBoutique: '',
            categorie: '',
            isActive: false,
            legalCertified: false,
          });
        }
      } finally {
        if (!cancelled) setLoadingVendor(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedVendorId]);

  const filteredCart = useMemo(() => {
    if (!selectedVendorId) return cart;
    return cart.filter(item => {
      const vId = item.vendorId || item.vendeurId || 'default';
      return vId === selectedVendorId;
    });
  }, [cart, selectedVendorId]);

  const isAddressFilled = useMemo(() => deliveryAddress.trim().length > 0, [deliveryAddress]);

  const total = useMemo(() => {
    return filteredCart.reduce((acc, item) => acc + (Number(item.prix || 0) * (item.quantity || 1)), 0);
  }, [filteredCart]);

  const isSupermarketOrder = useMemo(() =>
    filteredCart.some(item =>
      (item.type || "").toLowerCase() === "supermarche" ||
      (item.categorie || "").toLowerCase().includes("supermarche") ||
      (item.nomBoutique || "").toUpperCase().includes("SUPER") ||
      (item.nomBoutique || "").toUpperCase().includes("MARCHE")
    ) || (vendorStatus?.categorie || "").toLowerCase().includes("supermarche"),
    [filteredCart, vendorStatus]);

  // Paiement autorisé uniquement si vendeur vérifié
  const vendorAllowed = useMemo(() => {
    if (!selectedVendorId || selectedVendorId === 'default') return true;
    if (loadingVendor) return false;
    if (!vendorStatus) return false;
    return vendorStatus.isVerified === true && vendorStatus.isActive !== false;
  }, [selectedVendorId, vendorStatus, loadingVendor]);

  // Boutique autorisée à vendre, mais n'ayant pas fourni ses documents légaux (Raison sociale
  // + RCCM) : elle reste éligible, mais UNIQUEMENT au paiement à la livraison (le client ne doit
  // jamais payer par Wave à l'avance à une boutique non certifiée).
  const vendorCertified = vendorStatus?.legalCertified === true;
  const forceCodOnly = useMemo(() => {
    if (!selectedVendorId || selectedVendorId === 'default') return false;
    if (!vendorAllowed) return false;
    return !vendorCertified;
  }, [selectedVendorId, vendorAllowed, vendorCertified]);

  // Boutique non certifiée : le paiement à la livraison est imposé (pas de choix possible).
  useEffect(() => {
    if (forceCodOnly && !payOnDelivery) setPayOnDelivery(true);
  }, [forceCodOnly, payOnDelivery]);

  // Chargement du profil du CLIENT connecté
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

          const resolvedClientName = 
            data.nomComplet || 
            data.fullName || 
            data.name || 
            data.nom || 
            (data.prenom && data.nom ? `${data.prenom} ${data.nom}` : '');

          const resolvedClientPhone = data.telephone || data.phone || u.phoneNumber || '';
          const resolvedClientAddress = data.adresse || data.address || '';

          setDeliveryName(resolvedClientName);
          setDeliveryPhone(resolvedClientPhone);
          setDeliveryAddress(resolvedClientAddress);
        }
      } catch (e) {
        console.warn('Erreur chargement profil client :', e);
      }
    });
    return unsubscribe;
  }, []);

  const buildRecipientFields = () => {
    const profileName = userProfile?.nomComplet || userProfile?.fullName || userProfile?.name || userProfile?.nom || '';
    
    const clientName = deliveryName.trim() || profileName || user?.displayName || 'Client Mambo';
    const clientPhone = deliveryPhone.trim() || userProfile?.telephone || userProfile?.phone || user?.phoneNumber || '';
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

  // Écoute de validation du paiement Wave & Redirection
  useEffect(() => {
    if (!currentOrderDocId) return;

    const unsub = onSnapshot(doc(db, "orders", currentOrderDocId), (docSnap) => {
      if (docSnap.exists()) {
        const orderData = docSnap.data();

        if (orderData.status === "en_attente_coursier" || orderData.status === "paye") {
          setIsProcessing(false);
          setShowWaveModal(false);

          if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 70 });
          if (typeof clearCart === 'function') clearCart();

          toast.success("Paiement validé ! Le vendeur va préparer votre commande et faire appel à un livreur.");

          navigate('/client-home');
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

  const ensureVendorVerified = () => {
    if (!vendorAllowed) {
      toast.error(
        "Cette boutique n'est pas encore validée par Mambo. Les paiements sont temporairement bloqués."
      );
      return false;
    }
    return true;
  };

  const handleInitiateOnlinePayment = async () => {
    if (!user || filteredCart.length === 0) return;
    if (!ensureDeliveryInfo()) return;
    if (!ensureVendorVerified()) return;

    setIsProcessing(true);

    try {
      const orderRef = `MG-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
      const vendorIds = [...new Set(filteredCart.map(i => i.vendorId || i.vendeurId).filter(Boolean))];
      const recipient = buildRecipientFields();

      const uniqueStores = [...new Set(filteredCart.map(i => i.nomBoutique).filter(Boolean))];
      const exactNomBoutique = uniqueStores.length > 0 ? uniqueStores.join(', ') : (filteredCart[0]?.nomBoutique || "Boutique Partenaire");

      const orderType = isSupermarketOrder ? "supermarche" : "boutique";

      const orderData = {
        orderId: orderRef,
        amount: total,
        status: determineInitialStatus(orderType),
        userId: user.uid,
        clientId: user.uid,
        createdAt: serverTimestamp(),
        items: [...filteredCart],
        type: orderType,
        vendorIds,
        vendorId: vendorIds[0] || null,
        nomBoutique: exactNomBoutique,
        vendorVerifiedAtOrder: true,
        pickupLocation: { address: exactNomBoutique },
        dropoffLocation: { address: recipient.deliveryAddress },
        ...recipient,
      };

      const docRef = await addDoc(collection(db, "orders"), orderData);
      setCurrentOrderDocId(docRef.id);

      // Notification automatique
      await creerNotificationAutomatique(orderRef, user.uid);

      setShowWaveModal(true);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'initialisation de la commande.");
      setIsProcessing(false);
    }
  };

  const handleCashOnDelivery = async () => {
    if (!user || filteredCart.length === 0) return;
    if (!ensureDeliveryInfo()) return;
    if (!ensureVendorVerified()) return;

    setIsProcessing(true);

    try {
      const orderRef = `MG-COD-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
      const vendorIds = [...new Set(filteredCart.map(i => i.vendorId || i.vendeurId).filter(Boolean))];
      const recipient = buildRecipientFields();

      const safePhone = hashOrMaskData(recipient.clientPhone);
      const safeName = recipient.clientName ? recipient.clientName.charAt(0) + '***' : 'Client';

      const uniqueStores = [...new Set(filteredCart.map(i => i.nomBoutique).filter(Boolean))];
      const exactNomBoutique = uniqueStores.length > 0 ? uniqueStores.join(', ') : (filteredCart[0]?.nomBoutique || "Boutique Partenaire");

      const orderType = isSupermarketOrder ? "supermarche" : "boutique";
      const courseRequested = true;

      const orderData = {
        orderId: orderRef,
        amount: total,
        status: "attente_livreur", 
        userId: user.uid,
        clientId: user.uid,
        createdAt: serverTimestamp(),
        items: [...filteredCart],
        type: orderType,
        vendorIds,
        vendorId: vendorIds[0] || null,
        paymentMethod: "cash_on_delivery",
        payOnDelivery: true,
        note: "Paiement à la livraison",
        nomBoutique: exactNomBoutique,
        vendorVerifiedAtOrder: true,
        courseRequested: courseRequested,
        pickupLocation: { address: exactNomBoutique },
        dropoffLocation: { address: recipient.deliveryAddress },
        ...recipient,
        safeClientPhone: safePhone,
        safeClientName: safeName,
      };

      await addDoc(collection(db, "orders"), orderData);

      // Notification automatique
      await creerNotificationAutomatique(orderRef, user.uid);

      toast.success("Commande créée ! Le vendeur va la préparer puis assigner un livreur.");

      if (typeof clearCart === 'function') clearCart();

      navigate('/client-home');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la création de la commande");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenWhatsAppAssist = () => {
    const phone = "2250778073456";
    const text = encodeURIComponent(`Bonjour Mambo Assist, voici mon reçu de paiement Wave complet pour ma commande.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const canCheckout = isAddressFilled && vendorAllowed && !loadingVendor;

  return (
    <div className="cart-page" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ToastContainer theme="dark" position="top-center" />

      <header className="cart-header-immersive" style={{ flexShrink: 0 }}>
        <img src={headerImg} alt="Header" className="header-img" />
        <button className="back-btn-blur" onClick={() => navigate(-1)}><ArrowLeft /></button>
        <div className="header-content">
          <h1>Mon Panier</h1>
          <p>{cart.length} article{cart.length > 1 ? 's' : ''} au total</p>
        </div>
      </header>

      <main className="cart-content" style={{ flex: 1, overflowY: 'auto', paddingBottom: '280px' }}>
        {cart.length === 0 ? (
          <div className="empty-cart" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p>Votre panier est vide</p>
            <button onClick={() => navigate('/espacecoursier')}>Retour aux commandes</button>
          </div>
        ) : (
          <>
            {availableVendors.length > 1 && (
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '16px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#0284c7' }}>
                  <AlertCircle size={16} />
                  <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Plusieurs enseignes détectées ({availableVendors.length})
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px', lineHeight: '1.4' }}>
                  Pour garantir un traitement fluide, veuillez valider une seule enseigne à la fois :
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {availableVendors.map(vendor => {
                    const isActive = vendor.id === selectedVendorId;
                    return (
                      <button
                        key={vendor.id}
                        onClick={() => setSelectedVendorId(vendor.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: '700',
                          border: isActive ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: isActive ? '#0284c7' : '#ffffff',
                          color: isActive ? '#ffffff' : '#334155',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: isActive ? '0 2px 4px rgba(2, 132, 199, 0.2)' : 'none'
                        }}
                      >
                        {vendor.name} ({vendor.count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!loadingVendor && selectedVendorId && selectedVendorId !== 'default' && !vendorAllowed && (
              <div style={{
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderRadius: 16,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}>
                <ShieldAlert size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#991b1b' }}>
                    Boutique en attente de validation Mambo
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c', lineHeight: 1.45, fontWeight: 600 }}>
                    {vendorStatus?.nomBoutique
                      ? `« ${vendorStatus.nomBoutique} » n'a pas encore été vérifiée`
                      : 'Cette enseigne n\'a pas encore été vérifiée'}
                    {' '}(CNI{vendorStatus?.categorie?.toLowerCase?.().includes('supermarche') ? ' + RCCM' : ''}).
                    Les paiements et commandes sont bloqués jusqu&apos;à validation admin.
                  </p>
                </div>
              </div>
            )}

            {vendorAllowed && selectedVendorId && selectedVendorId !== 'default' && !loadingVendor && vendorCertified && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 12,
                padding: '10px 14px',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <ShieldCheck size={16} color="#16a34a" />
                <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d' }}>
                  Boutique certifiée Mambo
                </span>
              </div>
            )}

            {forceCodOnly && !loadingVendor && (
              <div style={{
                background: '#fff7ed',
                border: '1.5px solid #fed7aa',
                borderRadius: 16,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}>
                <ShieldAlert size={20} color="#ea580c" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#9a3412' }}>
                    Boutique non certifiée
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#c2410c', lineHeight: 1.45, fontWeight: 600 }}>
                    Cette boutique n&apos;a pas encore fourni ses documents légaux (Raison sociale + RCCM).
                    Seul le <strong>paiement à la livraison</strong> est disponible pour cette commande.
                    Ne payez par Wave qu&apos;<strong>en présence du livreur</strong> et
                    <strong> après avoir vu le colis</strong>.
                  </p>
                </div>
              </div>
            )}

            <div className="cart-items-list">
              {filteredCart.map((item, idx) => (
                <div key={idx} className="cart-item-card premium-card">
                  <div className="cart-item-main" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '16px' }}>
                    <img src={item.image || item.imageUrl} className="item-thumb-large" alt="" />
                    <div className="item-details-rich">
                      <h3>{item.nom}</h3>
                      <p style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '2px' }}>
                        Enseigne : {item.nomBoutique || "Boutique Partenaire"}
                      </p>
                      <p>{item.quantity || 1} x {Number(item.prix).toLocaleString()} F</p>
                    </div>
                    <button onClick={() => removeFromCart(item)} className="trash-mini">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <section className="delivery-info-section" style={{ padding: '12px', background: '#fff', borderRadius: '16px', margin: '16px 0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', color: '#475569' }}>
                <MapPin size={18} />
                <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '700' }}>INFOS DE LIVRAISON (CLIENT)</h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Nom complet *"
                  value={deliveryName}
                  onChange={(e) => setDeliveryName(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <input
                  type="tel"
                  placeholder="Numéro de téléphone *"
                  value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <input
                  type="text"
                  placeholder="Adresse de livraison *"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
              </div>
            </section>
          </>
        )}
      </main>

      {cart.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#ffffff',
          padding: '12px 16px',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.08)',
          borderTop: '1px solid #e2e8f0',
          zIndex: 1000
        }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="cart-summary-section" style={{ margin: 0, padding: 0, background: 'transparent', boxShadow: 'none' }}>
              <div className="total-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="total-label" style={{ fontSize: '12px', fontWeight: '800', color: '#64748b' }}>TOTAL À RÉGLER ({filteredCart.length} art.)</div>
                <div className="total-amount" style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>{total.toLocaleString()} F</div>
              </div>

              {forceCodOnly ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px', fontWeight: '700', color: '#c2410c' }}>
                  <input type="checkbox" checked readOnly disabled style={{ width: '16px', height: '16px', accentColor: '#ea580c' }} />
                  <span>Paiement à la livraison uniquement (boutique non certifiée)</span>
                </div>
              ) : (
                !isSupermarketOrder && vendorAllowed && (
                  <label className="cod-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px', fontWeight: '600', color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={payOnDelivery}
                      onChange={(e) => setPayOnDelivery(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#0284c7' }}
                    />
                    <span>Payer à la livraison (COD)</span>
                  </label>
                )
              )}

              <button
                className={`checkout-btn-main ${!canCheckout ? 'disabled-btn' : ''}`}
                onClick={(forceCodOnly || payOnDelivery) ? handleCashOnDelivery : handleInitiateOnlinePayment}
                disabled={isProcessing || !canCheckout}
                title={
                  !vendorAllowed
                    ? "Boutique non validée par Mambo"
                    : !isAddressFilled
                      ? "Veuillez saisir l'adresse de livraison"
                      : ""
                }
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: '800',
                  fontSize: '13px',
                  opacity: canCheckout ? 1 : 0.55,
                  cursor: canCheckout ? 'pointer' : 'not-allowed',
                }}
              >
                {loadingVendor
                  ? 'VÉRIFICATION BOUTIQUE...'
                  : !vendorAllowed
                    ? 'BOUTIQUE NON VALIDÉE'
                    : forceCodOnly
                      ? 'COMMANDER + PAYER À LA LIVRAISON'
                      : isSupermarketOrder
                        ? 'COMMANDER ET PAYER VIA WAVE'
                        : payOnDelivery
                          ? 'COMMANDER + PAYER À LA LIVRAISON'
                          : 'PAYER MAINTENANT PAR WAVE'
                }
              </button>

              {!vendorAllowed && !loadingVendor && (
                <p style={{ fontSize: '11px', color: '#ef4444', textAlign: 'center', marginTop: '6px', fontWeight: '700' }}>
                  Paiement bloqué — validation admin requise.
                </p>
              )}
              {vendorAllowed && !isAddressFilled && (
                <p className="address-hint-msg" style={{ fontSize: '11px', color: '#ef4444', textAlign: 'center', marginTop: '4px', fontWeight: '600' }}>
                  Veuillez saisir l&apos;adresse de livraison pour activer le bouton de commande.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showWaveModal && (
        <div className="wave-modal-overlay">
          <div className="wave-modal-content">
            <div className="modal-header-brand">
              <div className="modal-header-left">
                <ShieldCheck className="text-sky-400 shrink-0" size={18} />
                <span className="main-title text-[10px] tracking-wider text-slate-300 font-bold uppercase truncate">SÉCURISÉ PAR MAMBO IA</span>
              </div>
              <div className="modal-header-right">
                <span className="text-xs font-black text-sky-400 whitespace-nowrap">{total.toLocaleString()} F CFA</span>
                <X onClick={() => setShowWaveModal(false)} className="cursor-pointer close-x text-slate-400 hover:text-white shrink-0" size={20} />
              </div>
            </div>

            <div className="p-4 text-center wave-body">
              <div className="p-4 mb-4 text-left border bg-sky-500/10 border-sky-500/30 rounded-2xl">
                <p className="text-[10px] font-black text-sky-400 uppercase mb-1 flex items-center gap-1.5 tracking-wider">
                  <UserPlus size={15} /> ÉTAPE 1 : ENREGISTRER LE CONTACT ASSISTANCE
                </p>
                <p className="text-[12px] text-slate-100 font-medium leading-normal mb-2">
                  Enregistrez ce contact d'assistance dans votre répertoire pour confirmer votre paiement par contrôle du reçu complet depuis l'interface Wave :
                </p>
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50 flex justify-between items-center mb-3">
                  <span className="font-mono text-white text-[13px] font-bold select-all">+225 07 78 07 34 56</span>
                  <span className="text-[9px] bg-sky-500 text-slate-950 px-2 py-0.5 rounded-md font-extrabold uppercase">Mambo Assist</span>
                </div>
                <button
                  onClick={handleOpenWhatsAppAssist}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4 rounded-xl text-[13px] transition-colors shadow-md"
                >
                  <MessageSquare size={16} />
                  Ouvrir WhatsApp Mambo Assist
                </button>
              </div>

              <div className="p-4 mb-4 text-center border border-slate-700/50 bg-slate-900/40 rounded-2xl">
                <p className="text-[10px] font-black text-sky-400 uppercase mb-3 tracking-wider">
                  MOYEN DE PAIEMENT WAVE
                </p>
                <div className="inline-flex w-full p-1 mb-4 payment-toggle bg-slate-800 rounded-xl">
                  <button
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'link' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setActiveTab('link')}
                  >
                    Lien Direct
                  </button>
                  <button
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'qr' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setActiveTab('qr')}
                  >
                    QR Code Marchand
                  </button>
                </div>

                {activeTab === 'link' ? (
                  <button className="w-full px-4 py-3 text-xs font-black tracking-wider uppercase transition-colors shadow-lg wave-link-btn bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl" onClick={() => window.open(`https://pay.wave.com/m/M_ci_fAQd8MgriWne/c/ci/`, '_blank')}>
                    OUVRIR WAVE ET PAYER
                  </button>
                ) : (
                  <div className="inline-block p-4 bg-white shadow-inner rounded-2xl">
                    <img src={qrCodeImg} alt="QR Code Wave" className="w-32 h-32 mx-auto" />
                  </div>
                )}
              </div>

              <div className="p-4 text-left border bg-slate-800/40 border-slate-700/50 rounded-2xl">
                <p className="text-[10px] font-black text-sky-400 uppercase mb-1 flex items-center gap-1.5 tracking-wider">
                  <MessageSquare size={15} /> ÉTAPE 2 : PARTAGER LE REÇU OFFICIEL COMPLET
                </p>
                <p className="text-[12px] text-slate-200 leading-relaxed">
                  Une fois le paiement effectué dans Wave, cliquez sur <strong>Partager le reçu</strong> et sélectionnez <strong>Mambo Assist</strong> (votre contact assistance enregistré) sur WhatsApp pour confirmer votre paiement par contrôle du reçu complet. Notre système valide automatiquement votre transfert à sa réception.
                </p>
              </div>

              <div className="mt-4 terminal-feedback">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
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