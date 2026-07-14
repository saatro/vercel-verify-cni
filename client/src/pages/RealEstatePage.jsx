import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Info, MapPin, Home, Bed, Bath, ChevronRight, Phone } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";

export default function RealEstatePage() {
  const navigate = useNavigate();
  
  const [properties, setProperties] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Récupération des Agences Immobilières
    const vQuery = query(
      collection(db, "vendors"), 
      where("enseigne", "==", "Immobilier")
    );
    
    const unsubscribeAgencies = onSnapshot(vQuery, (vSnapshot) => {
      const agencyList = vSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAgencies(agencyList);

      // 2. Récupération des Biens (Appartements, Studios, Maisons)
      const pQuery = query(
        collection(db, "products"), 
        where("type", "==", "immobilier") 
      );

      const unsubscribeProducts = onSnapshot(pQuery, (pSnapshot) => {
        const productList = pSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProperties(productList);
        setLoading(false);
      });

      return () => unsubscribeProducts();
    });

    return () => unsubscribeAgencies();
  }, []);

  // Filtrage intelligent
  const filteredProperties = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return properties;
    return properties.filter(p => 
      p.nom?.toLowerCase().includes(term) || 
      p.description?.toLowerCase().includes(term) ||
      p.nomBoutique?.toLowerCase().includes(term)
    );
  }, [properties, searchTerm]);

  return (
    <div className="re-container">
      <ToastContainer />
      
      <header className="re-header">
        <div className="re-nav-top">
          <button onClick={() => navigate(-1)} className="re-back-btn"><ArrowLeft size={22} /></button>
          <div className="re-title-group">
            <h1>Immobilier</h1>
            <p>{properties.length} annonces disponibles</p>
          </div>
          <div className="re-placeholder"></div>
        </div>
        
        <div className="re-search-wrapper">
          <Search size={18} className="re-search-icon" />
          <input 
            type="text" 
            placeholder="Studio, 2 pièces, Cocody..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="re-alert-banner">
          <Info size={14} />
          <p>Enregistrez le contact <strong>Assistance</strong> pour confirmer vos visites.</p>
        </div>
      </header>

      <main className="re-content">
        {loading ? (
          <div className="re-loading">Recherche des meilleures offres...</div>
        ) : filteredProperties.length > 0 ? (
          <div className="re-grid">
            {filteredProperties.map(p => (
              <div key={p.id} className="re-card" onClick={() => navigate(`/product/${p.id}`)}>
                <div className="re-card-image">
                  <img src={p.image || p.images?.[0] || "/placeholder.png"} alt={p.nom} />
                  <div className="re-price-tag">{p.prix?.toLocaleString()} F /mois</div>
                </div>
                
                <div className="re-card-body">
                  <div className="re-agency-info">
                    <img src={p.logoBoutique || "/placeholder.png"} alt="" className="re-agency-logo" />
                    <span>{p.nomBoutique}</span>
                  </div>
                  
                  <h3 className="re-property-title">{p.nom}</h3>
                  
                  <div className="re-property-meta">
                    <span><MapPin size={12} /> {p.adresse || "Abidjan"}</span>
                  </div>

                  <div className="re-property-features">
                    {p.unite && <div className="re-feature"><span>{p.unite}</span></div>}
                    <div className="re-feature"><span>Vérifié</span></div>
                  </div>

                  <button className="re-btn-contact" onClick={(e) => {
                    e.stopPropagation();
                    window.location.href = `tel:${p.telephone || "0500185364"}`;
                  }}>
                    <Phone size={14} /> Contacter l'agent
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="re-empty">
            <Home size={40} opacity={0.2} />
            <p>Aucun bien immobilier ne correspond à votre recherche.</p>
          </div>
        )}
      </main>

      <style>{`
        .re-container { background: #f8f9fc; min-height: 100vh; padding-bottom: 40px; font-family: 'Inter', sans-serif; }
        .re-header { background: #fff; padding: 15px 16px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
        .re-nav-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .re-title-group h1 { font-size: 1.2rem; font-weight: 800; color: #1a1a1a; margin: 0; }
        .re-title-group p { font-size: 0.75rem; color: #717171; margin: 0; }
        .re-back-btn { background: #f1f3f7; border: none; border-radius: 12px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; color: #1a1a1a; }
        
        .re-search-wrapper { background: #f1f3f7; border-radius: 14px; display: flex; align-items: center; padding: 12px 16px; gap: 10px; }
        .re-search-wrapper input { background: transparent; border: none; font-size: 0.95rem; width: 100%; outline: none; }
        
        .re-alert-banner { display: flex; align-items: center; gap: 8px; background: #1e293b; color: #fff; padding: 10px 14px; border-radius: 10px; margin-top: 15px; font-size: 0.75rem; }
        
        .re-content { padding: 20px 16px; }
        .re-grid { display: flex; flex-direction: column; gap: 20px; }
        
        .re-card { background: #fff; border-radius: 20px; overflow: hidden; border: 1px solid #edf2f7; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .re-card-image { position: relative; width: 100%; height: 220px; }
        .re-card-image img { width: 100%; height: 100%; object-fit: cover; }
        
        .re-price-tag { position: absolute; bottom: 15px; left: 15px; background: #6d28d9; color: #fff; padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 0.9rem; }
        
        .re-card-body { padding: 16px; }
        .re-agency-info { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .re-agency-logo { width: 20px; height: 20px; border-radius: 50%; border: 1px solid #eee; }
        .re-agency-info span { font-size: 0.7rem; font-weight: 600; color: #64748b; text-transform: uppercase; }
        
        .re-property-title { font-size: 1.1rem; font-weight: 700; color: #1e293b; margin: 0 0 8px 0; }
        .re-property-meta { font-size: 0.8rem; color: #64748b; margin-bottom: 12px; }
        
        .re-property-features { display: flex; gap: 10px; margin-bottom: 15px; }
        .re-feature { background: #f1f5f9; padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; color: #475569; }
        
        .re-btn-contact { width: 100%; background: #fff; border: 1.5px solid #6d28d9; color: #6d28d9; padding: 10px; border-radius: 12px; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; }
        .re-btn-contact:active { background: #6d28d9; color: #fff; }

        .re-loading, .re-empty { text-align: center; padding: 100px 20px; color: #94a3b8; }
      `}</style>
    </div>
  );
}