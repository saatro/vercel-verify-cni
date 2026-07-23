import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  Bike,
  CheckCircle,
  ChevronDown,
  Loader2,
  MessageCircle,
  Phone,
  ShieldCheck,
  Star,
  Store
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../firebase';

const CartCourseWeb = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showItems, setShowItems] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);

  // --- SYNCHRONISATION TEMPS RÉEL ---
  useEffect(() => {
    if (!orderId) return;

    const docRef = doc(db, "orders", orderId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const newData = docSnap.data();

        // Notification flash quand Johanne finit les achats
        if (orderData?.status && orderData.status !== "achats_termines" &&
          newData?.status === "achats_termines") {
          setShowSuccessOverlay(true);
          setTimeout(() => setShowSuccessOverlay(false), 4000);
        }

        setOrderData(newData);
        setLoading(false);
      } else {
        setLoading(false);
      }
    }, (err) => {
      console.error("Erreur Firestore:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [orderId, orderData?.status]);

  // --- LOGIQUE DE CALCUL ---
  const calculateTotal = useCallback(() => {
    if (orderData?.amount) return orderData.amount;
    if (!orderData?.items) return 0;
    return orderData.items.reduce((sum, item) =>
      sum + (Number(item.priceUnit || item.prix || 0) * (item.quantity || 1)), 0);
  }, [orderData]);

  const totalPrice = calculateTotal();

  const handleRate = async (value) => {
    if (orderId) {
      setRating(value);
      const docRef = doc(db, "orders", orderId);
      await updateDoc(docRef, { clientRating: value });
    }
  };

  // Génération du lien d'assistance avec message personnalisé contenant l'ID de la commande
  const handleAssistanceClick = () => {
    const text = encodeURIComponent(
      `Bonjour l'équipe Mambo, je viens d'effectuer mon paiement de ${totalPrice.toLocaleString()} F pour la commande ${orderData?.orderId || orderId || ''}. Pouvez-vous vérifier mon reçu ?`
    );
    window.open(`https://wa.me/2250778073456?text=${text}`, '_blank');
  };

  // --- ÉTATS DYNAMIQUES ---
  const hasCourier = orderData?.coursierId && orderData?.coursierId !== "";
  const isShoppingFinished = ["achats_termines", "en_route", "livre"].includes(orderData?.status);
  const isDelivered = orderData?.status === "livre";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="mt-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Mambo Cloud Sync...</p>
      </div>
    );
  }

  // --- RENDU : LIVRÉ ---
  if (isDelivered) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 animate-in fade-in">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex p-4 mb-6 rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={48} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter uppercase text-slate-900">Livré !</h1>

          <div className="p-6 my-8 bg-white border shadow-xl rounded-3xl border-slate-200">
            <div className="w-20 h-20 mx-auto mb-4 overflow-hidden border-2 rounded-full border-emerald-500 bg-slate-100">
              {orderData?.coursierPhoto ? (
                <img src={orderData.coursierPhoto} className="object-cover w-full h-full" alt="" />
              ) : <Bike className="w-full h-full p-4 text-slate-300" />}
            </div>
            <h3 className="font-bold uppercase text-slate-800">{orderData?.coursierNom || "Agent Mambo"}</h3>

            <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 mb-2">Notez votre agent</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setRatingHover(star)}
                  onMouseLeave={() => setRatingHover(0)}
                  onClick={() => handleRate(star)}
                  className="transition-transform active:scale-90"
                >
                  <Star
                    size={32}
                    className={`${(ratingHover || rating) >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'} transition-colors`}
                  />
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => navigate('/')} className="w-full p-4 text-xs font-black border text-slate-400 border-slate-200 rounded-2xl">
            RETOUR À L'ACCUEIL
          </button>
        </div>
      </div>
    );
  }

  // --- RENDU : SUIVI ---
  return (
    <div className="relative flex flex-col items-center min-h-screen p-4 bg-white text-slate-800">

      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-500/95 backdrop-blur-sm animate-in fade-in">
          <CheckCircle size={80} className="text-white animate-bounce" />
          <h2 className="mt-8 text-3xl font-black text-white uppercase">Achats Terminés !</h2>
          <p className="text-sm font-bold uppercase text-white/80">Le livreur moto arrive...</p>
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="mt-10 mb-10 text-center">
          <div className="inline-flex p-3 mb-4 bg-white border shadow-sm rounded-2xl border-slate-100">
            <Store className="text-blue-600" size={32} />
          </div>
          <h2 className="text-4xl font-black tracking-tighter text-slate-900">
            {totalPrice.toLocaleString()} F
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic">
            Paiement {orderData?.type || 'COURSE'} CERTIFIÉ
          </p>
        </div>

        {!hasCourier ? (
          <div className="flex flex-col items-center p-12 border border-dashed bg-slate-50 rounded-3xl border-slate-200">
            <Loader2 className="w-12 h-12 mb-4 text-blue-600 animate-spin" />
            <p className="text-xs font-bold tracking-widest uppercase text-slate-500">Recherche de coursier...</p>
          </div>
        ) : (
          <div className="overflow-hidden duration-500 bg-white border shadow-2xl border-slate-200 rounded-3xl animate-in zoom-in">
            <div className="flex items-center justify-between p-4 border-b bg-emerald-50 border-emerald-100">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                <span className="text-[10px] font-black text-emerald-600 uppercase">Agent certifié mambo</span>
              </div>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-4 p-4 mb-6 border bg-slate-50 rounded-2xl border-slate-100">
                <div className="w-16 h-16 overflow-hidden bg-white border-2 rounded-full shadow-sm border-emerald-500">
                  {orderData?.coursierPhoto ? (
                    <img src={orderData.coursierPhoto} className="object-cover w-full h-full" alt="" />
                  ) : <Bike className="w-full h-full p-4 text-slate-200" />}
                </div>
                <div>
                  <h3 className="font-bold uppercase text-slate-800">{orderData?.coursierNom || "Chargement..."}</h3>
                  <p className="text-[10px] text-emerald-600 font-black uppercase">En mission pour vous</p>
                </div>
              </div>

              <div className="mb-6">
                <div className="w-full h-2 mb-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full bg-emerald-500 transition-all duration-1000 ease-out ${isShoppingFinished ? 'w-full shadow-[0_0_8px_#10b981]' : 'w-1/2 animate-pulse'}`}
                  ></div>
                </div>
                <p className="text-xs font-bold tracking-tighter text-center uppercase text-slate-500">
                  {orderData?.status === "en_route" ? "🚀 Le livreur est en route vers vous" :
                    orderData?.status === "achats_termines" ? "📦 Colis prêt (transmission livreur)" :
                      "🛒 Achats en cours par votre agent..."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <a href={`tel:${orderData?.coursierPhone || '225'}`} className="flex items-center justify-center gap-2 py-4 border border-slate-200 rounded-2xl font-black text-[10px] hover:bg-slate-50 transition-colors">
                  <Phone size={16} className="text-blue-600" /> APPELER
                </a>
                <button
                  onClick={handleAssistanceClick}
                  className="flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] shadow-lg shadow-blue-200"
                >
                  <MessageCircle size={16} /> ASSISTANCE
                </button>
              </div>

              <button
                onClick={() => setShowItems(!showItems)}
                className="flex items-center justify-between w-full p-4 mt-6 transition-colors bg-slate-50 rounded-xl hover:bg-slate-100"
              >
                <span className="text-[10px] font-black uppercase text-slate-400">Détails de la liste</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${showItems ? 'rotate-180' : ''}`} />
              </button>

              {showItems && orderData?.items && (
                <div className="px-2 mt-4 space-y-2 duration-300 animate-in slide-in-from-top-2">
                  {orderData.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-[11px] border-b border-slate-50 pb-1">
                      <span className="font-medium text-slate-600">{item.quantity || 1}x {item.nom}</span>
                      <span className="font-bold text-slate-400">{(Number(item.priceUnit || item.prix || 0) * (item.quantity || 1)).toLocaleString()} F</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isShoppingFinished && (
        <div className="fixed p-3 border-4 border-white rounded-full shadow-2xl bottom-6 animate-bounce bg-emerald-500">
          <Bike size={24} className="text-white" />
        </div>
      )}
    </div>
  );
};

export default CartCourseWeb;