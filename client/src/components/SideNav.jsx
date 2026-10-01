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
  FaTimes,
  FaInbox
} from "react-icons/fa";
import { QRCodeSVG } from "qrcode.react";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import "./SideMenu.css";

export default function SideNav({ isOpen, onClose, unreadCount = 0 }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [pendingDeliveries, setPendingDeliveries] = useState(0);
  const [localUnreadMessages, setLocalUnreadMessages] = useState(0);
  const [showQrModal, setShowQrModal] = useState(false);

  // URL fixe ou dynamique de l'application pour le QR code
  const shareUrl = "https://livraison-moto.web.app";

  // Écouteur pour les livraisons en cours
  useEffect(() => {
    if (!isOpen || !auth.currentUser) return;

    const q = query(
      collection(db, "livraisons"),
      where("clientId", "==", auth.currentUser.uid),
      where("status", "in", ["pending", "accepted", "picked_up"])
    );

    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        setPendingDeliveries(snapshot.size);
      },
      (error) => {
        console.warn("SideNav Firestore listener error:", error.message);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  // Écouteur de secours en temps réel pour la messagerie (messages non lus)
  useEffect(() => {
    if (!auth.currentUser) return;

    const qMessages = query(
      collection(db, "inAppMessages"),
      where("receiverId", "==", auth.currentUser.uid),
      where("read", "==", false)
    );

    const unsubscribeMessages = onSnapshot(
      qMessages,
      (snapshot) => {
        setLocalUnreadMessages(snapshot.size);
      },
      (error) => {
        console.warn("SideNav Messages listener error:", error.message);
      }
    );

    return () => unsubscribeMessages();
  }, []);

  // Utilisation de la prop unreadCount si elle est fournie, sinon du compteur local
  const totalUnread = unreadCount > 0 ? unreadCount : localUnreadMessages;

  useEffect(() => {
    const handleClickOutside = (event) => {
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

  return (
    <>
      {/* Badge flottant permanent visible sur l'écran même lorsque le menu est fermé si de nouveaux messages arrivent */}
      {!isOpen && totalUnread > 0 && (
        <button
          onClick={() => navigate("/client/boite-de-reception")}
          className="fixed bottom-6 right-6 z-[998] flex items-center gap-2 bg-red-600 text-white px-4 py-3 rounded-full shadow-2xl hover:bg-red-700 transition-all animate-bounce"
          aria-label="Nouveaux messages"
        >
          <FaInbox className="text-white" size={18} />
          <span className="text-xs font-bold">
            {totalUnread} nouveau{totalUnread > 1 ? 'x' : ''} message{totalUnread > 1 ? 's' : ''}
          </span>
        </button>
      )}

      {/* Si le menu latéral n'est pas ouvert, on s'arrête là */}
      {!isOpen ? null : (
        <div ref={menuRef} className="shadow-2xl edge-panel client-theme">
          <div className="p-3 mb-3 text-center border-b border-white/10">
            <div className="flex justify-center mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20">
                <FaUser className="text-white" size={18} />
              </div>
            </div>
          </div>

          {/* BOUTON ACCUEIL */}
          <div className="edge-option" onClick={() => {
            navigate("/client-home"); 
            onClose();
          }}>
            <FaHome className="icon-emerald" />
            <div className="label-mini">Accueil</div>
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

          {/* BOÎTE DE RÉCEPTION / MESSAGERIE AVEC BADGE DE NOTIFICATION */}
          <div className="relative edge-option" onClick={() => navTo("/client/boite-de-reception")}>
            <FaInbox className="icon-emerald" />
            <div className="label-mini">MESSAGERIE</div>
            {totalUnread > 0 && (
              <span className="m-client-badge">{totalUnread}</span>
            )}
          </div>

          <div className="edge-option" onClick={() => navTo("/profil-client")}>
            <FaUser className="icon-emerald" />
            <div className="label-mini">MON PROFIL</div>
          </div>

          {/* OPTION DE PARTAGE */}
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
      )}

      {/* MODALE DE PARTAGE QR CODE */}
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
            
            <div className="side-menu-qr-image-wrapper" style={{ display: "flex", justifyContent: "center", padding: "15px", background: "white", borderRadius: "12px", margin: "10px auto", width: "fit-content" }}>
              <QRCodeSVG
                value={shareUrl}
                size={180}
                bgColor={"#ffffff"}
                fgColor={"#0f172a"}
                level={"H"}
                includeMargin={false}
              />
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