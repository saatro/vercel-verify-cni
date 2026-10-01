import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  doc, getDoc, collection, query, where,
  onSnapshot, serverTimestamp, writeBatch, increment, addDoc, updateDoc
} from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinary';
import { signOut } from 'firebase/auth';
import {
  Package, Plus, ShoppingBag, LogOut, Loader2, X,
  ChevronRight, User, Search, Coins, MessageSquare, ExternalLink,
  ShieldCheck, ShieldAlert
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import CategorieDynamique, {
  getSubCategories,
  normalizeCategoryId,
} from '../components/CategorieDynamique';
import VendeurCommandeDetail from '../components/VendeurCommandeDetail';
import './VendeurDashboard.css';

import VendeurHeader from '../components/VendeurHeader';

// ── Fonction utilitaire pour hacher / masquer un numéro de téléphone ──────────
const hashPhoneNumber = (phone) => {
  if (!phone) return 'Non renseigné';
  const str = String(phone).trim();
  if (str.length <= 4) return '****';
  return str.substring(0, 2) + '****' + str.substring(str.length - 2);
};

// ── Constantes ─────────────────────────────────────────────────────────────────
const DEFAULT_LOGO    = 'https://ui-avatars.com/api/?name=Boutique&background=6d28d9&color=fff';
const DEFAULT_PRODUCT = 'https://placehold.jp/24/6d28d9/ffffff/200x200.png?text=Aperçu';
const ADMIN_PHONE     = '0778073456';
const WAVE_LINK       = 'https://pay.wave.com/m/M_ci_fAQd8MgriWne/c/ci/';

// ── Styles CSS-in-JS pour la navigation mobile ───
const styles = {
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '64px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #f1f5f9',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 'env(safe-area-inset-bottom)',
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.05)',
    zIndex: 999,
  },
  navButton: {
    background: 'transparent',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    gap: '4px',
  },
  activeNavButton: {
    color: '#6d28d9',
    transform: 'translateY(-1px)',
  },
  navLabel: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.02em',
  }
};

// ── Composant Champ Formulaire ────────────────────────────────────────────────
const FormField = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748b', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.03em' }}>{label}</label>
    {React.cloneElement(children, {
      className: `m-input ${children.props.className || ''}`,
      style: { 
        width: '100%', 
        padding: '12px', 
        borderRadius: 12, 
        border: '1px solid #e2e8f0', 
        background: '#f8fafc', 
        color: '#0f172a', 
        fontSize: '14px', 
        fontWeight: '500',
        outline: 'none',
        transition: 'all 0.2s ease',
        ...children.props.style 
      },
    })}
  </div>
);

