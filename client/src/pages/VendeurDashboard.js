
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import {
  doc, getDoc, collection, query, where,
  onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, writeBatch, getDocs
} from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinary';
import { signOut } from 'firebase/auth';
import {
  Package, Plus, ShoppingBag, LogOut, Loader2, X,
  ChevronRight, User, Search, Trash2, PlusCircle
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import CategorieDynamique from '../components/CategorieDynamique';
import VendeurCommandeDetail from '../components/VendeurCommandeDetail';
import './VendeurDashboard.css';

import VendeurHeader from '../components/VendeurHeader';

// ── Constantes ─────────────────────────────────────────────────────────────────
const NOTIFICATION_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
const DEFAULT_LOGO       = 'https://ui-avatars.com/api/?name=Boutique&background=6d28d9&color=fff';
const DEFAULT_PRODUCT    = 'https://placehold.jp/24/6d28d9/ffffff/200x200.png?text=Aperçu';

const CATEGORIES_MAP = {
  boutique:         ['Mode','Électronique','Beauté','Parfumerie','Maison','Jeux','Téléphones','Accessoires','Autre'],
  supermarche:     ['Épicerie','Fruits & Légumes','Viandes & Poissons','Produits laitiers','Boissons','Surgelés','Hygiène & Beauté','Bébé','Entretien','Autre'],
  resto_fastfood:  ['Menu Complet','Entrées','Plats','Desserts','Boissons','Fast-Food'],
  en_ligne:         ['Logiciels','Formations','Abonnements','Services','Design','Coaching','Tickets','Autre'],
  deal_particulier:['Mode','Téléphones','Ordinateurs','Électronique','Meubles','Vélos','Jeux','Autre'],
  immobilier:      ['Studio','Chambre Salon','2 Pièces','3 Pièces','4 Pièces','Villa','Duplex','Terrain','Bureau'],
  vehicule:        ['Berline','SUV / 4x4','Moto','Camion','Pick-up','Utilitaire'],
  autre:           ['Artisanat','Cosmétiques','Agriculture','Services','Autre'],
};
// eslint-disable-next-line no-unused-vars
const STATUS_META = {
  en_preparation:       { label: "En préparation", color: "#b45309", bg: "#fef3c7", border: "#fde68a" },
  en_attente_paiement:  { label: "Attente Reçu Wave", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  paye_ia_valide:       { label: "Payé & Validé", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  achats_termines:      { label: "Prêt pour Livreur", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  en_route:             { label: "En cours de route", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  en_attente_coursier:  { label: "Recherche Livreur", color: "#475569", bg: "#f8fafc", border: "#e2e8f0" }
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

// ── Dashboard Principal ────────────────────────────────────────────────────────
export default function VendeurDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('stock');
  const [userProfile, setUserProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [stats, setStats] = useState({ totalProduits: 0, totalVentes: 0, chiffreAffaires: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const prevOrderIds = React.useRef(new Set());
  const [verificationCodes, setVerificationCodes] = useState({}); // { [orderId]: {pickupCode, deliveryCode} | null }
  const [regeneratingId, setRegeneratingId] = useState(null);

  // Écouteur pour capter le préremplissage de boutique ou de coursier fini-rayons via l'URL
  useEffect(() => {
    if (!userProfile) return;

    const queryParams = new URLSearchParams(location.search);
    const source = queryParams.get('source'); // ex: 'boutique' ou 'coursier_rayons'
    
    if (source === 'boutique' || source === 'coursier_rayons') {
      const targetDestination = queryParams.get('adresse') || queryParams.get('targetDestination') || '';
      const prefillName = queryParams.get('nom') || queryParams.get('prefillName') || '';
      const prefillPhone = queryParams.get('telephone') || queryParams.get('prefillPhone') || '';
      const montantArticles = Number(queryParams.get('montant') || queryParams.get('montantArticles') || 0);

      toast.info(`Pre-remplissage détecté (${source === 'boutique' ? 'Boutique' : 'Coursier rayons'})`);

      // Redirection automatique vers le formulaire client-home avec l'état prérempli
      navigate("/client-home", {
        state: {
          isTiersOrder: true,
          vendeurId: userProfile.id,
          vendeurNom: userProfile.nomBoutique || userProfile.enseigne || userProfile.nomComplet || "Vendeur Mambo",
          departAdresse: userProfile.adresse || "",
          prefillName: prefillName,
          prefillPhone: prefillPhone,
          targetDestination: targetDestination,
          targetAddress: targetDestination,
          montantArticles: montantArticles,
          montantLivraison: 0,
          items: [],
          isAutoAssign: true,
          fromVendeur: true,
          prefillSource: source
        }
      });
    }
  }, [location.search, userProfile, navigate]);
  
  // Listener In-App Messages / Notifications
  useEffect(() => {
    if (!userProfile?.id) return;

    const qMessages = query(
      collection(db, "inAppMessages"),
      where("receiverId", "==", userProfile.id),
      where("status", "==", "unread")
    );

    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const msgData = change.doc.data();
          
          // Notification visuelle à l'écran
          toast.info(`💬 ${msgData.title || "Nouveau message"} : ${msgData.body}`, {
            position: "top-center",
            autoClose: 5000,
          });

          // Marquer automatiquement le message comme lu
          updateDoc(doc(db, "inAppMessages", change.doc.id), {
            status: "read",
            readAt: serverTimestamp()
          }).catch(err => console.error("Erreur mise à jour message lu :", err));
        }
      });
    }, (err) => {
      console.warn("Erreur d'écoute des messages In-App :", err.message);
    });

    return () => unsubMessages();
  }, [userProfile?.id]);

  // Listener Firebase Cloud Messaging (Notifications Hors-App / Push)
  useEffect(() => {
    if (!userProfile?.id) return;

    const requestPushPermission = async () => {
      try {
        // Importation dynamique du module messaging de Firebase
        const { getMessaging, getToken } = await import('firebase/messaging');
        const messaging = getMessaging();
        
        // Demande d'autorisation au navigateur
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          // Récupération du jeton unique de l'appareil
          // Remplace 'VOTRE_CLE_VAPID_PUBLIQUE' par ta clé Web Push générée dans la console Firebase
          const currentToken = await getToken(messaging, { 
            vapidKey: 'BDE5b26fkUCHbCy7IzjX30eDjJpfQev7GWOrKc6yJxUV48L0XInKEd2urQwzuqUgjQ5UAfP9EcvZ3gtXYI52oII' 
          });
          
          if (currentToken) {
            // Sauvegarde ou mise à jour du jeton dans le profil du vendeur pour le serveur
            await updateDoc(doc(db, "users", userProfile.id), {
              fcmToken: currentToken,
              updatedAt: serverTimestamp()
            });
          } else {
            console.warn('Aucun jeton d\'enregistrement disponible. Demandez l\'autorisation de générer un jeton.');
          }
        } else {
          console.warn('Permission de notification refusée par l\'utilisateur.');
        }
      } catch (err) {
        console.error('Erreur lors de la configuration des notifications Push FCM :', err);
      }
    };

    requestPushPermission();
  }, [userProfile?.id]);

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
          nomBoutique: uData?.nomBoutique || uData?.enseigne || uData?.nomComplet,
          logo:        uData?.photoURL    || uData?.logo    || DEFAULT_LOGO,
          telephone:   uData?.telephone   || '',
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

  const pendingCount = useMemo(() =>
    orders.filter(o => ['paye','paye_ia_valide','en_attente_livreur','preparation','attente'].includes((o.status||'').toLowerCase())).length,
  [orders]);

  const fetchVerificationCode = React.useCallback(async (orderId) => {
    try {
      const q = query(collection(db, "courses"), where("orderId", "==", orderId));
      const querySnap = await getDocs(q);
      
      if (!querySnap.empty) {
        const courseData = querySnap.docs[0].data();
        const detectedCode = courseData.passCode || courseData.verificationCode || courseData.pickupCode || "";
        const deliveryCode = courseData.deliveryCode || "";
        
        if (detectedCode) {
          setVerificationCodes(prev => ({
            ...prev,
            [orderId]: { pickupCode: detectedCode, deliveryCode: deliveryCode }
          }));
          return;
        }
      }
      
      const directSnap = await getDoc(doc(db, "courses", orderId));
      if (directSnap.exists()) {
        const data = directSnap.data();
        const code = data.passCode || data.verificationCode || data.pickupCode || "";
        const deliveryCode = data.deliveryCode || "";
        if (code) {
          setVerificationCodes(prev => ({
            ...prev,
            [orderId]: { pickupCode: code, deliveryCode: deliveryCode }
          }));
          return;
        }
      }

      setVerificationCodes(prev => ({ ...prev, [orderId]: null }));
    } catch (e) {
      console.warn("Erreur lecture code de passation:", e.message);
      setVerificationCodes(prev => ({ ...prev, [orderId]: null }));
    }
  }, []);

  useEffect(() => {
    const toCheck = orders.filter(o => o.courseRequested);
    toCheck.forEach(o => {
      if (!(o.id in verificationCodes)) fetchVerificationCode(o.id);
    });
  }, [orders, verificationCodes, fetchVerificationCode]);

  const handleRegenerateCode = async (orderId) => {
    setRegeneratingId(orderId);
    try {
      const linkQ = query(collection(db, "courses"), where("orderId", "==", orderId));
      const linkSnap = await getDocs(linkQ);

      if (linkSnap.empty) {
        toast.error("Aucune course trouvée pour cette commande. Relancez d'abord la commande de course.");
        setRegeneratingId(null);
        return;
      }

      const realCourseId = linkSnap.docs[0].id;
      const initCodes = httpsCallable(functions, "initializeVerificationCodes");
      const result = await initCodes({ courseId: realCourseId });

      setVerificationCodes(prev => ({
        ...prev,
        [orderId]: { pickupCode: result.data.pickupCode, deliveryCode: result.data.deliveryCode }
      }));
      toast.success("Code de passation généré !");
    } catch (e) {
      toast.error(e.message || "Impossible de générer le code.");
    } finally {
      setRegeneratingId(null);
    }
  };

  useEffect(() => {
    const newOrders = orders.filter(o =>
      ['paye_ia_valide', 'en_attente_livreur'].includes((o.status || '').toLowerCase()) &&
      !prevOrderIds.current.has(o.id)
    );
    if (newOrders.length > 0) {
      NOTIFICATION_SOUND.play().catch(() => {});
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      newOrders.forEach(o => {
        toast.success(`💰 Commande #${o.orderId || o.id.slice(-5)} — ${Number(o.amount||0).toLocaleString()} F`);
      });
    }
    orders.forEach(o => prevOrderIds.current.add(o.id));
  }, [orders]);

  const handleOrderLaunchToTiers = async (order) => {
    if (!userProfile) return toast.error("Données du vendeur non chargées.");
    try {
      await updateDoc(doc(db, 'orders', order.id), { courseRequested: true });
    } catch (e) {
      console.warn("Impossible de marquer courseRequested:", e.message);
    }

    let clientName = order.nom || order.clientName || order.nomClient || '';
    let clientPhone = order.telephone || order.clientPhone || order.telephoneClient || '';
    let deliveryAddress = order.adresse || order.deliveryAddress || order.adresseLivraison || '';

    if (!clientName || !clientPhone || !deliveryAddress) {
      const clientUid = order.clientId || order.userId;
      if (clientUid) {
        try {
          const clientSnap = await getDoc(doc(db, 'users', clientUid));
          if (clientSnap.exists()) {
            const clientData = clientSnap.data();
            clientName = clientName || clientData.nom || clientData.nomComplet || '';
            clientPhone = clientPhone || clientData.telephone || '';
            deliveryAddress = deliveryAddress || clientData.adresse || '';
          }
        } catch (e) {
          console.warn("Impossible de charger le profil client :", e);
        }
      }
    }

    if (!deliveryAddress) {
      toast.warn("Adresse de livraison introuvable pour cette commande — merci de la saisir manuellement dans le prochain écran.");
    }

    navigate("/client-home", {
      state: {
        isTiersOrder: true,
        orderId: order.id,
        customOrderId: order.orderId || "",

        vendeurId: userProfile.id,
        vendeurNom: userProfile.nomBoutique || userProfile.enseigne || userProfile.nomComplet || "Vendeur Mambo",
        departAdresse: userProfile.adresse || "",

        prefillName: clientName,
        prefillPhone: clientPhone,
        targetDestination: deliveryAddress,
        targetAddress: deliveryAddress,

        montantArticles: Number(order.amount || order.total || 0),
        montantLivraison: Number(order.deliveryFee || order.fraisLivraison || 0),

        items: order.items || [],
        isAutoAssign: true,
        fromVendeur: true,
      }
    });
  };

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
                <div className="m-search-container" style={{ padding:'16px' }}>
                  <div className="m-search-bar">
                    <Search size={18}/>
                    <input placeholder="Produit…" onChange={e => setSearchTerm(e.target.value)}/>
                  </div>
                  <button className="m-add-fab" onClick={() => { setEditingProduct(null); setShowModal(true); }}><Plus size={24}/></button>
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
                onLaunchTiers={handleOrderLaunchToTiers}
                verificationCodes={verificationCodes}
                regeneratingId={regeneratingId}
                onRegenerateCode={handleRegenerateCode}
              />
            )}

            {activeTab === 'profil' && <ProfileView user={userProfile} stats={stats}/>}
          </>
        )}
      </main>

      <nav className="m-bottom-nav">
        <button className={activeTab === 'stock' ? 'active' : ''} onClick={() => setActiveTab('stock')}><Package size={22}/><span>Stock</span></button>
        <button className={activeTab === 'ventes' ? 'active' : ''} onClick={() => setActiveTab('ventes')}><ShoppingBag size={22}/><span>Ventes</span></button>
        <button className={activeTab === 'profil' ? 'active' : ''} onClick={() => setActiveTab('profil')}><User size={22}/><span>Profil</span></button>
      </nav>

      {showModal && <ProductModal user={userProfile} product={editingProduct} onClose={() => setShowModal(false)}/>}
    </div>
  );
}

