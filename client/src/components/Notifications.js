// src/pages/Notifications.js
import React from "react";
import "./Notifications.css";

// Exemple d'icônes, à placer dans /src/assets/
import TruckIcon from "../assets/truck-outline.png";
import BoxIcon from "../assets/box-outline.png";
import WarningIcon from "../assets/warning-outline.png";

export default function Notifications() {
  const notifications = [
    { id: 1, text: "Votre colis est en route", icon: TruckIcon },
    { id: 2, text: "Nouveau suivi disponible", icon: BoxIcon },
    { id: 3, text: "Vérifiez votre adresse", icon: WarningIcon },
  ];

  return (
    <div className="notifications-page">
      <h2>Notifications</h2>
      <ul>
        {notifications.map((notif) => (
          <li key={notif.id}>
            <img src={notif.icon} alt="icon" className="notif-icon" />
            {notif.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
