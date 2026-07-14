import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Info, Car } from "lucide-react";
import "./SupermarketPage.css"; 

export default function VehiculePage() {
  const navigate = useNavigate();
  const [marketData, setMarketData] = useState({});
  const [vendors, setVendors] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const vQuery = query(collection(db, "vendors"), where("typeCommerce", "==", "vehicule"));
    const unsubscribeVendors = onSnapshot(vQuery, (vSnapshot) => {
      const vendorList = vSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVendors(vendorList);

      if (vendorList.length > 0) {
        const vendorIds = vendorList.map(v => v.vendorId).filter(id => id !== undefined);
        const pQuery = query(collection(db, "products"), where("vendorId", "in", vendorIds));

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
      } else { setLoading(false); }
    });
    return () => unsubscribeVendors();
  }, []);

  const filteredVendors = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return vendors.filter(v => 
      v.nomBoutique?.toLowerCase().includes(term) ||
      (marketData[v.vendorId] && marketData[v.vendorId].some(p => p.nom.toLowerCase().includes(term)))
    );
  }, [vendors, searchTerm, marketData]);

  return (
    <div className="light-market">
      <header className="light-header" style={{ background: '#fff', borderBottom: '1px solid #eee' }}>
        <div className="header-main">
          <button onClick={() => navigate(-1)} className="btn-back"><ArrowLeft size={24} /></button>
          <h1>Véhicules</h1>
          <div className="header-cart" onClick={() => navigate('/')}><Car size={22} color="#f59e0b" /></div>
        </div>
        <div className="search-bar-light">
          <Search size={18} />
          <input type="text" placeholder="Toyota, Mercedes, Rav4..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="assistance-notice" style={{ background: '#fef3c7', color: '#92400e' }}>
          <Info size={14} />
          <span>Payez un acompte via Wave pour réserver, ou contactez l'assistance.</span>
        </div>
      </header>

      <main className="light-content">
        {loading ? <div className="no-data">Chargement des showrooms...</div> : filteredVendors.map(v => (
          <div key={v.id} className="shelf-section">
            <div className="shelf-top">
              <div className="vendor-brand" onClick={() => navigate(`/store/${v.vendorId}`)}>
                <img src={v.logo || "/placeholder-car.png"} alt={v.nomBoutique} className="brand-img" />
                <div className="brand-info">
                  <h3>{v.nomBoutique}</h3>
                  <span className="location-info">🚗 Concessionnaire / Particulier</span>
                </div>
              </div>
            </div>

            <div className="horizontal-scroll-light">
              {marketData[v.vendorId]?.map(p => (
                <div key={p.id} className="light-product-card" onClick={() => navigate(`/product/${p.id}`)}>
                  <div className="p-img-box">
                    <img src={p.images?.[0] || p.imageUrl} alt={p.nom} />
                    <div style={{ position: 'absolute', bottom: 5, left: 5, background: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 'bold' }}>
                      {p.annee || "N/A"}
                    </div>
                  </div>
                  <div className="p-info">
                    <p className="p-price-light" style={{ color: '#1e293b' }}>{p.prix.toLocaleString()} FCFA</p>
                    <p className="p-name-light">{p.nom}</p>
                    <p style={{ fontSize: '0.65rem', color: '#64748b' }}>⚙️ {p.transmission || "Auto"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}