import {
  CubeIcon,
  MapPinIcon,
  PhoneIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/solid";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, increment, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import "./Accepter.css";

export default function Accepter() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState({
    nom: "Chargement...",
    telephone: "",
    adresse: "",
    commande: "",
    depart: "",
    destination: "",
    tarif: "",
    avatarURL: "" 
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.uid === "FWOQ9S4Lxqfc2cBoTsa4m6J6j8p2") {
      const fetchFirstClient = async () => {
        try {
          const clientsSnapshot = await getDocs(collection(db, "clients"));
          if (!clientsSnapshot.empty) {
            setClientId(clientsSnapshot.docs[0].id);
          }
        } catch (err) {
          console.error("Erreur récupération clients admin :", err);
        }
      };
      fetchFirstClient();
    } else {
      setClientId(user.uid);
    }
  }, [user]);

  useEffect(() => {
    if (!clientId) return;
    const fetchClient = async () => {
      try {
        const docRef = doc(db, "clients", clientId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setClient(docSnap.data());
        } else {
          setError("Client non trouvé.");
        }
      } catch (err) {
        setError("Erreur : " + err.message);
      }
    };
    fetchClient();
  }, [clientId]);

  const handleStartMission = async () => {
    if (!clientId || !user) return;

    setLoading(true);
    try {
      const livreurRef = doc(db, "users", user.uid);
      const livreurSnap = await getDoc(livreurRef);
      const soldeJetons = livreurSnap.data()?.jetons || 0;

      const prixNumerique = parseInt(client.tarif.replace(/[^0-9]/g, "")) || 0;
      const commissionRequise = Math.round(prixNumerique * 0.10);

      if (soldeJetons < commissionRequise) {
        alert(`Solde insuffisant ! Cette mission nécessite ${commissionRequise} jetons.`);
        setLoading(false);
        return;
      }

      await updateDoc(livreurRef, { jetons: increment(-commissionRequise) });
      await updateDoc(doc(db, "clients", clientId), {
        status: "en_cours",
        commissionPrelevee: commissionRequise,
        dateDemarrage: new Date(),
      });

      navigate("/valider");
    } catch (err) {
      console.error("Erreur mission/jetons:", err);
      alert("Erreur lors de la validation. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-fullscreen">
      <button className="button-back" onClick={() => navigate(-1)}>
        ← Retour
      </button>

      <div className="page-header">
        <h1>
          <RocketLaunchIcon className="icon" /> Mission Acceptée 🚀
        </h1>
      </div>

      <div className="page-content">
        {error && (
          <p style={{ color: "orange", marginBottom: "15px", fontWeight: "bold" }}>
            ⚠️ {error}
          </p>
        )}

        <div className="trajet-section">
          <p><MapPinIcon className="icon" /> <strong>Départ :</strong> {client.depart || "Non spécifié"}</p>
          <p><MapPinIcon className="icon" /> <strong>Destination :</strong> {client.destination || "Non spécifié"}</p>
          <p><strong>Tarif :</strong> {client.tarif || "0 CFA"}</p>
        </div>

        <div className="client-card">
          <div className="client-header">
            <img
              src={client.avatarURL || "https://via.placeholder.com/60x60.png?text=👤"}
              alt={client.nom}
              className="client-avatar"
            />
            <div>
              <h2>{client.nom}</h2>
              <p className="client-role">Client</p>
            </div>
          </div>
          <div className="client-info">
            <p><PhoneIcon className="icon" /> {client.telephone}</p>
            <p><MapPinIcon className="icon" /> {client.adresse}</p>
            <p><CubeIcon className="icon" /> {client.commande}</p>
          </div>
        </div>

        <button
          className={`confirm-btn ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={handleStartMission}
          disabled={loading}
        >
          <RocketLaunchIcon className="icon" />
          {loading ? "Vérification jetons..." : "Démarrer la mission"}
        </button>
      </div>
    </div>
  );
}