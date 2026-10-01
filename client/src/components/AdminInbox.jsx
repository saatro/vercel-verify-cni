import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, 
  doc, updateDoc, serverTimestamp, addDoc 
} from 'firebase/firestore';
import { MessageSquare, Send, CheckCircle2, AlertCircle, Loader2, User } from 'lucide-react';
import { toast } from 'react-toastify';
import AdminBottomMenu from '../components/AdminBottomMenu'; // ── Import du menu du bas

export default function AdminInbox() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // Écoute en temps réel de tous les messages / tickets d'assistance
  useEffect(() => {
    const q = query(collection(db, 'vendor_messages'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      console.error("Erreur chargement messages admin :", error);
      toast.error("Impossible de charger les messages.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedMsg) return;

    setSending(true);
    try {
      // Enregistrement de la réponse
      await addDoc(collection(db, 'vendor_messages'), {
        vendorId: selectedMsg.vendorId || selectedMsg.userId || 'admin',
        title: `Réponse Admin - ${selectedMsg.title || 'Support'}`,
        body: replyText,
        senderType: 'admin',
        createdAt: serverTimestamp()
      });

      // Marquer le message original comme résolu / répondu
      await updateDoc(doc(db, 'vendor_messages', selectedMsg.id), {
        status: 'resolu',
        answeredAt: serverTimestamp()
      });

      toast.success("Réponse envoyée avec succès !");
      setReplyText('');
      setSending(false);
    } catch (err) {
      console.error("Erreur envoi réponse :", err);
      toast.error("Échec de l'envoi de la réponse.");
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Loader2 className="animate-spin" size={36} color="#6d28d9" />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', paddingBottom: '90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <MessageSquare size={24} color="#6d28d9" />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Messagerie & Support Administrateur
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', minHeight: '500px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
        
        {/* Liste des messages */}
        <div style={{ borderRight: '1px solid #e2e8f0', overflowY: 'auto', maxHeight: '600px' }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Aucun message pour le moment</p>
            </div>
          ) : (
            messages.map(msg => {
              const isSelected = selectedMsg?.id === msg.id;
              return (
                <div 
                  key={msg.id}
                  onClick={() => setSelectedMsg(msg)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: isSelected ? '#f8fafc' : '#fff',
                    borderLeft: isSelected ? '4px solid #6d28d9' : '4px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {msg.title || 'Message utilisateur'}
                    </span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleDateString() : 'Récemment'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {msg.body || msg.text}
                  </p>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: msg.senderType === 'vendeur' ? '#ede9fe' : '#f1f5f9', color: msg.senderType === 'vendeur' ? '#6d28d9' : '#475569', fontWeight: 600 }}>
                      {msg.senderType || 'Utilisateur'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Détail du message sélectionné & Réponse */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '20px', background: '#fafafa' }}>
          {selectedMsg ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                      {selectedMsg.title}
                    </h3>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      ID Émetteur : {selectedMsg.vendorId || selectedMsg.userId || 'Inconnu'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: selectedMsg.status === 'resolu' ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: 700 }}>
                    {selectedMsg.status === 'resolu' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {selectedMsg.status === 'resolu' ? 'Résolu' : 'En attente'}
                  </div>
                </div>

                <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>
                    {selectedMsg.body || selectedMsg.text}
                  </p>
                </div>
              </div>

              {/* Formulaire de réponse */}
              <form onSubmit={handleSendReply} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea 
                  rows={3}
                  placeholder="Écrire une réponse officielle..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', resize: 'none', background: '#fff' }}
                />
                <button 
                  type="submit"
                  disabled={sending}
                  style={{
                    alignSelf: 'flex-end',
                    padding: '10px 20px',
                    background: '#6d28d9',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer'
                  }}
                >
                  {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Envoyer la réponse
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
              <User size={40} style={{ marginBottom: 10, opacity: 0.5 }} />
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Sélectionnez un message pour afficher les détails</p>
            </div>
          )}
        </div>

      </div>

      {/* Menu de navigation du bas */}
      <AdminBottomMenu />
    </div>
  );
}