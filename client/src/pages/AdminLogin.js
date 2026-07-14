import { signInWithEmailAndPassword } from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc 
} from "firebase/firestore";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";
import { ShieldCheck, Phone, Lock, Loader2, AlertCircle } from "lucide-react";
import "./AdminLogin.css";

export default function AdminLogin() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    
    const cleanPhone = phoneNumber.trim();
    const cleanPassword = password.trim();

    if (!cleanPhone || !cleanPassword) {
      toast.warning("Veuillez remplir tous les champs");
      return;
    }

    setLoading(true);
    try {
      // ✅ STRATÉGIE MASTER : Connexion Auth directe pour contourner les restrictions Firestore
      const MASTER_ADMIN_EMAIL = "ydouagoury@gmail.com";
      
      const userCredential = await signInWithEmailAndPassword(auth, MASTER_ADMIN_EMAIL, cleanPassword);
      const user = userCredential.user;

      // ✅ VÉRIFICATION / CRÉATION DU PROFIL (Maintenant autorisé car connecté)
      const adminDocRef = doc(db, "users", user.uid);
      const adminDocSnap = await getDoc(adminDocRef);

      if (adminDocSnap.exists()) {
        const data = adminDocSnap.data();
        if (data.phoneNumber !== cleanPhone) {
          throw new Error("Numéro de téléphone non reconnu pour ce Master");
        }
      } else {
        // Création automatique si le profil est manquant
        await setDoc(adminDocRef, {
          uid: user.uid,
          email: MASTER_ADMIN_EMAIL,
          phoneNumber: cleanPhone,
          role: "admin",
          nom: "Administrateur Master",
          lastLogin: new Date().toISOString()
        });
      }

      toast.success("Authentification Master réussie");
      navigate("/admin-home");

    } catch (error) {
      console.error("Détails Erreur Auth:", error);
      
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        toast.error("Code confidentiel incorrect");
      } else {
        toast.error(error.message || "Erreur de connexion au serveur");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-wrapper">
      <div className="admin-login-card">
        <div className="admin-header-badge">
          <ShieldCheck size={36} color="#4F46E5" />
        </div>
        
        <h1 className="admin-title">MAMBO MASTER</h1>
        <p className="admin-subtitle">Accès par Identifiant Mobile</p>

        <form onSubmit={handleLogin} className="admin-form">
          <div className="admin-input-group">
            <Phone size={20} className="admin-input-icon" />
            <input
              type="tel"
              placeholder="Numéro Mobile"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="admin-field"
              required
            />
          </div>

          <div className="admin-input-group">
            <Lock size={20} className="admin-input-icon" />
            <input
              type="password"
              placeholder="Code Confidentiel"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-field"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="admin-submit-button">
            {loading ? (
              <div className="admin-loader-container">
                <Loader2 className="animate-spin" size={20} />
                <span>Vérification...</span>
              </div>
            ) : (
              "DÉVERROUILLER L'ACCÈS"
            )}
          </button>
        </form>

        <div className="admin-security-footer">
          <AlertCircle size={14} />
          <span>Session Master Monitorée • 2026</span>
        </div>
      </div> 
    </div>
  );
}