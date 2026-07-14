import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children, allow = [], userRole }) {
  const location = useLocation();

  // ✅ 1. PHASE DE CHARGEMENT STRICTE (Bloque la redirection tant que le rôle est inconnu)
  if (userRole === null || userRole === undefined || userRole === "loading") {
    return (
      <div className="shield-loader">
        <Loader2 className="animate-spin" size={40} color="#10b981" />
        <p>VÉRIFICATION...</p>
        <style>{`
          .shield-loader { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f172a; color: #64748b; }
          .shield-loader p { margin-top: 15px; font-size: 10px; letter-spacing: 4px; font-weight: 900; }
          .animate-spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Nettoyage préventif du rôle pour la comparaison
  const cleanRole = userRole.toLowerCase().trim();

  // ✅ 2. DÉFINITION DES ROUTES DE REDIRECTION (HOMES)
  const homeRoutes = {
    admin: "/admin-home",
    livreur: "/livreur-home",
    coursier: "/espace-coursier",
    vendeur: "/vendeur-dashboard",
    client: "/client-home",
    guest: "/acces"
  };

  // ✅ 3. VÉRIFICATION D'AUTORISATION COMPATIBLE ROLES DYNAMIQUES
  const isLivreurMatch = 
    (allow.includes("livreur") || allow.some(r => r.startsWith("livreur-"))) && 
    cleanRole.startsWith("livreur");

  const isAuthorized = 
    cleanRole === "admin" || 
    allow.includes(cleanRole) || 
    isLivreurMatch || 
    allow.length === 0;

  // ✅ 4. LOGIQUE DE REDIRECTION AMÉLIORÉE
  if (!isAuthorized) {
    const isLoginPage = location.pathname.includes("login") || location.pathname === "/acces" || location.pathname === "/";
    
    // Si on est sur une page d'authentification ou d'accès, on ne bloque jamais le rendu
    if (isLoginPage) return children;

    if (cleanRole === "guest") {
      console.warn(`🔒 Accès refusé (Guest) sur ${location.pathname}. Vers /acces`);
      return <Navigate to="/acces" state={{ from: location.pathname }} replace />;
    }

    // Détermination de la route cible de secours
    let targetRoute = homeRoutes[cleanRole] || "/client-home";
    
    // Gestion dynamique pour tous les livreurs régionaux (livreur-alepe, livreur-dabou, etc.)
    if (cleanRole.startsWith("livreur-")) {
      const zone = cleanRole.replace("livreur-", "");
      targetRoute = `/livreur-secteur/${zone}`;
    }

    // Évite une boucle infinie de redirection vers l'URL courante
    if (location.pathname === targetRoute) {
      return children;
    }

    console.warn(`🔒 Rôle [${userRole}] non autorisé sur ${location.pathname}. Vers ${targetRoute}`);
    return <Navigate to={targetRoute} replace />;
  }

  // ✅ 5. ACCÈS ACCORDÉ
  return children;
}