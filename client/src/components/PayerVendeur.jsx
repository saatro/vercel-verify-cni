import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { ShieldCheck, ExternalLink, Loader2, ArrowLeft, Wallet, ShoppingBag, Truck, Package } from "lucide-react";
import { db } from "../firebase";

function buildWaveMerchantUrl(waveRaw) {
  if (!waveRaw) return null;
  const s = String(waveRaw).trim();
  if (/^https?:\/\//i.test(s) || /^wave:/i.test(s)) return s;

  let digits = s.replace(/[^0-9]/g, "");
  if (digits.startsWith("225") && digits.length >= 12) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);

  return `https://pay.wave.com/m/${digits}`;
}

export default function PayerVendeur() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState({
    clientName: "",
    vendeurName: "",
    waveUrl: null,
    waveDisplay: "",
    orderId: null,
    articleName: "",
    articleImage: null,
    articlePrice: 0,
    deliveryPrice: 0,
    totalAmount: 0,
  });

  const orderId = params.get("orderId") || params.get("order") || "";
  const courseId = params.get("courseId") || params.get("course") || "";
  const vendeurIdParam = params.get("vendeurId") || params.get("vendorId") || params.get("sellerId") || "";
  const waveParam = params.get("wave") || "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      
      console.log("🔍 [PayerVendeur] Initialisation avec :", {
        orderId,
        courseId,
        vendeurIdParam,
        waveParam
      });

      try {
        let waveRaw = waveParam || "";
        let vendeurName = "Vendeur Mambo";
        let clientName = "";
        let resolvedOrderId = orderId || null;
        let articlePrice = 0;
        let deliveryPrice = 0;
        let articleName = "Article commandé";
        let articleImage = null;
        let vendeurUid = vendeurIdParam || null;

        // 1. Récupération via la commande (orders)
        if (orderId) {
          console.log("📄 [PayerVendeur] Lecture du document 'orders' :", orderId);
          let orderSnap = await getDoc(doc(db, "orders", orderId));

          // Recherche fallback si orderId est le code lisible et non l'ID Firestore
          if (!orderSnap.exists()) {
            const q = query(collection(db, "orders"), where("orderId", "==", orderId), limit(1));
            const match = await getDocs(q);
            if (!match.empty) orderSnap = match.docs[0];
          }
          
          if (orderSnap.exists()) {
            const od = orderSnap.data();
            console.log("✅ [PayerVendeur] Données 'orders' trouvées :", od);

            clientName = od.clientName || od.nomClient || clientName;
            resolvedOrderId = orderSnap.id;
            articlePrice = Number(od.prixArticle || od.montantArticles || od.amount || od.totalAmount || 0);
            deliveryPrice = Number(od.fraisLivraison || od.deliveryFee || 0);
            vendeurUid = vendeurUid || od.vendeurId || od.sellerId || od.storeId;
            
            if (od.items && od.items.length > 0) {
              articleName = od.items.map(i => i.nom || i.name || i.title).join(", ");
              articleImage = od.items[0]?.image || od.items[0]?.photo || null;
            } else {
              articleName = od.articleName || od.nomArticle || od.designation || articleName;
              articleImage = od.articleImage || od.photoArticle || null;
            }
          }
        }

        // 2. Récupération / Reconstitution via la course (courses)
        if (courseId || resolvedOrderId) {
          const targetCourseId = courseId || resolvedOrderId;
          console.log("🛵 [PayerVendeur] Recherche dans 'courses' avec ID/Order :", targetCourseId);
          
          let courseSnap = await getDoc(doc(db, "courses", targetCourseId));
          if (!courseSnap.exists() && resolvedOrderId) {
            const q = query(
              collection(db, "courses"),
              where("linkedOrderId", "==", resolvedOrderId),
              limit(1)
            );
            const match = await getDocs(q);
            if (!match.empty) courseSnap = match.docs[0];
          }

          if (courseSnap.exists()) {
            const c = courseSnap.data();
            console.log("✅ [PayerVendeur] Données 'courses' trouvées :", c);

            if (!resolvedOrderId) resolvedOrderId = c.orderId || c.linkedOrderId || null;
            clientName = clientName || c.thirdPartyName || c.clientName || "";
            deliveryPrice = deliveryPrice || Number(c.price || c.proposedPrice || 0);
            articlePrice = articlePrice || Number(c.prixArticle || c.articlePrice || 0);
            vendeurUid = vendeurUid || c.vendeurId || c.sellerId || c.vendorId || c.storeId;

            const directVendorPhone = 
              c.vendeurPhone || 
              c.vendorPhone || 
              c.telephoneVendeur || 
              c.phoneVendeur ||
              c.waveVendeur;

            if (directVendorPhone) {
              waveRaw = waveRaw || directVendorPhone;
            }
          }
        }

        // 3. Extraction du profil Vendeur dans 'users'
        if (vendeurUid) {
          console.log("👤 [PayerVendeur] Extraction du profil vendeur dans 'users' :", vendeurUid);
          const vSnap = await getDoc(doc(db, "users", vendeurUid));
          if (vSnap.exists()) {
            const vd = vSnap.data();
            console.log("✅ [PayerVendeur] Profil vendeur trouvé :", vd);

            vendeurName = vd.nomComplet || vd.nomBoutique || vd.enseigne || vd.nom || vendeurName;
            waveRaw =
              waveRaw ||
              vd.waveMerchantUrl ||
              vd.waveMerchant ||
              vd.waveLink ||
              vd.telephone ||
              vd.phone ||
              vd.waveQrURL ||
              "";
          }
        }

        // Vérification finale
        if (!waveRaw) {
          console.error("❌ [PayerVendeur] Erreur : Aucun numéro ou lien Wave résolu.");
          if (!cancelled) {
            setError("Impossible de trouver le numéro Wave du vendeur. Veuillez contacter l'assistance.");
            setLoading(false);
          }
          return;
        }

        const totalAmount = articlePrice + deliveryPrice;
        const waveUrl = buildWaveMerchantUrl(waveRaw);
        let waveDisplay = String(waveRaw).replace(/[^0-9+]/g, "");
        if (/^https?:\/\//i.test(waveRaw)) waveDisplay = "Lien marchand Wave";

        if (!cancelled) {
          setInfo({
            clientName,
            vendeurName,
            waveUrl,
            waveDisplay,
            orderId: resolvedOrderId,
            articleName,
            articleImage,
            articlePrice,
            deliveryPrice,
            totalAmount,
          });
          setLoading(false);
        }
      } catch (e) {
        console.error("❌ [PayerVendeur] Exception pendant le chargement :", e);
        if (!cancelled) {
          setError("Erreur de chargement des détails du règlement.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, courseId, vendeurIdParam, waveParam]);

  const openWave = () => {
    if (!info.waveUrl) return;
    window.location.href = info.waveUrl;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-slate-50">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-sm font-bold text-slate-500">Chargement des détails de l'article…</p>
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
              <h1 className="text-lg font-black text-slate-900">Règlement au Vendeur</h1>
              <p className="text-xs font-bold tracking-wider uppercase text-slate-400">
                Vendeur : {info.vendeurName}
              </p>
            </div>
          </div>

          {error ? (
            <div className="p-4 mb-4 text-sm font-bold border rounded-2xl bg-rose-50 border-rose-100 text-rose-700">
              {error}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-4 mb-4 border rounded-2xl bg-slate-50 border-slate-100">
                {info.articleImage ? (
                  <img
                    src={info.articleImage}
                    alt={info.articleName}
                    className="object-cover border w-14 h-14 rounded-xl border-slate-200"
                  />
                ) : (
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-slate-200 text-slate-500">
                    <Package size={24} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Article Acheté</p>
                  <h3 className="text-sm font-black truncate text-slate-800">{info.articleName}</h3>
                  <p className="text-xs font-bold text-emerald-600">{info.articlePrice} F CFA</p>
                </div>
              </div>

              <div className="p-4 mb-5 space-y-2 border rounded-2xl bg-slate-50 border-slate-100">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5"><ShoppingBag size={14} /> Prix de l'article :</span>
                  <span className="font-bold text-slate-800">{info.articlePrice} F CFA</span>
                </div>
                {info.deliveryPrice > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5"><Truck size={14} /> Frais de livraison :</span>
                    <span className="font-bold text-slate-800">{info.deliveryPrice} F CFA</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-xs font-black uppercase text-slate-500">Total à payer au vendeur :</span>
                  <span className="text-2xl font-black text-emerald-600">{info.totalAmount} F CFA</span>
                </div>
              </div>

              {info.waveDisplay && (
                <p className="mb-4 text-xs font-semibold text-center text-slate-500">
                  Compte Wave Vendeur : <span className="font-bold text-slate-800">{info.waveDisplay}</span>
                </p>
              )}

              <button
                onClick={openWave}
                disabled={!info.waveUrl}
                className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50"
              >
                <Wallet size={20} />
                Payer {info.totalAmount} F CFA sur Wave
                <ExternalLink size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}