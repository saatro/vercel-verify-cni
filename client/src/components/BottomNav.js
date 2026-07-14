import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
// ✅ Correction : 'Package' a été retiré de la liste ci-dessous
import { Home, User, Store, Truck, Settings, ShoppingBag } from "lucide-react";

export default function BottomNav() {
  const navigate = useNavigate();
  const [role, setRole] = useState(null);

  useEffect(() => {
    const fetchRole = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) setRole(userDoc.data().role);
        } catch (error) {
          console.error("Erreur lors de la récupération du rôle:", error);
        }
      }
    };
    fetchRole();
  }, []);

  return (
    <nav className="mobile-bottom-nav">
      <button onClick={() => navigate("/")} className="nav-item">
        <Home size={21} />
        <span>Accueil</span>
      </button>

      {/* Bouton Central Dynamique selon le rôle */}
      {role === "vendeur" ? (
        <button onClick={() => navigate("/vendeur-dashboard")} className="nav-item active">
          <Store size={21} />
          <span>Boutique</span>
        </button>
      ) : role === "livreur" ? (
        <button onClick={() => navigate("/livreur-home")} className="nav-item active">
          <Truck size={21} />
          <span>Courses</span>
        </button>
      ) : (
        <button onClick={() => navigate("/marketplace")} className="nav-item">
          <ShoppingBag size={21} />
          <span>Marché</span>
        </button>
      )}

      <button onClick={() => navigate("/profil")} className="nav-item">
        <User size={21} />
        <span>Profil</span>
      </button>

      <button onClick={() => navigate("/settings")} className="nav-item">
        <Settings size={21} />
        <span>Menu</span>
      </button>
    </nav>
  );
}