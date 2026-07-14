import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";

/**
 * Hook pour récupérer et écouter le rôle de l'utilisateur en temps réel
 * @returns {{ role: string|null, loading: boolean, error: string|null, userData: object|null }}
 */
export default function useUserRole() {
  const [state, setState] = useState({
    role: null,
    loading: true,
    error: null,
    userData: null
  });

  useEffect(() => {
    let unsubscribeSnapshot = null;

    // Écouter les changements d'authentification
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Utilisateur déconnecté
        setState({
          role: null,
          loading: false,
          error: null,
          userData: null
        });
        
        // Nettoyer l'écouteur Firestore si existant
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
        return;
      }

      // Utilisateur connecté - Écouter son document en temps réel
      const userRef = doc(db, "users", user.uid);
      
      unsubscribeSnapshot = onSnapshot(
        userRef,
        (userSnap) => {
          if (userSnap.exists()) {
            const data = userSnap.data();
            console.log("✅ Rôle récupéré:", data.role);
            
            setState({
              role: data.role || "client",
              loading: false,
              error: null,
              userData: data
            });
          } else {
            // Document n'existe pas
            console.warn("⚠️ Document utilisateur introuvable, fallback à 'client'");
            
            setState({
              role: "client",
              loading: false,
              error: "Document utilisateur introuvable",
              userData: null
            });
          }
        },
        (error) => {
          // Erreur lors de l'écoute
          console.error("❌ Erreur récupération rôle:", error);
          
          setState({
            role: null,
            loading: false,
            error: error.message,
            userData: null
          });
        }
      );
    });

    // Cleanup
    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  return state;
}

/**
 * Hook simplifié qui retourne seulement le rôle (compatible avec votre code existant)
 * @returns {{ role: string|null, loading: boolean }}
 */
export function useUserRoleSimple() {
  const { role, loading } = useUserRole();
  return { role, loading };
}