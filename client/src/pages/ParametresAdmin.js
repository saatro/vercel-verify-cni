/* global __app_id, __firebase_config, __initial_auth_token */
import { CheckCircle, DollarSign, Edit, MapPin, Phone, Truck, Send, User } from 'lucide-react';
import { useEffect, useState } from "react";
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { addDoc, collection, getFirestore } from 'firebase/firestore';

// --- Variables globales avec fallback ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Simulations navigation ---
const useNavigate = () => (path) => console.log(`Navigation simulée vers: ${path}`);
const useLocation = (initialState) => {
  const [state] = useState(initialState || {
    clientName: "Jean Dupont",
    clientPhone: "06 12 34 56 78",
    userStreet: "15 Rue de l'Arrivée, Ville A",
    address: "42 Avenue du Départ, Ville B",
    userLat: 4.00,
    userLng: -5.00,
    lat: 4.50,
    lng: -5.50,
    method: "Livraison Standard",
    price: 7500,
  });
  return { state };
};

// --- Composant InfoItem ---
const InfoItem = ({ icon: Icon, label, value, isPrice, isLocation, coords }) => (
  <div className="flex justify-between items-start">
    <div className="flex items-center">
      <Icon className="w-5 h-5 mr-3 text-indigo-500 dark:text-indigo-400" />
      <span className="font-medium text-gray-500 dark:text-gray-400">{label}:</span>
    </div>
    <div className={`text-right ${isPrice ? 'text-2xl font-bold text-green-600 dark:text-green-400' : 'font-semibold'}`}>
      {value}
      {isLocation && coords && (
        <span className="block text-xs text-gray-400 dark:text-gray-500 font-normal">
          ({coords.lat.toFixed(2)}, {coords.lng.toFixed(2)})
        </span>
      )}
    </div>
  </div>
);

// --- Composant de succès ---
const SuccessPage = ({ order, onReset }) => (
  <div className="flex flex-col items-center justify-center p-8 bg-green-50 rounded-xl shadow-lg border border-green-200">
    <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
    <h3 className="text-3xl font-bold text-green-700 mb-2">Commande Validée !</h3>
    <p className="text-center text-gray-600 mb-6">
      Votre commande a été enregistrée avec succès. Un chauffeur sera bientôt affecté.
    </p>
    <div className="bg-white p-4 rounded-lg shadow-inner w-full max-w-sm">
      <p className="font-semibold">ID de commande : <span className="text-indigo-600 break-all">{order?.id || 'N/A'}</span></p>
      <p className="text-sm text-gray-500 mt-1">Montant : {order?.price} FCFA</p>
    </div>
    <button
      onClick={onReset}
      className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md transition duration-200"
    >
      Retour à l'accueil
    </button>
  </div>
);

// --- Composant principal ---
export default function ParametresAdmin() {
  const [dbInstance, setDbInstance] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  const { state } = useLocation();
  const navigate = useNavigate();
  const { clientName, clientPhone, userStreet, address, userLat, userLng, lat, lng, method, price } = state || {};

  useEffect(() => {
    if (!firebaseConfig) {
      console.error("Firebase config manquante.");
      setLoading(false);
      return;
    }

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    const authenticate = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
        const currentUserId = auth.currentUser?.uid || crypto.randomUUID();
        setUserId(currentUserId);
        setDbInstance(db);
      } catch (e) {
        console.error("Erreur Firebase Auth:", e);
        setError("Échec de l'authentification. Impossible de soumettre la commande.");
      } finally {
        setLoading(false);
      }
    };

    authenticate();
  }, []);

  const handleReset = () => {
    setIsSuccess(false);
    setCompletedOrder(null);
  };

  const handleFinalSubmit = async () => {
    if (!dbInstance || !userId) {
      setError("Erreur interne : Base de données non initialisée ou utilisateur non identifié.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const orderPayload = {
        clientName,
        phone: clientPhone,
        departure_address: userStreet,
        departure_coords: { lat: userLat, lng: userLng },
        destination_address: address,
        destination_coords: { lat, lng },
        method,
        price,
        status: "Pending",
        createdAt: new Date(),
        userId,
      };

      const ordersCollectionRef = collection(dbInstance, `/artifacts/${appId}/users/${userId}/orders`);
      const newOrderRef = await addDoc(ordersCollectionRef, orderPayload);

      setCompletedOrder({ ...orderPayload, id: newOrderRef.id, price });
      setIsSuccess(true);
    } catch (e) {
      console.error("Erreur lors de l'envoi à Firestore:", e);
      setError(`Erreur lors de l'enregistrement de la commande: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (isSuccess) return <SuccessPage order={completedOrder} onReset={handleReset} />;

  if (loading || !state) {
    const message = loading ? "Authentification et préparation..." : "Aucune commande à confirmer. Données manquantes.";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-4 border-indigo-500 border-t-transparent mb-4"></div>
        <p className="text-lg">{message}</p>
        {!loading && (
          <button onClick={() => navigate("/")} className="mt-4 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-200">
            Retour
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg p-6 md:p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl transition-colors">
        <h2 className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mb-6 flex items-center justify-center border-b pb-3 border-gray-200 dark:border-gray-700">
          <Truck className="w-8 h-8 mr-3" /> Résumé de la Commande
        </h2>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Erreur:</strong>
            <span className="block sm:inline ml-2">{error}</span>
          </div>
        )}

        <div className="space-y-4 text-gray-700 dark:text-gray-300">
          <InfoItem icon={User} label="Nom du Client" value={clientName} />
          <InfoItem icon={Phone} label="Téléphone" value={clientPhone} />
          <div className="border-t border-dashed border-gray-300 dark:border-gray-700 pt-4 mt-4 space-y-4">
            <InfoItem icon={MapPin} label="Départ" value={userStreet} isLocation coords={{ lat: userLat, lng: userLng }} />
            <InfoItem icon={MapPin} label="Destination" value={address} isLocation coords={{ lat, lng }} />
          </div>
          <div className="border-t border-solid border-gray-200 dark:border-gray-700 pt-4 mt-4 space-y-4">
            <InfoItem icon={Truck} label="Méthode de Livraison" value={method} />
            <InfoItem icon={DollarSign} label="Prix Total" value={`${price} FCFA`} isPrice />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <button
            onClick={() => navigate("/")}
            className="flex-1 flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg shadow-md transition duration-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
            disabled={submitting}
          >
            <Edit className="w-5 h-5 mr-2" /> Modifier
          </button>
          <button
            onClick={handleFinalSubmit}
            disabled={submitting || loading || error || !state}
            className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition duration-200 disabled:opacity-50"
          >
            {submitting ? <><Send className="w-5 h-5 mr-2 animate-pulse" /> Envoi...</> : "Valider et payer à la livraison"}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          ID Utilisateur: {userId || 'N/A'} (Nécessaire pour la sauvegarde Firestore)
        </p>
      </div>
    </div>
  );
}
