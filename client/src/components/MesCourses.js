import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  getDoc
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { 
  Clock, 
  Package, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Truck,
  Calendar,
  ShoppingBag,
  MapPin,
  ShieldCheck
} from "lucide-react";
import ClientFooter from "../components/ClientFooter";
import "./MesCourses.css";

export default function MesCourses() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [userRole, setUserRole] = useState("client");

  useEffect(() => {
    if (!auth.currentUser) return;

    const initPage = async () => {
      // 1. Détection du rôle de l'utilisateur
      const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      const role = userSnap.exists() ? userSnap.data().role?.toLowerCase().trim() : "client";
      setUserRole(role);

      // 2. Requête adaptée au rôle
      const filterField = role === "livreur" ? "livreurId" : "userId";
      
      // Configuration de la requête principale avec tri par date
      const qOrders = query(
        collection(db, "orders"),
        where(filterField, "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
      );

      const unsubscribe = onSnapshot(qOrders, (snapshot) => {
        const docs = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setOrders(docs);
        setLoading(false);
      }, (error) => {
        console.error("Erreur Firestore avec orderBy (Index manquant ?) :", error);
        
        // ALTERNATIVE PROFESSIONNELLE : Si l'index composite Firestore n'est pas encore créé ou actif,
        // on bascule automatiquement sur une requête simple résiliente et on gère le tri côté client pour éviter le crash.
        const fallbackQuery = query(
          collection(db, "orders"),
          where(filterField, "==", auth.currentUser.uid)
        );
        
        const fallbackUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
          const docs = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          })).sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA; // Tri décroissant (desc)
          });
          setOrders(docs);
          setLoading(false);
        }, (err2) => {
          console.error("Échec de la requête de secours :", err2);
          setLoading(false);
        });

        return fallbackUnsubscribe;
      });

      return unsubscribe;
    };

    let unsub;
    initPage().then(u => unsub = u);
    return () => unsub && unsub();
  }, []);

  // Filtrage intelligent incluant le statut de réassurance et d'assignation
  const filteredOrders = orders.filter(o => {
    const activeStatus = ["paye", "paye_ia_valide", "assigned", "attente_verification", "en_preparation", "en_livraison"];
    return filter === "active" 
      ? activeStatus.includes(o.status) 
      : !activeStatus.includes(o.status);
  });

  // Gestionnaire des styles de statuts enrichis pour maximiser la réassurance client
  const getStatusStyle = (status) => {
    const styles = {
      attente_verification: { text: "Vérification...", color: "#f59e0b", icon: Clock },
      paye_ia_valide: { text: "Fonds sécurisés (Wave) ✓", color: "#10b981", icon: ShieldCheck },
      paye: { text: "Confirmé", color: "#10b981", icon: CheckCircle2 },
      assigned: { text: "Livreur trouvé", color: "#6366f1", icon: Truck },
      en_preparation: { text: "En préparation", color: "#3b82f6", icon: Package },
      en_livraison: { text: "En route", color: "#8b5cf6", icon: Truck },
      livre: { text: "Livré", color: "#10b981", icon: CheckCircle2 },
      annulee: { text: "Annulé", color: "#ef4444", icon: AlertCircle }
    };
    return styles[status] || { text: status, color: "#64748b", icon: AlertCircle };
  };

  return (
    <div className="mes-courses-container">
      <header className="courses-header">
        <h1 className="text-xl font-bold tracking-tight uppercase">
          {userRole === "livreur" ? "Mes Missions" : "Mes Commandes"}
        </h1>
        <div className="tabs">
          <button 
            className={`tab ${filter === "active" ? "active" : ""}`}
            onClick={() => setFilter("active")}
          >
            {userRole === "livreur" ? "À livrer" : "En cours"}
          </button>
          <button 
            className={`tab ${filter === "completed" ? "active" : ""}`}
            onClick={() => setFilter("completed")}
          >
            Historique
          </button>
        </div>
      </header>

      <main className="courses-list">
        {loading ? (
          <div className="loader-container">
            <div className="spinner"></div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <ShoppingBag size={48} className="mb-3 opacity-20" />
            <p>Aucune course trouvée</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const style = getStatusStyle(order.status);
            const StatusIcon = style.icon;
            
            return (
              <div 
                key={order.id} 
                className="order-card-premium"
                style={{
                  borderLeft: order.status === "paye_ia_valide" ? "4px solid #10b981" : "transparent"
                }}
              >
                <div className="order-card-header">
                  <div className="date-info">
                    <Calendar size={13} />
                    <span>{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('fr-FR') : "Date..."}</span>
                  </div>
                  <div className="status-badge" style={{ background: `${style.color}15`, color: style.color, fontWeight: 800 }}>
                    <StatusIcon size={12} className={["en_livraison", "paye_ia_valide"].includes(order.status) ? "animate-pulse" : ""} />
                    {style.text}
                  </div>
                </div>

                <div className="order-body">
                  {/* Message contextuel de réassurance haute priorité pour le client — Distinction sémantique Livreur / Coursier respectée */}
                  {userRole !== "livreur" && order.status === "paye_ia_valide" && (
                    <div style={{ background: "#f0fdf4", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 11, color: "#166534", fontWeight: 600 }}>
                      🛡️ Votre paiement a été authentifié avec succès. Le commerçant prépare votre commande et un livreur vous appellera sous peu pour la livraison.
                    </div>
                  )}

                  <div className="items-list">
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item, i) => (
                        <div key={i} className="item-row">
                          <span className="qty">{item.quantity || item.qty || 1}x</span>
                          <span className="name">{item.nom || item.title || "Article"}</span>
                        </div>
                      ))
                    ) : (
                      <div className="item-row">
                        <span className="qty">1x</span>
                        <span className="name">{order.nom || "Détails de la commande"}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Adresse d'enlèvement et de destination affichées de manière claire */}
                  {order.adresse && (
                    <div className="delivery-address" style={{ marginTop: 8 }}>
                      <MapPin size={14} style={{ color: "#64748b", flexShrink: 0 }} />
                      <span style={{ color: "#475569", fontSize: 12 }}>{order.adresse}</span>
                    </div>
                  )}
                </div>

                <div className="order-card-footer">
                  <div className="price-tag">
                    <span className="label">{userRole === "livreur" ? "Gain" : "Total payé"}</span>
                    <span className="value">
                      {Number(order.total || order.amount || order.price || 0).toLocaleString()} F
                    </span>
                  </div>
                  
                  <button 
                    className={`action-btn ${userRole === "livreur" || order.status === "paye_ia_valide" ? "primary" : ""}`}
                    onClick={() => {/* Redirection vers détails/tracking */}}
                  >
                    {userRole === "livreur" ? "Détails Mission" : "Suivi en direct"}
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>

      <ClientFooter />
    </div>
  );
}