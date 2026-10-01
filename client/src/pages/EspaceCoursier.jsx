import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, limit } from "firebase/firestore";
import { CheckCircle, Clock, Layers, MapPin, PackageCheck, ShieldCheck, ShoppingBag, Bike, MessageSquare } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";

const ARRIVED_STATUSES = ["arrived_at_pickup", "in_transit", "completed"];

export default function EspaceCoursier() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState("dispo");
  const [commandesDispo, setCommandesDispo] = useState([]);
  const [commandesEnCours, setCommandesEnCours] = useState([]);
  const [commandesHistorique, setCommandesHistorique] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;

    const queryParams = new URLSearchParams(location.search);
    const source = queryParams.get("source");

    if (source === "boutique" || source === "coursier_rayons" || source === "coursier") {
      const targetDestination = queryParams.get("adresse") || queryParams.get("targetDestination") || "";
      const prefillName = queryParams.get("nom") || queryParams.get("prefillName") || "";
      const prefillPhone = queryParams.get("telephone") || queryParams.get("prefillPhone") || queryParams.get("tel") || "";
      const montantArticles = Number(queryParams.get("montant") || queryParams.get("montantArticles") || 0);

      navigate("/client-home", {
        state: {
          isTiersOrder: true,
          vendeurId: currentUser.uid,
          vendeurNom: currentUser.displayName || currentUser.email || "Coursier Mambo",
          departAdresse: currentUser.adresse || "",
          prefillName,
          prefillPhone,
          targetDestination,
          targetAddress: targetDestination,
          montantArticles,
          montantLivraison: 0,
          items: [],
          isAutoAssign: true,
          fromVendeur: true,
          prefillSource: source,
        },
      });
    }
  }, [location.search, currentUser, navigate]);

  const filterUniqueOrders = (docsList) => {
    const map = new Map();
    docsList.forEach((item) => {
      if (item.id && !map.has(item.id)) map.set(item.id, item);
    });
    return Array.from(map.values());
  };

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const qDispo = query(
      collection(db, "orders"),
      where("status", "in", ["paye_ia_valide", "en_attente_coursier"])
    );
    const unsubDispo = onSnapshot(
      qDispo,
      (snapshot) => {
        setCommandesDispo(filterUniqueOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
        setLoading(false);
      },
      (error) => {
        console.error("Erreur snapshot dispo :", error);
        setLoading(false);
      }
    );

    const qEnCours = query(
      collection(db, "orders"),
      where("coursierId", "==", currentUser.uid),
      where("status", "in", ["en_preparation", "achats_termines", "en_attente_commission"])
    );
    const unsubEnCours = onSnapshot(
      qEnCours,
      (snapshot) => {
        setCommandesEnCours(filterUniqueOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
      },
      (error) => console.error("Erreur snapshot en cours :", error)
    );

    const qHistorique = query(
      collection(db, "orders"),
      where("coursierId", "==", currentUser.uid),
      where("status", "in", ["en_route", "livre", "termine", "completed", "cancelled"])
    );
    const unsubHistorique = onSnapshot(
      qHistorique,
      (snapshot) => {
        setCommandesHistorique(filterUniqueOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
      },
      (error) => console.error("Erreur snapshot historique :", error)
    );

    return () => {
      unsubDispo();
      unsubEnCours();
      unsubHistorique();
    };
  }, [currentUser]);

  const handleAccepterCommande = async (orderId) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        coursierId: currentUser.uid,
        coursierNom: currentUser.displayName || currentUser.email || "Coursier",
        status: "en_preparation",
        dateAcceptationCoursier: serverTimestamp(),
      });
      setActiveTab("encours");
    } catch (error) {
      console.error("Erreur lors de l'acceptation :", error);
      alert("Impossible d'accepter la commande pour le moment.");
    }
  };

  const handleBookCourseForOrder = async (order) => {
    try {
      await updateDoc(doc(db, "orders", order.id), { courseRequested: true });
    } catch (e) {
      console.warn("Impossible de marquer courseRequested :", e.message);
    }

    const clientName =
      order.clientNom ||
      order.nomClient ||
      order.clientName ||
      order.nom ||
      (order.client && (order.client.nom || order.client.name)) ||
      "";

    const clientPhone =
      order.clientTelephone ||
      order.telephone ||
      order.phone ||
      order.tel ||
      order.clientPhone ||
      order.telephoneClient ||
      (order.client && (order.client.telephone || order.client.phone)) ||
      "";

    const boutiqueName =
      order.nomBoutique ||
      (order.items?.length
        ? [...new Set(order.items.map((i) => i.nomBoutique).filter(Boolean))].join(", ")
        : "") ||
      (order.articles?.length
        ? [...new Set(order.articles.map((i) => i.nomBoutique).filter(Boolean))].join(", ")
        : "");

    navigate("/client-home", {
      state: {
        isTiersOrder: true,
        orderId: order.id,
        vendeurId: currentUser.uid,
        vendeurNom: currentUser.displayName || currentUser.email || "Coursier Mambo",
        departAdresse: boutiqueName || currentUser.adresse || "",
        prefillName: clientName,
        prefillPhone: clientPhone,
        targetDestination: order.adresseLivraison || order.adresse || "",
        targetAddress: order.adresseLivraison || order.adresse || "",
        montantArticles: Number(order.amount || order.montantTotal || order.total || 0),
        montantLivraison: 0,
        items: order.articles || order.items || [],
        isAutoAssign: true,
        fromVendeur: true,
        prefillSource: "coursier",
      },
    });
  };

  const handleNotifyCommission = async (order) => {
    try {
      if (order.status === "en_attente_commission" || order.commissionNotifiedAt) return;

      await updateDoc(doc(db, "orders", order.id), {
        status: "en_attente_commission",
        commissionNotifiedAt: serverTimestamp(),
        inAppMessage:
          "📦 Vos achats sont prêts ! Le livreur est arrivé. Payez la commission (500 F) via le lien WhatsApp, puis envoyez le reçu à l'assistance.",
        inAppMessageRead: false,
        inAppMessageAt: serverTimestamp(),
      });

      const markCourse = async (snap) => {
        if (snap.empty) return false;
        const courseDoc = snap.docs[0];
        await updateDoc(doc(db, "courses", courseDoc.id), {
          commissionRequested: true,
          commissionRequestedAt: serverTimestamp(),
        });
        return true;
      };

      const q1 = query(collection(db, "courses"), where("orderId", "==", order.id), limit(1));
      const unsub1 = onSnapshot(q1, async (snapshot) => {
        const ok = await markCourse(snapshot);
        unsub1();
        if (!ok) {
          const q2 = query(collection(db, "courses"), where("linkedOrderId", "==", order.id), limit(1));
          const unsub2 = onSnapshot(q2, async (snap2) => {
            await markCourse(snap2);
            unsub2();
          });
        }
      });
    } catch (e) {
      console.warn("Impossible de mettre à jour le statut commission :", e.message);
    }
  };

  const handleCourseCompleted = async (orderId) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: "livre",
        closedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("Impossible de clôturer la commande :", e.message);
    }
  };

  const getSupermarketName = (order) => {
    if (order.nomBoutique) return order.nomBoutique;
    if (order.items?.length) {
      const stores = [...new Set(order.items.map((i) => i.nomBoutique).filter(Boolean))];
      if (stores.length > 0) return stores.join(", ");
    }
    return "Boutique Partenaire";
  };

  const renderItemsList = (order) => {
    const items = order.articles || order.items || [];
    return (
      <div style={S.itemsList}>
        <strong>Articles ({items.length}) :</strong>
        <ul style={{ paddingLeft: 0, margin: "6px 0 0 0", listStyle: "none" }}>
          {items.map((item, idx) => {
            const qty = item.quantite || item.quantity || 1;
            const name = item.nom || item.name || "Article";
            const unit = Number(item.prix || item.price || item.prixUnitaire || 0);
            const lineTotal = unit * qty;
            return (
              <li
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  padding: "6px 0",
                  borderBottom: idx < items.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                <span style={{ color: "#334155" }}>
                  {qty}x {name}
                </span>
                <span style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                  {unit > 0
                    ? qty > 1
                      ? `${unit.toLocaleString()} F × ${qty} = ${lineTotal.toLocaleString()} F`
                      : `${unit.toLocaleString()} F`
                    : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div style={S.container}>
      <header style={S.header}>
        <div style={S.headerTop}>
          <div style={S.headerBadge}>
            <span style={S.pulseDot}></span> Espace Pro Coursier
          </div>
          {currentUser && (
            <div style={S.userInfo}>
              <span style={S.userName}>{currentUser.displayName || "Coursier"}</span>
            </div>
          )}
        </div>
        <h1 style={S.title}>Supermarché & Achats</h1>
        <p style={S.subtitle}>Gestion des courses et passation aux livreurs moto</p>

        <div style={S.waveNotice}>
          <ShieldCheck size={16} color="#0284c7" style={{ minWidth: 16 }} />
          <span>
            1. Réservez un livreur → 2. À son arrivée, le client est notifié automatiquement pour la commission → 3. Passation après validation OCR.
          </span>
        </div>
      </header>

      <nav style={S.tabsContainer}>
        <button
          style={activeTab === "dispo" ? { ...S.tab, ...S.activeTab } : S.tab}
          onClick={() => setActiveTab("dispo")}
        >
          <Clock size={16} style={{ marginRight: 6 }} />
          Disponibles
          <span style={activeTab === "dispo" ? S.badgeCountActive : S.badgeCount}>
            {commandesDispo.length}
          </span>
        </button>
        <button
          style={activeTab === "encours" ? { ...S.tab, ...S.activeTab } : S.tab}
          onClick={() => setActiveTab("encours")}
        >
          <Layers size={16} style={{ marginRight: 6 }} />
          En Cours
          <span style={activeTab === "encours" ? S.badgeCountActive : S.badgeCount}>
            {commandesEnCours.length}
          </span>
        </button>
        <button
          style={activeTab === "historique" ? { ...S.tab, ...S.activeTab } : S.tab}
          onClick={() => setActiveTab("historique")}
        >
          <CheckCircle size={16} style={{ marginRight: 6 }} />
          Historique
          <span style={activeTab === "historique" ? S.badgeCountActive : S.badgeCount}>
            {commandesHistorique.length}
          </span>
        </button>
      </nav>

      <main style={S.content}>
        {loading && (
          <div style={S.loadingContainer}>
            <div style={S.spinner}></div>
            <p>Chargement des données en cours...</p>
          </div>
        )}

        {!loading && activeTab === "dispo" && (
          <div style={S.scrollableSection}>
            {commandesDispo.length === 0 ? (
              <EmptyBlock
                icon={<Clock size={36} color="#3b82f6" />}
                title="Aucune commande disponible"
                text="Les commandes apparaîtront ici uniquement après validation du paiement supermarché par l'IA."
              />
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
                      {getSupermarketName(order)}
                    </p>
                    <p style={S.detailText}>
                      <MapPin size={18} style={S.icon} />
                      {order.adresseLivraison || order.adresse || "Adresse client"}
                    </p>
                    {renderItemsList(order)}
                    <div style={S.totalLine}>
                      <span>Total commande :</span>
                      <strong>
                        {Number(order.amount || order.montantTotal || order.total || 0).toLocaleString()} F CFA
                      </strong>
                    </div>
                  </div>
                  <button style={S.btnPrimary} onClick={() => handleAccepterCommande(order.id)}>
                    Accepter & S&apos;assigner la commande
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && activeTab === "encours" && (
          <div style={S.scrollableSection}>
            {commandesEnCours.length === 0 ? (
              <EmptyBlock
                icon={<PackageCheck size={36} color="#f59e0b" />}
                title="Aucune commande en cours"
                text="Vous n'avez pas de mission d'achat active pour le moment."
              />
            ) : (
              commandesEnCours.map((order) => (
                <EnCoursCard
                  key={order.id}
                  order={order}
                  getSupermarketName={getSupermarketName}
                  renderItemsList={renderItemsList}
                  onBookCourse={() => handleBookCourseForOrder(order)}
                  onNotifyCommission={() => handleNotifyCommission(order)}
                  onCourseCompleted={handleCourseCompleted}
                />
              ))
            )}
          </div>
        )}

        {!loading && activeTab === "historique" && (
          <div style={S.scrollableSection}>
            {commandesHistorique.length === 0 ? (
              <EmptyBlock
                icon={<Clock size={36} color="#64748b" />}
                title="Historique vide"
                text="Vos anciennes courses terminées apparaîtront ici."
              />
            ) : (
              commandesHistorique.map((order) => (
                <div key={order.id} style={{ ...S.card, opacity: 0.9 }}>
                  <div style={S.cardHeader}>
                    <span style={S.orderId}>Réf: #{order.id.slice(-6)}</span>
                    <span style={S.badgeComplete}>
                      {order.status === "en_route" ? "En route" : "Terminée"}
                    </span>
                  </div>
                  <div style={S.cardBody}>
                    <p style={S.supermarketName}>
                      <ShoppingBag size={18} style={S.icon} />
                      {getSupermarketName(order)}
                    </p>
                    {renderItemsList(order)}
                    <div style={S.totalLine}>
                      <span>Total :</span>
                      <strong>
                        {Number(order.amount || order.montantTotal || order.total || 0).toLocaleString()} FCFA
                      </strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function EnCoursCard({
  order,
  getSupermarketName,
  renderItemsList,
  onBookCourse,
  onNotifyCommission,
  onCourseCompleted,
}) {
  const [linkedCourseStatus, setLinkedCourseStatus] = useState(null);
  const [commissionRequestedState, setCommissionRequestedState] = useState(false);
  const hasClosedRef = useRef(false);
  const hasAutoNotifiedRef = useRef(false);

  useEffect(() => {
    if (!order.courseRequested && !order.linkedCourseId) return;

    const processSnap = (snap) => {
      if (snap.empty) return;

      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const currentCourse = docs[0];

      setLinkedCourseStatus(currentCourse.status);
      setCommissionRequestedState(!!currentCourse.commissionRequested);

      const arrived = ARRIVED_STATUSES.includes(currentCourse.status);
      const alreadyNotified =
        order.status === "en_attente_commission" ||
        !!order.commissionNotifiedAt ||
        !!currentCourse.commissionRequested;

      if (arrived && !alreadyNotified && !hasAutoNotifiedRef.current) {
        hasAutoNotifiedRef.current = true;
        onNotifyCommission();
      }

      if (currentCourse.status === "completed" && !hasClosedRef.current) {
        hasClosedRef.current = true;
        onCourseCompleted(order.id);
      }
    };

    const q = query(collection(db, "courses"), where("orderId", "==", order.id), limit(5));

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          processSnap(snap);
          return;
        }
        const q2 = query(collection(db, "courses"), where("linkedOrderId", "==", order.id), limit(5));
        const unsub2 = onSnapshot(q2, processSnap);
        unsub._fallback = unsub2;
      },
      (err) => console.warn("Erreur écoute course liée :", err.message)
    );

    return () => {
      unsub();
      if (unsub._fallback) unsub._fallback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.courseRequested, order.linkedCourseId]);

  const livreurArrived = ARRIVED_STATUSES.includes(linkedCourseStatus);
  const commissionAlreadyNotified =
    order.status === "en_attente_commission" ||
    !!order.commissionNotifiedAt ||
    commissionRequestedState;

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={S.orderId}>Réf: #{order.id.slice(-6)}</span>
        <span style={order.courseRequested ? S.badgeReady : S.badgeProgress}>
          {order.courseRequested
            ? livreurArrived
              ? commissionAlreadyNotified
                ? "Client notifié"
                : "Livreur sur place"
              : "Livreur en route"
            : "En attente de réservation"}
        </span>
      </div>

      <div style={S.cardBody}>
        <p style={S.supermarketName}>
          <ShoppingBag size={18} style={S.icon} />
          {getSupermarketName(order)}
        </p>
        <p style={S.detailText}>
          <MapPin size={18} style={S.icon} />
          {order.adresseLivraison || order.adresse || "Adresse client"}
        </p>

        {renderItemsList(order)}

        <div style={S.totalLine}>
          <span>Total commande :</span>
          <strong>
            {Number(order.amount || order.montantTotal || order.total || 0).toLocaleString()} F CFA
          </strong>
        </div>

        {commissionAlreadyNotified && (
          <div style={S.inAppAlertBox}>
            <MessageSquare size={16} color="#0284c7" style={{ minWidth: 16, marginTop: 2 }} />
            <div>
              <strong>Client notifié automatiquement</strong>
              <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#0369a1" }}>
                WhatsApp + message in-app pour le paiement de la commission 500 F.
              </p>
            </div>
          </div>
        )}
      </div>

      <button
        style={order.courseRequested ? S.btnDisabled : S.btnPrimary}
        onClick={order.courseRequested ? undefined : onBookCourse}
        disabled={!!order.courseRequested}
      >
        <Bike size={18} style={{ marginRight: 8 }} />
        {order.courseRequested ? "Livreur réservé" : "Réserver un livreur"}
      </button>
    </div>
  );
}

function EmptyBlock({ icon, title, text }) {
  return (
    <div style={S.emptyState}>
      <div style={S.emptyIconWrapper}>{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

const S = {
  container: {
    maxWidth: "550px",
    margin: "0 auto",
    padding: "20px 16px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    backgroundColor: "#f8fafc",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  header: {
    marginBottom: "16px",
    backgroundColor: "#ffffff",
    padding: "16px",
    borderRadius: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    border: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  headerBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#2563eb",
    backgroundColor: "#eff6ff",
    padding: "4px 10px",
    borderRadius: "20px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  pulseDot: {
    width: "8px",
    height: "8px",
    backgroundColor: "#2563eb",
    borderRadius: "50%",
    boxShadow: "0 0 0 4px #dbeafe",
  },
  userInfo: { fontSize: "13px", color: "#64748b", fontWeight: "500" },
  userName: { color: "#0f172a", fontWeight: "600" },
  title: {
    fontSize: "22px",
    fontWeight: "800",
    color: "#0f172a",
    margin: "0 0 4px 0",
    letterSpacing: "-0.5px",
  },
  subtitle: { fontSize: "13px", color: "#64748b", margin: "0 0 10px 0" },
  waveNotice: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "#f0f9ff",
    border: "1px solid #bae6fd",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#0369a1",
  },
  tabsContainer: {
    display: "flex",
    gap: "6px",
    marginBottom: "12px",
    backgroundColor: "#e2e8f0",
    padding: "4px",
    borderRadius: "14px",
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 6px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "transparent",
    color: "#64748b",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  activeTab: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
  },
  badgeCount: {
    marginLeft: "6px",
    backgroundColor: "#cbd5e1",
    color: "#334155",
    fontSize: "11px",
    fontWeight: "700",
    padding: "1px 6px",
    borderRadius: "10px",
  },
  badgeCountActive: {
    marginLeft: "6px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: "700",
    padding: "1px 6px",
    borderRadius: "10px",
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  scrollableSection: {
    flex: 1,
    overflowY: "auto",
    paddingRight: "2px",
    paddingBottom: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "16px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02)",
    border: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
    paddingBottom: "8px",
    borderBottom: "1px solid #f1f5f9",
  },
  orderId: { fontWeight: "700", color: "#0f172a", fontSize: "15px" },
  badgeDispo: {
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  badgeProgress: {
    backgroundColor: "#fffbeb",
    color: "#d97706",
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  badgeReady: {
    backgroundColor: "#f0fdf4",
    color: "#15803d",
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  badgeComplete: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardBody: { marginBottom: "14px" },
  supermarketName: {
    fontWeight: "700",
    color: "#0f172a",
    display: "flex",
    alignItems: "center",
    marginBottom: "6px",
    fontSize: "15px",
  },
  detailText: {
    color: "#475569",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    marginBottom: "6px",
  },
  icon: { marginRight: "8px", color: "#64748b" },
  itemsList: {
    marginTop: "10px",
    padding: "10px",
    backgroundColor: "#f8fafc",
    borderRadius: "10px",
    fontSize: "13px",
    color: "#334155",
    border: "1px solid #f1f5f9",
  },
  totalLine: {
    marginTop: "10px",
    paddingTop: "8px",
    borderTop: "1px solid #f1f5f9",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "13px",
    color: "#0f172a",
    fontWeight: 700,
  },
  inAppAlertBox: {
    marginTop: "10px",
    padding: "10px",
    backgroundColor: "#f0f9ff",
    borderRadius: "10px",
    border: "1px solid #bae6fd",
    display: "flex",
    gap: "8px",
    fontSize: "13px",
    color: "#0369a1",
  },
  btnPrimary: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#e2e8f0",
    color: "#94a3b8",
    border: "none",
    borderRadius: "10px",
    fontWeight: "600",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "not-allowed",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    margin: "auto 0",
  },
  emptyIconWrapper: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    backgroundColor: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "4px",
    border: "1px solid #e2e8f0",
  },
  loadingContainer: { textAlign: "center", padding: "40px", color: "#64748b" },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid #e2e8f0",
    borderTop: "3px solid #2563eb",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto 12px auto",
  },
};
