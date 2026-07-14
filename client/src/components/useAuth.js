import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    user: null,
    userRole: null,
    userData: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthState({
          user: null,
          userRole: null,
          userData: null,
          loading: false,
          error: null
        });
        return;
      }

      try {
        // Recherche centralisée dans la collection "users"
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          setAuthState({
            user,
            userRole: userData.role || "client", // "client" par défaut si le champ role est vide
            userData,
            loading: false,
            error: null
          });
        } else {
          // Cas où l'UID est dans Auth mais pas encore dans Firestore
          setAuthState({
            user,
            userRole: "guest",
            userData: null,
            loading: false,
            error: null
          });
        }
      } catch (error) {
        setAuthState({
          user,
          userRole: null,
          userData: null,
          loading: false,
          error: error.message
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return context;
}