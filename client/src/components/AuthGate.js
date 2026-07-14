import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function AuthGate({ children }) {
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      // 1. Si pas d'utilisateur, redirection login
      if (!user) {
        setChecking(false);
        navigate("/login", { replace: true });
        return;
      }

      try {
        // 2. Chercher l'utilisateur dans l'unique collection "users"
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
          const role = userDoc.data().role;

          // 3. Redirection intelligente selon le rôle détecté
          if (role === "admin") navigate("/admin-home", { replace: true });
          else if (role === "coursier") navigate("/espace-coursier", { replace: true });
          else if (role === "livreur") navigate("/livreur-home", { replace: true });
          else if (role === "vendeur") navigate("/vendeur-dashboard", { replace: true });
          else navigate("/client-home", { replace: true });
        } else {
          // Si le doc n'existe pas encore (nouvel utilisateur)
          navigate("/client-home", { replace: true });
        }
      } catch (error) {
        console.error("Erreur AuthGate:", error);
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
  }, [navigate]);

  if (checking) return null;

  return children;
}