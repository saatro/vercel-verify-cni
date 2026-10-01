import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Check,
  Banknote,
  Zap,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

/**
 * Arrondi CFA commercial :
 * - toujours un multiple de 100
 * - toujours vers le HAUT (980 → 1000)
 * - plancher absolu : 1500 F
 */
const roundCfa = (n) => Math.max(2000, Math.ceil(Number(n) / 100) * 100);

/**
 * Page de négociation tarifaire assistée (tarifs fortement rehaussés).
 */
export default function Negociation() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = useMemo(() => location.state || {}, [location.state]);

  // Nouveau prix de base de référence (ne se base plus sur l'éco)
  const basePrice = useMemo(
    () => Math.max(2500, Number(state.price) || Number(state.ecoPrice) || 2500),
    [state.price, state.ecoPrice]
  );

  // Grille de tarifs drastiquement rehaussée (que des propositions à la hausse)
  const priceOptions = useMemo(() => {
    return [
      { key: "base", label: "Standard", amount: roundCfa(basePrice), tone: "base", isDefault: true },
      { key: "p20", label: "+20 %", amount: roundCfa(basePrice * 1.2), tone: "up" },
      { key: "p40", label: "+40 %", amount: roundCfa(basePrice * 1.4), tone: "up" },
      { key: "p60", label: "+60 %", amount: roundCfa(basePrice * 1.6), tone: "up" },
      { key: "p80", label: "+80 %", amount: roundCfa(basePrice * 1.8), tone: "up" },
    ];
  }, [basePrice]);

  const [selectedKey, setSelectedKey] = useState("base");
  const [wantArret, setWantArret] = useState(false);
  const [customPrice, setCustomPrice] = useState("");

  const optionsCount = wantArret ? 1 : 0;

  // Si une option est cochée, on bloque le tarif Standard pour forcer une hausse
  const disabledKeys = useMemo(() => {
    if (optionsCount >= 1) return new Set(["base"]);
    return new Set();
  }, [optionsCount]);

  // Le minimum autorisé ne peut plus descendre sous le prix Standard
  const minAllowed = useMemo(() => {
    if (optionsCount >= 1) return roundCfa(basePrice * 1.2); // Minimum +20% si option
    return roundCfa(basePrice); // Plancher = Prix Standard
  }, [optionsCount, basePrice]);

  useEffect(() => {
    if (customPrice) return;
    if (disabledKeys.has(selectedKey) || !selectedKey) {
      const fallback =
        priceOptions.find((o) => !disabledKeys.has(o.key))?.key || "p20";
      setSelectedKey(fallback);
    }
  }, [disabledKeys, selectedKey, customPrice, priceOptions]);

  const selectedAmount = useMemo(() => {
    if (customPrice && parseInt(customPrice, 10) > 0) {
      return parseInt(customPrice, 10);
    }
    const opt = priceOptions.find((o) => o.key === selectedKey);
    return opt?.amount || basePrice;
  }, [customPrice, selectedKey, priceOptions, basePrice]);

  const handleToggleArret = (checked) => {
    setWantArret(checked);
    setCustomPrice("");
  };

  const handleConfirm = useCallback(() => {
    if (selectedAmount < 1500) {
      toast.error("Montant minimum absolu : 1500 F");
      return;
    }
    if (selectedAmount < minAllowed) {
      toast.error(
        optionsCount >= 1
          ? `Avec option(s), le minimum est de ${minAllowed.toLocaleString()} F`
          : `Le montant libre ne peut être inférieur à ${minAllowed.toLocaleString()} F`
      );
      return;
    }

    navigate("/confirmation", {
      state: {
        ...state,
        price: basePrice,
        proposedPrice: selectedAmount,
        isNegoActive: selectedAmount !== basePrice || wantArret,
        isArrangement: true,
        wantArret,
        negotiationSource: "negociation_page",
        requireWaveValidation: true,
      },
      replace: false,
    });
  }, [
    navigate,
    state,
    basePrice,
    selectedAmount,
    wantArret,
    minAllowed,
    optionsCount,
  ]);

  const assistHint =
    optionsCount >= 1
      ? "Option activée : le tarif Standard est désactivé"
      : null;

  return (
    <div style={S.page}>
      <ToastContainer position="top-center" autoClose={2500} />

      <div style={S.scrollArea}>
        <header style={S.header}>
          <button type="button" onClick={() => navigate(-1)} style={S.back} aria-label="Retour">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p style={S.kicker}>Négociation assistée</p>
            <h1 style={S.title}>Votre prix</h1>
          </div>
        </header>

        {(state.destination || state.dropoffAddress) && (
          <div style={S.destRow}>
            <MapPin size={16} color="#f35416" />
            <span style={S.destText}>
              {state.destination || state.dropoffAddress}
              {state.distanceKm ? ` · ${Number(state.distanceKm).toFixed(1)} km` : ""}
            </span>
          </div>
        )}

        <div style={S.refBox}>
          <Zap size={16} color="#f35416" fill="#f35416" />
          <div>
            <p style={S.refLabel}>Référence tarifaire</p>
            <p style={S.refValue}>{basePrice.toLocaleString()} F CFA</p>
          </div>
        </div>

        <p style={S.sectionTitle}>Choisissez un tarif</p>
        {assistHint && <p style={S.assistHint}>{assistHint}</p>}

        <div style={S.grid}>
          {priceOptions.map((opt) => {
            const disabled = disabledKeys.has(opt.key);
            const active = !disabled && !customPrice && selectedKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setSelectedKey(opt.key);
                  setCustomPrice("");
                }}
                style={{
                  ...S.priceCard,
                  opacity: disabled ? 0.35 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                  borderColor: active ? "#f35416" : "#e2e8f0",
                  background: disabled
                    ? "#f1f5f9"
                    : active
                      ? opt.tone === "down"
                        ? "#fff7ed"
                        : opt.tone === "up"
                          ? "#f0fdf4"
                          : "#eef2ff"
                      : "#fff",
                  boxShadow: active ? "0 8px 20px rgba(243,84,22,0.15)" : "none",
                }}
              >
                <span
                  style={{
                    ...S.priceLabel,
                    color: disabled
                      ? "#94a3b8"
                      : opt.tone === "down"
                        ? "#ea580c"
                        : opt.tone === "up"
                          ? "#16a34a"
                          : "#4f46e5",
                  }}
                >
                  {opt.label}
                </span>
                <strong style={{ ...S.priceAmount, color: disabled ? "#94a3b8" : "#0f172a" }}>
                  {opt.amount.toLocaleString()} F
                </strong>
                {opt.isDefault && !disabled && (
                  <span style={S.badgeDefault}>Défaut</span>
                )}
                {disabled && <span style={S.badgeLocked}>Verrouillé</span>}
                {active && (
                  <span style={S.check}>
                    <Check size={14} color="#fff" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p style={S.sectionTitle}>Ou montant libre</p>
        <div style={S.customRow}>
          <Banknote size={18} color="#64748b" />
          <input
            type="number"
            inputMode="numeric"
            placeholder={`Min. ${minAllowed.toLocaleString()} F`}
            value={customPrice}
            onChange={(e) => {
              setCustomPrice(e.target.value);
              if (e.target.value) setSelectedKey("");
            }}
            style={S.customInput}
          />
          <span style={S.currency}>F</span>
        </div>
        {optionsCount > 0 && (
          <p style={S.minHint}>
            Minimum avec option :{" "}
            <strong>{minAllowed.toLocaleString()} F</strong>
          </p>
        )}

        <p style={S.sectionTitle}>Options</p>
        <div style={S.options}>
          <label style={S.option}>
            <input
              type="checkbox"
              checked={wantArret}
              onChange={(e) => handleToggleArret(e.target.checked)}
              style={S.checkbox}
            />
            <MapPin size={18} color={wantArret ? "#f35416" : "#94a3b8"} />
            <div>
              <strong style={S.optTitle}>Arrêt(s)</strong>
              <p style={S.optSub}>Arrêts intermédiaires possibles</p>
            </div>
          </label>
        </div>
      </div>

      <div style={S.footer}>
        <div style={S.summary}>
          <span style={S.summaryLabel}>Vous proposez</span>
          <strong style={S.summaryPrice}>{selectedAmount.toLocaleString()} F</strong>
          {wantArret && (
            <span style={S.summaryOpts}>Arrêt</span>
          )}
        </div>
        <button type="button" onClick={handleConfirm} style={S.confirmBtn}>
          Valider et continuer
        </button>
      </div>
    </div>
  );
}

const S = {
  page: {
    height: "100dvh",
    maxHeight: "100dvh",
    background: "#f8fafc",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "16px 16px 24px",
    paddingBottom: 8,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  back: {
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
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
  },
  destRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    marginBottom: 14,
  },
  destText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  refBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    background: "linear-gradient(135deg,#fff7ed,#ffedd5)",
    borderRadius: 16,
    marginBottom: 20,
  },
  refLabel: {
    margin: 0,
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    color: "#c2410c",
  },
  refValue: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#9a3412",
  },
  sectionTitle: {
    margin: "0 0 10px",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    color: "#64748b",
  },
  assistHint: {
    margin: "-4px 0 12px",
    fontSize: 11,
    fontWeight: 700,
    color: "#c2410c",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: 10,
    padding: "8px 12px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 8,
    marginBottom: 16,
  },
  priceCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    padding: "8px 6px",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    textAlign: "left",
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  priceAmount: {
    fontSize: 12,
    fontWeight: 900,
    color: "#0f172a",
  },
  badgeDefault: {
    fontSize: 8,
    fontWeight: 800,
    color: "#4f46e5",
    background: "#e0e7ff",
    padding: "2px 5px",
    borderRadius: 6,
  },
  badgeLocked: {
    fontSize: 8,
    fontWeight: 800,
    color: "#94a3b8",
    background: "#e2e8f0",
    padding: "2px 5px",
    borderRadius: 6,
  },
  check: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#f35416",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  customRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    marginBottom: 6,
  },
  customInput: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: 14,
    fontWeight: 900,
    color: "#0f172a",
    background: "transparent",
  },
  currency: {
    fontSize: 12,
    fontWeight: 800,
    color: "#94a3b8",
  },
  minHint: {
    margin: "0 0 14px",
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
  },
  options: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 10,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    cursor: "pointer",
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: "#f35416",
  },
  optTitle: {
    display: "block",
    fontSize: 13,
    fontWeight: 800,
    color: "#0f172a",
  },
  optSub: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    color: "#94a3b8",
  },
  footer: {
    flexShrink: 0,
    padding: "10px 16px max(12px, env(safe-area-inset-bottom))",
    background: "rgba(255,255,255,0.98)",
    backdropFilter: "blur(12px)",
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    boxShadow: "0 -8px 24px rgba(15,23,42,0.06)",
  },
  summary: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap",
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
  },
  summaryPrice: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
  },
  summaryOpts: {
    fontSize: 11,
    fontWeight: 700,
    color: "#f35416",
  },
  confirmBtn: {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: 14,
    background: "#0f172a",
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    cursor: "pointer",
  },
};