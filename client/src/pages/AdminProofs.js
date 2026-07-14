import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import "./AdminProofs.css";
import AdminBottomMenu from "../components/AdminBottomMenu";

export default function AdminProofs() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all"); // Options: all, en_attente, validé, rejeté

    useEffect(() => {
        const q = query(
            collection(db, "recharges"), 
            orderBy("createdAt", "desc")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            setTransactions(data);
            setLoading(false);
        });
        return unsub;
    }, []);

    const formatDate = (timestamp) => {
        if (!timestamp) return "—";
        const date = timestamp.toDate();
        return date.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const filteredTransactions = transactions.filter((t) => {
        if (filter === "all") return true;
        return t.status === filter;
    });

    return (
        <div className="proofs-page">
            <header className="proofs-header">
                <h2>📜 Historique des Dépôts</h2>
                <p className="subtitle">Contrôlez et validez les reçus de paiement Wave de vos livreurs</p>
            </header>

            {/* Barre de filtres dynamiques */}
            <div className="filter-bar">
                <button className={`filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                    Tous ({transactions.length})
                </button>
                <button className={`filter-btn en_attente ${filter === "en_attente" ? "active" : ""}`} onClick={() => setFilter("en_attente")}>
                    ⏳ En attente ({transactions.filter(t => t.status === "en_attente" || !t.status).length})
                </button>
                <button className={`filter-btn validé ${filter === "validé" ? "active" : ""}`} onClick={() => setFilter("validé")}>
                    ✅ Validés ({transactions.filter(t => t.status === "validé").length})
                </button>
                <button className={`filter-btn rejeté ${filter === "rejeté" ? "active" : ""}`} onClick={() => setFilter("rejeté")}>
                    ❌ Refusés ({transactions.filter(t => t.status === "rejeté").length})
                </button>
            </div>

            {loading && (
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Chargement des transactions en cours...</p>
                </div>
            )}

            {!loading && filteredTransactions.length === 0 && (
                <div className="empty-state">
                    <div className="empty-icon">📂</div>
                    <p>Aucune transaction ne correspond à ce filtre.</p>
                </div>
            )}

            <div className="proofs-list">
                {filteredTransactions.map((t) => {
                    const currentStatus = t.status || "en_attente";
                    return (
                        <div key={t.id} className={`proof-card ${currentStatus}`}>
                            <div className="proof-img-container">
                                <img 
                                    src={t.recuURL || "https://placehold.co/150?text=Pas+d+image"} 
                                    alt="Preuve de dépôt" 
                                    className="proof-img" 
                                    onClick={() => window.open(t.recuURL, '_blank', 'noreferrer')}
                                    onError={(e) => {
                                        e.target.src = "https://placehold.co/150?text=Erreur+Image";
                                    }}
                                />
                                <span className="zoom-hint">Agrandir</span>
                            </div>
                            
                            <div className="proof-details">
                                <div className="proof-main-info">
                                    <p className="livreur-name">👤 {t.livreurNom || "Utilisateur inconnu"}</p>
                                    <p className="amount-container">
                                        <span className="amount-text">{t.montant?.toLocaleString('fr-FR') || 0} Jetons</span>
                                    </p>
                                </div>
                                
                                <hr className="card-divider" />

                                <div className="proof-meta">
                                    <div className="status-wrapper">
                                        <span className={`status-tag ${currentStatus}`}>
                                            {currentStatus === "validé" ? "✅ CRÉDITÉ" : currentStatus === "rejeté" ? "❌ REFUSÉ" : "⏳ EN ATTENTE"}
                                        </span>
                                    </div>
                                    <p className="date-text">📅 {formatDate(t.createdAt)}</p>
                                </div>
                                
                                {currentStatus === "rejeté" && t.motifRefus && (
                                    <div className="reason-box">
                                        <strong>Motif du refus :</strong> {t.motifRefus}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <AdminBottomMenu />
        </div>
    );
}