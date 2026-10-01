import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { auth, db } from "../firebase";

const WAVE_APP_LINK = "https://pay.wave.com/";
/** Numéro assistance WhatsApp (OCR côté server) — aligné ASSISTANCE_PHONE */
const ASSISTANCE_DISPLAY =
  process.env.REACT_APP_ASSISTANCE_PHONE || "0778073456";
const ASSISTANCE_WA = String(ASSISTANCE_DISPLAY).replace(/\D/g, "").replace(/^225/, "");

function toLocalCiPhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("225") && digits.length >= 12) return "0" + digits.slice(3);
  if (digits.startsWith("0") && digits.length >= 10) return digits.slice(0, 10);
  if (digits.length === 9) return "0" + digits;
  return digits;
}

/**
 * Dédommagement = 1/3 du prix de la course.
 * Le client paie via Wave, partage le reçu à l'assistance WhatsApp.
 * Le serveur (OCR) valide → compensationPaid = true → bouton Annuler actif.
 */
export default function Dedomagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};

  const courseId = state.courseId || state.missionId || null;
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(!!courseId);
  const [isCancelling, setIsCancelling] = useState(false);

  // Écoute temps réel : OCR serveur pose compensationPaid
  useEffect(() => {
    if (!courseId) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "courses", courseId),
      async (snap) => {
        if (!snap.exists()) {
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setCourse(data);
        setLoading(false);

        // Marque la demande de dédommagement pour le serveur OCR
        if (!data.compensationRequested) {
          try {
            const price =
              Number(data.price) ||
              Number(data.finalPrice) ||
              Number(data.proposedPrice) ||
              Number(state.price) ||
              0;
            await updateDoc(doc(db, "courses", courseId), {
              compensationRequested: true,
              compensationRequestedAt: serverTimestamp(),
              compensationExpectedAmount: Math.ceil(price / 3),
              compensationRequestedBy: auth.currentUser?.uid || null,
            });
          } catch (e) {
            console.warn("compensationRequested:", e.message);
          }
        }
      },
      (err) => {
        console.error(err);
        setLoading(false);
        toast.error("Impossible de suivre la course");
      }
    );
    return () => unsub();
  }, [courseId, state.price]);

  const price = useMemo(() => {
    const p =
      Number(course?.price) ||
      Number(course?.finalPrice) ||
      Number(course?.proposedPrice) ||
      Number(state.price) ||
      0;
    return Math.max(0, p);
  }, [course, state.price]);

  const compensation = useMemo(
    () =>
      Number(course?.compensationExpectedAmount) || Math.ceil(price / 3),
    [course, price]
  );

  const receiptValidated = !!(
    course?.compensationPaid ||
    course?.compensationValidated
  );

  const driverPhone = useMemo(() => {
    const raw =
      course?.assignedLivreurPhone ||
      course?.driverPhone ||
      course?.livreurPhone ||
      state.driverPhone ||
      "";
    return toLocalCiPhone(raw) || String(raw || "").trim();
  }, [course, state.driverPhone]);

  const driverWaveMerchant =
    course?.driverWaveMerchant ||
    course?.assignedLivreurWave ||
    state.driverWaveMerchant ||
    null;

  const isMerchantLink =
    typeof driverWaveMerchant === "string" &&
    /^https?:\/\//i.test(driverWaveMerchant);

  const handleCopyPhone = useCallback(async () => {
    if (!driverPhone) {
      toast.error("Numéro livreur indisponible");
      return;
    }
    try {
      await navigator.clipboard.writeText(driverPhone);
      toast.success(`Numéro copié : ${driverPhone}`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = driverPhone;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success(`Numéro copié : ${driverPhone}`);
    }
  }, [driverPhone]);

  const handleOpenWave = useCallback(async () => {
    if (isMerchantLink) {
      window.open(driverWaveMerchant, "_blank", "noopener,noreferrer");
      return;
    }
    await handleCopyPhone();
    window.open(WAVE_APP_LINK, "_blank", "noopener,noreferrer");
    toast.info(
      `Collez le n° livreur dans Wave et déposez ${compensation.toLocaleString()} F`
    );
  }, [isMerchantLink, driverWaveMerchant, handleCopyPhone, compensation]);

  const handleOpenAssistantWhatsApp = useCallback(() => {
    const msg = encodeURIComponent(
      `Dédommagement course ${courseId || ""}\nMontant : ${compensation} F\nJe joins le reçu Wave.`
    );
    const phone = ASSISTANCE_WA.startsWith("225")
      ? ASSISTANCE_WA
      : `225${ASSISTANCE_WA.replace(/^0/, "")}`;
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener,noreferrer");
  }, [courseId, compensation]);

  const handleCancelCourse = useCallback(async () => {
    if (!receiptValidated || !courseId) return;
    setIsCancelling(true);
    try {
      const uid = auth.currentUser?.uid;
      await updateDoc(doc(db, "courses", courseId), {
        status: "cancelled",
        cancelledBy: "client",
        cancelledAt: serverTimestamp(),
        cancelReason: "client_after_compensation",
        compensationPaid: true,
        compensationAmount:
          Number(course?.compensationAmount) || compensation,
        cancelledByUid: uid || null,
      });
      toast.success("Course annulée après dédommagement");
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (e) {
      console.error(e);
      toast.error("Impossible d'annuler la course");
    } finally {
      setIsCancelling(false);
    }
  }, [receiptValidated, courseId, compensation, course, navigate]);

  if (loading) {
    return (
      <div style={S.page}>
        <Loader2 className="animate-spin" size={28} color="#6366f1" />
      </div>
    );
  }

  return (
    <div style={S.page}>
      <ToastContainer position="top-center" autoClose={2800} />

      <header style={S.header}>
        <button type="button" onClick={() => navigate(-1)} style={S.backBtn} aria-label="Retour">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p style={S.kicker}>Annulation après acceptation</p>
          <h1 style={S.title}>Dédommagement</h1>
        </div>
      </header>

      <div style={S.card}>
        <div style={S.alertRow}>
          <ShieldAlert size={22} color="#ea580c" />
          <p style={S.alertText}>
            Un livreur a déjà accepté la course. Pour annuler, versez{" "}
            <strong>1/3 du prix</strong> au livreur via Wave, puis{" "}
            <strong>partagez le reçu Wave</strong> au numéro d&apos;assistance.
            L&apos;OCR validera automatiquement.
          </p>
        </div>

        <div style={S.amountBox}>
          <span style={S.amountLabel}>Montant à verser</span>
          <strong style={S.amountValue}>{compensation.toLocaleString()} F</strong>
          <span style={S.amountSub}>
            Prix course : {price.toLocaleString()} F · 1/3 = {compensation.toLocaleString()} F
          </span>
        </div>

        {/* Étape 1 — Payer le livreur */}
        <p style={S.stepLabel}>1. Payer le livreur sur Wave</p>
        <button type="button" onClick={handleOpenWave} style={S.waveBtn}>
          <Wallet size={18} />
          <span>
            {isMerchantLink
              ? "Payer via Wave marchand"
              : "Copier le n° livreur & ouvrir Wave"}
          </span>
          <ExternalLink size={16} />
        </button>
        {driverPhone && (
          <button type="button" onClick={handleCopyPhone} style={S.copyBtn}>
            <Copy size={16} />
            <span>Copier {driverPhone}</span>
          </button>
        )}

        {/* Étape 2 — Partager le reçu à l'assistance (pas de scan in-app) */}
        <p style={S.stepLabel}>2. Partager le reçu depuis Wave</p>
        <div style={S.waBox}>
          <p style={S.waText}>
            Dans Wave → menu du reçu → <strong>Partager</strong> vers le contact
            assistance <strong>{ASSISTANCE_DISPLAY}</strong>.
            Notre système OCR lit le reçu et valide le dédommagement.
          </p>
          <button type="button" onClick={handleOpenAssistantWhatsApp} style={S.waBtn}>
            <MessageCircle size={18} />
            Ouvrir WhatsApp assistance
          </button>
        </div>

        {/* Statut OCR */}
        <div
          style={{
            ...S.statusBox,
            borderColor: receiptValidated ? "#86efac" : "#e2e8f0",
            background: receiptValidated ? "#f0fdf4" : "#f8fafc",
          }}
        >
          {receiptValidated ? (
            <>
              <CheckCircle2 size={20} color="#16a34a" />
              <span style={{ color: "#15803d", fontWeight: 800, fontSize: 13 }}>
                Reçu validé par OCR — vous pouvez annuler
              </span>
            </>
          ) : (
            <>
              <Loader2 className="animate-spin" size={18} color="#6366f1" />
              <span style={{ color: "#64748b", fontWeight: 700, fontSize: 12 }}>
                En attente du reçu Wave sur le numéro d&apos;assistance…
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          disabled={!receiptValidated || isCancelling}
          onClick={handleCancelCourse}
          style={{
            ...S.cancelBtn,
            background: receiptValidated ? "#dc2626" : "#cbd5e1",
            color: receiptValidated ? "#fff" : "#64748b",
            cursor: receiptValidated ? "pointer" : "not-allowed",
          }}
        >
          {isCancelling ? (
            <Loader2 className="animate-spin" size={18} />
          ) : receiptValidated ? (
            <>
              <CheckCircle2 size={18} />
              Annuler la course
            </>
          ) : (
            "Annuler (reçu OCR requis)"
          )}
        </button>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100dvh",
    background: "#f8fafc",
    padding: "16px 16px 40px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  kicker: {
    margin: 0,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
  },
  card: {
    background: "#fff",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 8px 30px rgba(15,23,42,0.08)",
    border: "1px solid #e2e8f0",
  },
  alertRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 18,
  },
  alertText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: "#7c2d12",
    fontWeight: 600,
  },
  amountBox: {
    background: "linear-gradient(135deg,#fff7ed,#ffedd5)",
    borderRadius: 16,
    padding: "16px 18px",
    marginBottom: 16,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    color: "#c2410c",
    letterSpacing: "0.5px",
  },
  amountValue: {
    fontSize: 28,
    fontWeight: 900,
    color: "#9a3412",
  },
  amountSub: {
    fontSize: 11,
    fontWeight: 600,
    color: "#9a3412",
    opacity: 0.85,
  },
  stepLabel: {
    margin: "0 0 8px",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    color: "#64748b",
  },
  waveBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "14px 16px",
    border: "none",
    borderRadius: 14,
    background: "#1dc4ff",
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 10,
  },
  copyBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    fontWeight: 700,
    fontSize: 12,
    color: "#334155",
    cursor: "pointer",
    marginBottom: 18,
  },
  waBox: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  waText: {
    margin: "0 0 12px",
    fontSize: 12,
    fontWeight: 600,
    color: "#166534",
    lineHeight: 1.45,
  },
  waBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px",
    border: "none",
    borderRadius: 12,
    background: "#25d366",
    color: "#fff",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
  },
  statusBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "14px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    marginBottom: 16,
  },
  cancelBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "15px",
    border: "none",
    borderRadius: 14,
    fontWeight: 900,
    fontSize: 13,
    textTransform: "uppercase",
  },
};
