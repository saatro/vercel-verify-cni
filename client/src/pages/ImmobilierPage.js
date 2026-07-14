import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Info, Home } from "lucide-react";
import "./SupermarketPage.css"; // On réutilise le même CSS pour la cohérence

const SkeletonSection = () => (
  <div className="shelf-section skeleton-pulse">
    <div className="shelf-top" style={{ marginBottom: '15px' }}>
      <div style={{ width: '150px', height: '35px', background: '#e2e8f0', borderRadius: '8px' }}></div>
    </div>
    <div style={{ display: 'flex', gap: '12px', overflow: 'hidden' }}>
      {[1, 2, 3].map((n) => (
        <div key={n} style={{ minWidth: '130px', height: '170px', background: '#f1f5f9', borderRadius: '12px' }}></div>
      ))}
    </div>
  </div>
);

export default function ImmobilierPage() {
  const navigate = useNavigate();
  
  const [marketData, setMarketData] = useState({});
  const [vendors, setVendors] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Récupérer les agents/agences de type "immobilier"
    const vQuery = query(collection(db, "vendors"), where("typeCommerce", "==", "immobilier"));
    
    const unsubscribeVendors = onSnapshot(vQuery, (vSnapshot) => {
      const vendorList = vSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      setVendors(vendorList);

      if (vendorList.length > 0) {
        const vendorIds = vendorList.map(v => v.vendorId).filter(id => id !== undefined);

        if (vendorIds.length > 0) {
          // 2. Récupérer les annonces immo de ces agences
          const pQuery = query(
            collection(db, "products"), 
            where("vendorId", "in", vendorIds)
          );

          const unsubscribeProducts = onSnapshot(pQuery, (pSnapshot) => {
            const products = pSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const grouped = products.reduce((acc, p) => {
              const vId = p.vendorId;
              if (!acc[vId]) acc[vId] = [];
              acc[vId].push(p);
              return acc;
            }, {});
            
            setMarketData(grouped);
            setLoading(false);
          });

          return () => unsubscribeProducts();
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeVendors();
  }, []);

  const filteredVendors = useMemo(() => {
    if (!searchTerm) return vendors;
    const term = searchTerm.toLowerCase();
    return vendors.filter(v => 
      v.nomBoutique?.toLowerCase().includes(term) ||
      (marketData[v.vendorId] && marketData[v.vendorId].some(p => p.nom.toLowerCase().includes(term)))
    );
  }, [vendors, searchTerm, marketData]);

  return (
    <div className="light-market">
      <header className="light-header" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div className="header-main">
          <button onClick={() => navigate(-1)} className="btn-back"><ArrowLeft size={24} /></button>
          <h1 style={{ color: '#1e293b' }}>Immobilier</h1>
          <div className="header-cart" onClick={() => navigate('/favorites')}><Home size={22} color="#3b82f6" /></div>
        </div>
        
        <div className="search-bar-light">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Rechercher un quartier, un studio..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="assistance-notice" style={{ background: '#e0f2fe', color: '#0369a1' }}>
          <Info size={14} />
          <span>Contactez l'assistance pour visiter un bien ou confirmer une réservation.</span>
        </div>
      </header>

      <main className="light-content">
        {loading ? (
          <>
            <SkeletonSection />
            <SkeletonSection />
          </>
        ) : filteredVendors.length > 0 ? (
          filteredVendors.map(v => (
            <div key={v.id} className="shelf-section">
              <div className="shelf-top">
                <div className="vendor-brand" onClick={() => navigate(`/store/${v.vendorId}`)}>
                  <img src={v.logo || "/placeholder-agency.png"} alt={v.nomBoutique} className="brand-img" />
                  <div className="brand-info">
                    <h3>{v.nomBoutique}</h3>
                    <span className="location-info">🏢 Agence / Mandataire</span>
                  </div>
                </div>
                <button className="btn-more" style={{ color: '#3b82f6' }} onClick={() => navigate(`/store/${v.vendorId}`)}>Voir tout</button>
              </div>

              <div className="horizontal-scroll-light">
                {marketData[v.vendorId] && marketData[v.vendorId].length > 0 ? (
                  marketData[v.vendorId]
                    .filter(p => p.nom.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(p => (
                      <div key={p.id} className="light-product-card" onClick={() => navigate(`/product/${p.id}`)}>
                        <div className="p-img-box">
                          <img src={p.images?.[0] || p.imageUrl} alt={p.nom} style={{ objectFit: 'cover' }} />
                          {/* Badge de type de bien */}
                          <div style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem' }}>
                            {p.typeBien || "Logement"}
                          </div>
                        </div>
                        <div className="p-info">
                          <p className="p-price-light" style={{ color: '#2563eb' }}>{p.prix.toLocaleString()} FCFA</p>
                          <p className="p-name-light" style={{ fontWeight: '700' }}>{p.nom}</p>
                          <p style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>📍 {p.quartier || "Zone non spécifiée"}</p>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="empty-shelf-msg">Aucune annonce disponible...</div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="no-data">Aucune agence immobilière trouvée.</div>
        )}
      </main>

      <style>{`
        .assistance-notice {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 16px; margin: 10px 16px;
          border-radius: 8px; font-size: 0.7rem; font-weight: 600;
        }
        .location-info { font-size: 0.7rem; color: #667085; display: block; }
        .skeleton-pulse { animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}