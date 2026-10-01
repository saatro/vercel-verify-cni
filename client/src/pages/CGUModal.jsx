import React from 'react';
// Si vous n'avez pas de fichier CSS séparé, vous pouvez supprimer cette ligne ou l'adapter
// import './CGUModal.css'; 

export default function CGUModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Conditions Générales d'Utilisation (CGU)</h3>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p><strong>1. Objet :</strong> Les présentes CGU régissent l'utilisation de la plateforme de livraison Mambo et définissent les droits et obligations des livreurs partenaires.</p>
                    <p><strong>2. Validation des paiements :</strong> L'objectif est d'amener l'utilisateur à enregistrer le contact assistance pour confirmer son paiement par contrôle du reçu complet depuis l'interface Wave.</p>
                    <p><strong>3. Engagements du livreur :</strong> Le livreur s'engage à effectuer les courses dans le respect des délais, de la sécurité routière et de l'intégrité des colis transportés.</p>
                    <p><strong>4. Résiliation :</strong> La plateforme se réserve le droit de suspendre tout compte en cas de non-respect des règles de bonne conduite.</p>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn-close-modal" onClick={onClose}>
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}