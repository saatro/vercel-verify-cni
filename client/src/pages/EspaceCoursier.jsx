import React, { useState, useEffect } from "react";
import { 
  db, 
  auth 
} from "../firebase"; // Ajustez le chemin selon votre structure
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  ShoppingBag, 
  CheckCircle2, 
  QrCode, 
  MapPin, 
  Clock, 
  PackageCheck, 
  X,
  AlertCircle
} from "lucide-react";

export default function EspaceCoursier() {
  const [activeTab, setActiveTab] = useState("dispo"); // 'dispo', 'encours', 'historique'
  const [commandesDispo, setCommandesDispo] = useState([]);
  const [commandesEnCours, setCommandesEnCours] = useState([]);
  const [commandesHistorique, setCommandesHistorique] = useState([]);
  const [selectedOrderQR, setSelectedOrderQR] = useState(null);
  const [loading, setLoading] = useState(true);

  const currentUser = auth.currentUser;

  // Ecoute des commandes en temps réel
  useEffect(() => {
    if (!currentUser) return;

    // 1. Commandes disponibles (paye_ia_valide ou en_attente_coursier)
    const qDispo = query(
      collection(db, "commandes"),
      where("statut", "in", ["paye_ia_valide", "en_attente_coursier"])
    );

    const unsubDispo = onSnapshot(qDispo, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setCommandesDispo(list);
      setLoading(false);
    });

    // 2. Commandes en cours attribuées à ce coursier
    const qEnCours = query(
      collection(db, "commandes"),
      where("coursierId", "==", currentUser.uid),
      where("statut", "in", ["en_preparation", "achats_termines"])
    );

    const unsubEnCours = onSnapshot(qEnCours, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setCommandesEnCours(list);
    });

    // 3. Historique des commandes remises ou terminées par ce coursier
    const qHistorique = query(
      collection(db, "commandes"),
      where("coursierId", "==", currentUser.uid),
      where("statut", "in", ["en_route", "livre", "termine"])
    );

    const unsubHistorique = onSnapshot(qHistorique, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setCommandesHistorique(list);
    });

    return () => {
      unsubDispo();
      unsubEnCours();
      unsubHistorique();
    };
  }, [currentUser]);

  // Accepter une commande disponible
  const handleAccepterCommande = async (orderId) => {
    try {
      const orderRef = doc(db, "commandes", orderId);
      await updateDoc(orderRef, {
        coursierId: currentUser.uid,
        coursierNom: currentUser.displayName || "Coursier",
        statut: "en_preparation",
        dateAcceptationCoursier: serverTimestamp()
      });
      setActiveTab("encours");
    } catch (error) {
      console.error("Erreur lors de l'acceptation :", error);
      alert("Impossible d'accepter la commande pour le moment.");
    }
  };

  // Marquer les achats comme terminés
  const handleValiderAchats = async (orderId) => {
    try {
      const orderRef = doc(db, "commandes", orderId);
      await updateDoc(orderRef, {
        statut: "achats_termines",
        dateAchatsTermines: serverTimestamp()
      });
    } catch (error) {
      console.error("Erreur lors de la validation des achats :", error);
      alert("Erreur lors de la validation.");
    }
  };

  return (
    <div style={S.container}>
      {/* En-tête */}
      <header style={S.header}>
        <h1 style={S.title}>Espace Coursier Supermarché</h1>
        <p style={S.subtitle}>Achats & Passation aux Livreurs Moto</p>
      </header>

      {/* Navigation par Onglets */}
      <nav style={S.tabsContainer}>
        <button
          style={activeTab === "dispo" ? { ...S.tab, ...S.activeTab } : S.tab}
          onClick={() => setActiveTab("dispo")}
        >
          Disponibles ({commandesDispo.length})
        </button>
        <button
          style={activeTab === "encours" ? { ...S.tab, ...S.activeTab } : S.tab}
          onClick={() => setActiveTab("encours")}
        >
          En Cours ({commandesEnCours.length})
        </button>
        <button
          style={activeTab === "historique" ? { ...S.tab, ...S.activeTab } : S.tab}
          onClick={() => setActiveTab("historique")}
        >
          Historique ({commandesHistorique.length})
        </button>
      </nav>

      {/* Contenu principal */}
      <main style={S.content}>
        {loading && <p style={S.loadingText}>Chargement des données...</p>}

        {/* 1. ONGLET DISPONIBLES */}
        {!loading && activeTab === "dispo" && (
          <div>
            {commandesDispo.length === 0 ? (
              <div style={S.emptyState}>
                <Clock size={48} color="#94a3b8" />
                <p>Aucune nouvelle commande à effectuer pour le moment.</p>
              </div>
            ) : (
              commandesDispo.map((order) => (
                <div key={order.id} style={S.card}>
                  <div style={S.cardHeader}>
                    <span style={S.orderId}>Réf: #{order.id.slice(-6)}</span>
                    <span style={S.badgeDispo}>Prêt pour achats</span>
                  </div>

                  <div style={S.cardBody}>
                    <p style={S.supermarketName}>
                      <ShoppingBag size={18} style={S.icon} />
                      {order.supermarche || "Supermarché Central"}
                    </p>
                    <p style={S.detailText}>
                      <MapPin size={18} style={S.icon} />
                      {order.adresseLivraison || "Adresse client"}
                    </p>
                    
                    <div style={S.itemsList}>
                      <strong>Articles à acheter ({order.articles?.length || 0}) :</strong>
                      <ul>
                        {order.articles?.map((item, idx) => (
                          <li key={idx}>
                            {item.quantite}x {item.nom}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <button
                    style={S.btnPrimary}
                    onClick={() => handleAccepterCommande(order.id)}
                  >
                    Accepter & Commencer les achats
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* 2. ONGLET EN COURS */}
        {!loading && activeTab === "encours" && (
          <div>
            {commandesEnCours.length === 0 ? (
              <div style={S.emptyState}>
                <PackageCheck size={48} color="#94a3b8" />
                <p>Vous n'avez pas de commande en cours d'achat.</p>
              </div>
            ) : (
              commandesEnCours.map((order) => (
                <div key={order.id} style={S.card}>
                  <div style={S.cardHeader}>
                    <span style={S.orderId}>Réf: #{order.id.slice(-6)}</span>
                    <span
                      style={
                        order.statut === "achats_termines"
                          ? S.badgeReady
                          : S.badgeProgress
                      }
                    >
                      {order.statut === "achats_termines"
                        ? "Prêt pour passation"
                        : "Achats en cours"}
                    </span>
                  </div>

                  <div style={S.cardBody}>
                    <p style={S.supermarketName}>
                      <ShoppingBag size={18} style={S.icon} />
                      {order.supermarche || "Supermarché Central"}
                    </p>

                    <div style={S.itemsList}>
                      <strong>Liste des achats :</strong>
                      <ul>
                        {order.articles?.map((item, idx) => (
                          <li key={idx}>
                            {item.quantite}x {item.nom}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div style={S.cardActions}>
                    {order.statut === "en_preparation" && (
                      <button
                        style={S.btnSuccess}
                        onClick={() => handleValiderAchats(order.id)}
                      >
                        <CheckCircle2 size={18} style={{ marginRight: 8 }} />
                        Valider mes achats
                      </button>
                    )}

                    {order.statut === "achats_termines" && (
                      <button
                        style={S.btnQR}
                        onClick={() => setSelectedOrderQR(order)}
                      >
                        <QrCode size={18} style={{ marginRight: 8 }} />
                        Afficher mon QR Code de passation
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 3. ONGLET HISTORIQUE */}
        {!loading && activeTab === "historique" && (
          <div>
            {commandesHistorique.length === 0 ? (
              <div style={S.emptyState}>
                <Clock size={48} color="#94a3b8" />
                <p>Aucune commande dans l'historique.</p>
              </div>
            ) : (
              commandesHistorique.map((order) => (
                <div key={order.id} style={{ ...S.card, opacity: 0.85 }}>
                  <div style={S.cardHeader}>
                    <span style={S.orderId}>Réf: #{order.id.slice(-6)}</span>
                    <span style={S.badgeComplete}>
                      {order.statut === "en_route" ? "Remis au livreur" : "Terminée"}
                    </span>
                  </div>
                  <div style={S.cardBody}>
                    <p style={S.detailText}>
                      <strong>Articles :</strong> {order.articles?.length || 0}
                    </p>
                    <p style={S.detailText}>
                      <strong>Total :</strong> {order.montantTotal || 0} FCFA
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* MODAL : QR Code pour Passation au Livreur Moto */}
      {selectedOrderQR && (
        <div style={S.modalOverlay}>
          <div style={S.modalCard}>
            <button
              style={S.closeModalBtn}
              onClick={() => setSelectedOrderQR(null)}
            >
              <X size={24} />
            </button>

            <h2 style={S.modalTitle}>QR Code de Passation</h2>
            <p style={S.modalSub}>
              Faites scanner ce code par le livreur moto pour effectuer la remise de la commande.
            </p>

            {/* QR Code dynamique combinant ID Commande + Code de vérification */}
            <div style={S.qrContainer}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  JSON.stringify({
                    commandeId: selectedOrderQR.id,
                    codePassation: selectedOrderQR.codeVerification || selectedOrderQR.pickupCode || "",
                    coursierId: currentUser?.uid
                  })
                )}`}
                alt="QR Code Passation"
                style={S.qrImg}
              />
            </div>

            <div style={S.codeFallback}>
              <span>Code secours (saisie manuelle) :</span>
              <strong style={S.codeText}>
                {selectedOrderQR.codeVerification || selectedOrderQR.pickupCode || "Non défini"}
              </strong>
            </div>

            <p style={S.infoNotice}>
              <AlertCircle size={16} style={{ marginRight: 6 }} />
              Une fois scanné par le livreur, la commande passera automatiquement au statut "En route".
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles en JS Object pour une intégration immédiate
const S = {
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    backgroundColor: "#f8fafc",
    minHeight: "100vh",
  },
  header: {
    textAlign: "center",
    marginBottom: "20px",
  },
  title: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#0f172a",
    margin: 0,
  },
  subtitle: {
    fontSize: "14px",
    color: "#64748b",
    marginTop: "4px",
  },
  tabsContainer: {
    display: "flex",
    gap: "8px",
    marginBottom: "20px",
    backgroundColor: "#e2e8f0",
    padding: "4px",
    borderRadius: "12px",
  },
  tab: {
    flex: 1,
    padding: "10px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "transparent",
    color: "#64748b",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  activeTab: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
    border: "1px solid #e2e8f0",
    marginBottom: "16px",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
    paddingBottom: "8px",
    borderBottom: "1px solid #f1f5f9",
  },
  orderId: {
    fontWeight: "700",
    color: "#334155",
  },
  badgeDispo: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
  },
  badgeProgress: {
    backgroundColor: "#fef3c7",
    color: "#d97706",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
  },
  badgeReady: {
    backgroundColor: "#dcfce7",
    color: "#15803d",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
  },
  badgeComplete: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
  },
  cardBody: {
    marginBottom: "16px",
  },
  supermarketName: {
    fontWeight: "600",
    color: "#0f172a",
    display: "flex",
    alignItems: "center",
    marginBottom: "6px",
  },
  detailText: {
    color: "#475569",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    marginBottom: "6px",
  },
  icon: {
    marginRight: "8px",
    color: "#64748b",
  },
  itemsList: {
    marginTop: "12px",
    padding: "10px",
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    fontSize: "14px",
    color: "#334155",
  },
  cardActions: {
    display: "flex",
    gap: "10px",
  },
  btnPrimary: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
  },
  btnSuccess: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#16a34a",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  btnQR: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#64748b",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  loadingText: {
    textAlign: "center",
    color: "#64748b",
    padding: "20px",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    zIndex: 1000,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    width: "100%",
    maxWidth: "400px",
    textAlign: "center",
    position: "relative",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  },
  closeModalBtn: {
    position: "absolute",
    top: "16px",
    right: "16px",
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
  },
  modalTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: "#0f172a",
    margin: "0 0 6px 0",
  },
  modalSub: {
    fontSize: "13px",
    color: "#64748b",
    marginBottom: "16px",
  },
  qrContainer: {
    padding: "16px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    display: "inline-block",
    border: "1px solid #e2e8f0",
    marginBottom: "16px",
  },
  qrImg: {
    width: "200px",
    height: "200px",
    display: "block",
  },
  codeFallback: {
    backgroundColor: "#f1f5f9",
    padding: "10px",
    borderRadius: "8px",
    fontSize: "13px",
    color: "#475569",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "16px",
  },
  codeText: {
    fontSize: "18px",
    letterSpacing: "2px",
    color: "#0f172a",
  },
  infoNotice: {
    fontSize: "12px",
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: 0,
  }
};