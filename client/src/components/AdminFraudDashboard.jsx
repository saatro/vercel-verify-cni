import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { AlertTriangle, Ban, CheckCircle, Clock, Fingerprint, RefreshCw, Shield, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { db } from "../firebase";
import AdminBottomMenu from "./AdminBottomMenu";
import "./AdminFraudDashboard.css";

export default function AdminFraudDashboard() {
  const [fraudUsers, setFraudUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("fraud"); // Options: fraud, pending

  useEffect(() => {
    fetchFraudData();
  }, []);

  const fetchFraudData = async () => {
    setLoading(true);
    try {
      // 1. Users à risque (Score >= 50)
      const fraudQuery = query(
        collection(db, "users"),
        where("fraudScore", ">=", 50),
        orderBy("fraudScore", "desc"),
        limit(50)
      );
      const fraudSnap = await getDocs(fraudQuery);
      setFraudUsers(fraudSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 2. Bonus en attente (Filtrage côté client si pas d'index composite)
      const pendingSnap = await getDocs(collection(db, "users"));
      const pendingList = pendingSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.bonusPending === true);
      setPendingUsers(pendingList);

      // 3. Stats Globales
      const statsDoc = await getDocs(collection(db, "stats"));
      if (!statsDoc.empty) setStats(statsDoc.docs[0].data());

    } catch (err) {
      console.error("Erreur fetch:", err);
      toast.error("Données indisponibles");
    } finally {
      setLoading(false);
    }
  };

  const banUser = async (userId, userData) => {
    const reason = userData.fraudReasons?.join(', ') || "Activité suspecte répétée";
    if (!window.confirm(`BANNIR DÉFINITIVEMENT ${userData.nom || "cet utilisateur"} ?`)) return;

    try {
      await updateDoc(doc(db, "users", userId), {
        banned: true,
        bannedAt: new Date(),
        banReason: reason,
        soldeJetons: 0,
        bonusEligible: false,
        isActive: false,
        bonusPending: false
      });

      const lists = [
        { col: "blacklistPhones", val: userData.phone },
        { col: "blacklistDevices", val: userData.deviceId },
        { col: "blacklistIPs", val: userData.signupMeta?.ip }
      ];

      for (const item of lists) {
        if (item.val) {
          await setDoc(doc(db, item.col, item.val), {
            userId,
            reason,
            timestamp: new Date(),
            admin: "System_Auto"
          });
        }
      }

      toast.success("Utilisateur neutralisé et blacklisté");
      fetchFraudData();
    } catch (err) {
      console.error(err);
      toast.error("Échec du bannissement");
    }
  };

  const handleVerifyBonus = async (userId, action) => {
    const isApproved = action === "approve";
    if (!window.confirm(`Confirmer la décision : ${isApproved ? "VALIDER" : "ANNULER"} le bonus ?`)) return;

    try {
      await updateDoc(doc(db, "users", userId), {
        bonusPending: false,
        bonusEligible: isApproved,
        // La logique d'attribution des jetons bonus s'exécute idéalement ici ou via Cloud Function
      });
      toast.success(isApproved ? "Bonus validé avec succès" : "Bonus annulé et retiré");
      fetchFraudData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors du traitement du bonus");
    }
  };

  const getScoreColor = (s) => {
    if (s > 80) return "score-high";
    if (s > 50) return "score-medium";
    return "score-low";
  };

  return (
    <div className="admin-fraud-page">
      <header className="fraud-header">
        <h1 className="fraud-title">
          <Shield className="shield-icon" />
          CENTRE DE SÉCURITÉ & ANTIFRAUDE
        </h1>
        <p className="fraud-subtitle">Surveillance des comportements suspects et validation des éligibilités aux bonus</p>
      </header>

      <div className="stats-grid">
        <StatCard title="Alertes Fraude" value={fraudUsers.length} type="danger" icon={<AlertTriangle />} />
        <StatCard title="Bonus en Attente" value={pendingUsers.length} type="warning" icon={<Clock />} />
        <StatCard title="Comptes Bloqués" value={stats?.blockedUsers || 0} type="neutral" icon={<Ban />} />
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab-btn ${activeTab === "fraud" ? "active" : ""}`}
          onClick={() => setActiveTab("fraud")}
        >
          🚨 Comptes Suspects ({fraudUsers.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          ⏳ Bonus à Vérifier ({pendingUsers.length})
        </button>
      </div>

      <section className="dashboard-card">
        <div className="card-header">
          <h2 className="card-title">
            {activeTab === "fraud" ? "Utilisateurs à Risque Élevé" : "Vérification Manuelle des Bonus"}
          </h2>
          <button onClick={fetchFraudData} className="refresh-btn" disabled={loading}>
            <RefreshCw size={16} className={loading ? "spinning" : ""} />
            Actualiser
          </button>
        </div>

        {loading ? (
          <div className="table-loading">
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
          </div>
        ) : (
          <div className="table-responsive">
            {activeTab === "fraud" ? (
              fraudUsers.length === 0 ? (
                <p className="empty-message">Aucune alerte de fraude critique détectée actuellement.</p>
              ) : (
                <table className="fraud-table">
                  <thead>
                    <tr>
                      <th>Identité / Appareil</th>
                      <th>Score Risque</th>
                      <th>Détails / Raisons</th>
                      <th>Dernière IP</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fraudUsers.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div className="user-name">{user.nom || "Utilisateur sans nom"}</div>
                          <div className="user-meta">Tel: {user.phone || "Non renseigné"}</div>
                          <div className="user-id">Dev: {user.deviceId ? `${user.deviceId.slice(0, 14)}...` : "Aucun"}</div>
                        </td>
                        <td>
                          <div className={`score-badge ${getScoreColor(user.fraudScore)}`}>
                            {user.fraudScore}
                          </div>
                        </td>
                        <td>
                          <div className="fraud-reasons-tags">
                            {user.fraudReasons && user.fraudReasons.length > 0 ? (
                              user.fraudReasons.map((r, idx) => <span key={idx} className="reason-tag">{r}</span>)
                            ) : (
                              <span className="reason-tag generic">Comportement anormal</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="ip-wrapper">
                            <Fingerprint size={14} /> {user.signupMeta?.ip || "Inconnue"}
                          </div>
                        </td>
                        <td>
                          <button onClick={() => banUser(user.id, user)} className="ban-action-btn">
                            Bannir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              pendingUsers.length === 0 ? (
                <p className="empty-message">Aucune demande de bonus en attente de validation.</p>
              ) : (
                <table className="fraud-table">
                  <thead>
                    <tr>
                      <th>Livreur</th>
                      <th>Score Risque Actuel</th>
                      <th>Téléphone</th>
                      <th>Actions de Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUsers.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div className="user-name">{user.nom}</div>
                          <div className="user-id">ID: {user.id.slice(0, 8)}...</div>
                        </td>
                        <td>
                          <div className={`score-badge ${getScoreColor(user.fraudScore || 0)}`}>
                            {user.fraudScore || 0}
                          </div>
                        </td>
                        <td><span className="phone-text">{user.phone || "—"}</span></td>
                        <td>
                          <div className="action-buttons-group">
                            <button
                              onClick={() => handleVerifyBonus(user.id, "approve")}
                              className="approve-btn"
                              title="Valider l'éligibilité au bonus"
                            >
                              <CheckCircle size={16} /> Accepter
                            </button>
                            <button
                              onClick={() => handleVerifyBonus(user.id, "reject")}
                              className="reject-btn"
                              title="Refuser et rejeter le bonus"
                            >
                              <Trash2 size={16} /> Rejeter
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        )}
      </section>

      <AdminBottomMenu />
    </div>
  );
}

const StatCard = ({ title, value, type, icon }) => (
  <div className={`stat-card border-${type}`}>
    <div className="stat-card-header">
      <span className="stat-card-title">{title}</span>
      <span className={`stat-icon icon-${type}`}>{icon}</span>
    </div>
    <div className="stat-card-value">{value}</div>
  </div>
);