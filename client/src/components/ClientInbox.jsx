/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  limit,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  Inbox,
  Mail,
  Clock,
  Loader2,
  Sparkles,
  Truck,
  User,
  Filter,
  AlertCircle,
  Volume2,
  VolumeX,
  CheckCheck,
  CheckCircle2,
  MapPin,
  UserCheck,
  PackageCheck,
  Package,
  ChevronDown,
  ChevronUp,
  History,
  X,
  ExternalLink,
} from "lucide-react";

const MUTE_KEY = "mambo_inbox_muted";

/* ---------- Son de notification (Web Audio) ---------- */
let sharedAudioCtx = null;
const getAudioCtx = () => {
  try {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    return sharedAudioCtx;
  } catch (e) {
    return null;
  }
};

const playNotificationSound = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    [
      { f: 587.33, t: 0, d: 0.16 },
      { f: 880, t: 0.14, d: 0.28 },
    ].forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.18, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    });
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  } catch (e) {
    /* le navigateur peut bloquer le son */
  }
};

/* ---------- Helpers d'affichage ---------- */
const toDate = (ts) => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return null;
};

const formatTime = (ts) => {
  const d = toDate(ts);
  if (!d) return "À l'instant";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const formatRelative = (ts) => {
  const d = toDate(ts);
  if (!d) return "À l'instant";
  const diff = Math.max(0, Date.now() - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " + formatTime(ts);
};

const dayLabel = (ts) => {
  const d = toDate(ts);
  if (!d) return "Aujourd'hui";
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Aujourd'hui";
  if (same(d, yest)) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};

const getStepMeta = (msg) => {
  const t = (msg.text || "").toLowerCase();
  if (t.includes("livrée") || t.includes("livree"))
    return { icon: <CheckCircle2 size={16} />, label: "Livrée", bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" };
  if (t.includes("en route") || t.includes("récupéré") || t.includes("recupere") || t.includes("pris la route"))
    return { icon: <Truck size={16} />, label: "En route", bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" };
  if (t.includes("arrivé") || t.includes("arrive"))
    return { icon: <MapPin size={16} />, label: "Au ramassage", bg: "#faf5ff", color: "#9333ea", border: "#e9d5ff" };
  if (t.includes("pris en charge") || t.includes("accepté") || t.includes("accepte"))
    return { icon: <UserCheck size={16} />, label: "Livreur assigné", bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" };
  if (t.includes("enregistrée") || t.includes("enregistree"))
    return { icon: <PackageCheck size={16} />, label: "Commande reçue", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" };
  const role = msg.role || msg.senderRole;
  if (role === "livreur" || msg.senderId?.includes("driver"))
    return { icon: <Truck size={16} />, label: "Livreur", bg: "#fefce8", color: "#ca8a04", border: "#fef08a" };
  if (role === "system" || msg.senderId === "system_mambo")
    return { icon: <Sparkles size={16} />, label: "Système", bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" };
  return { icon: <User size={16} />, label: "Support", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" };
};

/* ---------- Sous-composant pour le corps du détail avec carte article (CORRIGÉ) ---------- */
function DetailBodyWrapper({ selectedMessage, activeOrderId }) {
  const [orderDetails, setOrderDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const isPaymentMsg =
    selectedMessage.text?.toLowerCase().includes("règlement") ||
    selectedMessage.text?.toLowerCase().includes("reglement") ||
    selectedMessage.text?.toLowerCase().includes("vendeur via wave") ||
    selectedMessage.text?.toLowerCase().includes("payer");

  // Extraction d'orderId
  const extractedOrderId = useMemo(() => {
    if (selectedMessage.orderId) return selectedMessage.orderId;
    if (activeOrderId) return activeOrderId;
    const match = selectedMessage.text?.match(/MG-[A-Z0-9-]+/i);
    return match ? match[0] : "";
  }, [selectedMessage, activeOrderId]);

  const courseId = selectedMessage.courseId || "";

  useEffect(() => {
    let active = true;
    async function fetchOrderInfo() {
      if (!isPaymentMsg) return;
      setLoadingDetails(true);

      try {
        let name = "Article commandé";
        let image = null;
        let price = 0;
        let boutique = "";
        let description = "";
        let stock = null;
        let type = "";

        // 1. Récupération prioritaire et exacte de la commande.
        // Le code lisible (ex: MG-COD-D9HGI0) n'est JAMAIS l'ID du document
        // Firestore (celui-ci est auto-généré par addDoc) : c'est un simple
        // champ `orderId` à l'intérieur du document. On tente donc, dans
        // l'ordre : l'ID exact du document s'il a été transmis dans le
        // message (orderDocId), puis une recherche par le champ `orderId`.
        let snap = null;
        if (selectedMessage.orderDocId) {
          const direct = await getDoc(doc(db, "orders", selectedMessage.orderDocId));
          if (direct.exists()) snap = direct;
        }
        if (!snap && extractedOrderId) {
          const matchQuery = query(
            collection(db, "orders"),
            where("orderId", "==", extractedOrderId),
            limit(1)
          );
          const matchSnap = await getDocs(matchQuery);
          if (!matchSnap.empty) snap = matchSnap.docs[0];
        }
        if (snap && snap.exists()) {
            const data = snap.data();

            // Structure avec un tableau items (ex: Dynace Collagène)
            if (Array.isArray(data.items) && data.items.length > 0) {
              const firstItem = data.items[0];

              name = data.items
                .map((i) => i.nom || i.name || i.title)
                .filter(Boolean)
                .join(", ");

              image =
                firstItem?.image ||
                firstItem?.imageUrl ||
                firstItem?.photo ||
                (firstItem?.images && firstItem?.images[0]) ||
                null;

              price = Number(
                firstItem?.prix ||
                firstItem?.price ||
                data.prixArticle ||
                data.amount ||
                data.totalAmount ||
                price
              );

              description = firstItem?.description || data.description || "";
              boutique = firstItem?.nomBoutique || data.nomBoutique || data.vendorName || "";
              type = firstItem?.type || firstItem?.categorie || data.type || "";
            } else {
              // Structure à plat
              name =
                data.articleName ||
                data.nomArticle ||
                data.nom ||
                data.designation ||
                name;

              image =
                data.articleImage ||
                data.imageUrl ||
                data.image ||
                (data.images && data.images[0]) ||
                null;

              price = Number(
                data.prixArticle || data.amount || data.totalAmount || data.prix || price
              );
              boutique = data.nomBoutique || data.vendorName || "";
              description = data.description || "";
              type = data.type || data.categorie || "";
            }
        }

        // 2. Fallback avec la collection "courses" si les détails manquent
        if (courseId && (!price || name === "Article commandé")) {
          const snapC = await getDoc(doc(db, "courses", courseId));
          if (snapC.exists()) {
            const cData = snapC.data();
            price =
              Number(
                cData.montantArticles ||
                cData.prixArticle ||
                cData.articlePrice ||
                cData.amount ||
                price
              );
            name =
              name !== "Article commandé"
                ? name
                : cData.articleName || cData.nomArticle || cData.nom || name;
            image =
              image ||
              cData.articleImage ||
              cData.imageUrl ||
              cData.image ||
              null;
            boutique = boutique || cData.nomBoutique || "";
            description = description || cData.description || "";
            type = type || cData.type || cData.categorie || "";
          }
        }

        // Dernier recours seulement : si ni la commande ni la course n'ont donné de montant,
        // on tente d'extraire un chiffre du texte du message (peu fiable, à éviter si possible).
        if (!price) {
          const textMatch = selectedMessage.text?.match(/(\d[\d\s]*)\s*(FCFA|F CFA|F)/i);
          if (textMatch) {
            price = parseInt(textMatch[1].replace(/\s+/g, ""), 10) || 0;
          }
        }

        if (active) {
          setOrderDetails({ name, image, price, boutique, description, stock, type });
          setLoadingDetails(false);
        }
      } catch (err) {
        console.warn("Erreur de chargement des détails :", err);
        if (active) setLoadingDetails(false);
      }
    }

    fetchOrderInfo();
    return () => {
      active = false;
    };
  }, [isPaymentMsg, extractedOrderId, courseId, selectedMessage.text, selectedMessage.orderDocId]);

  return (
    <div style={styles.detailBody}>
      {/* Texte original de la notification */}
      <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "#1e293b" }}>
        {selectedMessage.text}
      </p>

      {/* Carte du produit & Règlement */}
      {isPaymentMsg && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          {loadingDetails ? (
            <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
              Chargement des détails de la commande...
            </div>
          ) : orderDetails ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 14,
                backgroundColor: "#f8fafc",
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                {orderDetails.image ? (
                  <img
                    src={orderDetails.image}
                    alt={orderDetails.name}
                    style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 10,
                      backgroundColor: "#e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748b",
                      flexShrink: 0,
                    }}
                  >
                    <Package size={28} />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                      Article à régler
                    </span>
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                    {orderDetails.name}
                  </div>

                  {orderDetails.boutique && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 2 }}>
                      Vendeur : <strong>{orderDetails.boutique}</strong>
                    </div>
                  )}

                  <div style={{ fontSize: 14, fontWeight: 800, color: "#059669", marginTop: 4 }}>
                    Montant : {orderDetails.price > 0 ? `${orderDetails.price.toLocaleString("fr-FR")} F CFA` : "Non spécifié"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Bouton avec le prix exact ou général */}
          <button
            onClick={() => {
              window.location.href = `/payer-vendeur?orderId=${extractedOrderId}&courseId=${courseId}`;
            }}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              backgroundColor: "#059669",
              color: "#ffffff",
              fontWeight: "800",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            💳 Régler {orderDetails?.price > 0 ? `${orderDetails.price.toLocaleString("fr-FR")} F CFA` : "l'article"} via Wave
            <ExternalLink size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ClientInbox({ currentOrder, orderId }) {
  const location = useLocation();
  const state = location.state || {};

  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [showHistory, setShowHistory] = useState(false);
  const [, forceTick] = useState(0);

  const mutedRef = useRef(muted);
  const seenIdsRef = useRef(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  }, [muted]);

  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === "suspended") ctx.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const extractOrderId = () => {
    if (typeof orderId === "string" && orderId.trim()) return orderId.trim();
    const obj = currentOrder || state.currentOrder || state;
    if (typeof obj === "string" && obj.trim()) return obj.trim();
    if (typeof obj === "object" && obj !== null) {
      if (obj.orderId) return String(obj.orderId);
      if (obj.orderReference) return String(obj.orderReference);
      if (obj.id) return String(obj.id);
      if (obj.codeCommande) return String(obj.codeCommande);
    }
    return localStorage.getItem("mambo_last_order_id") || "";
  };

  const activeOrderId = extractOrderId();

  useEffect(() => {
    if (activeOrderId) localStorage.setItem("mambo_last_order_id", activeOrderId);
  }, [activeOrderId]);

  const [uid, setUid] = useState(auth.currentUser?.uid || null);
  const [byReceiver, setByReceiver] = useState([]);
  const [byOrder, setByOrder] = useState([]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUid(u?.uid || null);
      if (!u) setLoading(false);
    });
    return () => unsub();
  }, []);

  const toList = (snapshot) => snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const q = query(collection(db, "inAppMessages"), where("receiverId", "==", uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setByReceiver(toList(snapshot));
        setLoading(false);
      },
      (error) => {
        console.error("Erreur Firestore inAppMessages (receiverId) :", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!activeOrderId) {
      setByOrder([]);
      return;
    }
    const q = query(collection(db, "inAppMessages"), where("orderId", "==", activeOrderId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setByOrder(toList(snapshot)),
      (error) => console.warn("Erreur Firestore inAppMessages (orderId) :", error)
    );
    return () => unsubscribe();
  }, [activeOrderId]);

  useEffect(() => {
    if (!uid && !activeOrderId) setLoading(false);
  }, [uid, activeOrderId]);

  const messages = useMemo(() => {
    const map = new Map();
    [...byReceiver, ...byOrder].forEach((m) => map.set(m.id, m));
    return Array.from(map.values()).sort(
      (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)
    );
  }, [byReceiver, byOrder]);

  useEffect(() => {
    if (loading) return;
    if (!seededRef.current) {
      messages.forEach((m) => seenIdsRef.current.add(m.id));
      seededRef.current = true;
      return;
    }
    const fresh = messages.filter((m) => !seenIdsRef.current.has(m.id));
    if (fresh.length > 0) {
      fresh.forEach((m) => seenIdsRef.current.add(m.id));
      if (!mutedRef.current && fresh.some((m) => !m.read)) playNotificationSound();
    }
  }, [messages, loading]);

  const latestId = messages[0]?.id || null;

  const handleSelectMessage = async (msg) => {
    setSelectedMessage(msg);
    if (!msg.read) {
      try {
        await updateDoc(doc(db, "inAppMessages", msg.id), { read: true });
      } catch (err) {
        console.warn("Impossible de marquer comme lu :", err);
      }
    }
  };

  const unreadMessages = useMemo(() => messages.filter((m) => !m.read), [messages]);
  const unreadCount = unreadMessages.length;

  const markAllAsRead = useCallback(async () => {
    if (unreadMessages.length === 0) return;
    try {
      const batch = writeBatch(db);
      unreadMessages.slice(0, 450).forEach((m) => {
        batch.update(doc(db, "inAppMessages", m.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.warn("Impossible de tout marquer comme lu :", err);
    }
  }, [unreadMessages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => (filter === "unread" ? !m.read : true));
  }, [messages, filter]);

  const { currentOrderMessages, pastOrdersMessages } = useMemo(() => {
    const current = [];
    const past = [];

    filteredMessages.forEach((msg) => {
      if (activeOrderId && msg.orderId && String(msg.orderId) !== String(activeOrderId)) {
        past.push(msg);
      } else {
        current.push(msg);
      }
    });

    return { currentOrderMessages: current, pastOrdersMessages: past };
  }, [filteredMessages, activeOrderId]);

  const groupMessagesByDay = (msgList) => {
    const groups = [];
    msgList.forEach((m) => {
      const label = dayLabel(m.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    });
    return groups;
  };

  const currentGrouped = useMemo(() => groupMessagesByDay(currentOrderMessages), [currentOrderMessages]);
  const pastGrouped = useMemo(() => groupMessagesByDay(pastOrdersMessages), [pastOrdersMessages]);

  const renderMessageCard = (msg) => {
    const isLatest = msg.id === latestId;
    const meta = getStepMeta(msg);
    const unread = !msg.read;

    return (
      <div
        key={msg.id}
        onClick={() => handleSelectMessage(msg)}
        style={{
          ...styles.messageItem,
          ...(isLatest ? styles.latestItem : {}),
          backgroundColor: isLatest ? "#f0f9ff" : unread ? "#fafafa" : "#ffffff",
          borderLeft: isLatest
            ? "5px solid #0284c7"
            : unread
            ? "4px solid #38bdf8"
            : "4px solid transparent",
          animation: isLatest ? "mamboSlideIn .35s ease-out" : undefined,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ ...styles.badgeTag, background: meta.bg, color: meta.color, borderColor: meta.border }}>
              {meta.icon} {meta.label}
            </span>
            {isLatest && <span style={styles.latestPill}>DERNIER</span>}
            {msg.orderId && msg.orderId !== activeOrderId && (
              <span style={styles.orderTag}>#{msg.orderId}</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: isLatest ? "#0369a1" : "#94a3b8", fontWeight: isLatest ? 700 : 500, whiteSpace: "nowrap" }}>
            {formatRelative(msg.timestamp)}
          </span>
        </div>

        <h4 style={{
          margin: "0 0 4px 0",
          fontSize: isLatest ? 14 : 13,
          fontWeight: isLatest ? 800 : unread ? 700 : 600,
          color: isLatest || unread ? "#0f172a" : "#334155",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          {unread && <span style={styles.unreadDot} />}
          {msg.senderName || "Mambo Express"}
        </h4>

        <p style={{
          ...styles.previewText,
          fontSize: isLatest ? 13.5 : 12,
          fontWeight: isLatest ? 700 : unread ? 600 : 400,
          color: isLatest ? "#0f172a" : unread ? "#334155" : "#64748b",
          WebkitLineClamp: isLatest ? 3 : 2,
        }}>
          {msg.text}
        </p>
      </div>
    );
  };

  const headerOrderLabel = activeOrderId
    ? `Commande #${activeOrderId}`
    : messages[0]?.orderId
    ? `Commande #${messages[0].orderId}`
    : `${messages.length} message${messages.length > 1 ? "s" : ""}`;

  return (
    <div style={styles.cardContainer}>
      <style>{`
        @keyframes mamboSpin { to { transform: rotate(360deg); } }
        @keyframes mamboPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(2,132,199,.45); } 50% { box-shadow: 0 0 0 6px rgba(2,132,199,0); } }
        @keyframes mamboSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mamboFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mamboDrawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      {/* En-tête */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={styles.iconCircle}>
            <Inbox size={20} color="#0284c7" />
          </div>
          <div>
            <h3 style={styles.headerTitle}>Messages & Notifications</h3>
            <p style={styles.headerSubtitle}>{headerOrderLabel}</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilter(filter === "all" ? "unread" : "all")}
            style={{
              ...styles.filterBtn,
              background: filter === "unread" ? "#0284c7" : "#f1f5f9",
              color: filter === "unread" ? "#ffffff" : "#475569",
            }}
          >
            <Filter size={13} />
            {filter === "unread" ? "Non lus" : "Tous"}
          </button>

          <button
            onClick={() => setMuted((m) => !m)}
            title={muted ? "Activer le son" : "Couper le son"}
            aria-label={muted ? "Activer le son" : "Couper le son"}
            style={{ ...styles.filterBtn, background: muted ? "#fee2e2" : "#f1f5f9", color: muted ? "#b91c1c" : "#475569" }}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          {unreadCount > 0 && (
            <>
              <button onClick={markAllAsRead} style={styles.filterBtn} title="Tout marquer comme lu">
                <CheckCheck size={14} /> Tout lire
              </button>
              <span style={styles.unreadBadge}>
                {unreadCount} nouveau{unreadCount > 1 ? "x" : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {!uid && !activeOrderId && (
        <div style={{ padding: 12, background: "#fef2f2", borderBottom: "1px solid #fee2e2", color: "#991b1b", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={16} color="#dc2626" />
          <span>Connectez-vous pour consulter vos messages.</span>
        </div>
      )}

      {/* Liste des Messages */}
      <div style={styles.bodyLayout}>
        {loading ? (
          <div style={styles.loadingBox}>
            <Loader2 style={{ animation: "mamboSpin 1s linear infinite" }} size={22} color="#0284c7" />
            <span style={{ fontSize: 13, color: "#64748b" }}>Recherche des messages...</span>
          </div>
        ) : (
          <div style={styles.listColumn}>
            {filteredMessages.length === 0 ? (
              <div style={styles.emptyState}>
                <Mail size={36} color="#cbd5e1" />
                <p style={{ margin: "10px 0 0", fontSize: 14, fontWeight: 600, color: "#64748b" }}>
                  {filter === "unread" ? "Aucun message non lu" : "Aucun message reçu"}
                </p>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  Les mises à jour de votre livraison s'afficheront ici.
                </span>
              </div>
            ) : (
              <>
                {/* Messages de la commande active */}
                {currentGrouped.map((group) => (
                  <div key={group.label}>
                    <div style={styles.dayLabel}>{group.label}</div>
                    {group.items.map(renderMessageCard)}
                  </div>
                ))}

                {/* Anciennes commandes (Accordéon) */}
                {pastOrdersMessages.length > 0 && (
                  <div style={styles.historyContainer}>
                    <button
                      onClick={() => setShowHistory((prev) => !prev)}
                      style={styles.historyToggleBtn}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <History size={16} color="#64748b" />
                        <span>
                          {showHistory ? "Masquer les anciennes commandes" : "Voir les messages des commandes précédentes"}
                        </span>
                        <span style={styles.historyCountPill}>{pastOrdersMessages.length}</span>
                      </div>
                      {showHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {showHistory && (
                      <div style={styles.historyContent}>
                        {pastGrouped.map((group) => (
                          <div key={`past-${group.label}`}>
                            <div style={{ ...styles.dayLabel, background: "#f1f5f9" }}>{group.label}</div>
                            {group.items.map(renderMessageCard)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* PANNEAU LATÉRAL DE DÉTAIL (DRAWER MODAL) */}
      {selectedMessage && (
        <div style={styles.modalOverlay} onClick={() => setSelectedMessage(null)}>
          <div style={styles.drawerContainer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {(() => {
                  const meta = getStepMeta(selectedMessage);
                  return (
                    <span style={{ ...styles.badgeTag, background: meta.bg, color: meta.color, borderColor: meta.border }}>
                      {meta.icon} {meta.label}
                    </span>
                  );
                })()}
                {selectedMessage.orderId && (
                  <span style={styles.orderTag}>Commande #{selectedMessage.orderId}</span>
                )}
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                style={styles.closeIconButton}
                title="Fermer le message"
              >
                <X size={20} color="#64748b" />
              </button>
            </div>

            <div style={styles.drawerContent}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                  Expéditeur
                </span>
                <h3 style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
                  {selectedMessage.senderName || "Mambo Express"}
                </h3>
                <span style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Clock size={13} /> {dayLabel(selectedMessage.timestamp)} à {formatTime(selectedMessage.timestamp)}
                </span>
              </div>

              <DetailBodyWrapper selectedMessage={selectedMessage} activeOrderId={activeOrderId} />
            </div>

            <div style={styles.drawerFooter}>
              <button onClick={() => setSelectedMessage(null)} style={styles.drawerCloseBtn}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  cardContainer: {
    background: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
    overflow: "hidden",
    margin: "0 auto",
    width: "100%",
    position: "relative",
  },
  header: {
    padding: "16px 20px",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#e0f2fe",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" },
  headerSubtitle: { margin: 0, fontSize: 12, color: "#64748b", fontWeight: 500 },
  filterBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "#f1f5f9",
    color: "#475569",
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  unreadBadge: {
    background: "#ef4444",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 8px",
    borderRadius: 20,
  },
  bodyLayout: {
    display: "flex",
    flexDirection: "column",
  },
  loadingBox: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 40,
  },
  listColumn: {
    overflowY: "auto",
    maxHeight: "75vh",
  },
  dayLabel: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    padding: "6px 18px",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#64748b",
    background: "#f8fafc",
    borderBottom: "1px solid #eef2f6",
  },
  emptyState: {
    padding: 40,
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  messageItem: {
    padding: "14px 18px",
    borderBottom: "1px solid #f1f5f9",
    cursor: "pointer",
    transition: "background .2s",
  },
  latestItem: {
    padding: "16px 18px",
    boxShadow: "inset 0 0 0 1px #bae6fd",
  },
  latestPill: {
    background: "#0284c7",
    color: "#ffffff",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.6,
    padding: "2px 7px",
    borderRadius: 20,
    animation: "mamboPulse 1.8s infinite",
  },
  orderTag: {
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    border: "1px solid #cbd5e1",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#0284c7",
    display: "inline-block",
    flexShrink: 0,
  },
  badgeTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid",
  },
  previewText: {
    margin: 0,
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  historyContainer: {
    borderTop: "2px dashed #e2e8f0",
  },
  historyToggleBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 18px",
    backgroundColor: "#f8fafc",
    border: "none",
    borderBottom: "1px solid #e2e8f0",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  historyCountPill: {
    backgroundColor: "#cbd5e1",
    color: "#334155",
    fontSize: 10,
    fontWeight: 800,
    padding: "2px 6px",
    borderRadius: 10,
  },
  historyContent: {
    backgroundColor: "#fafafa",
  },

  /* STYLES PANNEAU LATÉRAL / MODALE DÉDIÉE */
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    backdropFilter: "blur(4px)",
    zIndex: 9999,
    display: "flex",
    justifyContent: "flex-end",
    animation: "mamboFadeIn 0.2s ease-out",
  },
  drawerContainer: {
    width: "100%",
    maxWidth: "480px",
    height: "100%",
    backgroundColor: "#ffffff",
    boxShadow: "-4px 0 25px rgba(0, 0, 0, 0.15)",
    display: "flex",
    flexDirection: "column",
    animation: "mamboDrawerSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  drawerHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
  },
  closeIconButton: {
    background: "transparent",
    border: "none",
    padding: 6,
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
  },
  drawerContent: {
    padding: "20px",
    flex: 1,
    overflowY: "auto",
  },
  detailBody: {
    background: "#f8fafc",
    padding: 18,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
  },
  drawerFooter: {
    padding: "16px 20px",
    borderTop: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    display: "flex",
    justifyContent: "flex-end",
  },
  drawerCloseBtn: {
    background: "#0284c7",
    color: "#ffffff",
    border: "none",
    padding: "10px 20px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
  },
};