// ── Modal de Vérification CNI / Pièce d'identité via IA ─────────────────────────
function CniVerificationModal({ user, onSuccess, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const expectedName = (
    user?.nomBoutique || 
    user?.enseigne || 
    `${user?.prenom || ''} ${user?.nom || user?.nomComplet || ''}`
  ).trim();

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Veuillez sélectionner une image nette de votre pièce d'identité.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const imageBase64 = await convertToBase64(file);

      const response = await fetch('/api/verify-cni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          expectedName,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        const message = data.reasons && data.reasons.length > 0 
          ? data.reasons.join(' ') 
          : (data.error || "Échec de la vérification.");
        setError(message);
      } else {
        toast.success("Pièce d'identité certifiée avec succès !");
        if (onSuccess) onSuccess(data);
      }
    } catch (err) {
      setError("Erreur lors de la communication avec le serveur de vérification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-modal-fs fade-in" style={{ zIndex: 1200, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#ffffff', borderRadius: 20, maxWidth: 440, width: '100%', padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Verification CNI / Identité</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
            <X size={20}/>
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.4 }}>
          Nom attendu sur le document : <strong style={{ color: '#0f172a' }}>{expectedName || 'Non spécifié'}</strong>
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Photo recto de la pièce d'identité (CNI / Passeport / Attestation)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setFile(e.target.files[0]);
                  setError('');
                }
              }}
              style={{
                width: '100%',
                fontSize: 12,
                padding: '10px',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                background: '#f8fafc'
              }}
            />
          </div>

          {error && (
            <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 10, fontSize: 12 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#6d28d9', color: '#fff', fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {loading ? <><Loader2 className="animate-spin" size={16}/> Vérification IA...</> : 'Soumettre et vérifier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Dashboard Principal ────────────────────────────────────────────────────────
export default function VendeurDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('stock');
  const [userProfile, setUserProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [stats, setStats] = useState({ totalProduits: 0, totalVentes: 0, chiffreAffaires: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [showCniModal, setShowCniModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  useEffect(() => {
    let unsubP = () => {};
    let unsubO = () => {};
    let unsubC = () => {};

    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) { 
        navigate('/vendeur-login'); 
        return; 
      }
      const vId = user.uid;

      try {
        const uSnap = await getDoc(doc(db, 'users', vId));
        const uData = uSnap.data();

        setUserProfile({
          id: vId,
          ...uData,
          nomBoutique:  uData?.nomBoutique || uData?.enseigne || uData?.nomComplet,
          logo:         uData?.photoURL    || uData?.logo    || DEFAULT_LOGO,
          telephone:    uData?.telephone   || '',
          jetons:       uData?.jetons      || 0, 
          cniVerified:  Boolean(uData?.cniVerified),
          cniFullName:  uData?.cniFullName || '',
          cniNumber:    uData?.cniNumber   || '',
        });

        unsubP = onSnapshot(
          query(collection(db, 'products'), where('vendorId', '==', vId)),
          snap => {
            const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setProducts(prods);
            setStats(s => ({ ...s, totalProduits: prods.length }));
            setLoading(false);
          }
        );

        unsubO = onSnapshot(
          query(collection(db, 'orders'), where('vendorId', '==', vId)),
          async (snap) => {
            const actives = [];
            for (const d of snap.docs) {
              const order = { id: d.id, ...d.data() };
              if (['delivered', 'completed', 'livre'].includes((order.status || '').toLowerCase())) {
                try {
                  const batch = writeBatch(db);
                  batch.set(doc(db, 'orders_completed', order.id), { ...order, status: 'completed', archivedAt: serverTimestamp() });
                  batch.delete(doc(db, 'orders', order.id));
                  await batch.commit();
                } catch (e) {
                  console.warn("Échec archivage :", e);
                }
              } else {
                actives.push(order);
              }
            }
            setOrders(actives.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
          }
        );

        unsubC = onSnapshot(
          query(collection(db, 'orders_completed'), where('vendorId', '==', vId)),
          snap => {
            const done = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCompletedOrders(done);
            setStats(s => ({
              ...s,
              totalVentes:     done.length,
              chiffreAffaires: done.reduce((a, o) => a + Number(o.amount || o.total || 0), 0),
            }));
          }
        );

      } catch (error) {
        console.error("Erreur profil vendeur :", error);
      }
    });

    return () => {
      unsubAuth();
      unsubP();
      unsubO();
      unsubC();
    };
  }, [navigate]);

  const handleCniSuccess = async (cniData) => {
    if (!userProfile?.id) return;
    try {
      const userRef = doc(db, 'users', userProfile.id);
      const updatePayload = {
        cniVerified: true,
        cniFullName: cniData.fullName || '',
        cniNumber: cniData.cniNumber || '',
        cniVerifiedAt: serverTimestamp(),
      };

      await updateDoc(userRef, updatePayload);
      setUserProfile(prev => ({ ...prev, ...updatePayload, cniVerified: true }));
      setShowCniModal(false);
    } catch (err) {
      console.error("Erreur mise à jour Firestore CNI:", err);
      toast.error("Erreur lors de la mise à jour de la certification sur votre profil.");
    }
  };

  const pendingCount = useMemo(() =>
    orders.filter(o => 
      [
        'paye',
        'paye_ia_valide',
        'attente_livreur',
        'en_attente_livreur',
        'en_attente_coursier',
        'en_attente_commission',
        'preparation',
        'attente'
      ].includes((o.status || '').toLowerCase())
    ).length,
  [orders]);

  if (loading) return <div className="m-loader"><Loader2 className="animate-spin" size={42} color="#6d28d9"/></div>;

  return (
    <div className="m-dashboard">
      <ToastContainer theme="dark" position="top-center" autoClose={3000}/>
      
      <VendeurHeader 
        user={userProfile} 
        pendingCount={pendingCount} 
        onProfileClick={() => setActiveTab('profil')} 
        onBellClick={() => setActiveTab('ventes')} 
      />

      <main className="m-main-content">
        {selectedOrderId ? (
          <VendeurCommandeDetail orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)}/>
        ) : (
          <>
            {activeTab === 'stock' && (
              <div className="fade-in">
                <div className="m-search-container" style={{ padding:'16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div className="m-search-bar" style={{ flex: 1 }}>
                    <Search size={18}/>
                    <input placeholder="Produit…" onChange={e => setSearchTerm(e.target.value)}/>
                  </div>
                  <button 
                    className="m-add-fab" 
                    onClick={() => { 
                      if (!userProfile?.cniVerified) {
                        toast.warn("Veuillez d'abord certifier votre pièce d'identité dans votre profil pour ajouter des produits.");
                        setActiveTab('profil');
                        setShowCniModal(true);
                        return;
                      }
                      if (products.length >= 5 && (userProfile?.jetons || 0) < 100) {
                        toast.error("Limite de 5 produits gratuits atteinte. Rechargez votre compte jetons (100 F requis pour ce produit).");
                        setShowRechargeModal(true);
                        return;
                      }
                      setEditingProduct(null); 
                      setShowModal(true); 
                    }}
                  >
                    <Plus size={24}/>
                  </button>
                </div>

                <div className="m-product-grid">
                  {products.filter(p => p.nom?.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                    <div key={p.id} className="m-product-card" onClick={() => { setEditingProduct(p); setShowModal(true); }}>
                      <img src={p.images?.[0] || p.image || DEFAULT_PRODUCT} alt={p.nom} onError={(e) => { e.target.src = DEFAULT_PRODUCT; }} />
                      <div className="m-p-info">
                        <h4>{p.nom}</h4>
                        <div className="m-p-footer"><strong>{Number(p.prix || 0).toLocaleString()} F</strong><ChevronRight size={16}/></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'ventes' && (
              <OrdersView 
                orders={orders} 
                completedOrders={completedOrders} 
                onOrderClick={setSelectedOrderId}
              />
            )}

            {activeTab === 'messagerie' && (
              <VendorMessagingView user={userProfile} />
            )}

            {activeTab === 'profil' && (
              <ProfileView 
                user={userProfile} 
                stats={stats} 
                onOpenRecharge={() => setShowRechargeModal(true)} 
                onOpenCniModal={() => setShowCniModal(true)}
              />
            )}
          </>
        )}
      </main>

      <nav style={styles.bottomNav}>
        <button 
          style={{ ...styles.navButton, ...(activeTab === 'stock' ? styles.activeNavButton : {}) }} 
          onClick={() => setActiveTab('stock')}
        >
          <Package size={22} strokeWidth={activeTab === 'stock' ? 2.5 : 1.8} />
          <span style={styles.navLabel}>Stock</span>
        </button>

        <button 
          style={{ ...styles.navButton, ...(activeTab === 'ventes' ? styles.activeNavButton : {}) }} 
          onClick={() => setActiveTab('ventes')}
        >
          <ShoppingBag size={22} strokeWidth={activeTab === 'ventes' ? 2.5 : 1.8} />
          <span style={styles.navLabel}>Ventes</span>
        </button>

        <button 
          style={{ ...styles.navButton, ...(activeTab === 'messagerie' ? styles.activeNavButton : {}) }} 
          onClick={() => setActiveTab('messagerie')}
        >
          <MessageSquare size={22} strokeWidth={activeTab === 'messagerie' ? 2.5 : 1.8} />
          <span style={styles.navLabel}>Messagerie</span>
        </button>

        <button 
          style={{ ...styles.navButton, ...(activeTab === 'profil' ? styles.activeNavButton : {}) }} 
          onClick={() => setActiveTab('profil')}
        >
          <User size={22} strokeWidth={activeTab === 'profil' ? 2.5 : 1.8} />
          <span style={styles.navLabel}>Profil</span>
        </button>
      </nav>

      {showModal && (
        <ProductModal 
          user={userProfile} 
          product={editingProduct} 
          productCount={products.length}
          onClose={() => setShowModal(false)}
          onRequireRecharge={() => setShowRechargeModal(true)}
        />
      )}

      {showRechargeModal && (
        <RechargeModal 
          user={userProfile} 
          onClose={() => setShowRechargeModal(false)} 
        />
      )}

      {showCniModal && (
        <CniVerificationModal
          user={userProfile}
          onSuccess={handleCniSuccess}
          onClose={() => setShowCniModal(false)}
        />
      )}
    </div>
  );
}

// ── Composant de Messagerie Vendeur (Synchro inAppMessages & Wave) ──
function VendorMessagingView({ user }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMsg, setLoadingMsg] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const q = query(collection(db, 'inAppMessages'), where('receiverId', '==', user.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs.sort((a, b) => (b.timestamp?.seconds || b.createdAt?.seconds || 0) - (a.timestamp?.seconds || a.createdAt?.seconds || 0)));
      setLoadingMsg(false);
    }, (error) => {
      console.error("Erreur écoute messages vendeur :", error);
      setLoadingMsg(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user?.id) return;

    try {
      await addDoc(collection(db, 'inAppMessages'), {
        senderId: user.id,
        receiverId: 'support', 
        vendorId: user.id,
        text: newMessage,
        timestamp: serverTimestamp(),
        read: false,
      });
      setNewMessage('');
    } catch (error) {
      console.error("Erreur lors de l'envoi du message :", error);
      toast.error("Erreur lors de l'envoi du message.");
    }
  };

  const handleCoursierPaymentQuery = () => {
    const hashedPhone = hashPhoneNumber(user?.telephone);
    const text = `Bonjour Assistance Mambo,\nJe souhaite confirmer le paiement de ma commission de coursier.\n(Vendeur: ${user?.nomBoutique || 'Boutique'} | Tél: ${hashedPhone})\n\nVoici mon reçu complet Wave pour vérification.`;
    window.open(`https://wa.me/225${ADMIN_PHONE}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="fade-in" style={{ padding: '16px', maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#ffffff', borderRadius: 16, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={18} color="#6d28d9" /> Messagerie & Commissions Coursier
        </h3>
        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, marginBottom: 14 }}>
          Retrouvez ici les messages échangés avec les clients et l'assistance. Vous pouvez également valider et transmettre directement votre reçu Wave pour le paiement de la commission du coursier.
        </p>
        <button
          onClick={handleCoursierPaymentQuery}
          style={{
            width: '100%',
            padding: '12px',
            background: '#25D366',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer'
          }}
        >
          <ExternalLink size={16} /> Confirmer commission coursier (WhatsApp Wave)
        </button>
      </div>

      <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '400px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Boîte de réception des messages</h4>
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loadingMsg ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Chargement des messages...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', margin: 'auto' }}>
              <MessageSquare size={36} color="#cbd5e1" style={{ marginBottom: 10 }} />
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Aucun message pour le moment</p>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Les notifications et messages de vos clients apparaîtront ici.</span>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: 12,
                    fontSize: 13,
                    background: isMe ? '#6d28d9' : '#f1f5f9',
                    color: isMe ? '#fff' : '#0f172a',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}>
                    <p style={{ margin: 0, lineHeight: 1.4 }}>{msg.text}</p>
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, padding: '0 4px' }}>
                    {msg.timestamp?.toDate ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Récemment'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSendMessage} style={{ display: 'flex', padding: 12, borderTop: '1px solid #f1f5f9', background: '#fff', gap: 8 }}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrire un message..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              fontSize: 13,
              outline: 'none',
              background: '#f8fafc'
            }}
          />
          <button
            type="submit"
            style={{
              background: '#6d28d9',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '0 16px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Modal de Paiement Wave Intégré ──────────────────────────────────────────
function RechargeModal({ user, onClose }) {
  const [whatsappOpened, setWhatsappOpened] = useState(false);

  const openWhatsApp = () => {
    const hashedPhone = hashPhoneNumber(user?.telephone);
    const userIdentifier = user 
      ? `\n(Vendeur: ${user.nomBoutique || user.nomComplet || 'Inconnu'} | Tél: ${hashedPhone} | UID: ${user.id})` 
      : '';
    
    const text = `Bonjour Assistance MAMBO,\nJe prépare mon rechargement de solde via Wave.${userIdentifier}\n\nVoici le reçu de ma transaction pour le contrôle et le crédit immédiat de mon solde.`;
    
    window.open(`https://wa.me/225${ADMIN_PHONE}?text=${encodeURIComponent(text)}`, '_blank');
    setWhatsappOpened(true);
  };

  const handleWavePay = () => {
    window.open(WAVE_LINK, '_blank');
  };

  return (
    <div className="m-modal-fs fade-in" style={{ zIndex: 1100, background: '#f8fafc', overflowY: 'auto', paddingBottom: 30 }}>
      <div className="m-modal-header" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
        <button type="button" onClick={onClose}><X size={24}/></button>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Paiement & Rechargement Wave</h3>
        <div></div>
      </div>

      <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, textAlign: 'center' }}>
          Suivez les étapes ci-dessous pour effectuer votre rechargement de solde en toute sécurité.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ 
            background: '#fff', 
            borderRadius: 16, 
            padding: 16, 
            border: whatsappOpened ? '1px solid #16a34a' : '2px solid #0284c7',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ 
                width: 24, height: 24, borderRadius: '50%', background: whatsappOpened ? '#16a34a' : '#0284c7', 
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 
              }}>
                {whatsappOpened ? '✓' : '1'}
              </div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Préparer WhatsApp</h4>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px 34px', lineHeight: 1.4 }}>
              Ouvrez la discussion avec l'assistance pour pouvoir y partager votre reçu Wave.
            </p>
            <div style={{ marginLeft: 34 }}>
              <button 
                onClick={openWhatsApp}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#25D366',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer'
                }}
              >
                <MessageSquare size={16} /> Ouvrir la discussion WhatsApp
              </button>
            </div>
          </div>

          <div style={{ 
            background: '#fff', 
            borderRadius: 16, 
            padding: 16, 
            border: '1px solid #e2e8f0',
            opacity: whatsappOpened ? 1 : 0.6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ 
                width: 24, height: 24, borderRadius: '50%', background: '#64748b', 
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 
              }}>
                2
              </div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Payer sur Wave & Transmettre</h4>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px 34px', lineHeight: 1.4 }}>
              Effectuez votre paiement sur Wave puis partagez directement le reçu complet dans la discussion.
            </p>
            <div style={{ marginLeft: 34 }}>
              <button 
                onClick={handleWavePay}
                disabled={!whatsappOpened}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: whatsappOpened ? '#16a34a' : '#cbd5e1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: whatsappOpened ? 'pointer' : 'not-allowed'
                }}
              >
                <ExternalLink size={16} /> Ouvrir Wave & Payer
              </button>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 20, lineHeight: 1.5 }}>
          Le contrôle du reçu complet depuis l'interface Wave garantit le crédit automatique et rapide de votre solde.
        </p>
      </div>
    </div>
  );
}