// ── Modal Produit ──────────────────────────────────────────────────────────────
function ProductModal({ user, product, onClose }) {
  const [type, setType]       = useState('boutique');
  const [loading, setLoading] = useState(false);
  const [images, setImages]   = useState([]);
  const [f, setF]             = useState({ nom:'', prix:'', stock:'1', description:'', categorie:'', unite:'pièce' });

  useEffect(() => {
    if (product) {
      setType(product.type || 'boutique');
      setImages(product.images || (product.image ? [product.image] : []));
      setF({ ...product });
    } else {
      setF({ nom:'', prix:'', stock:'1', description:'', categorie: CATEGORIES_MAP['boutique'][0], unite:'pièce' });
    }
  }, [product]);

  const handleSave = async () => {
    if (!f.nom || !f.prix || images.length === 0) { 
      toast.error('Nom, Prix et au moins une photo sont obligatoires'); 
      return; 
    }
    setLoading(true);
    
    try {
      const urls = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (typeof img === 'string' && (img.startsWith('http') || img.startsWith('data:'))) {
          urls.push(img);
          continue;
        }
        if (img instanceof File || img instanceof Blob) {
          const secureUrl = await uploadToCloudinary(img);
          if (secureUrl) urls.push(secureUrl);
        }
      }
      
      if (urls.length === 0) throw new Error("Impossible d'uploader les images.");

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

      if (product?.id) {
        await updateDoc(doc(db, 'products', product.id), baseData);
      } else {
        await addDoc(collection(db, 'products'), { ...baseData, createdAt: serverTimestamp() });
      }
        
      onClose();
      toast.success('Produit enregistré avec succès !');
    } catch (err) { 
      toast.error(err.message || 'Erreur lors de l\'enregistrement'); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="m-modal-fs fade-in">
      <div className="m-modal-header">
        <button onClick={onClose}><X size={24}/></button>
        <h3>{product ? 'Modifier' : 'Nouveau Produit'}</h3>
        <button onClick={handleSave} className="m-save-btn" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={20}/> : 'Publier'}
        </button>
      </div>
      <div className="m-modal-scroll-body" style={{ padding:20 }}>
        <CategorieDynamique mode="selection" categorie={type} onSelect={(val) => { setType(val); setF(p => ({ ...p, categorie: CATEGORIES_MAP[val][0] })); }}/>
        <CategorieDynamique mode="photos-only" categorie={type} images={images} setImages={setImages}/>
        <div style={{ marginTop:20 }}>
          <FormField label="Nom de l'article *">
            <input type="text" value={f.nom || ''} onChange={e => setF({ ...f, nom: e.target.value })}/>
          </FormField>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FormField label="Prix (F CFA) *">
              <input type="number" value={f.prix || ''} onChange={e => setF({ ...f, prix: e.target.value })}/>
            </FormField>
            <FormField label="Catégorie *">
              <select value={f.categorie || ''} onChange={e => setF({ ...f, categorie: e.target.value })}>
                {(CATEGORIES_MAP[type] || ['Autre']).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Description">
            <textarea rows={3} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })}/>
          </FormField>
        </div>
        {product && (
          <button className="m-btn-delete-prod" onClick={async () => { await deleteDoc(doc(db, 'products', product.id)); onClose(); }}>
            <Trash2 size={16}/> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

// ── Vue des Commandes ──────────────────────────────────────────────────────────
function OrdersView({ orders, completedOrders, onOrderClick, onLaunchTiers, verificationCodes, regeneratingId, onRegenerateCode }) {
  const [filter, setFilter] = useState('actives');
  const list = filter === 'actives' ? orders : completedOrders;

  const getStatusStyle = (s = '') => {
    const st = s.toLowerCase();
    if (st.includes('paye') || st.includes('attente_livreur')) return { bg:'#d1fae5', color:'#059669' };
    if (st.includes('prepa')) return { bg:'#dbeafe', color:'#2563eb' };
    return { bg:'#f1f5f9', color:'#475569' };
  };

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
        {list.map(o => {
          const style = getStatusStyle(o.status);
          return (
            <div key={o.id} className="m-order-item-container" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div className="m-order-item" onClick={() => onOrderClick(o.id)} style={{ cursor: 'pointer' }}>
                <div className="order-main">
                  <div className="order-user-avatar">{((o.nom || o.clientName || o.nomClient || 'C').charAt(0))}</div>
                  <div className="order-meta">
                    <h4>{o.nom || o.clientName || o.nomClient || 'Client'}</h4>
                    <p>{o.orderId || o.id.substring(0, 8)}</p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p><strong>{Number(o.amount || o.total || 0).toLocaleString()} F</strong></p>
                    <span className="m-status-badge" style={{ background: style.bg, color: style.color }}>
                      {o.status}
                    </span>
                  </div>
                </div>
              </div>

              {filter === 'actives' && (
                <div style={{ padding: '0 16px 14px 16px', marginTop: -4 }}>
                  {!o.courseRequested && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onLaunchTiers(o); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: '#6d28d9',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: '700',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <PlusCircle size={14} />
                      Commander une course pour cette commande
                    </button>
                  )}

                  {o.courseRequested && (
                    <div style={{
                      padding: '10px 14px',
                      background: '#f8fafc',
                      border: '1px dashed #e2e8f0',
                      borderRadius: '10px',
                    }}>
                      {verificationCodes[o.id] === undefined ? (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>
                          Vérification du code...
                        </span>
                      ) : verificationCodes[o.id] ? (
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ display: 'block', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
                            Code à donner au livreur
                          </span>
                          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, color: '#0f172a' }}>
                            {verificationCodes[o.id].pickupCode}
                          </span>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
                            ⚠️ Code de passation non généré
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRegenerateCode(o.id); }}
                            disabled={regeneratingId === o.id}
                            style={{
                              padding: '8px 14px',
                              fontSize: 10,
                              fontWeight: 800,
                              color: '#fff',
                              background: '#dc2626',
                              border: 'none',
                              borderRadius: 10,
                              cursor: 'pointer',
                            }}
                          >
                            {regeneratingId === o.id ? "Génération..." : "Régénérer le code"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vue du Profil ──────────────────────────────────────────────────────────────
function ProfileView({ user, stats }) {
  const boutiqueNom = user?.nomBoutique || user?.enseigne || user?.nomComplet;
  const boutiqueLogo = user?.photoURL || user?.logo || DEFAULT_LOGO;

  return (
    <div className="m-profile-view fade-in">
      <div className="m-profile-hero">
        <img 
          src={boutiqueLogo} 
          alt={boutiqueNom || "Boutique"}
          onError={(e) => { e.target.src = DEFAULT_LOGO; }}
          style={{ 
            width: 120, 
            height: 120, 
            borderRadius: '24px', 
            border: '4px solid #ffffff',
            objectFit: 'cover',
            boxShadow: '0 10px 30px rgba(109, 40, 217, 0.15)'
          }} 
        />
        
        <div className="profile-info">
          {boutiqueNom && <h3>{boutiqueNom}</h3>}
          {user?.telephone && (
            <p className="vendor-contact">📱 {user.telephone}</p>
          )}
        </div>
      </div>

      <div className="m-stats-grid">
        <div className="stat-card">
          <small>Chiffre d'affaires</small>
          <strong>{Number(stats.chiffreAffaires || 0).toLocaleString()} F</strong>
        </div>
        <div className="stat-card">
          <small>Total Ventes</small>
          <strong>{stats.totalVentes || 0}</strong>
        </div>
        <div className="stat-card">
          <small>Produits</small>
          <strong>{stats.totalProduits || 0}</strong>
        </div>
      </div>

      <div className="m-profile-details">
        {user?.emailPersonnel && (
          <div className="detail-row">
            <span>✉️ Email</span>
            <span>{user.emailPersonnel}</span>
          </div>
        )}
        {user?.adresse && (
          <div className="detail-row">
            <span>📍 Adresse</span>
            <span>{user.adresse}</span>
          </div>
        )}
      </div>

      <button className="m-btn-logout-large" onClick={() => signOut(auth)}>
        <LogOut size={20}/> Déconnexion
      </button>
    </div>
  );
}
