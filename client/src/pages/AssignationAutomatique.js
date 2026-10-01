// Rôle : assigner un LIVREUR à une commande classique (boutique / VTC) par un COURSIER via l'interface centrale

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  Bike, Car,
  CheckCircle2,
  Loader2,
  Package, Phone,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { auth, db } from '../firebase';

const VehicleIcon = ({ type, mode }) => {
  const t = (type || mode || '').toLowerCase();
  if (t.includes('moto')) return <Bike size={13} />;
  return <Car size={13} />;
};

export default function AssignationAutomatique() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [courseDocId, setCourseDocId] = useState(null);
  const [course, setCourse] = useState(null);
  const [livreurs, setLivreurs] = useState([]);
  const [coursiers, Coursiers] = useState([]); // Liste des coursiers disponibles pour l'assignation centrale
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);
  const [selectedCoursier, setSelectedCoursier] = useState(''); // Coursier choisi pour l'assignation
  const [source, setSource] = useState('orders');

  // Chargement de la commande
  useEffect(() => {
    const load = async () => {
      if (!orderId) return;
      try {
        const os = await getDoc(doc(db, 'orders', orderId));
        if (os.exists()) {
          const data = os.data();
          if (data.type === 'supermarche') {
            toast.error("Commande supermarché → utiliser AssignationCoursier.");
            navigate(`/assignation-coursier/${orderId}`);
            return;
          }
          setCourse(data);
          setCourseDocId(os.id);
          setSource('orders');
          setLoading(false);
          return;
        }

        const q = query(collection(db, 'orders'), where('orderId', '==', orderId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data();
          if (data.type === 'supermarche') {
            toast.error("Supermarché → utiliser AssignationCoursier.");
            navigate(`/assignation-coursier/${data.orderId || d.id}`);
            return;
          }
          setCourse(data);
          setCourseDocId(d.id);
          setSource('orders');
        } else {
          toast.error("Commande introuvable.");
        }
      } catch (err) {
        toast.error(`Erreur : ${err.message}`);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId, navigate]);

  // Chargement des livreurs et des coursiers en ligne
  useEffect(() => {
    const loadUsers = async () => {
      try {
        // Chargement des livreurs
        const snapLivreurs = await getDocs(
          query(collection(db, 'users'),
            where('role', '==', 'livreur'),
            where('isOnline', '==', true)
          )
        );
        setLivreurs(snapLivreurs.docs.map(d => ({ uid: d.id, ...d.data() })));

        // Chargement des coursiers (rôle coursier)
        const snapCoursiers = await getDocs(
          query(collection(db, 'users'),
            where('role', '==', 'coursier')
          )
        );
        Coursiers(snapCoursiers.docs.map(d => ({ uid: d.id, ...d.data() })));

      } catch (e) {
        console.error("Erreur chargement utilisateurs:", e);
      }
    };
    loadUsers();
  }, []);

  // Validation du reçu Wave + Réassurance PRIORITAIRE du Client & du Vendeur
  const handleValiderRecuWave = async () => {
    if (!courseDocId || !course) return;
    try {
      await updateDoc(doc(db, source, courseDocId), {
        waveReceiptVerified: true,
        waveVerifiedAt: serverTimestamp(),
        status: 'paye_ia_valide'
      });

      setCourse(prev => ({ ...prev, waveReceiptVerified: true, status: 'paye_ia_valide' }));
      toast.success("Témoin Wave acté ! Messages de réassurance envoyés.");

      const ref = course.orderId || courseDocId.slice(-6).toUpperCase();
      const montantFormate = Number(course.amount || course.price || 0).toLocaleString();

      // 1. REASSURANCE CLIENT PRIORITAIRE (In-App + WhatsApp)
      if (course.clientUserId || course.userId) {
        await addDoc(collection(db, "notifications_queue"), {
          toUserId: course.clientUserId || course.userId,
          title: "🎉 Paiement reçu avec succès !",
          body: `Votre règlement de ${montantFormate} F CFA pour la commande #${ref} a été validé. Votre livreur est en cours d'attribution.`,
          status: "pending",
          createdAt: serverTimestamp(),
        });
      }

      const clientPhone = course.clientPhone || course.clientTelephone || course.phone;
      if (clientPhone) {
        const msgClient = `🎉 *MAMBO - PAIEMENT CONFIRMÉ* 🎉\n\n` +
          `Cher(e) client(e), nous vous confirmons la bonne réception de votre paiement Wave :\n\n` +
          `• *Commande :* *#${ref}*\n` +
          `• *Montant :* *${montantFormate} F CFA*\n` +
          `• *Article :* ${course.nom || "Votre commande"}\n\n` +
          `🛡️ *Sécurité Mambo :* Votre argent est sécurisé et le commerçant prépare votre colis. Un livreur est immédiatement mobilisé pour votre livraison.`;

        window.open(`https://wa.me/${clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msgClient)}`, '_blank');
      }

      // 2. REASSURANCE & ACTION VENDEUR (WhatsApp)
      const vendeurPhone = course.vendeurPhone || course.userPhone || course.telephone;
      if (vendeurPhone) {
        const msgVendeur = `🤝 *ASSISTANCE MAMBO - FONDS EN SÉCURITÉ*\n\n` +
          `Bonjour, le témoin numérique de la commande *#${ref}* (${montantFormate} F CFA) vient d'être validé.\n\n` +
          `Le paiement du client est certifié sur notre interface Wave. Veuillez préparer les articles (*${course.nom || "Colis"}*). Nous vous envoyons le livreur immédiatement.`;

        setTimeout(() => {
          window.open(`https://wa.me/${vendeurPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msgVendeur)}`, '_blank');
        }, 800);
      }

    } catch (err) {
      toast.error("Impossible de valider la transaction.");
      console.error(err);
    }
  };

  // Assignation du livreur par le coursier via l'admin central + Notification Finale
  const handleAssigner = async (livreur) => {
    if (!courseDocId || !course || !auth.currentUser) return;
    if (!course.waveReceiptVerified) {
      toast.error("Veuillez d'abord valider le contrôle du témoin Wave.");
      return;
    }
    if (!selectedCoursier) {
      toast.error("Veuillez sélectionner le coursier assignant depuis l'interface centrale.");
      return;
    }
    setAssigning(livreur.uid);

    try {
      const coursierObj = coursiers.find(c => c.uid === selectedCoursier);
      const coursierNomAffiche = coursierObj ? (coursierObj.nomComplet || `${coursierObj.prenom || ''} ${coursierObj.nom || ''}`.trim() || 'Coursier') : 'Administration';

      await updateDoc(doc(db, source, courseDocId), {
        livreurId: livreur.uid,
        livreurNom: livreur.nomComplet || `${livreur.prenom || ''} ${livreur.nom || ''}`.trim() || 'Livreur',
        livreurPhone: livreur.telephone || '',
        coursierId: selectedCoursier,
        coursierNom: coursierNomAffiche,
        status: 'assigned',
        assignedAt: serverTimestamp(),
        assignedBy: auth.currentUser.uid,
      });

      toast.success(`✅ ${livreur.nomComplet || livreur.nom} assigné par le coursier ${coursierNomAffiche} !`);

      const ref = course.orderId || courseDocId.slice(-6).toUpperCase();
      const dest = course.dropoffAddress || course.dest || '—';
      const montantFormate = Number(course.price || course.amount || 0).toLocaleString();

      // Notification In-App Livreur
      await addDoc(collection(db, "notifications_queue"), {
        toUserId: livreur.uid,
        title: "📦 Mission Livraison Mambo",
        body: `Course validée de ${montantFormate} F CFA à récupérer.`,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // WhatsApp Livreur
      const msgLivreur = `🚀 *MISSION LIVRAISON CONFIRMÉE - MAMBO*\n\n` +
        `📦 *Réf :* *${ref}*\n` +
        `🛡️ *Garantie :* Paiement client vérifié et validé par l'Assistance.\n\n` +
        `📍 *Enlèvement :* *${course.pickup || course.pickupAddress || '—'}*\n` +
        `🏁 *Destination :* *${dest}*\n` +
        `💰 *Valeur du Colis :* *${montantFormate} F CFA*\n\n` +
        `Le paiement de la boutique est validé sur nos écrans, vous pouvez récupérer les articles en toute sérénité.`;

      if (livreur.telephone) {
        window.open(`https://wa.me/${livreur.telephone.replace(/\D/g, '')}?text=${encodeURIComponent(msgLivreur)}`, '_blank');
      }

      setTimeout(() => navigate(-1), 2000);
    } catch (err) {
      console.error(err);
      toast.error(err.code === 'permission-denied' ? "Accès refusé." : `Erreur : ${err.message}`);
    } finally {
      setAssigning(null);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={40} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 10 }}>Sécurisation du canal de transaction...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <ToastContainer theme="dark" position="top-center" />

      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: '#fff',
        borderBottom: course?.waveReceiptVerified ? '2px solid #10b981' : '2px solid #ef4444',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#f1f5f9',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', margin: 0 }}>Assignation via Admin Central</h2>
          <p style={{ fontSize: 10, color: course?.waveReceiptVerified ? '#10b981' : '#ef4444', fontWeight: 700, margin: 0 }}>
            {course?.waveReceiptVerified ? "Client & Commerçant rassurés ✅" : "Validation témoin numérique attendue ⚠️"}
          </p>
        </div>
      </header>

      <div style={{ padding: '16px 16px 80px', maxWidth: 480, margin: '0 auto' }}>
        {course && (
          <div style={{
            background: '#fff',
            borderRadius: 18,
            padding: '16px',
            boxShadow: '0 1px 4px rgba(0,0,0,.06)',
            marginBottom: 16,
            border: course.waveReceiptVerified ? '1px solid #10b981' : '1px solid #fee2e2'
          }}>

            <div style={{
              background: course.waveReceiptVerified ? '#f0fdf4' : '#fff5f5',
              padding: '12px',
              borderRadius: 12,
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {course.waveReceiptVerified ? (
                  <CheckCircle2 size={18} color="#10b981" />
                ) : (
                  <AlertCircle size={18} color="#ef4444" />
                )}
                <span style={{ fontSize: 12, fontWeight: 800, color: course.waveReceiptVerified ? '#10b981' : '#ef4444' }}>
                  {course.waveReceiptVerified ? "PAIEMENT SÉCURISÉ & CLIENT NOTIFIÉ" : "CONTRÔLE ET RÉASSURANCE CLIENT"}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#475569', lineHeight: '1.4' }}>
                Référence Transaction : <strong style={{ color: '#0f172a' }}>{course.orderId || orderId}</strong><br />
                Fonds versés par le client : <strong style={{ color: '#0f172a' }}>{Number(course.amount || course.price || 0).toLocaleString()} F CFA</strong>
              </p>

              {!course.waveReceiptVerified && (
                <button
                  onClick={handleValiderRecuWave}
                  style={{
                    marginTop: 4,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <ShieldCheck size={14} /> Confirmer Wave (Rassurer le Client en priorité)
                </button>
              )}
            </div>

            {/* SÉLECTION DU COURSIER DEPUIS L'ADMIN CENTRAL */}
            <div style={{ marginBottom: 14, padding: '12px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
                <UserCheck size={14} color="#6366f1" /> Coursier assignant (Admin Central) :
              </label>
              <select
                value={selectedCoursier}
                onChange={(e) => setSelectedCoursier(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#0f172a',
                  outline: 'none'
                }}
              >
                <option value="">-- Sélectionner un coursier --</option>
                {coursiers.map(c => (
                  <option key={c.uid} value={c.uid}>
                    {c.nomComplet || `${c.prenom || ''} ${c.nom || ''}`.trim() || c.email || c.uid}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total payé</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>
                {Number(course.amount || course.price || 0).toLocaleString()} F CFA
              </span>
            </div>

            {course.nom && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={12} color="#6366f1" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', flex: 1 }}>{course.nom}</span>
                <span style={{ background: '#ede9fe', color: '#6366f1', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>
                  ×{course.quantity || 1}
                </span>
              </div>
            )}
          </div>
        )}

        <h3 style={{
          fontSize: 12,
          fontWeight: 800,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginBottom: 10
        }}>
          Livreurs disponibles ({livreurs.length})
        </h3>

        {livreurs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', textAlign: 'center' }}>
            <Bike size={40} color="#e2e8f0" />
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 10 }}>Aucun livreur en ligne.</p>
          </div>
        ) : (
          livreurs.map(l => {
            const photo = l.photoProfileURL || l.photoURL || null;
            const nomAffiche = l.nomComplet || `${l.prenom || ''} ${l.nom || ''}`.trim() || 'Livreur';

            return (
              <div key={l.uid} style={{
                background: '#fff',
                borderRadius: 18,
                padding: '16px',
                boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                marginBottom: 12,
                opacity: (course?.waveReceiptVerified && selectedCoursier) ? 1 : 0.5
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ede9fe' }}
                    />
                  ) : (
                    <div style={{
                      width: 46,
                      height: 46,
                      borderRadius: '50%',
                      background: '#6366f1',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 18
                    }}>
                      {nomAffiche.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>{nomAffiche}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        background: '#ede9fe',
                        color: '#6366f1',
                        borderRadius: 100,
                        padding: '2px 8px',
                        fontSize: 9,
                        fontWeight: 800
                      }}>
                        <VehicleIcon type={l.typeVehicule} mode={l.modeVtc} />
                        {l.typeVehicule || l.modeVtc || 'Moto'}
                      </span>
                    </div>
                    {l.telephone && (
                      <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Phone size={9} /> {l.telephone}
                      </p>
                    )}
                  </div>

                  <button
                    style={{
                      padding: '10px 18px',
                      borderRadius: 100,
                      border: 'none',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: (course?.waveReceiptVerified && selectedCoursier) ? 'pointer' : 'not-allowed',
                      background: (!course?.waveReceiptVerified || !selectedCoursier) ? '#cbd5e1' : assigning === l.uid ? '#e2e8f0' : '#6366f1',
                    }}
                    disabled={!course?.waveReceiptVerified || !selectedCoursier || !!assigning}
                    onClick={() => handleAssigner(l)}
                  >
                    {assigning === l.uid ? (
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : 'Assigner'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}