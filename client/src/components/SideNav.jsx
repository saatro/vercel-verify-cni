import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FaSignOutAlt, 
  FaUser, 
  FaHome, 
  FaShoppingBag,
  FaHistory,
  FaStore,
  FaTruck,
  FaQrcode,
  FaShareAlt,
  FaTimes
} from "react-icons/fa";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import "./SideMenu.css";

export default function SideNav({ isOpen, onClose }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [pendingDeliveries, setPendingDeliveries] = useState(0);
  const [showQrModal, setShowQrModal] = useState(false);

  // Génération dynamique de l'URL du QR code basée sur l'hôte actuel
  const shareUrl = window.location.origin;
  const qrCodeImageUrl = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(shareUrl)}&choe=UTF-8&chld=L|2`;

  useEffect(() => {
    if (!isOpen || !auth.currentUser) return;

    const q = query(
      collection(db, "livraisons"),
      where("clientId", "==", auth.currentUser.uid),
      where("status", "in", ["pending", "accepted", "picked_up"])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingDeliveries(snapshot.size);
    });

    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Évite la fermeture si on clique à l'intérieur de la modale QR code
      if (showQrModal) return; 
      
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, showQrModal]);

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

  if (!isOpen) return null;

  return (
    <>
      <div ref={menuRef} className="shadow-2xl edge-panel client-theme">
        <div className="p-3 mb-3 text-center border-b border-white/10">
          <div className="flex justify-center mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20">
              <FaUser className="text-emerald-400" size={18} />
            </div>
          </div>
          <span className="text-[9px] font-black text-white uppercase tracking-widest">
            ESPACE CLIENT
          </span>
        </div>

        {/* BOUTON ACCUEIL CORRIGÉ */}
        <div className="edge-option" onClick={() => {
          navigate("/client-home"); 
          onClose();
        }}>
          <FaHome className="icon-emerald" />
          <div className="label-mini">ACCUEIL</div>
        </div>

        <div className="edge-option" onClick={() => navTo("/marketplace-full")}>
          <FaStore className="icon-emerald" />
          <div className="label-mini">LE MARCHÉ</div>
        </div>

        <div className="edge-option" onClick={() => navTo("/cart")}>
          <FaShoppingBag className="icon-emerald" />
          <div className="label-mini">MON PANIER</div>
        </div>

        <div className="relative edge-option" onClick={() => navTo("/mes-courses")}>
          {pendingDeliveries > 0 ? (
            <FaTruck className="icon-emerald animate-bounce-slow" />
          ) : (
            <FaHistory className="icon-emerald" />
          )}
          <div className="label-mini">
            {pendingDeliveries > 0 ? "SUIVI EN COURS" : "MES COMMANDES"}
          </div>
          {pendingDeliveries > 0 && (
            <span className="m-client-badge">{pendingDeliveries}</span>
          )}
        </div>

        <div className="edge-option" onClick={() => navTo("/profil-client")}>
          <FaUser className="icon-emerald" />
          <div className="label-mini">MON PROFIL</div>
        </div>

        {/* NOUVELLE OPTION DE PARTAGE AJOUTÉE PROPREMENT */}
        <div className="edge-option share-option-highlight" onClick={() => setShowQrModal(true)}>
          <FaQrcode className="icon-emerald" />
          <div className="label-mini">PARTAGER L'APP</div>
        </div>

        <div className="flex-1"></div>

        <div className="mt-4 edge-option logout-btn" onClick={handleLogout}>
          <FaSignOutAlt />
          <div className="label-mini">DÉCONNEXION</div>
        </div>
      </div>

      {/* MODALE DE PARTAGE QR CODE INTEGRÉE */}
      {showQrModal && (
        <div className="side-menu-qr-overlay" onClick={() => setShowQrModal(false)}>
          <div className="side-menu-qr-content" onClick={(e) => e.stopPropagation()}>
            <button className="side-menu-qr-close" onClick={() => setShowQrModal(false)}>
              <FaTimes size={16} />
            </button>
            <div className="side-menu-qr-header">
              <div className="side-menu-qr-icon-circle">
                <FaShareAlt size={18} className="text-emerald-500" />
              </div>
              <h3>Partager Mambo</h3>
              <p>Faites scanner ce code QR pour ouvrir et utiliser l'application instantanément.</p>
            </div>
            <div className="side-menu-qr-image-wrapper">
              <img src={qrCodeImageUrl} alt="QR Code Mambo" className="side-menu-qr-img" />
            </div>
            <div className="side-menu-qr-footer">
              <span>{shareUrl}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}