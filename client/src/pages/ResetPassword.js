import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";


export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Email de réinitialisation envoyé ✅");
    } catch (err) {
      setError("Impossible d’envoyer l’email. Vérifiez l’adresse.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card glass-effect">
        <h2 className="title">Réinitialiser le mot de passe</h2>
        <p className="subtitle">
          Entrez votre email pour recevoir un lien de réinitialisation.
        </p>

        <form onSubmit={handleReset} className="form-area">
          <div className="input-group">
            <input
              type="email"
              className="input-field"
              placeholder="Adresse email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Envoi..." : "Envoyer le lien"}
          </button>

          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}

          <p className="register-text">
            Retour à la connexion :{" "}
            <span className="register-link" onClick={() => navigate("/login")}>
              Se connecter
            </span>
          </p>
        </form>
      </div>
    </div>
  );
}
