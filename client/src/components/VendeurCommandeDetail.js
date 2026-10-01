import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ChevronLeft, MapPin, Package, UserX, PhoneOff, PlusCircle } from 'lucide-react';
import { toast } from 'react-toastify';

/**
 * Fonction utilitaire pour masquer les chiffres centraux du téléphone[cite: 2]
 */
const maskPhoneNumber = (phone) => {
  if (!phone) return 'Non renseigné';
  const str = String(phone).trim();
  if (str.length < 8) return '********';

  const firstPart = str.slice(0, 5);
  const lastPart = str.slice(-4);
  const maskedLength = Math.max(str.length - 9, 4);
  
  return `${firstPart}${'*'.repeat(maskedLength)}${lastPart}`;
};

/**
 * Fonction utilitaire pour masquer le nom du client (ex: "KUIE GIRARD" -> "K*** G*****")
 */
const maskClientName = (name) => {
  if (!name) return 'Client masqué';
  const parts = String(name).trim().split(' ');
  return parts.map(part => {
    if (part.length <= 1) return part;
    return part[0] + '*'.repeat(part.length - 1);
  }).join(' ');
};

export default function VendeurCommandeDetail({ orderId, onBack }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const unsub = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        setOrder({ id: docSnap.id, ...docSnap.data() });
      } else {
        toast.error("Commande introuvable");
        onBack();
      }
      setLoading(false);
    }, (error) => {
      console.error("Erreur Firestore :", error);
      setLoading(false);
    });

    return () => unsub();
  }, [orderId, onBack]);

  const safeNumber = (val) => {
    if (val == null) return 0;
    const num = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : Number(val);
    return isNaN(num) ? 0 : num;
  };

  const totalCommande = safeNumber(order?.amount ?? order?.total);
  const fraisLivraison = safeNumber(order?.deliveryFee ?? order?.fraisLivraison ?? order?.frais);

  const handleLaunchTiers = useCallback(async () => {
    if (!order) return toast.error("Commande non chargée");

    let clientName = order.clientName || order.nomClient || order.nom || "";
    let clientPhone = order.clientPhone || order.telephoneClient || order.telephone || "";
    let deliveryAddress = order.deliveryAddress || order.adresseLivraison || order.adresse || "";

    let vendeurNom = order.vendeurNom || order.nomBoutique || "Boutique";
    let departAdresse = order.departAdresse || "";

    try {
      if (!clientName || !clientPhone || !deliveryAddress) {
        const clientUid = order.clientId || order.userId;
        if (clientUid) {
          const clientSnap = await getDoc(doc(db, 'users', clientUid));
          if (clientSnap.exists()) {
            const c = clientSnap.data();
            clientName = clientName || c.nom || c.nomComplet || "";
            clientPhone = clientPhone || c.telephone || "";
            deliveryAddress = deliveryAddress || c.adresse || "";
          }
        }
      }

      if (!departAdresse && order.vendorId) {
        const vendeurSnap = await getDoc(doc(db, 'users', order.vendorId));
        if (vendeurSnap.exists()) {
          const v = vendeurSnap.data();
          departAdresse = v.adresse || "";
          vendeurNom = order.vendeurNom || v.nomBoutique || v.enseigne || v.nomComplet || vendeurNom;
        }
      }
    } catch (e) {
      console.warn("Erreur récupération profils client/vendeur :", e);
    }

    if (!deliveryAddress) {
      toast.warn("Adresse de livraison introuvable — merci de la saisir manuellement.");
    }

    const stateData = {
      isTiersOrder: true,
      fromVendeur: true,
      orderId: order.id,
      customOrderId: order.orderId || "",

      // Vendeur (expéditeur)
      vendeurId: order.vendorId,
      vendeurNom,
      departAdresse,

      // Client (destinataire) transmis en entier pour la course
      prefillName: clientName,
      prefillPhone: clientPhone,
      targetDestination: deliveryAddress,
      targetAddress: deliveryAddress,

      montantArticles: totalCommande,
      montantLivraison: fraisLivraison,
      items: order.items || []
    };

    navigate('/client-home', { state: stateData });
  }, [order, totalCommande, fraisLivraison, navigate]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6d28d9' }}>Chargement des détails...</div>;
  if (!order) return null;

  const rawName = order.clientName || order.nomClient || order.nom || '';
  const rawPhone = order.clientPhone || order.telephoneClient || order.telephone || '';

  return (
    <div className="vendeur-commande-detail" style={{ padding: '16px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
          <ChevronLeft size={24} color="#0f172a" />
        </button>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
            COMMANDE #{order.orderId || order.id.substring(0, 8).toUpperCase()}
          </h3>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
            Status: {order.status || 'En attente'}
          </span>
        </div>
      </div>

      {/* Articles */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#475569' }}>
          <Package size={18} />
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>ARTICLES À PRÉPARER</h4>
        </div>
        
        {order.items && order.items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: idx !== order.items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#6d28d9', fontWeight: '700', width: '28px', height: '28px', borderRadius: '8px', fontSize: '14px' }}>
                {parseInt(item.quantity ?? item.quantite ?? 1, 10)}
              </span>
              <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>{item.nom || item.title || 'Article'}</span>
            </div>
            <span style={{ fontWeight: '700', color: '#64748b', fontSize: '14px' }}>
              {safeNumber(item.prix ?? item.price).toLocaleString()} F
            </span>
          </div>
        ))}
      </div>

      {/* Section Destination */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#475569' }}>
          <MapPin size={18} />
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>DESTINATION</h4>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155' }}>
          
          {/* Nom du client masqué */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserX size={16} color="#dc2626" />
              <span style={{ fontWeight: '600', color: '#1e293b', letterSpacing: '0.03em' }}>
                {maskClientName(rawName)}
              </span>
            </div>
            <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
              Nom protégé
            </span>
          </div>

          {/* Téléphone du client masqué */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PhoneOff size={16} color="#dc2626" />
              <span style={{ fontWeight: '600', color: '#0f172a', letterSpacing: '0.03em' }}>
                {maskPhoneNumber(rawPhone)}
              </span>
            </div>
            <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
              Numéro protégé
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'start', gap: '8px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
            <MapPin size={16} color="#6d28d9" style={{ marginTop: '2px' }} />
            <span style={{ color: '#0f172a', fontWeight: '500' }}>
              {order.deliveryAddress || order.adresseLivraison || order.adresse || 'Adresse non renseignée'}
            </span>
          </div>
          {fraisLivraison > 0 && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
              Frais de livraison : {fraisLivraison.toLocaleString()} F CFA
            </div>
          )}
        </div>
      </div>

      {/* Résumé Global */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '16px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>TOTAL FINAL</span>
          <span style={{ fontSize: '20px', fontWeight: '800', color: '#6d28d9' }}>
            {(totalCommande + fraisLivraison).toLocaleString()} F CFA
          </span>
        </div>
      </div>

      {/* Bouton Tiers */}
      <button
        onClick={handleLaunchTiers}
        style={{
          width: '100%',
          padding: '14px',
          background: '#6d28d9',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          fontWeight: '700',
          fontSize: '15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        <PlusCircle size={18} />
        COMMANDER UNE COURSE POUR CE CLIENT
      </button>
    </div>
  );
}