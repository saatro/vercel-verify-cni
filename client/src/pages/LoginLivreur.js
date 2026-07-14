import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import { auth, db } from "../firebase";
import MamboLock from "../components/MamboLock";
import { cleanPhone, generatePatternPassword } from "../mamboUtils";
import "./LoginLivreur.css";

export default function LoginLivreur() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ telephone: "+225" });
  const [pattern, setPattern] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isGoogleRoute, setIsGoogleRoute] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        toast.error("Aucun compte partenaire trouvé pour ce profil Google. Veuillez vous inscrire.");
        await auth.signOut();
        return;
      }

      const userData = userDoc.data();
      
      
      if (userData.role === "livreur") {
        navigate("/livreur-home");
      } else {
        navigate(`/livreur-secteur/${userData.sectorZone || "default"}`);
      }
    } catch (err) {
      console.error("Erreur connexion Google :", err);
      toast.error("Échec de la connexion avec Google.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const phone = cleanPhone(form.telephone);

    if (phone.length !== 10) {
      return toast.error("Numéro WhatsApp invalide (10 chiffres requis).");
    }

    if (!isGoogleRoute && pattern.length < 3) {
      return toast.error("Veuillez dessiner votre schéma de sécurité.");
    }

    setLoading(true);

    try {
      let emailTrouve = "";

      // 1. Récupération automatique de l'email via Firestore avec le numéro WhatsApp
      const q = query(collection(db, "users"), where("telephone", "==", phone));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setLoading(false);
        return toast.error("Aucun compte partenaire associé à ce numéro WhatsApp.");
      }

      // Extraction de l'email du document utilisateur trouvé
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        emailTrouve = data.email;
      });

      if (!emailTrouve) {
        setLoading(false);
        return toast.error("Structure du compte invalide (Email manquant). Contactez le support.");
      }

      // 2. Génération du mot de passe basé sur le schéma et le téléphone
      const password = generatePatternPassword(pattern, phone);

      // 3. Tentative de connexion Firebase Auth avec l'email récupéré
      const creds = await signInWithEmailAndPassword(auth, emailTrouve, password);
      
      // 4. Récupération complète des données de session actuelles
      const userDoc = await getDoc(doc(db, "users", creds.user.uid));

      if (!userDoc.exists()) {
        toast.error("Données de profil introuvables. Contactez l'assistance.");
        await auth.signOut();
        return;
      }

      const userData = userDoc.data();
      toast.success(`Connexion réussie ! Content de vous revoir ${userData.prenom}.`);

      // 5. Redirection d'activité selon le secteur
      if (userData.role === "livreur") {
        navigate("/livreur-home");
      } else {
        navigate(`/livreur-secteur/${userData.sectorZone || "default"}`);
      }

    } catch (err) {
      console.error("Détails échec connexion livreur :", err.code, err.message);
      
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
        toast.error("Numéro WhatsApp ou Schéma de verrouillage incorrect.");
      } else {
        toast.error("Erreur lors de la connexion. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-master-wrapper">
      <ToastContainer theme="dark" position="top-center" limit={1} />
      
      <div className="scrollable-auth-zone">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft />
        </button>

        <div className="reg-card">
          <h2>Espace Partenaire</h2>
          <p className="sector-subtitle">Connexion à votre compte de livraison MAMBO</p>

          <div className="route-selector" style={{ display: "flex", gap: 10, marginBottom: 15 }}>
            <button 
              type="button" 
              onClick={() => setIsGoogleRoute(false)}
              style={{
                flex: 1, padding: 10, borderRadius: 10, border: "1.5px solid #e2e8f0", fontWeight: 700, fontSize: 12,
                backgroundColor: !isGoogleRoute ? "#1e293b" : "#ffffff",
                color: !isGoogleRoute ? "#ffffff" : "#1e293b"
              }}
            >
              Schéma Standard
            </button>
            <button 
              type="button" 
              onClick={() => setIsGoogleRoute(true)}
              style={{
                flex: 1, padding: 10, borderRadius: 10, border: "1.5px solid #e2e8f0", fontWeight: 700, fontSize: 12,
                backgroundColor: isGoogleRoute ? "#1e293b" : "#ffffff",
                color: isGoogleRoute ? "#ffffff" : "#1e293b"
              }}
            >
              Compte Google
            </button>
          </div>

          {isGoogleRoute ? (
            <div style={{ padding: "20px 0" }}>
              <button 
                type="button" 
                className="google-btn" 
                onClick={handleGoogleLogin} 
                disabled={loading}
                style={{ width: "100%", padding: 14, borderRadius: 12, fontWeight: 800, cursor: "pointer" }}
              >
                {loading ? <Loader2 className="mx-auto animate-spin" size={20} /> : "Se connecter avec Google"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin}>
              <input 
                placeholder="Numéro WhatsApp (Ex: 0700000000)" 
                type="tel" 
                value={form.telephone} 
                onChange={e => setForm({ ...form, telephone: e.target.value })} 
                required 
              />

              <div className="pattern-section" style={{ background: "#f8fafc", padding: 15, borderRadius: 20, border: "1.5px solid #e2e8f0", margin: "15px 0" }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textAlign: "center", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Lock size={12} /> DESSINEZ VOTRE SCHÉMA DE SÉCURITÉ
                </p>
                <div style={{ display: "flex", justifyContent: "center", touchAction: "none" }}>
                  <MamboLock value={pattern} onChange={setPattern} size={180} />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || pattern.length < 3}
                className="submit-btn"
                style={(loading || pattern.length < 3) ? { backgroundColor: "#cbd5e1", color: "#64748b", cursor: "not-allowed", boxShadow: "none" } : {}}
              >
                {loading ? <Loader2 className="mx-auto animate-spin" size={22} /> : "SE CONNECTER"}
              </button>
            </form>
          )}
          
          <p style={{ textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 20 }}>
            Pas encore de compte ?{" "}
            <span style={{ color: "#3b82f6", fontWeight: 700, cursor: "pointer" }} onClick={() => navigate(-1)}>
              Inscrivez-vous ici
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}