import { Home, User, Clock, LogOut } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { toast } from "react-toastify";
import "./ClientFooter.css";

/**
 * Footer de navigation pour les clients
 * Affiche : Accueil, Mes courses, Profil, Déconnexion
 */
export default function ClientFooter() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success("Déconnexion réussie");
      navigate("/acces");
    } catch (error) {
      console.error("Erreur déconnexion:", error);
      toast.error("Erreur lors de la déconnexion");
    }
  };

  const menuItems = [
    {
      id: "home",
      label: "Accueil",
      icon: Home,
      path: "/client-home",
      color: "#10b981"
    },
    {
      id: "courses",
      label: "Courses",
      icon: Clock,
      path: "/mes-courses",
      color: "#f59e0b"
    },
 
    {
      id: "profile",
      label: "Profil",
      icon: User,
      path: "/profil-client",
      color: "#6366f1"
    }
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <footer className="client-footer">
      <div className="footer-content">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`footer-item ${active ? "active" : ""}`}
              style={{
                "--item-color": item.color
              }}
            >
              <div className="icon-wrapper">
                <Icon 
                  size={21} 
                  strokeWidth={active ? 1 : 1}
                />
                {active && <div className="active-dot"></div>}
              </div>
              <span className="item-label">{item.label}</span>
            </button>
          );
        })}

        {/* Bouton déconnexion discret */}
        <button
          onClick={handleLogout}
          className="footer-item logout"
          title="Déconnexion"
        >
          <div className="icon-wrapper">
            <LogOut size={20} strokeWidth={2} />
          </div>
          <span className="item-label">Sortir</span>
        </button>
      </div>

      {/* Safe area pour iPhone */}
      <div className="footer-safe-area"></div>
    </footer>
  );
}