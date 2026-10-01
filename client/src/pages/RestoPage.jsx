/* eslint-disable no-unused-vars */
import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Clock,
  Star,
  MapPin,
  UtensilsCrossed,
  Info,
  ShoppingCart,
} from "lucide-react";

/** Vendeur restaurant uniquement */
function isRestoUser(user) {
  const type = (user.type || user.categorie || user.categorieBoutique || "").toLowerCase();
  const enseigne = (user.enseigne || "").toLowerCase();
  const nom = (user.nomBoutique || "").toLowerCase();
  return (
    type.includes("resto") ||
    enseigne.includes("resto") ||
    enseigne.includes("restaurant") ||
    nom.includes("restaurant") ||
    nom.includes("resto")
  );
}

export default function RestoPage() {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchRestos = async () => {
      try {
        setLoading(true);

        // Vendeurs role=vendeur filtrés "restaurant"
        const q = query(collection(db, "users"), where("role", "==", "vendeur"));
        const snapshot = await getDocs(q);
        let list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isRestoUser);

        // Fallback : vendeurs ayant des produits type "resto"
        if (list.length === 0) {
          const pq = query(collection(db, "products"), where("type", "==", "resto"));
          const pSnap = await getDocs(pq);
          const vendorIds = [
            ...new Set(
              pSnap.docs
                .map((d) => d.data().vendorId || d.data().vendeurId)
                .filter(Boolean)
            ),
          ];
          const fromProducts = [];
          for (const vid of vendorIds) {
            const s = await getDoc(doc(db, "users", vid));
            if (s.exists()) fromProducts.push({ id: s.id, ...s.data() });
          }
          list = fromProducts;
        }

        if (isMounted) {
          setRestaurants(list);
          setLoading(false);
        }
      } catch (err) {
        console.error("Erreur récupération restaurants:", err);
        if (isMounted) setLoading(false);
      }
    };

    fetchRestos();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRestos = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return restaurants;
    return restaurants.filter(
      (r) =>
        r.nomBoutique?.toLowerCase().includes(term) ||
        r.specialite?.toLowerCase().includes(term) ||
        r.enseigne?.toLowerCase().includes(term) ||
        r.adresse?.toLowerCase().includes(term)
    );
  }, [restaurants, searchTerm]);

  return (
    <div className="r-page-container">
      <header className="r-header">
        <div className="r-nav">
          <button type="button" onClick={() => navigate(-1)} className="r-back-btn">
            <ArrowLeft size={24} />
          </button>
          <h1 className="r-title">Restaurants</h1>
          <button type="button" onClick={() => navigate("/cart")} className="r-cart-btn">
            <ShoppingCart size={20} />
          </button>
        </div>

        <div className="r-search">
          <Search size={18} className="r-search-icon" />
          <input
            type="text"
            placeholder="Une envie ? (Pizza, Ivoirien, Grillades...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        
      </header>

      <main className="r-content">
        {loading ? (
          <div className="r-loader">Préparation des menus...</div>
        ) : filteredRestos.length > 0 ? (
          <div className="r-grid">
            {filteredRestos.map((resto) => (
              <div
                key={resto.id}
                className="r-card"
                onClick={() => navigate(`/store/${resto.id}`)}
              >
                <div className="r-card-img">
                  <img
                    src={
                      resto.couverture ||
                      resto.photoURL ||
                      "https://placehold.co/600x400/7c3aed/ffffff/png?text=Restaurant"
                    }
                    alt={resto.nomBoutique || resto.enseigne}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src =
                        "https://placehold.co/600x400/7c3aed/ffffff/png?text=Restaurant";
                    }}
                  />
                  {resto.isOpen === false && <div className="r-closed-overlay">Fermé</div>}
                </div>
                <div className="r-card-body">
                  <div className="r-card-header">
                    <h3>{resto.nomBoutique || resto.enseigne || "Restaurant"}</h3>
                    <div className="r-rating">
                      <Star size={12} fill="currentColor" /> 4.5
                    </div>
                  </div>
                  <p className="r-speciality">{resto.specialite || "Cuisine variée"}</p>
                  <div className="r-meta">
                    <div className="r-meta-item">
                      <Clock size={14} /> 20-35 min
                    </div>
                    <div className="r-meta-item">
                      <MapPin size={14} /> {resto.adresse || resto.commune || "Abidjan"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="r-empty">
            <UtensilsCrossed size={48} opacity={0.2} />
            <p>Aucun restaurant ne correspond à votre recherche.</p>
          </div>
        )}
      </main>

      <style>{`
        .r-page-container { background: #fafafa; min-height: 100vh; font-family: Inter, system-ui, sans-serif; }
        .r-header {
          background: #fff; padding: 15px; position: sticky; top: 0; z-index: 100;
          border-bottom: 4px solid rgba(104, 5, 233, 0.75);
          border-radius: 0 0 36px 36px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }
        .r-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .r-title { font-size: 1.3rem; font-weight: 800; color: #111; margin: 0; }
        .r-back-btn, .r-cart-btn {
          background: #f3f4f6; border: none; width: 40px; height: 40px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .r-search {
          background: #f3f4f6; border-radius: 12px; display: flex; align-items: center;
          padding: 5px; gap: 10px;
        }
        .r-search input { background: transparent; border: none; width: 100%; outline: none; font-size: 0.95rem; }
        .r-search-icon { color: #9ca3af; }
        .r-wave-banner {
          background: #6d28d9; color: #fff; margin-top: 15px; padding: 12px; border-radius: 12px;
          display: flex; gap: 10px; align-items: center; font-size: 0.8rem; line-height: 1.4;
        }
        
        .r-content { padding: 15px; }
        .r-grid { display: flex; flex-direction: column; gap: 20px; }
        .r-card {
          background: #fff; border-radius: 20px; overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.05); cursor: pointer;
        }
        .r-card-img { height: 350px; position: relative; }
        .r-card-img img { width: 100%; height: 100%; padding: 21px; justify-content: center; align-items: center; object-fit: cover; display: block; }
        .r-closed-overlay {
          position: absolute; inset: 0; background: rgba(0,0,0,0.6); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; text-transform: uppercase;
        }
        .r-card-body { padding: 5px; }
        .r-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        .r-card-header h3 { margin: 0; font-size: 1.1rem; color: #111; font-weight: 700; }
        .r-rating {
          background: #fef3c7; color: #d97706; padding: 2px 8px; border-radius: 6px;
          font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 4px;
        }
        .r-speciality { color: #6b7280; font-size: 0.85rem; margin-bottom: 12px; }
        .r-meta { display: flex; gap: 15px; border-top: 1px solid #f3f4f6; padding-top: 12px; }
        .r-meta-item { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; color: #4b5563; font-weight: 500; }
        .r-loader, .r-empty { text-align: center; padding: 60px 20px; color: #9ca3af; }
      `}</style>
    </div>
  );
}
