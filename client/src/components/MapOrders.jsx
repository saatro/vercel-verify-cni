import { CheckCircle, Clock, Loader, MapPin, Truck } from 'lucide-react';
import { useEffect, useState } from "react";

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, onSnapshot, setDoc } from "firebase/firestore";

// --- Configuration Firebase ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialisation des services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Chemin Firestore pour les commandes (collection publique)
const ORDERS_COLLECTION = `artifacts/${appId}/public/data/orders`;


// Fonction pour initialiser des données de commandes mock (si la collection est vide)
const initializeMockOrders = async () => {
  const ordersCollectionRef = collection(db, ORDERS_COLLECTION);
  const snapshot = await getDocs(ordersCollectionRef);

  if (snapshot.empty) {
    console.log("Initialisation des commandes mock dans Firestore...");

    const mockOrders = [
      { id: "O1", client: "Magasin Central", address: "Plateau, Rue du Commerce", status: "pending", lat: 5.328, lng: -4.015, orderTime: new Date().getTime() - 600000 },
      { id: "O2", client: "Client VIP Marc", address: "Cocody, Riviera 3", status: "assigned", lat: 5.355, lng: -3.980, orderTime: new Date().getTime() - 300000, livreur: 'LVR-101' },
      { id: "O3", client: "Boulangerie Pat.", address: "Yopougon, Quartier Millionnaire", status: "pending", lat: 5.305, lng: -4.070, orderTime: new Date().getTime() - 120000 },
      { id: "O4", client: "Bureau de Poste", address: "Marcory, Zone 4", status: "delivered", lat: 5.289, lng: -3.992, orderTime: new Date().getTime() - 900000, livreur: 'LVR-105' },
    ];

    for (const order of mockOrders) {
      // Utiliser setDoc avec l'ID pour avoir un contrôle sur les IDs mock
      await setDoc(doc(ordersCollectionRef, order.id), order);
    }
  }
};


export default function MapOrders() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // --- Gestion de l'Authentification et Initialisation ---
  useEffect(() => {
    const handleAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
        setIsAuthReady(true);
        // Initialiser les données mock après l'authentification
        initializeMockOrders();
      } catch (error) {
        console.error("Erreur lors de l'authentification:", error);
        setIsAuthReady(true);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        handleAuth();
      } else {
        setIsAuthReady(true);
        initializeMockOrders();
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // --- Écoute Firestore en Temps Réel ---
  useEffect(() => {
    if (!isAuthReady) return;

    const ordersCollectionRef = collection(db, ORDERS_COLLECTION);

    const unsubscribe = onSnapshot(ordersCollectionRef, (snapshot) => {
      const updatedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Triez pour garder les "pending" en haut de la liste
      updatedOrders.sort((a, b) => {
        const statusOrder = { 'pending': 1, 'assigned': 2, 'delivered': 3, 'cancelled': 4 };
        return (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5);
      });

      setOrders(updatedOrders);
      setIsLoading(false);

    }, (error) => {
      console.error("Erreur d'écoute Firestore pour les commandes:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthReady]);


  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return {
          label: 'En Attente',
          icon: Clock,
          bgColor: 'bg-yellow-500/10',
          textColor: 'text-yellow-700',
          ringColor: 'ring-yellow-500'
        };
      case 'assigned':
        return {
          label: 'Assignée',
          icon: Truck,
          bgColor: 'bg-blue-500/10',
          textColor: 'text-blue-700',
          ringColor: 'ring-blue-500'
        };
      case 'delivered':
        return {
          label: 'Livrée',
          icon: CheckCircle,
          bgColor: 'bg-green-500/10',
          textColor: 'text-green-700',
          ringColor: 'ring-green-500'
        };
      default:
        return {
          label: 'Inconnu',
          icon: MapPin,
          bgColor: 'bg-gray-500/10',
          textColor: 'text-gray-700',
          ringColor: 'ring-gray-500'
        };
    }
  };

  // Formatte le temps écoulé depuis la commande
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'N/A';
    const seconds = Math.floor((new Date().getTime() - timestamp) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " ans";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " mois";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " jours";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " heures";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes";
    return Math.floor(seconds) + " secondes";
  };

  if (!isAuthReady) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4">
        <Loader className="h-10 w-10 text-indigo-600 animate-spin mb-3" />
        <p className="text-lg font-semibold text-gray-700">Connexion aux services de suivi...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-gray-50">
      <header className="p-4 bg-indigo-600 text-white shadow-xl flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-2xl font-extrabold flex items-center">
          <MapPin className="h-6 w-6 mr-3" />
          Tableau de Bord des Commandes
        </h1>
        <span className="text-sm font-medium bg-indigo-700 px-3 py-1 rounded-full">
          {isLoading ? "Chargement..." : `${orders.length} Commandes Actives`}
        </span>
      </header>
      <main className="flex-grow p-4 md:p-8">
        {isLoading && orders.length === 0 ? (
          <div className="flex items-center justify-center h-96 bg-white rounded-xl shadow-lg">
            <Loader className="h-8 w-8 text-indigo-600 animate-spin mr-3" />
            <p className="text-lg text-gray-700">Récupération des données en temps réel...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-xl shadow-lg border-2 border-dashed border-gray-300">
            <CheckCircle className="h-10 w-10 mx-auto text-green-500 mb-3" />
            <p className="text-xl font-semibold text-gray-600">Aucune commande active actuellement.</p>
            <p className="text-sm text-gray-400 mt-1">Les nouvelles commandes apparaîtront ici automatiquement.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => {
              const statusInfo = getStatusInfo(order.status);
              const Icon = statusInfo.icon;

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-5 border-t-4 border-indigo-600 ${statusInfo.ringColor === 'ring-yellow-500' ? 'border-yellow-500' : statusInfo.ringColor === 'ring-blue-500' ? 'border-blue-500' : 'border-green-500'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-lg font-bold text-gray-900 truncate">
                      {order.client}
                    </h2>
                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ring-1 ring-inset ${statusInfo.bgColor} ${statusInfo.textColor} ${statusInfo.ringColor}`}>
                      <Icon className="w-3 h-3 mr-1" /> {statusInfo.label}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-2 flex items-start">
                    <MapPin className="h-4 w-4 mr-2 mt-1 text-indigo-500 flex-shrink-0" />
                    <span>{order.address}</span>
                  </p>

                  <div className="border-t border-gray-100 pt-3 mt-3 space-y-1">
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">Lat/Lng:</span> {order.lat}, {order.lng}
                    </p>
                    {order.livreur && (
                      <p className="text-xs text-gray-500 flex items-center">
                        <Truck className="h-3 w-3 mr-1 text-blue-500" />
                        <span className="font-medium text-gray-700">Livreur ID:</span> {order.livreur}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 italic">
                      Passée il y a : {formatTimeAgo(order.orderTime)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}