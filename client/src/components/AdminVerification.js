import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { CheckCircle, XCircle, ExternalLink, ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';

export default function AdminVerification() {
  const [pendingVendors, setPendingVendors] = useState([]);

  useEffect(() => {
    // On écoute les vendeurs non vérifiés
    const q = query(collection(db, "vendors"), where("isVerified", "==", false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vendors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingVendors(vendors);
    });
    return () => unsubscribe();
  }, []);

  const handleApprove = async (vendorId) => {
    try {
      await updateDoc(doc(db, "vendors", vendorId), {
        isVerified: true,
        verifiedAt: new Date()
      });
      toast.success("Boutique validée avec succès !");
    } catch (error) {
      toast.error("Erreur lors de la validation");
    }
  };

  const handleReject = async (vendorId) => {
    if (window.confirm("Voulez-vous vraiment supprimer cette demande ?")) {
      await deleteDoc(doc(db, "vendors", vendorId));
      toast.info("Demande rejetée.");
    }
  };

  return (
    <div className="admin-verification-section">
      <div className="section-header">
        <h2><ShieldAlert size={20} /> Boutiques à valider ({pendingVendors.length})</h2>
      </div>

      <div className="vendors-grid">
        {pendingVendors.length === 0 ? (
          <p className="empty-msg">Aucune boutique en attente de vérification.</p>
        ) : (
          pendingVendors.map(vendor => (
            <div key={vendor.id} className="vendor-card-admin">
              <div className="vendor-info">
                <h4>{vendor.nomBoutique}</h4>
                <p>{vendor.nomComplet} • {vendor.telephone}</p>
                <p className="vendor-address">📍 {vendor.adresse}</p>
              </div>

              <div className="cni-preview">
                <a href={vendor.cniUrl} target="_blank" rel="noreferrer">
                  <img src={vendor.cniUrl} alt="CNI" />
                  <span><ExternalLink size={12} /> Voir CNI</span>
                </a>
              </div>

              <div className="admin-actions">
                <button className="approve-btn" onClick={() => handleApprove(vendor.id)}>
                  <CheckCircle size={18} /> Valider
                </button>
                <button className="reject-btn" onClick={() => handleReject(vendor.id)}>
                  <XCircle size={18} /> Rejeter
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}