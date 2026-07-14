import { CheckBadgeIcon, ShieldCheckIcon, XCircleIcon } from "@heroicons/react/24/solid";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

export default function ValidationReçus() {
  const navigate = useNavigate();
  const [lastRequest, setLastRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return navigate("/login-livreur");

    // On écoute la DERNIÈRE demande de recharge du livreur
    const q = query(
      collection(db, "recharges"),
      where("livreurId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setLastRequest(snap.docs[0].data());
      }
      setLoading(false);
    });

    return () => unsub();
  }, [navigate]);

  if (loading) return <div className="flex items-center justify-center h-screen">Vérification du statut...</div>;
  if (!lastRequest) return <div className="p-8 text-center">Aucune demande de recharge en cours.</div>;

  const isValid = lastRequest.status === "validé";
  const isRejected = lastRequest.status === "rejeté";
  const isPending = lastRequest.status === "en_attente";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-gray-100">
      <div className="max-w-md p-8 text-center bg-white border border-gray-200 shadow-xl rounded-2xl">

        {/* --- ICÔNE DYNAMIQUE --- */}
        {isPending ? (
          <div className="w-24 h-24 mx-auto mb-4 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
        ) : isValid ? (
          <CheckBadgeIcon className="w-24 h-24 mx-auto mb-4 text-green-500" />
        ) : (
          <XCircleIcon className="w-24 h-24 mx-auto mb-4 text-red-500" />
        )}

        <h1 className="mb-2 text-3xl font-bold text-gray-800">
          {isPending ? "Analyse en cours..." : isValid ? "Reçu Validé ✔" : "Reçu Refusé ❌"}
        </h1>

        <p className="mb-6 text-lg text-gray-600">
          {isPending ? (
            "L'administrateur vérifie votre reçu de dépôt."
          ) : isValid ? (
            <>Votre compte a été crédité de <strong className="text-green-600">{lastRequest.montant} F</strong>.</>
          ) : (
            <>Votre reçu a été <strong className="text-red-600">rejeté par l'Admin</strong>.</>
          )}
        </p>

        {/* --- BADGE DE PROTECTION --- */}
        <div className={`rounded-xl p-4 mb-6 flex items-center justify-center space-x-3 border ${
          isValid ? "bg-green-50 border-green-200" : isPending ? "bg-indigo-50 border-indigo-200" : "bg-red-50 border-red-200"
        }`}>
          <ShieldCheckIcon className={`w-8 h-8 ${isValid ? "text-green-600" : isPending ? "text-indigo-600" : "text-red-600"}`} />
          <div className="text-left">
            <p className={`font-semibold ${isValid ? "text-green-700" : isPending ? "text-indigo-700" : "text-red-700"}`}>
              {isPending ? "Vérification Admin" : "Statut Finalisé"}
            </p>
            <p className="text-sm text-gray-600">
              {isPending ? "En attente de confirmation." : isValid ? "Crédit ajouté au portefeuille." : "Document invalide ou illisible."}
            </p>
          </div>
        </div>

        {/* --- MESSAGE D'ERREUR SI REJET --- */}
        {isRejected && lastRequest.motifRefus && (
          <div className="p-3 mb-6 text-sm text-red-700 border border-red-200 rounded-lg bg-red-50">
            <strong>Motif :</strong> {lastRequest.motifRefus}
          </div>
        )}

        <button
          onClick={() => navigate("/livreur-home")}
          className={`w-full py-3 rounded-xl font-semibold transition text-white ${
            isValid ? "bg-green-600 hover:bg-green-700" : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {isValid ? "Aller livrer maintenant" : "Retour au tableau de bord"}
        </button>
      </div>
    </div>
  );
}