// ── Modal Produit ─────────────────────────────────────────────────────────────
function ProductModal({ user, product, productCount, onClose, onRequireRecharge }) {
  const [type, setType]       = useState('boutique');
  const [loading, setLoading] = useState(false);
  const [images, setImages]   = useState([]);
  const [f, setF]             = useState({
    nom: '', prix: '', stock: '1', description: '', categorie: '', unite: 'pièce'
  });

  const subCats = useMemo(() => getSubCategories(type), [type]);

  useEffect(() => {
    if (product) {
      const t = normalizeCategoryId(product.type || 'boutique');
      setType(t);
      const existingImages = product.images || (product.image ? [product.image] : []);
      setImages(existingImages.map((url) =>
        typeof url === 'string' ? { preview: url, url } : url
      ));
      setF({ ...product, categorie: product.categorie || getSubCategories(t)[0] });
    } else {
      const cats = getSubCategories('boutique');
      setType('boutique');
      setImages([]);
      setF({ nom: '', prix: '', stock: '1', description: '', categorie: cats[0], unite: 'pièce' });
    }
  }, [product]);

  const handleTypeChange = (val) => {
    const resolved = normalizeCategoryId(val);
    setType(resolved);
    const cats = getSubCategories(resolved);
    setF((prev) => ({ ...prev, categorie: cats[0] }));
  };

  const handleSave = async () => {
    if (!f.nom || !f.prix || images.length === 0) {
      toast.error('Nom, Prix et au moins une photo sont obligatoires');
      return;
    }

    const isNew = !product?.id;
    const requiresFee = isNew && productCount >= 5;

    if (requiresFee) {
      const currentJetons = user?.jetons || 0;
      if (currentJetons < 100) {
        toast.error("Solde de jetons insuffisant (100 jetons requis pour ce produit supplémentaire).");
        onClose();
        onRequireRecharge();
        return;
      }
    }

    setLoading(true);

    try {
      const urls = [];
      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        if (typeof item === 'string' && item.startsWith('http')) {
          urls.push(item);
          continue;
        }
        const fileTarget = (typeof item === 'object' && item !== null) ? (item.file || item.raw || item) : item;
        try {
          const secureUrl = await uploadToCloudinary(fileTarget);
          if (secureUrl) urls.push(secureUrl);
        } catch (uploadErr) {
          console.error("Échec upload image", uploadErr);
        }
      }

      if (urls.length === 0) {
        throw new Error("Impossible d'uploader les images.");
      }

      const baseData = {
        nom:         f.nom || '',
        prix:        Number(f.prix) || 0,
        stock:       f.stock || '1',
        description: f.description || '',
        categorie:   f.categorie || '',
        unite:       f.unite || 'pièce',
        type,
        images:      urls,
        image:       urls[0] || DEFAULT_PRODUCT,
        vendorId:    user.id,
        vendeurId:   user.id,
        nomBoutique: user?.nomBoutique || user?.enseigne || user?.nomComplet || '',
        updatedAt:   serverTimestamp(),
      };

      const batch = writeBatch(db);

      if (isNew) {
        const newDocRef = doc(collection(db, 'products'));
        batch.set(newDocRef, { ...baseData, createdAt: serverTimestamp() });

        if (requiresFee) {
          const userRef = doc(db, 'users', user.id);
          batch.update(userRef, { jetons: increment(-100) });
        }
      } else {
        const prodRef = doc(db, 'products', product.id);
        batch.update(prodRef, baseData);
      }

      await batch.commit();

      onClose();
      toast.success(requiresFee ? 'Produit publié ! 100 jetons ont été déduits de votre compte.' : 'Produit enregistré avec succès !');
    } catch (err) {
      toast.error(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-modal-fs fade-in">
      <div className="m-modal-header">
        <button type="button" onClick={onClose}><X size={24}/></button>
        <h3>{product ? 'Modifier' : 'Nouveau Produit'} {productCount >= 5 && !product ? '(Facturé 100 jetons)' : ''}</h3>
        <button type="button" onClick={handleSave} className="m-save-btn" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={20}/> : 'Publier'}
        </button>
      </div>

      <div className="m-modal-scroll-body" style={{ padding: 20 }}>
        <CategorieDynamique mode="selection" categorie={type} onSelect={handleTypeChange}/>
        <CategorieDynamique mode="photos-only" categorie={type} images={images} setImages={setImages}/>

        <div style={{ marginTop: 12 }}>
          <FormField label="Nom de l'article *">
            <input type="text" value={f.nom || ''} onChange={e => setF({ ...f, nom: e.target.value })}/>
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Prix (F CFA) *">
              <input type="number" value={f.prix || ''} onChange={e => setF({ ...f, prix: e.target.value })}/>
            </FormField>
            <FormField label="Stock">
              <input type="text" value={f.stock || ''} onChange={e => setF({ ...f, stock: e.target.value })}/>
            </FormField>
          </div>

          <FormField label="Catégorie *">
            <select value={f.categorie || ''} onChange={e => setF({ ...f, categorie: e.target.value })}>
              {subCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          <FormField label="Description">
            <textarea rows={3} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })}/>
          </FormField>
        </div>
      </div>
    </div>
  );
}

