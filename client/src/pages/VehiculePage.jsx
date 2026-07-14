import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Info, MapPin, Car, Gauge, Calendar, Phone, ShoppingCart } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";

export default function VehiculePage() {
  const navigate = useNavigate();
  
  const [vehicles, setVehicles] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Récupération des Concessionnaires / Vendeurs de véhicules
    const vQuery = query(
      collection(db, "vendors"), 
      where("enseigne", "==", "Véhicule")
    );
    
    const unsubscribeDealers = onSnapshot(vQuery, (vSnapshot) => {
      const dealerList = vSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDealers(dealerList);

      // 2. Récupération des Véhicules (Voitures, Motos, etc.)
      const pQuery = query(
        collection(db, "products"), 
        where("type", "==", "vehicule") 
      );

      const unsubscribeProducts = onSnapshot(pQuery, (pSnapshot) => {
        const productList = pSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setVehicles(productList);
        setLoading(false);
      }, (err) => {
        console.error("Erreur produits véhicules:", err);
        setLoading(false);
      });

      return () => unsubscribeProducts();
    }, (err) => {
      console.error("Erreur vendeurs véhicules:", err);
      setLoading(false);
    });

    return () => unsubscribeDealers();
  }, []);

  // Filtrage par nom de véhicule, marque ou nom du vendeur
  const filteredVehicles = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return vehicles;
    return vehicles.filter(v => 
      v.nom?.toLowerCase().includes(term) || 
      v.marque?.toLowerCase().includes(term) ||
      v.nomBoutique?.toLowerCase().includes(term)
    );
  }, [vehicles, searchTerm]);

  const contactVendor = (e, phone, vehicleName) => {
    e.stopPropagation();
    const message = `Bonjour, je suis intéressé par votre véhicule : ${vehicleName}. Est-il toujours disponible ?`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="v-page-container">
      <ToastContainer position="bottom-right" />
      
      <header className="v-main-header">
        <div className="v-nav-row">
          <button onClick={() => navigate(-1)} className="v-icon-btn"><ArrowLeft size={22} /></button>
          <div className="v-header-title">
            <h1>Véhicules</h1>
            <p>{vehicles.length} annonces en ligne</p>
          </div>
          <button onClick={() => navigate('/cart')} className="v-icon-btn">
            <ShoppingCart size={20} />
          </button>
        </div>
        
        <div className="v-search-bar">
          <Search size={18} className="v-search-icon" />
          <input 
            type="text" 
            placeholder="Marque, modèle (ex: Toyota, Range...)" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="v-wave-info">
          <div className="v-info-circle"><Info size={12} /></div>
          <p>Paiement <strong>Wave</strong> : Enregistrez le contact assistance pour valider votre reçu.</p>
        </div>
      </header>

      <main className="v-list-content">
        {loading ? (
          <div className="v-state-msg">Chargement du parc automobile...</div>
        ) : filteredVehicles.length > 0 ? (
          <div className="v-auto-grid">
            {filteredVehicles.map(veh => (
              <div key={veh.id} className="v-auto-card" onClick={() => navigate(`/product/${veh.id}`)}>
                <div className="v-img-wrapper">
                  <img src={veh.image || veh.images?.[0] || "/placeholder.png"} alt={veh.nom} />
                  <div className="v-price-badge">{veh.prix?.toLocaleString()} F</div>
                </div>
                
                <div className="v-card-details">
                  <div className="v-vendor-tag">
                    <img src={veh.logoBoutique || "/placeholder.png"} alt="" />
                    <span>{veh.nomBoutique}</span>
                  </div>
                  
                  <h3 className="v-car-name">{veh.marque} {veh.nom}</h3>
                  
                  <div className="v-car-specs">
                    <div className="v-spec-item"><Calendar size={14} /> <span>{veh.reference || "N/A"}</span></div>
                    <div className="v-spec-item"><Gauge size={14} /> <span>{veh.poidsVolume || "Essence"}</span></div>
                    <div className="v-spec-item"><MapPin size={14} /> <span>{veh.adresse || "Abidjan"}</span></div>
                  </div>

                  <div className="v-action-row">
                    <button className="v-btn-call" onClick={(e) => contactVendor(e, veh.telephone || "0500185364", veh.nom)}>
                      <Phone size={14} /> WhatsApp
                    </button>
                    <button className="v-btn-details">Voir plus</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="v-state-msg">
            <Car size={48} opacity={0.1} />
            <p>Aucun véhicule trouvé pour cette recherche.</p>
          </div>
        )}
      </main>

      <style>{`
        .v-page-container { background: #f0f2f5; min-height: 100vh; font-family: 'Segoe UI', Roboto, sans-serif; }
        .v-main-header { background: #fff; padding: 15px; position: sticky; top: 0; z-index: 50; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .v-nav-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .v-header-title h1 { font-size: 1.2rem; font-weight: 800; color: #1c1e21; margin: 0; }
        .v-header-title p { font-size: 0.75rem; color: #65676b; margin: 0; }
        .v-icon-btn { background: #f0f2f5; border: none; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; color: #1c1e21; }
        
        .v-search-bar { background: #f0f2f5; border-radius: 20px; display: flex; align-items: center; padding: 10px 15px; gap: 10px; }
        .v-search-bar input { background: transparent; border: none; font-size: 0.9rem; width: 100%; outline: none; }
        .v-search-icon { color: #8a8d91; }
        
        .v-wave-info { display: flex; align-items: center; gap: 10px; background: #6d28d9; color: #fff; padding: 10px 15px; border-radius: 12px; margin-top: 15px; font-size: 0.75rem; line-height: 1.3; }
        .v-info-circle { background: rgba(255,255,255,0.2); border-radius: 50%; width: 18px; height: 18px; min-width: 18px; display: flex; align-items: center; justify-content: center; }
        
        .v-list-content { padding: 15px; }
        .v-auto-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        
        .v-auto-card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
        .v-img-wrapper { position: relative; width: 100%; height: 200px; }
        .v-img-wrapper img { width: 100%; height: 100%; object-fit: cover; }
        .v-price-badge { position: absolute; top: 15px; right: 15px; background: #fff; color: #1c1e21; padding: 5px 12px; border-radius: 20px; font-weight: 800; font-size: 0.9rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        
        .v-card-details { padding: 15px; }
        .v-vendor-tag { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .v-vendor-tag img { width: 18px; height: 18px; border-radius: 4px; object-fit: cover; }
        .v-vendor-tag span { font-size: 0.7rem; font-weight: 600; color: #65676b; text-transform: uppercase; }
        
        .v-car-name { font-size: 1.1rem; font-weight: 700; color: #1c1e21; margin: 0 0 10px 0; }
        .v-car-specs { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 15px; border-top: 1px solid #f0f2f5; padding-top: 12px; }
        .v-spec-item { display: flex; align-items: center; gap: 5px; color: #65676b; font-size: 0.75rem; }
        
        .v-action-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .v-btn-call { background: #25d366; color: #fff; border: none; padding: 10px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .v-btn-details { background: #f0f2f5; color: #1c1e21; border: none; padding: 10px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; }

        .v-state-msg { text-align: center; padding: 80px 20px; color: #8a8d91; }
      `}</style>
    </div>
  );
}