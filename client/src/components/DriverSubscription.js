import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { Zap, Clock, CreditCard, CheckCircle, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'react-toastify';

export default function DriverSubscription({ driverId }) {
  const [driverData, setDriverData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Écoute en temps réel du profil livreur (solde et abonnement)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'livreurs', driverId), (snapshot) => {
      if (snapshot.exists()) {
        setDriverData(snapshot.data());
      }
      setFetching(false);
    });
    return () => unsub();
  }, [driverId]);

  const plans = [
    {
      id: 'night_shift',
      label: 'Forfait Nuit',
      price: 5000,
      expiryHour: 6,
      expiryMinute: 0,
      icon: <Clock size={22} className="text-orange-400" />,
      description: 'Courses illimitées jusqu\'à 06h00'
    },
    {
      id: 'extended_shift',
      label: 'Forfait Premium',
      price: 10000,
      expiryHour: 13,
      expiryMinute: 0,
      icon: <Zap size={22} className="text-yellow-400" />,
      description: 'Courses illimitées jusqu\'à 13h00'
    }
  ];

  const handleSubscribe = async (plan) => {
    if (!driverData) return;

    const currentSolde = driverData.solde || 0;

    if (currentSolde < plan.price) {
      toast.error(`Solde insuffisant (${currentSolde.toLocaleString()} F). Veuillez recharger.`);
      return;
    }

    try {
      setLoading(true);

      const now = new Date();
      let expiryDate = new Date();
      
      // Configuration de l'heure cible (06h ou 13h)
      expiryDate.setHours(plan.expiryHour, plan.expiryMinute, 0, 0);

      // LOGIQUE : Si l'heure cible est déjà passée ou si on est en soirée (ex: 23h),
      // l'expiration est forcément pour demain.
      if (expiryDate <= now) {
        expiryDate.setDate(expiryDate.getDate() + 1);
      }

      const newSolde = currentSolde - plan.price;

      await updateDoc(doc(db, 'livreurs', driverId), {
        solde: newSolde,
        subscriptionExpiresAt: Timestamp.fromDate(expiryDate),
        isAvailable: true,
        lastPlan: plan.id,
        updatedAt: Timestamp.now()
      });

      toast.success(`Forfait activé jusqu'à ${plan.expiryHour}h00 !`);

    } catch (error) {
      console.error("Erreur souscription:", error);
      toast.error("Impossible d'activer le forfait");
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const subscriptionDate = driverData?.subscriptionExpiresAt?.toDate();
  const isSubscribed = subscriptionDate && subscriptionDate > now;

  if (fetching) return <div className="p-8 text-center"><Loader2 className="mx-auto animate-spin text-emerald-500" /></div>;

  return (
    <div className="s-sub-wrapper bg-[#0f0f0f] rounded-3xl border border-white/5 overflow-hidden my-4 shadow-2xl">
      
      {/* Header Solde */}
      <div className="flex items-center justify-between p-6 border-b bg-gradient-to-br from-gray-900 to-black border-white/5">
        <div>
          <p className="text-gray-500 text-[10px] uppercase tracking-[2px] mb-1">Votre Crédit</p>
          <p className="text-2xl italic font-black text-white">
            {(driverData?.solde || 0).toLocaleString()} <span className="text-xs not-italic text-emerald-500">F CFA</span>
          </p>
        </div>
        <div className="flex items-center justify-center w-12 h-12 border bg-white/5 rounded-2xl border-white/10">
          <CreditCard className="text-emerald-500" size={24} />
        </div>
      </div>

      <div className="p-6">
        {isSubscribed ? (
          <div className="flex items-center gap-4 p-4 mb-6 border bg-emerald-500/10 border-emerald-500/20 rounded-2xl">
            <div className="flex items-center justify-center w-10 h-10 text-black rounded-full shadow-lg bg-emerald-500 shadow-emerald-500/20">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-500">Abonnement Actif</p>
              <p className="text-gray-400 text-[11px]">
                Expire le {subscriptionDate.toLocaleDateString()} à {planExpiryString(subscriptionDate)}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 mb-6 border bg-red-500/10 border-red-500/20 rounded-2xl">
            <AlertCircle className="text-red-500" size={18} />
            <p className="text-xs font-medium text-red-200">Assignations bloquées. Choisissez un forfait.</p>
          </div>
        )}

        <div className="space-y-4">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => handleSubscribe(plan)}
              disabled={loading || isSubscribed}
              className={`w-full group relative flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${
                isSubscribed 
                  ? 'bg-gray-900/50 border-white/5 opacity-50 cursor-not-allowed'
                  : 'bg-white/5 border-white/10 hover:border-emerald-500/50 hover:bg-white/[0.08] active:scale-95'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 transition-colors bg-black border rounded-xl border-white/5 group-hover:border-emerald-500/30">
                  {plan.icon}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">{plan.label}</p>
                  <p className="text-gray-500 text-[11px] font-medium">{plan.description}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm italic font-black text-emerald-500">{plan.price.toLocaleString()} F</p>
                {!isSubscribed && <ArrowRight size={14} className="mt-1 ml-auto text-gray-600 transition-colors group-hover:text-emerald-500" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 text-center bg-black/40">
        <p className="text-[10px] text-gray-600 italic">
          Système de prélèvement automatique sécurisé.
        </p>
      </div>
    </div>
  );
}

// Fonction utilitaire pour formater l'heure proprement
function planExpiryString(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
}