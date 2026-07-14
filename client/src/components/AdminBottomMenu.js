import React from "react";
import { 
  MdHome, 
  MdPeople, 
  MdDeliveryDining, 
  MdMonetizationOn, 
  MdSecurity, 
  MdFactCheck,
  MdLocationSearching // Nouvelle icône pour le diagnostic GPS
} from "react-icons/md";
import { useLocation, useNavigate } from "react-router-dom";
import "./AdminBottomMenu.css";

export default function AdminBottomMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveClass = (path) => 
    location.pathname.toLowerCase() === path.toLowerCase() ? "menu-item active" : "menu-item";

  const menuItems = [
    { label: "Accueil", icon: MdHome, path: "/admin-home" },
    { label: "Clients", icon: MdPeople, path: "/gestion-clients" },
    { label: "Livreurs", icon: MdDeliveryDining, path: "/gestion-livreurs" },
    { label: "GPS", icon: MdLocationSearching, path: "/gps-diagnostic" }, // Ajout du diagnostic
    { label: "Jetons", icon: MdMonetizationOn, path: "/gestion-jetons" },
    { label: "Fraude", icon: MdSecurity, path: "/admin-fraud" },
    { label: "Preuves", icon: MdFactCheck, path: "/admin-proofs" },
  ];

  return (
    <nav className="admin-bottom-menu">
      {menuItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button 
            key={`${item.path}-${index}`}
            className={getActiveClass(item.path)} 
            onClick={() => navigate(item.path)}
          >
            <div className="icon-wrapper">
              <Icon className="menu-icon" />
            </div>
            <span className="menu-label">{item.label}</span>
            <div className="active-dot"></div>
          </button>
        );
      })}
    </nav>
  );
}