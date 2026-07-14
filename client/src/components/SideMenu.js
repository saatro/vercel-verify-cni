import React, { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FaSignOutAlt, 
  FaUser, 
  FaWallet, 
  FaHome, 
  FaTruck,
  FaCoins
} from "react-icons/fa";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import "./SideMenu.css";

export default function SideMenu({ isOpen, onClose, userRole, activeCoursesCount = 0 }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onClose();
      navigate("/acces");
    } catch (error) {
      console.error("Erreur déconnexion:", error);
    }
  };

  const navTo = (path) => {
    navigate(path);
    onClose();
  };

  if (!isOpen || userRole === "admin") return null;

  return (
    <div ref={menuRef} className="shadow-2xl edge-panel">
      {/* --- HEADER DU MENU --- */}
      <div className="p-4 mb-3 text-center border-b border-white/10 bg-zinc-900/50">
        <div className="flex justify-center mb-2">
          <div className="flex items-center justify-center w-12 h-12 border rounded-full bg-indigo-500/20 border-indigo-500/30">
            <FaUser className="text-indigo-400" size={20} />
          </div>
        </div>
        <span className="text-[10px] font-black text-white/80 uppercase tracking-[0.2em]">
          {userRole === "livreur" && "ESPACE LIVREUR"}
          {userRole === "coursier" && "COURSIER INDÉPENDANT"}
          {userRole === "vendeur" && "PARTENAIRE VENDEUR"}
          {userRole === "client" && "ESPACE CLIENT"}
          {userRole === "guest" && "SESSION INVITÉ"}
        </span>
      </div>

      <div className="flex flex-col gap-1 px-2">
        {/* --- ACCUEIL --- */}
        <div className="edge-option" onClick={() => {
          if (userRole === "livreur") navTo("/livreur-dashboard");
          else if (userRole === "coursier") navTo("/espace-coursier");
          else if (userRole === "vendeur") navTo("/vendeur-dashboard");
          else navTo("/client-home");
        }}>
          <FaHome className="icon-violet" />
          <div className="label-mini">TABLEAU DE BORD</div>
        </div>

        {/* --- OPTIONS LIVREUR / COURSIER --- */}
        {(userRole === "livreur" || userRole === "coursier") && (
          <>
            <div className="edge-option" onClick={() => navTo("/upload-recu")}>
              <FaCoins className="text-yellow-500 icon-violet" />
              <div className="label-mini">Recharger Jetons</div>
            </div>
            <div className="edge-option" onClick={() => navTo("/historique-gains")}>
              <FaWallet className="icon-violet" />
              <div className="label-mini">Mes gains & Solde</div>
            </div>
          </>
        )}

        {/* --- LIVRAISONS EN COURS --- */}
        {userRole !== "vendeur" && (
          <div className="relative edge-option" onClick={() => navTo("/mes-courses")}>
            <FaTruck className="icon-violet" />
            <div className="label-mini">Courses Actives</div>
            {activeCoursesCount > 0 && (
              <span className="m-badge-notif animate-pulse">{activeCoursesCount}</span>
            )}
          </div>
        )}

        {/* --- PROFIL --- */}
        <div className="edge-option" onClick={() => {
          if (userRole === "client" || userRole === "guest") navTo("/profil-client");
          else navTo("/profil-livreur");
        }}>
          <FaUser className="icon-violet" />
          <div className="label-mini">Mon Compte</div>
        </div>
      </div>

      <div className="flex-1"></div>

      {/* --- DÉCONNEXION --- */}
      <div className="mt-4 border-t border-white/5 edge-option logout-btn" onClick={handleLogout}>
        <FaSignOutAlt className="text-red-400" />
        <div className="text-red-400 label-mini">Déconnexion</div>
      </div>
    </div>
  );
}