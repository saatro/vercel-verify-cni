import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  ArrowLeft,
  Loader2,
  Lock, Package,
  Phone
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import MamboLock from "../components/MamboLock";
import { auth, db } from "../firebase";
import { cleanPhone, generatePatternPassword } from "../mamboUtils";
import "./LoginClient.css";

export default function LoginCoursier() {
  const [activeTab, setActiveTab] = useState("schema"); // "schema" ou "google"
  const [telephone, setTelephone] = useState("");
  const [pattern, setPattern] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // --- 🛡️ LOGIQUE COMMUNE ET HARMONISÉE DE VÉRIFICATION ---
  const verifyCoursierRole = async (user) => {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      await signOut(auth);
      throw new Error("Compte inexistant. Veuillez vous inscrire.");
    }

    const userData = userSnap.data();
    if (userData.role?.toLowerCase() !== "coursier") {
      await signOut(auth);
      throw new Error("Accès refusé. Cet espace est réservé aux coursiers.");
    }
    return userData;
  };

  // --- 🌐 OPTION 1 : CONNEXION VIA GOOGLE ---
  const handleGoogleLogin = async () => {
    if (loading) return;
    const provider = new GoogleAuthProvider();

    setLoading(true);
    try {
      const res = await signInWithPopup(auth, provider);
      const userData = await verifyCoursierRole(res.user);
      toast.success(`Ravi de vous revoir, ${userData.nomComplet || 'Coursier'} !`);
      navigate("/espace-coursier");
    } catch (error) {
      toast.error(error.message || "Erreur lors de la connexion Google.");
    } finally {
      setLoading(false);
    }
  };

  // --- 🔐 OPTION 2 : CONNEXION VIA SCHÉMA ---
  const handlePatternLogin = async (e) => {
    e.preventDefault();
    let phone = cleanPhone(telephone);
    if (phone.length === 10 && !phone.startsWith("225")) {
      phone = "225" + phone;
    }

    if (phone.length !== 13) {
      return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    }
    if (pattern.length < 3) {
      return toast.error("Schéma trop court.");
    }

    setLoading(true);

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("telephone", "in", [phone, telephone, phone.slice(3)]));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error("Aucun compte associé à ce numéro de téléphone.");
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const technicalEmail = userData.email || `${phone}@livraison-moto.firebaseapp.com`;
      const technicalPassword = generatePatternPassword(pattern, phone);

      const userCredential = await signInWithEmailAndPassword(auth, technicalEmail, technicalPassword);
      const verifiedUserData = await verifyCoursierRole(userCredential.user);

      toast.success(`Ravi de vous revoir, ${verifiedUserData.nomComplet || 'Coursier'} !`);
      navigate("/espace-coursier");

    } catch (err) {
      console.error("Erreur Connexion Schéma :", err);
      if (err.code === "auth/internal-error" || err.message?.includes("503")) {
        toast.error("Le serveur est temporairement saturé. Veuillez réessayer.");
      } else if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.message?.includes("Aucun compte")) {
        toast.error("Aucun compte associé à ce numéro ou identifiants invalides.");
      } else if (err.code === "auth/wrong-password") {
        toast.error("Schéma incorrect.");
      } else {
        toast.error(err.message || "Échec de l'authentification. Veuillez vérifier vos accès.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <ToastContainer theme="dark" limit={1} position="top-center" />

      <button className="back-btn-float" type="button" onClick={() => navigate("/")}>
        <ArrowLeft size={22} />
      </button>

      <div className="auth-container">
        <header className="auth-header">
          <div className="logo-circle">
            <Package size={22} color="#10b981" />
          </div>
          <h1>MAMBO Coursier</h1>
          <p>AUTHENTIFICATION PARTENAIRE</p>
        </header>

        <div className="auth-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === "schema" ? "active" : ""}`}
            onClick={() => setActiveTab("schema")}
          >
            <Lock size={16} /> Schéma
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
          <form onSubmit={handlePatternLogin} className="auth-form">
            <div className="input-field">
              <Phone size={18} className="icon" />
              <input
                type="tel"
                placeholder="Numéro WhatsApp (ex: 07xxxxxxxx)"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                required
              />
            </div>

            <div className="pattern-login-section">
              <div className="lock-title">
                <Lock size={14} /> DESSINEZ VOTRE SCHÉMA
              </div>
              <div className="lock-wrapper">
                <MamboLock
                  onChange={(val) => setPattern(val)}
                  loading={loading}
                  size={150}
                />
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading || pattern.length < 3}>
              {loading ? <Loader2 className="animate-spin" size={20} /> : "DÉMARRER LE SERVICE"}
            </button>
          </form>
        ) : (
          <div className="google-login-container">
            <p className="google-notice">
              Utilisez votre compte Google professionnel associé à votre profil coursier MAMBO.
            </p>
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="google-action-btn"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt="Google logo"
                    width={20}
                    height={20}
                  />
                  Se connecter avec Google
                </>
              )}
            </button>
          </div>
        )}

        <div className="auth-footer-links">
          <p>Nouveau partenaire ?</p>
          <button
            type="button"
            className="switch-auth-btn"
            onClick={() => navigate("/inscription-coursier")}
          >
            Rejoindre la flotte →
          </button>
        </div>
      </div>
    </div>
  );
}