// ── Vue des Commandes ────────────────────────────────────────────────────────
function OrdersView({ orders, completedOrders, onOrderClick }) {
  const [filter, setFilter] = useState('actives');
  const list = filter === 'actives' ? orders : completedOrders;

  return (
    <div className="m-orders-view fade-in">
      <div className="m-tabs-pills">
        <button className={filter === 'actives' ? 'active' : ''} onClick={() => setFilter('actives')}>En cours</button>
        <button className={filter === 'terminees' ? 'active' : ''} onClick={() => setFilter('terminees')}>Historique</button>
      </div>
      <div style={{ padding:'0 16px' }}>
        {list.length === 0 && (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#94a3b8', fontSize:12, fontWeight:700 }}>
            Aucune commande
          </div>
        )}
        {list.map(o => (
          <div key={o.id} className="m-order-item-container" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div className="m-order-item" onClick={() => onOrderClick(o.id)} style={{ cursor: 'pointer', padding: 16 }}>
              <div className="order-main" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4>{o.nom || o.clientName || 'Client'}</h4>
                  <p style={{ fontSize: 11, color: '#64748b' }}>{o.orderId || o.id.substring(0, 8)}</p>
                </div>
                <div style={{ textAlign:'right' }}>
                  <p><strong>{Number(o.amount || o.total || 0).toLocaleString()} F</strong></p>
                  <span className="m-status-badge">{o.status}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Vue du Profil (avec bloc de certification CNI) ──────────────────────────
function ProfileView({ user, stats, onOpenRecharge, onOpenCniModal }) {
  const boutiqueNom = user?.nomBoutique || user?.enseigne || user?.nomComplet;
  const boutiqueLogo = user?.photoURL || user?.logo || DEFAULT_LOGO;

  return (
    <div className="m-profile-view fade-in" style={{ padding: 16 }}>
      <div className="m-profile-hero" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <img 
          src={boutiqueLogo} 
          alt={boutiqueNom || "Boutique"}
          style={{ width: 80, height: 80, borderRadius: '20px', objectFit: 'cover' }} 
        />
        <div>
          {boutiqueNom && <h3 style={{ margin: 0, fontSize: 18 }}>{boutiqueNom}</h3>}
          {user?.telephone && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>📱 {hashPhoneNumber(user.telephone)}</p>}
        </div>
      </div>

      {/* Bloc certification d'identité CNI */}
      <div style={{ 
        borderRadius: 16, 
        padding: 16, 
        marginBottom: 20, 
        background: user?.cniVerified ? '#f0fdf4' : '#fffbeb',
        border: user?.cniVerified ? '1px solid #bbf7d0' : '1px solid #fef3c7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.cniVerified ? (
            <ShieldCheck size={28} color="#16a34a" />
          ) : (
            <ShieldAlert size={28} color="#d97706" />
          )}
          <div>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: user?.cniVerified ? '#15803d' : '#b45309' }}>
              {user?.cniVerified ? 'Identité Certifiée' : 'Compte Non Vérifié'}
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
              {user?.cniVerified 
                ? `CNI validée (${user.cniFullName || 'Nom certifié'})` 
                : 'Veuillez faire vérifier votre CNI pour débloquer toutes les fonctionnalités.'}
            </p>
          </div>
        </div>

        {!user?.cniVerified && (
          <button
            onClick={onOpenCniModal}
            style={{
              padding: '8px 12px',
              background: '#d97706',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Vérifier
          </button>
        )}
      </div>

      <div style={{ 
        background: 'linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)', 
        borderRadius: 16, 
        padding: 20, 
        color: '#fff', 
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 10px 20px rgba(109, 40, 217, 0.2)'
      }}>
        <div>
          <span style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Coins size={16} /> Solde de Jetons
          </span>
          <h2 style={{ fontSize: 28, margin: '6px 0 0', fontWeight: 800 }}>
            {Number(user?.jetons || 0).toLocaleString()} <span style={{ fontSize: 14, fontWeight: 400 }}>jetons</span>
          </h2>
        </div>
        <button 
          onClick={onOpenRecharge}
          style={{
            background: '#ffffff',
            color: '#6d28d9',
            border: 'none',
            padding: '10px 16px',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          Payer (Wave)
        </button>
      </div>

      <div className="m-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div className="stat-card" style={{ background: '#f8fafc', padding: 12, borderRadius: 12, textAlign: 'center' }}>
          <small style={{ fontSize: 10, color: '#64748b' }}>CA</small>
          <strong style={{ display: 'block', fontSize: 14 }}>{Number(stats.chiffreAffaires || 0).toLocaleString()} F</strong>
        </div>
        <div className="stat-card" style={{ background: '#f8fafc', padding: 12, borderRadius: 12, textAlign: 'center' }}>
          <small style={{ fontSize: 10, color: '#64748b' }}>Ventes</small>
          <strong style={{ display: 'block', fontSize: 14 }}>{stats.totalVentes || 0}</strong>
        </div>
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, textAlign: 'center' }}>
          <small style={{ fontSize: 10, color: '#64748b' }}>Produits</small>
          <strong style={{ display: 'block', fontSize: 14 }}>{stats.totalProduits || 0}</strong>
        </div>
      </div>

      <button className="m-btn-logout-large" onClick={() => signOut(auth)} style={{ width: '100%', padding: '12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <LogOut size={18}/> Déconnexion
      </button>
    </div>
  );
}