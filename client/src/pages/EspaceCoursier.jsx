import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp, getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, Send, ShoppingBag,
  Package, Bike, Bell, Zap, X, QrCode
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import ScannerLivreur from "../components/ScannerLivreur";

const STATUS_META = {
  en_attente_coursier: { label: "Dispo · À prendre",   color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  paye_ia_valide:      { label: "Paiement validé",     color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
  en_preparation:      { label: "En préparation",      color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  paiement_confirme:   { label: "Achats en cours",     color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
  achats_termines:     { label: "Prêt / Transmission", color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" },
  en_route:            { label: "En livraison moto",   color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
  livre:               { label: "Livré",               color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
};

const COMMISSION_COURSIER = 500;

export default function EspaceCoursier() {
  const navigate = useNavigate();
  const [coursier, setCoursier] = useState(null);
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("dispo");
  const [processing, setProcessing] = useState(null);
  const [activeScanner, setActiveScanner] = useState(null);
  const [linkedMission, setLinkedMission] = useState(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  const prevOrdersCount = useRef(0);

  const sortOrders = (arr) => [...arr].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  // Notifications sonores
  useEffect(() => {
    const available = orders.filter(o => o.status === "paye_ia_valide" && !o.coursierId);
    if (available.length > prevOrdersCount.current) {
      try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.connect(gain); gain.connect(context.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
        osc.stop(context.currentTime + 0.5);
      } catch (audioErr) {
        console.warn("Audio bloqué par le navigateur");
      }
      toast.info("🚨 NOUVEAU PANIER DISPONIBLE !", { icon: <Bell /> });
    }
    prevOrdersCount.current = available.length;
  }, [orders]);

  // Tracking GPS
  useEffect(() => {
    if (!coursier?.uid) return;
    const hasActiveOrder = orders.some(o =>
      o.coursierId === coursier.uid &&
      ["en_preparation", "paiement_confirme", "achats_termines", "en_route"].includes(o.status)
    );
    if (!hasActiveOrder) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await updateDoc(doc(db, "coursiers", coursier.uid), {
            geoloc: { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading || 0 },
            lastSeen: serverTimestamp(),
          });
        } catch (e) { console.error("GPS Update Error"); }
      },
      null,
      { enableHighAccuracy: true, distanceFilter: 10 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [coursier?.uid, orders]);

  // Auth + Data & Listeners Sécurisés
  useEffect(() => {
    let unsubActive = () => {};
    let unsubHistory = () => {};

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) { setReady(true); navigate("/login-coursier"); return; }

      let data = null;
      try {
        const snapC = await getDoc(doc(db, "coursiers", user.uid));
        if (snapC.exists() && snapC.data().role === "coursier") {
          data = snapC.data();
        } else {
          const snapU = await getDoc(doc(db, "users", user.uid));
          if (snapU.exists() && snapU.data().role === "coursier") data = snapU.data();
        }
      } catch (e) {
        console.error("getDoc profile error:", e.message);
      }

      if (!data) { setReady(true); navigate("/acces"); return; }

      setCoursier({ uid: user.uid, ...data });
      setReady(true);

      const qActive = query(
        collection(db, "orders"),
        where("type", "==", "supermarche"),
        where("status", "in", ["paye_ia_valide", "en_preparation", "paiement_confirme", "achats_termines", "en_route"])
      );

      unsubActive = onSnapshot(qActive, (s) => {
        const allOrders = s.docs.map(d => ({ id: d.id, ...d.data() }));
        const filtered = allOrders.filter(o => !o.coursierId || o.coursierId === user.uid);
        setOrders(sortOrders(filtered));
        setLoading(false);
      }, (err) => {
        console.warn("Erreur d'écoute des commandes actives :", err.message);
        setLoading(false);
      });

      const qHistory = query(
        collection(db, "orders"),
        where("type", "==", "supermarche"),
        where("coursierId", "==", user.uid),
        where("status", "==", "livre")
      );
      
      unsubHistory = onSnapshot(qHistory, (s) => {
        setHistory(sortOrders(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      }, (err) => {
        console.warn("Erreur d'écoute de l'historique :", err.message);
      });
    });

    return () => { 
      unsubAuth(); 
      unsubActive(); 
      unsubHistory(); 
    };
  }, [navigate]);

  // Listener mssions courses sécurisé
  useEffect(() => {
    if (!coursier?.uid) return;

    const q = query(
      collection(db, "courses"),
      where("status", "in", ["offering", "assigned", "accepted", "arrived_at_pickup", "in_transit", "achats_termines"])
    );

    const unsub = onSnapshot(q, (s) => {
      const allMissions = s.docs.map(d => ({ id: d.id, ...d.data() }));
      const found = allMissions.find(m =>
        m.assignedCoursier === coursier.uid ||
        (m.type === "supermarche" && m.status === "achats_termines" && !m.livreurId)
      ) ?? null;
      setLinkedMission(found);
    }, (err) => {
      console.warn("Erreur d'écoute sur les missions courses :", err.message);
    });

    return () => unsub();
  }, [coursier?.uid]);

  const totalOrder = (o) =>
    o.amount ??
    (o.items?.reduce((sum, i) => 
      sum + parseFloat(i.priceUnit || i.prix || 0) * parseInt(i.quantity || 1), 0) || 0);

  const handleAccept = useCallback(async (order) => {
    const hasCurrentOrder = orders.some(o =>
      o.coursierId === auth.currentUser?.uid &&
      ["en_preparation", "achats_termines"].includes(o.status)
    );
    if (hasCurrentOrder) {
      toast.error("Terminez d'abord votre commande en cours !");
      return;
    }
    if (!coursier?.isVerified) {
      toast.warn("Compte non vérifié.");
      return;
    }

    setProcessing(order.id);
    try {
      await updateDoc(doc(db, "orders", order.id), {
        status: "en_preparation",
        coursierId: auth.currentUser.uid,
        coursierNom: coursier?.nomComplet ?? "Coursier",
        acceptedAt: serverTimestamp(),
        commission: COMMISSION_COURSIER,
      });

      const liste = order.items?.map(i => `• ${i.nom} (x${i.quantity})`).join("\n") || "";
      const msg = `🚀 *LANCEMENT LIVRAISON*\nRef: #${order.orderId || order.id}\nMontant: ${totalOrder(order)}F\n\n📦 PANIER :\n${liste}`;
      window.open(`https://wa.me/${order.clientPhone || "225"}?text=${encodeURIComponent(msg)}`, "_blank");

      setActiveTab("mes_achats");
    } catch {
      toast.error("Erreur lors de l'acceptation.");
    } finally {
      setProcessing(null);
    }
  }, [orders, coursier]);

  const handlePartagerPourValidation = useCallback(async (order) => {
    const montantFinal = totalOrder(order);
    if (!montantFinal || montantFinal <= 0) {
      toast.error("Montant invalide.");
      return;
    }

    try {
      await updateDoc(doc(db, "orders", order.id), {
        status: "en_attente_paiement",
        datePartageValidation: serverTimestamp(),
        montantAttendu: montantFinal
      });

      const nomBoutique = order.nomBoutique || "SOCOFRAIS";
      const listeArticles = order.items?.map(i => `• ${i.nom} (${i.quantity}x) : ${i.prix}F`).join("\n") || "";

      const msg = `🧾 *DEMANDE DE VALIDATION PAIEMENT*\n` +
                  `Vendeur : ${nomBoutique}\n` +
                  `Réf : #${(order.orderId || order.id).slice(-6)}\n` +
                  `Montant : ${montantFinal}F\n\n` +
                  `⚠️ *ACTION REQUISE :* Veuillez d'abord enregistrer ce numéro d'assistance dans vos contacts.\n` +
                  `Cela est obligatoire pour confirmer votre paiement par le contrôle du reçu complet depuis l'interface Wave.\n\n` +
                  `Articles :\n${listeArticles}\n\n` +
                  `👉 Envoyez votre reçu Wave complet une fois le contact enregistré.`;

      window.open(`https://wa.me/2250778073456?text=${encodeURIComponent(msg)}`, "_blank");
      toast.success("Demande envoyée via WhatsApp");
    } catch {
      toast.error("Erreur lors de la demande de validation.");
    }
  }, []);

  const handleTerminerAchats = async (order) => {
    setProcessing(order.id);
    try {
      await updateDoc(doc(db, "orders", order.id), { 
        status: "achats_termines", 
        attenteCommission: true 
      });
      
      toast.success("Achats validés ! Recherche d'un livreur moto...");

      setTimeout(() => {
        navigate("/client-redirect", { state: { orderId: order.id } });
      }, 1500);

    } catch (error) {
      toast.error("Erreur de validation.");
    } finally {
      setProcessing(null);
    }
  };

  const handleCompleteTransmission = async (livreurId, orderId) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: "en_route",
        livreurId,
        transmissionLivreurAt: serverTimestamp(),
      });
      setActiveScanner(null);
      toast.success("Colis transmis au livreur !");
    } catch {
      toast.error("Erreur lors de la transmission.");
    }
  };

  const handleFinaliserLivraison = async (order) => {
    if (!window.confirm(`Confirmez avoir reçu vos ${COMMISSION_COURSIER}F ?`)) return;
    try {
      await updateDoc(doc(db, "orders", order.id), {
        status: "livre",
        deliveredAt: serverTimestamp(),
        serviceFeePaid: true,
      });
      toast.success("Mission terminée avec succès !");
    } catch {
      toast.error("Erreur.");
    }
  };

  const visibleOrders = useMemo(() => {
    if (activeTab === "dispo")
      return orders.filter(o => 
        o.status === "paye_ia_valide" && 
        !o.coursierId && 
        o.type === "supermarche"
      );

    if (activeTab === "mes_achats")
      return orders.filter(o => o.coursierId === auth.currentUser?.uid);

    if (activeTab === "historique")
      return history;

    return [];
  }, [orders, history, activeTab]);

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} color='#6366f1' className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={S.root}>
      <ToastContainer theme="dark" position="top-center" />

      {activeScanner && (
        <ScannerLivreur
          orderId={activeScanner}
          onClose={() => setActiveScanner(null)}
          onScanSuccess={(id) => handleCompleteTransmission(id, activeScanner)}
        />
      )}

      {showBadgeModal && (
        <div style={S.modalOverlay} onClick={() => setShowBadgeModal(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <button style={S.modalClose} onClick={() => setShowBadgeModal(false)}>
              <X size={18} />
            </button>
            <div style={S.modalHeader}>
              <QrCode size={28} color="#6366f1" />
              <p style={S.modalTitle}>Présentez ce code au livreur</p>
              <p style={S.modalSub}>Le livreur scanne ce QR pour récupérer le colis</p>
            </div>
            <div style={S.qrWrapper}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${auth.currentUser?.uid}`}
                alt="QR Coursier"
                style={S.qrImg}
              />
            </div>
            <p style={S.qrUid}>{auth.currentUser?.uid?.slice(0, 12).toUpperCase()}…</p>
          </div>
        </div>
      )}

      <header style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <div style={S.headerCenter}>
          <div style={S.headerIcon}><ShoppingBag size={20} color="#fff" /></div>
          <div>
            <h1 style={S.headerTitle}>MAMBO COURSIER</h1>
            <p style={S.headerSub}>{coursier?.nomComplet}</p>
          </div>
        </div>
        <div style={S.onlineDot}><span style={S.dot} /> EN LIGNE</div>
      </header>

      <nav style={S.tabs}>
        {["dispo", "mes_achats", "historique"].map((tabId) => (
          <button
            key={tabId}
            style={{ ...S.tab, ...(activeTab === tabId ? S.tabActive : {}) }}
            onClick={() => setActiveTab(tabId)}
          >
            {tabId.toUpperCase()}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {loading ? (
          <div style={S.loader}><Loader2 size={36} className="animate-spin" /></div>
        ) : visibleOrders.length > 0 ? (
          visibleOrders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              tab={activeTab}
              total={totalOrder(o)}
              onAccept={() => handleAccept(o)}
              onValiderPaiement={() => handlePartagerPourValidation(o)}
              onTerminer={() => handleTerminerAchats(o)}
              onStartScan={() => setShowBadgeModal(true)}
              onFinaliser={() => handleFinaliserLivraison(o)}
              isProcessing={processing === o.id}
              hasIncomingLivreur={linkedMission?.type === "supermarche" && linkedMission?.status === "achats_termines"}
            />
          ))
        ) : (
          <EmptyState label="Aucune activité" />
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order, tab, total,
  onAccept, onValiderPaiement, onTerminer, onStartScan, onFinaliser,
  isProcessing, hasIncomingLivreur
}) {
  const meta = STATUS_META[order.status] || STATUS_META.en_attente_coursier;

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={S.cardId}>#{(order.orderId || order.id.slice(-5)).toUpperCase()}</span>
        <span style={{ ...S.statusPill, background: meta.bg, color: meta.color }}>{meta.label}</span>
      </div>

      {order.type === "supermarche" && order.status === "achats_termines" && (
        <div style={S.transmissionBanner}>
          <Zap size={18} color="#f97316" fill="#f97316" />
          <div>
            <p style={S.transmissionTitle}>Récupération Colis</p>
            <p style={S.transmissionSub}>
              {hasIncomingLivreur ? "Un livreur est en route — présentez votre QR Code." : "En attente d'un livreur..."}
            </p>
          </div>
        </div>
      )}

      <div style={S.totalRow}>
        <span style={S.totalLabel}>MONTANT À RÉCUPÉRER</span>
        <span style={S.totalAmount}>{total.toLocaleString()} F</span>
      </div>

      <div style={S.btnGroup}>
        {tab === "dispo" && (
          <button style={S.btnPrimary} onClick={onAccept} disabled={isProcessing}>
            <Bike size={16} /> PRENDRE PANIER
          </button>
        )}

        {tab === "mes_achats" && (
          <>
            {/* Étape 1 : Demande de validation */}
            {(order.status === "en_preparation" || order.status === "paye_ia_valide") && (
              <>
                <button
                  style={{ ...S.btnPrimary, background: "#25D366" }}
                  onClick={onValiderPaiement}
                  disabled={isProcessing}
                >
                  <Send size={16} /> PARTAGER POUR VALIDATION
                </button>
                <p style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', marginTop: '4px', lineHeight: '1.4' }}>
                  Demandez au client d'enregistrer le contact assistance pour valider son reçu depuis l'interface Wave.
                </p>
              </>
            )}

            {/* Étape 2 : Clôture des achats après confirmation du paiement */}
            {(order.status === "paiement_confirme" || order.status === "en_preparation") && (
              <button
                style={{ ...S.btnPrimary, background: "#10b981", marginTop: order.status === "en_preparation" ? "8px" : "0" }}
                onClick={onTerminer}
                disabled={isProcessing}
              >
                <Package size={16} /> VALIDER MES ACHATS (LIVREUR MOTO)
              </button>
            )}

            {/* Étape 3 : Transmission au livreur */}
            {order.status === "achats_termines" && (
              <button
                style={{ ...S.btnPrimary, background: "#f97316" }}
                onClick={onStartScan}
                disabled={isProcessing}
              >
                <QrCode size={16} /> AFFICHER MON QR CODE
              </button>
            )}

            {/* Étape 4 : Encaissement de la commission coursier */}
            {order.status === "en_route" && (
              <button style={S.btnPrimary} onClick={onFinaliser} disabled={isProcessing}>
                💰 REÇU MES {COMMISSION_COURSIER}F
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div style={S.empty}>
      <Package size={40} color="#cbd5e1" />
      <p>{label}</p>
    </div>
  );
}

const S = {
  root: {
    minHeight: "100dvh",
    background: "#f8fafc",
    paddingBottom: 100,
    fontFamily: "Inter, system-ui, sans-serif",
  },
  main: {
    padding: "16px",
  },
  loader: {
    textAlign: "center",
    padding: "100px 0",
    color: "#6366f1",
  },
  empty: {
    textAlign: "center",
    padding: "100px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 600,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    background: "#0f172a",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    padding: 4,
  },
  headerCenter: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "#6366f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#fff",
    margin: 0,
    letterSpacing: "0.5px",
  },
  headerSub: {
    fontSize: 10,
    color: "rgba(255,255,255,.45)",
    margin: 0,
    textTransform: "uppercase",
  },
  onlineDot: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 9,
    color: "#10d98c",
    fontWeight: 800,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#10d98c",
    boxShadow: "0 0 8px #10d98c",
  },
  tabs: {
    display: "flex",
    background: "#fff",
    borderBottom: "1px solid #f1f5f9",
    position: "sticky",
    top: 70,
    zIndex: 40,
  },
  tab: {
    flex: 1,
    padding: "15px",
    border: "none",
    background: "transparent",
    fontSize: 10,
    fontWeight: 800,
    color: "#94a3b8",
    transition: "all 0.2s ease",
    cursor: "pointer",
  },
  tabActive: {
    color: "#6366f1",
    borderBottom: "2px solid #6366f1",
  },
  card: {
    background: "#fff",
    borderRadius: 24,
    padding: "20px",
    marginBottom: 16,
    boxShadow: "0 4px 20px rgba(0,0,0,.04)",
    border: "1px solid #f1f5f9",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardId: {
    fontWeight: 900,
    fontSize: 14,
    color: "#0f172a",
  },
  statusPill: {
    fontSize: 9,
    fontWeight: 800,
    padding: "4px 12px",
    borderRadius: 100,
    textTransform: "uppercase",
  },
  transmissionBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: "#fff7ed",
    border: "2px solid #fed7aa",
    borderRadius: 16,
    padding: "12px 14px",
    marginBottom: 14,
  },
  transmissionTitle: {
    fontSize: 10,
    fontWeight: 900,
    color: "#c2410c",
    textTransform: "uppercase",
    margin: "0 0 2px",
  },
  transmissionSub: {
    fontSize: 11,
    fontWeight: 600,
    color: "#475569",
    margin: 0,
    lineHeight: "1.4",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderTop: "1px solid #f1f5f9",
    marginBottom: 15,
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 900,
    color: "#6366f1",
  },
  btnGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  btnPrimary: {
    width: "100%",
    padding: "16px",
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: 16,
    fontWeight: 900,
    fontSize: 13,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.8)",
    backdropFilter: "blur(4px)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    background: "#fff",
    borderRadius: 28,
    padding: "28px 24px",
    width: "100%",
    maxWidth: 340,
    position: "relative",
    textAlign: "center",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "#f1f5f9",
    border: "none",
    borderRadius: 50,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#64748b",
  },
  modalHeader: {
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 900,
    color: "#0f172a",
    margin: "12px 0 4px",
  },
  modalSub: {
    fontSize: 11,
    color: "#64748b",
    margin: 0,
    lineHeight: "1.4",
  },
  qrWrapper: {
    display: "flex",
    justifyContent: "center",
    padding: "20px",
    background: "#f8fafc",
    borderRadius: 24,
    marginBottom: 16,
    border: "1px dashed #e2e8f0",
  },
  qrImg: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  qrUid: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    letterSpacing: 1,
    background: "#f1f5f9",
    padding: "4px 12px",
    borderRadius: 8,
    display: "inline-block",
  },
};