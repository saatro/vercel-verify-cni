/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  addDoc,
  serverTimestamp,
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
  ArrowLeft,
  Store,
  Send,
} from "lucide-react";

const MUTE_KEY = "mambo_vendeur_inbox_muted";

/* ---------- Son de notification (Web Audio, aucun fichier requis) ---------- */
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
    // Carillon à deux notes (ré5 -> la5)
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
    /* blocage éventuel navigateur avant interaction */
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

// Métadonnées contextuelles basées sur le rôle et le texte
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
  return { icon: <User size={16} />, label: "Support / Client", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" };
};

export default function VendeurInbox({ currentOrder, orderId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};

  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [, forceTick] = useState(0);

  const mutedRef = useRef(muted);
  const seenIdsRef = useRef(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  }, [muted]);

  // Déverrouillage audio au premier toucher tactile/clic
  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === "suspended") ctx.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Rafraîchissement des timestamps relatifs
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Extraction de l'ID de commande actif
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
    return localStorage.getItem("mambo_vendeur_last_order_id") || "";
  };

  const activeOrderId = extractOrderId();

  useEffect(() => {
    if (activeOrderId) localStorage.setItem("mambo_vendeur_last_order_id", activeOrderId);
  }, [activeOrderId]);

  // Écoute Firestore (Par receiverId du vendeur + par orderId si sélectionné)
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
      (a, b) => (b.timestamp?.seconds || b.createdAt?.seconds || 0) - (a.timestamp?.seconds || a.createdAt?.seconds || 0)
    );
  }, [byReceiver, byOrder]);

  // Son sur réception de nouveaux messages
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

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !uid) return;
    setIsSending(true);

    try {
      const targetReceiver = selectedMessage?.senderId || "support";
      const targetOrderId = selectedMessage?.orderId || activeOrderId || null;

      await addDoc(collection(db, "inAppMessages"), {
        text: replyText.trim(),
        senderId: uid,
        senderName: auth.currentUser?.displayName || "Vendeur",
        receiverId: targetReceiver,
        orderId: targetOrderId,
        read: false,
        role: "vendeur",
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      setReplyText("");
    } catch (err) {
      console.error("Erreur lors de l'envoi de la réponse vendeur :", err);
    } finally {
      setIsSending(false);
    }
  };

  const filteredMessages = messages.filter((m) => (filter === "unread" ? !m.read : true));

  const grouped = useMemo(() => {
    const groups = [];
    filteredMessages.forEach((m) => {
      const label = dayLabel(m.timestamp || m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    });
    return groups;
  }, [filteredMessages]);

  const headerOrderLabel = activeOrderId
    ? `Commande #${activeOrderId}`
    : messages[0]?.orderId
    ? `Commande #${messages[0].orderId}`
    : `${messages.length} message${messages.length > 1 ? "s" : ""}`;

  return (
    <div style={styles.cardContainer}>
      <style>{`
        @keyframes mamboSpin { to { transform: rotate(360deg); } }
        @keyframes mamboPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(5,150,105,.45); } 50% { box-shadow: 0 0 0 6px rgba(5,150,105,0); } }
        @keyframes mamboSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate(-1)} style={styles.backBtn} title="Retour">
            <ArrowLeft size={18} color="#059669" />
          </button>
          <div style={styles.iconCircle}>
            <Store size={20} color="#059669" />
          </div>
          <div>
            <h3 style={styles.headerTitle}>Messagerie Vendeur</h3>
            <p style={styles.headerSubtitle}>{headerOrderLabel}</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilter(filter === "all" ? "unread" : "all")}
            style={{
              ...styles.filterBtn,
              background: filter === "unread" ? "#059669" : "#f1f5f9",
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

      <div style={styles.bodyLayout}>
        {loading ? (
          <div style={styles.loadingBox}>
            <Loader2 style={{ animation: "mamboSpin 1s linear infinite" }} size={22} color="#059669" />
            <span style={{ fontSize: 13, color: "#64748b" }}>Recherche des messages...</span>
          </div>
        ) : (
          <>
            <div style={styles.listColumn}>
              {filteredMessages.length === 0 ? (
                <div style={styles.emptyState}>
                  <Mail size={36} color="#cbd5e1" />
                  <p style={{ margin: "10px 0 0", fontSize: 14, fontWeight: 600, color: "#64748b" }}>
                    {filter === "unread" ? "Aucun message non lu" : "Aucun message reçu"}
                  </p>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    Les notifications clients, livreurs et support s'afficheront ici.
                  </span>
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.label}>
                    <div style={styles.dayLabel}>{group.label}</div>
                    {group.items.map((msg) => {
                      const isSelected = selectedMessage?.id === msg.id;
                      const isLatest = msg.id === latestId;
                      const meta = getStepMeta(msg);
                      const unread = !msg.read;
                      const msgTime = msg.timestamp || msg.createdAt;

                      return (
                        <div
                          key={msg.id}
                          onClick={() => handleSelectMessage(msg)}
                          style={{
                            ...styles.messageItem,
                            ...(isLatest ? styles.latestItem : {}),
                            backgroundColor: isSelected ? "#ecfdf5" : isLatest ? "#f0fdf4" : unread ? "#fafafa" : "#ffffff",
                            borderLeft: isLatest
                              ? "5px solid #059669"
                              : unread
                              ? "4px solid #34d399"
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
                            </div>
                            <span style={{ fontSize: 11, color: isLatest ? "#047857" : "#94a3b8", fontWeight: isLatest ? 700 : 500, whiteSpace: "nowrap" }}>
                              {formatRelative(msgTime)}
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
                            {msg.senderName || "Mambo Support"}
                          </h4>

                          <p style={{
                            ...styles.previewText,
                            fontSize: isLatest ? 13.5 : 12,
                            fontWeight: isLatest ? 700 : unread ? 600 : 400,
                            color: isLatest ? "#0f172a" : unread ? "#334155" : "#64748b",
                            WebkitLineClamp: isLatest ? 4 : 2,
                          }}>
                            {msg.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {selectedMessage && (
              <div style={styles.detailColumn}>
                <div style={styles.detailHeader}>
                  <div>
                    <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                      Expéditeur
                    </span>
                    <h4 style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                      {selectedMessage.senderName || "Mambo Support"}
                    </h4>
                  </div>
                  <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={13} /> {dayLabel(selectedMessage.timestamp || selectedMessage.createdAt)} · {formatTime(selectedMessage.timestamp || selectedMessage.createdAt)}
                  </span>
                </div>

                <div style={styles.detailBody}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{selectedMessage.text}</p>
                </div>

                <form onSubmit={handleSendReply} style={styles.replyForm}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Répondre au message..."
                    style={styles.replyInput}
                  />
                  <button type="submit" disabled={isSending || !replyText.trim()} style={styles.sendBtn}>
                    {isSending ? <Loader2 size={16} style={{ animation: "mamboSpin 1s linear infinite" }} /> : <Send size={16} />}
                  </button>
                </form>

                <div style={styles.detailFooter}>
                  <button onClick={() => setSelectedMessage(null)} style={styles.closeBtn}>
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
    maxWidth: "900px",
    margin: "0 auto",
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
  backBtn: {
    background: "#ecfdf5",
    border: "none",
    borderRadius: 10,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#d1fae5",
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
  bodyLayout: { display: "flex", flexDirection: "column", minHeight: 280 },
  loadingBox: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 40,
  },
  listColumn: { overflowY: "auto", maxHeight: "60vh", flex: 1 },
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
    boxShadow: "inset 0 0 0 1px #a7f3d0",
  },
  latestPill: {
    background: "#059669",
    color: "#ffffff",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.6,
    padding: "2px 7px",
    borderRadius: 20,
    animation: "mamboPulse 1.8s infinite",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#059669",
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
  detailColumn: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    background: "#f8fafc",
    borderTop: "1px solid #e2e8f0",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 12,
    borderBottom: "1px solid #e2e8f0",
    marginBottom: 16,
    gap: 8,
  },
  detailBody: {
    background: "#ffffff",
    padding: 16,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#334155",
    lineHeight: 1.6,
  },
  replyForm: {
    marginTop: 12,
    display: "flex",
    gap: 8,
  },
  replyInput: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    fontSize: 13,
    outline: "none",
  },
  sendBtn: {
    background: "#059669",
    color: "#ffffff",
    border: "none",
    borderRadius: 10,
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  detailFooter: { marginTop: 14, display: "flex", justifyContent: "flex-end" },
  closeBtn: {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
    cursor: "pointer",
  },
};