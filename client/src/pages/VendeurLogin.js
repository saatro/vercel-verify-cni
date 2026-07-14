import React, { useState } from "react";
import { auth, db } from "../firebase";
import { 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { Store, ArrowLeft, Smartphone, Lock, RefreshCcw } from "lucide-react";
import MamboLock from "../components/MamboLock"; 
import { cleanPhone, buildEmail, generatePatternPassword } from "../mamboUtils";
import "react-toastify/dist/ReactToastify.css";
import "./VendeurAuth.css";

export default function VendeurLogin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("schema");
  const [phone, setPhone] = useState("");
  const [pattern, setPattern] = useState([]);
  const [loading, setLoading] = useState(false);

  // Vérification du rôle par UID (méthode globale)
  const verifyVendeurRole = async (user) => {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) {
      return null;
    }
    
    const userData = userSnap.data();
    if (userData.role?.toLowerCase() !== "vendeur") {
      await signOut(auth);
      throw new Error("Accès refusé. Cet espace est réservé aux boutiques.");
    }
    return userData;
  };

  // Connexion avec Schéma + Téléphone
  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;

    const cleanTelephone = cleanPhone(phone);
    if (cleanTelephone.length !== 10 || pattern.length < 3) {
      return toast.error("Numéro ou schéma invalide");
    }

    setLoading(true);

    try {
      // 1. Recherche du vendeur dans Firestore par son numéro de téléphone
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("telephone", "==", cleanTelephone), where("role", "==", "vendeur"));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast.info("Compte inexistant. Redirection vers la création de boutique...");
        setTimeout(() => {
          navigate("/vendeur-signup", { state: { initialPhone: cleanTelephone } });
        }, 1500);
        return;
      }

      // Récupération des données Firestore existantes
      const existingUserDoc = querySnapshot.docs[0];
      const existingUserData = existingUserDoc.data();

      // 2. Génération des identifiants techniques basés STRICTEMENT sur les données du document trouvé
      const technicalEmail = existingUserData.email || buildEmail("", cleanTelephone, "vendeur");
      const technicalPassword = generatePatternPassword(pattern, cleanTelephone);

      // 3. Authentification Firebase Auth et Redirection immédiate pour éviter les conflits d'écouteurs de snapshots
      try {
        const userCredential = await signInWithEmailAndPassword(auth, technicalEmail, technicalPassword);
        
        // Validation immédiate du rôle suite à la connexion par schéma
        const validProfile = await verifyVendeurRole(userCredential.user);
        if (validProfile) {
          toast.success(`Bienvenue ${validProfile.nomBoutique || validProfile.nomComplet || 'dans votre boutique'} !`);
          navigate("/vendeur-dashboard");
        }
      } catch (authError) {
        console.error("Erreur Auth:", authError.code);
        throw new Error("Schéma de sécurité incorrect pour ce numéro.");
      }

    } catch (error) {
      console.error(error);
      toast.error(error.message || "Échec de connexion. Vérifiez vos informations.");
    } finally {
      setLoading(false);
    }
  };

  // Connexion Alternative Professionnelle Google
  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    
    try {
      const res = await signInWithPopup(auth, provider);
      let googleVendorData = await verifyVendeurRole(res.user);
      
      if (!googleVendorData) {
        const userDocRef = doc(db, "users", res.user.uid);
        const newVendorPayload = {
          uid: res.user.uid,
          email: res.user.email,
          telephone: res.user.phoneNumber || "",
          role: "vendeur",
          nomComplet: res.user.displayName || "Nouveau Vendeur",
          nomBoutique: "Ma Boutique Mambo",
          photoURL: res.user.photoURL || "",
          isVerified: false,
          createdAt: serverTimestamp(),
          method: "google"
        };
        await setDoc(userDocRef, newVendorPayload);
        googleVendorData = newVendorPayload;
      }
    
      toast.success(`Bienvenue ${googleVendorData.nomBoutique || googleVendorData.nomComplet || 'dans votre boutique'} !`);
      navigate("/vendeur-dashboard");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Erreur lors de la connexion Google");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vendeur-auth-page">
      <ToastContainer theme="dark" position="top-center" />

      <button onClick={() => navigate("/")} className="back-btn">
        <ArrowLeft size={20} />
      </button>

      <div className="scrollable-page">
        <div className="auth-container">
          <header className="auth-header">
            <div className="vendeur-badge">
              <Store size={35} color="white" />
            </div>
            <h1>MAMBO Boutique</h1>
            <p>ESPACE DE GESTION</p>
          </header>

          <div className="auth-tabs">
            <button 
              type="button"
              className={`tab-btn ${activeTab === "schema" ? "active" : ""}`}
              onClick={() => setActiveTab("schema")}
            >
              Schéma de sécurité
            </button>
            <button 
              type="button"
              className={`tab-btn ${activeTab === "google" ? "active" : ""}`}
              onClick={() => setActiveTab("google")}
            >
              Google
            </button>
          </div>

          {activeTab === "schema" ? (
            <form onSubmit={handleLogin} className="auth-form">
              <div className="input-group">
                <Smartphone size={20} />
                <input 
                  type="tel" 
                  placeholder="Numéro WhatsApp (07xxxxxxxx)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div className="pattern-section">
                <div className="pattern-label">
                  <Lock size={13} /> Dessinez votre schéma
                </div>
                <MamboLock onChange={setPattern} size={160} />
              </div>

              <button type="submit" className="submit-btn" disabled={loading || pattern.length < 3}>
                {loading ? <RefreshCcw className="animate-spin" size={18} /> : "CONNEXION →"}
              </button>
            </form>
          ) : (
            <div className="google-tab-content">
              <button type="button" onClick={handleGoogleLogin} className="google-auth-btn" disabled={loading}>
                Se connecter avec Google
              </button>
            </div>
          )}

          <footer className="auth-footer">
            <button type="button" onClick={() => navigate("/vendeur-signup")} className="signup-link">
              Créer ma boutique
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}