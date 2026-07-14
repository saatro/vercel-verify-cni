import { useState } from "react"; // Retrait de useEffect (ligne 1)
import { useNavigate } from "react-router-dom";
import { Check, X, ShieldCheck } from "lucide-react"; // Retrait de User (ligne 3)
import "./Valider.css";

export default function Valider() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  // Retrait de isSuccess (ligne 17) car elle n'était pas utilisée dans le rendu

  const handleConfirm = () => {
    setLoading(true);
    // Simuler une validation
    setTimeout(() => {
      setLoading(false);
      alert("Mission validée avec succès !");
      navigate("/livreur-dashboard");
    }, 1500);
  };

  return (
    <div className="valider-container">
      <div className="valider-card">
        <div className="icon-success">
          <ShieldCheck size={64} className="text-green-500" />
        </div>
        
        <h2>Confirmation Finale</h2>
        <p>Voulez-vous confirmer la fin de cette mission ? Cette action créditera votre solde.</p>

        <div className="valider-actions">
          <button 
            className="btn-confirm" 
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Chargement..." : <><Check size={20} /> Valider</>}
          </button>
          
          <button 
            className="btn-cancel" 
            onClick={() => navigate(-1)}
            disabled={loading}
          >
            <X size={20} /> Annuler
          </button>
        </div>
      </div>
    </div>
  );
}