import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { AlertTriangle, ArrowLeft, CheckCircle, Clock, DollarSign, TrendingUp, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";

export default function PretUrgence() {
  const [userData, setUserData] = useState(null);
  const [activeLoan, setActiveLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    if (!auth.currentUser) return;

    try {
      // Charger données utilisateur
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      }

      // Vérifier s'il y a un prêt actif
      const loansQuery = query(
        collection(db, "prets"),
        where("livreurId", "==", auth.currentUser.uid),
        where("status", "==", "actif")
      );
      const loansSnap = await getDocs(loansQuery);

      if (!loansSnap.empty) {
        setActiveLoan({ id: loansSnap.docs[0].id, ...loansSnap.docs[0].data() });
      }
    } catch (error) {
      console.error("Erreur chargement:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestLoan = async () => {
    if (!auth.currentUser || !userData) return;

    // Vérifier qu'il n'y a pas déjà un prêt actif
    if (activeLoan) {
      toast.error("❌ Vous avez déjà un prêt en cours");
      return;
    }

    try {
      setLoading(true);

      // Montant du prêt : 5000 F
      const loanAmount = 5000;
      const loanId = `LOAN_${Date.now()}`;

      // Créer le document de prêt
      await setDoc(doc(db, "prets", loanId), {
        id: loanId,
        livreurId: auth.currentUser.uid,
        livreurName: userData.nom || "Livreur",
        amount: loanAmount,
        commissionRate: 21, // 13% au lieu de 10%
        status: "actif",
        earnedFromLoan: 0, // Montant gagné avec le prêt
        coursesWithLoan: [], // IDs des courses faites avec le prêt
        createdAt: serverTimestamp(),
        activatedAt: serverTimestamp()
      });

      // Ajouter le montant au solde bonus
      const newSoldeJetons = (userData.soldeJetons || 0) + loanAmount;
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        soldeJetons: newSoldeJetons,
        hasActiveLoan: true
      });

      toast.success(`✅ Prêt de ${loanAmount.toLocaleString()} F accordé !`);

      // Recharger les données
      await loadUserData();

    } catch (error) {
      console.error("Erreur prêt:", error);
      toast.error("❌ Erreur lors de la demande de prêt");
    } finally {
      setLoading(false);
    }
  };

  const handleRepayLoan = async () => {
    if (!auth.currentUser || !userData || !activeLoan) return;

    // Vérifier que le livreur a assez dans son solde
    const totalBalance = (userData.solde || 0) + (userData.soldeJetons || 0);
    const amountToRepay = activeLoan.amount;

    if (totalBalance < amountToRepay) {
      toast.error(`❌ Solde insuffisant. Requis: ${amountToRepay.toLocaleString()} F, Disponible: ${totalBalance.toLocaleString()} F`);
      return;
    }

    try {
      setLoading(true);

      // Déduire du solde (cash en priorité, puis bonus)
      let newSolde = userData.solde || 0;
      let newSoldeJetons = userData.soldeJetons || 0;

      if (newSolde >= amountToRepay) {
        newSolde -= amountToRepay;
      } else {
        const remaining = amountToRepay - newSolde;
        newSoldeJetons -= remaining;
        newSolde = 0;
      }

      // Mettre à jour le prêt
      await updateDoc(doc(db, "prets", activeLoan.id), {
        status: "rembourse",
        repaidAt: serverTimestamp(),
        repaidAmount: amountToRepay
      });

      // Mettre à jour l'utilisateur
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        solde: Math.max(0, newSolde),
        soldeJetons: Math.max(0, newSoldeJetons),
        hasActiveLoan: false
      });

      toast.success(`✅ Prêt de ${amountToRepay.toLocaleString()} F remboursé !`);

      // Recharger les données
      await loadUserData();

    } catch (error) {
      console.error("Erreur remboursement:", error);
      toast.error("❌ Erreur lors du remboursement");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="w-12 h-12 border-4 border-orange-500 rounded-full animate-spin border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-3 text-white transition-colors bg-slate-800 rounded-2xl hover:bg-slate-700"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl italic font-black text-white uppercase">
              Prêt d'Urgence
            </h1>
            <p className="text-sm font-semibold text-slate-400">
              Continuez à travailler avec une avance
            </p>
          </div>
        </div>

        {/* Solde actuel */}
        <div className="p-6 mb-6 border-2 bg-gradient-to-br from-slate-800 to-slate-700 rounded-3xl border-slate-600">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider uppercase text-slate-400">
              Votre Solde Actuel
            </span>
            {activeLoan && (
              <span className="px-3 py-1 text-xs font-black text-orange-400 uppercase rounded-full bg-orange-500/20">
                Prêt Actif
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/50 rounded-2xl">
              <div className="mb-2 text-xs font-bold text-slate-400">Cash</div>
              <div className="text-2xl font-black text-white">
                {(userData?.solde || 0).toLocaleString()} <span className="text-sm text-slate-400">F</span>
              </div>
            </div>
            <div className="p-4 bg-slate-900/50 rounded-2xl">
              <div className="mb-2 text-xs font-bold text-slate-400">Bonus</div>
              <div className="text-2xl font-black text-orange-400">
                {(userData?.soldeJetons || 0).toLocaleString()} <span className="text-sm text-slate-400">J</span>
              </div>
            </div>
          </div>
        </div>

        {/* État du prêt */}
        {activeLoan ? (
          <div className="relative p-8 mb-6 overflow-hidden bg-gradient-to-br from-orange-500 to-red-500 rounded-3xl">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-3xl"></div>

            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-white/20 rounded-2xl">
                  <TrendingUp size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl italic font-black text-white uppercase">
                    Prêt en Cours
                  </h2>
                  <p className="text-xs font-semibold text-orange-100">
                    Commission: 13% au lieu de 10%
                  </p>
                </div>
              </div>

              <div className="p-6 mb-6 bg-white/10 backdrop-blur-sm rounded-2xl">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="mb-1 text-xs font-bold text-orange-100">Montant Prêté</div>
                    <div className="text-2xl font-black text-white">
                      {activeLoan.amount.toLocaleString()} F
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-bold text-orange-100">Gagné avec prêt</div>
                    <div className="text-2xl font-black text-white">
                      {(activeLoan.earnedFromLoan || 0).toLocaleString()} F
                    </div>
                  </div>
                </div>

                <div className="text-xs font-semibold text-orange-100">
                  Courses effectuées: {activeLoan.coursesWithLoan?.length || 0}
                </div>
              </div>

              <button
                onClick={handleRepayLoan}
                disabled={loading}
                className="flex items-center justify-center w-full gap-3 py-4 text-sm font-black text-orange-600 uppercase transition-colors bg-white rounded-2xl hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={20} />
                Rembourser {activeLoan.amount.toLocaleString()} F
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 mb-6 border-2 bg-gradient-to-br from-slate-800 to-slate-700 rounded-3xl border-slate-600">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-orange-500/20 rounded-2xl">
                <DollarSign size={24} className="text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl italic font-black text-white uppercase">
                  Demander un Prêt
                </h2>
                <p className="text-xs font-semibold text-slate-400">
                  5 000 F disponibles immédiatement
                </p>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <div className="flex items-start gap-3 text-sm">
                <CheckCircle size={16} className="flex-shrink-0 mt-1 text-green-400" />
                <span className="font-semibold text-slate-300">
                  <strong className="text-white">Instantané :</strong> Le montant est ajouté à vos bonus immédiatement
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <AlertTriangle size={16} className="flex-shrink-0 mt-1 text-orange-400" />
                <span className="font-semibold text-slate-300">
                  <strong className="text-white">Commission :</strong> 13% au lieu de 10% pendant la durée du prêt
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <Clock size={16} className="flex-shrink-0 mt-1 text-blue-400" />
                <span className="font-semibold text-slate-300">
                  <strong className="text-white">Remboursement :</strong> À tout moment depuis cette page
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <XCircle size={16} className="flex-shrink-0 mt-1 text-red-400" />
                <span className="font-semibold text-slate-300">
                  <strong className="text-white">Limite :</strong> Un seul prêt à la fois
                </span>
              </div>
            </div>

            <div className="p-6 mb-6 bg-slate-900/50 rounded-2xl">
              <h3 className="mb-4 text-sm font-black uppercase text-slate-300">
                💡 Comment ça marche ?
              </h3>
              <ol className="space-y-3 text-xs font-semibold text-slate-400">
                <li className="flex gap-3">
                  <span className="font-black text-orange-400">1.</span>
                  <span>Vous recevez 5 000 F en <strong className="text-white">bonus</strong> instantanément</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-black text-orange-400">2.</span>
                  <span>Chaque course acceptée prélève <strong className="text-white">13%</strong> au lieu de 10%</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-black text-orange-400">3.</span>
                  <span>Remboursez <strong className="text-white">5 000 F</strong> quand vous voulez pour repasser à 10%</span>
                </li>
              </ol>
            </div>

            <button
              onClick={handleRequestLoan}
              disabled={loading}
              className="flex items-center justify-center w-full gap-3 py-5 text-base font-black text-white uppercase transition-all shadow-xl bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <DollarSign size={20} />
              Obtenir 5 000 F Maintenant
            </button>
          </div>
        )}

        {/* Avertissement */}
        <div className="p-6 border-2 bg-slate-800/50 border-slate-700 rounded-2xl">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="flex-shrink-0 mt-1 text-orange-400" />
            <div>
              <h3 className="mb-2 text-sm font-black text-white uppercase">
                ⚠️ Important
              </h3>
              <ul className="space-y-2 text-xs font-semibold text-slate-400">
                <li>• Ce prêt est conçu pour vous aider à continuer de travailler en cas de solde faible</li>
                <li>• La commission de 13% s'applique automatiquement à chaque course tant que le prêt est actif</li>
                <li>• Vous pouvez rembourser à tout moment pour revenir à 10% de commission</li>
                <li>• Un seul prêt peut être actif à la fois</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}