import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allow, userRole }) {
  // 1. Si le rôle est encore en train de charger dans App.js
  if (userRole === null) {
    return (
      <div style={{ 
        height: '100vh', display: 'flex', alignItems: 'center', 
        justifyContent: 'center', background: '#0f172a', color: 'white' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', 
            borderTop: '3px solid #6366f1', borderRadius: '50%', 
            animation: 'spin 1s linear infinite', margin: '0 auto 15px' 
          }}></div>
          <p style={{ fontSize: '10px', fontWeight: '900', letterSpacing: '2px' }}>MAMBO SECURITY</p>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 2. Vérification des permissions (on force en minuscule pour éviter les erreurs de frappe)
  const normalizedRole = userRole.toLowerCase().trim();
  if (!allow.includes(normalizedRole)) {
    console.warn(`Accès refusé. Rôle requis: ${allow}. Rôle actuel: ${normalizedRole}`);
    return <Navigate to="/acces" replace />;
  }

  // 3. Autorisé
  return children;
}