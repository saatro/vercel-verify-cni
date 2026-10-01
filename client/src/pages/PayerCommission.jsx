import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ShieldCheck, ExternalLink, Loader2, ArrowLeft, Wallet } from "lucide-react";
import { db } from "../firebase";

/**
 * Construit une URL Wave marchand à partir d'un numéro ou d'un lien déjà stocké.
 * - Si l'utilisateur a déjà un lien complet (https://pay.wave.com/...) → on l'utilise
 * - Sinon on ouvre le deep-link / page Wave avec le numéro marchand
 */
function buildWaveMerchantUrl(waveRaw) {
  if (!waveRaw) return null;
  const s = String(waveRaw).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^wave:/i.test(s)) return s;

  // Numéro local CI → lien pay.wave (format courant Afrique de l'Ouest)
  let digits = s.replace(/[^0-9]/g, "");
  if (digits.startsWith("225") && digits.length >= 12) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Fallback : page Wave search / transfer (le client choisit le contact)
  // Lien marchand générique — beaucoup de marchands Wave CI utilisent pay.wave.com
  // Si vous avez un ID marchand (M_xxx), stockez l'URL complète dans users.waveMerchantUrl
  return `https://pay.wave.com/m/${digits}`;
}

export default function PayerCommission() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState({
    clientName: "",
    coursierName: "",
    waveUrl: null,
    waveDisplay: "",
    orderId: null,
    amount: 500,
  });

  const orderId = params.get("orderId") || params.get("order") || "";
  const courseId = params.get("courseId") || params.get("course") || "";
  const waveParam = params.get("wave") || params.get("m") || "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        let waveRaw = waveParam || "";
        let coursierName = "Coursier Mambo";
        let clientName = "";
        let resolvedOrderId = orderId || null;
        let amount = 500;

        // 1) Via order
        if (orderId) {
          const orderSnap = await getDoc(doc(db, "orders", orderId));
          if (orderSnap.exists()) {
            const od = orderSnap.data();
            clientName = od.clientName || od.nomClient || "";
            resolvedOrderId = orderSnap.id;
            if (od.coursierId) {
              const cSnap = await getDoc(doc(db, "users", od.coursierId));
              if (cSnap.exists()) {
                const cd = cSnap.data();
                coursierName = cd.nomComplet || cd.nom || cd.prenom || cd.displayName || coursierName;
                waveRaw =
                  waveRaw ||
                  cd.waveMerchantUrl ||
                  cd.waveMerchant ||
                  cd.waveLink ||
                  cd.telephone ||
                  cd.phone ||
                  "";
              }
            }
          }
        }

        // 2) Via course
        if (courseId && !waveRaw) {
          const courseSnap = await getDoc(doc(db, "courses", courseId));
          if (courseSnap.exists()) {
            const c = courseSnap.data();
            if (!resolvedOrderId) resolvedOrderId = c.orderId || c.linkedOrderId || null;
            clientName = clientName || c.thirdPartyName || c.clientName || "";
            const coursierUid = c.assignedCoursierId || c.coursierId;
            if (coursierUid) {
              const cSnap = await getDoc(doc(db, "users", coursierUid));
              if (cSnap.exists()) {
                const cd = cSnap.data();
                coursierName = cd.nomComplet || cd.nom || cd.prenom || coursierName;
                waveRaw =
                  waveRaw ||
                  cd.waveMerchantUrl ||
                  cd.waveMerchant ||
                  cd.waveLink ||
                  cd.telephone ||
                  cd.phone ||
                  "";
              }
            }
          }
        }

        if (!waveRaw) {
          if (!cancelled) {
            setError(
              "Impossible de trouver le numéro Wave du coursier. Contactez l'assistance WhatsApp."
            );
            setLoading(false);
          }
          return;
        }

        const waveUrl = buildWaveMerchantUrl(waveRaw);
        let waveDisplay = String(waveRaw).replace(/[^0-9+]/g, "");
        if (/^https?:\/\//i.test(waveRaw)) waveDisplay = "Lien marchand Wave";

        if (!cancelled) {
          setInfo({
            clientName,
            coursierName,
            waveUrl,
            waveDisplay,
            orderId: resolvedOrderId,
            amount,
          });
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("Erreur de chargement. Réessayez ou contactez l'assistance.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, courseId, waveParam]);

  const assistanceWa = useMemo(() => {
    const phone = "2250778073456";
    const text = info.orderId
      ? `Bonjour Mambo Assistance, voici mon reçu Wave pour la commission de la commande ${info.orderId}.`
      : `Bonjour Mambo Assistance, voici mon reçu Wave pour la commission coursier.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }, [info.orderId]);

  const openWave = () => {
    if (!info.waveUrl) return;
    window.location.href = info.waveUrl;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-slate-50">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-sm font-bold text-slate-500">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-8 bg-gradient-to-b from-slate-50 to-white">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 mb-6 text-sm font-bold text-slate-500"
        >
          <ArrowLeft size={18} /> Retour
        </button>

        <div className="p-6 bg-white border shadow-xl rounded-3xl border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50">
              <ShieldCheck className="text-emerald-600" size={26} />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900">Payer la commission</h1>
              <p className="text-xs font-bold tracking-wider uppercase text-slate-400">
                Coursier : {info.coursierName}
              </p>
            </div>
          </div>

          {error ? (
            <div className="p-4 mb-4 text-sm font-bold border rounded-2xl bg-rose-50 border-rose-100 text-rose-700">
              {error}
            </div>
          ) : (
            <>
              <div className="p-4 mb-5 text-center border rounded-2xl bg-slate-50 border-slate-100">
                <p className="text-[11px] font-black uppercase text-slate-400 mb-1">Montant</p>
                <p className="text-3xl font-black text-emerald-600">{info.amount} F CFA</p>
                {info.waveDisplay && (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Wave marchand : {info.waveDisplay}
                  </p>
                )}
              </div>

              <ol className="mb-6 space-y-2 text-sm list-decimal list-inside text-slate-600">
                <li>Appuyez sur le bouton ci-dessous pour ouvrir Wave</li>
                <li>Validez le paiement de {info.amount} F</li>
                <li>Envoyez le reçu complet à l&apos;assistance WhatsApp</li>
              </ol>

              <button
                onClick={openWave}
                disabled={!info.waveUrl}
                className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50"
              >
                <Wallet size={20} />
                Ouvrir Wave &amp; payer {info.amount} F
                <ExternalLink size={16} />
              </button>

              <a
                href={assistanceWa}
                target="_blank"
                rel="noreferrer"
                className="mt-3 w-full py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase flex items-center justify-center gap-2 active:scale-[0.98] transition"
              >
                Envoyer mon reçu à l&apos;assistance
              </a>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400 font-medium px-4">
          Après validation du reçu par notre IA, le coursier pourra remettre le colis au livreur.
        </p>
      </div>
    </div>
  );
}
