import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Info, Car } from "lucide-react";
import "./SupermarketPage.css";

function getSpecs(p) {
  const s = p.detailsSpecifiques || {};
  return {
    annee: s.modele_annee || p.annee || p.modele_annee || "",
    transmission: s.boite || p.transmission || p.boite || "",
    energie: s.energie || p.energie || "",
    km: s.kilometrage || p.kilometrage || "",
    marque: s.marque_auto || p.marque || "",
    etat: s.etat_auto || p.etat || "",
  };
}

export default function VehiculePage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [vendorsMap, setVendorsMap] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "products"), where("type", "==", "vehicule"));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProducts(list);

        const ids = [...new Set(list.map((p) => p.vendorId || p.vendeurId).filter(Boolean))];
        const map = {};
        await Promise.all(
          ids.map(async (vid) => {
            try {
              let s = await getDoc(doc(db, "users", vid));
              if (!s.exists()) s = await getDoc(doc(db, "vendors", vid));
              if (s.exists()) map[vid] = { id: s.id, ...s.data() };
            } catch (_) {}
          })
        );
        setVendorsMap(map);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const byVendor = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const filtered = products.filter((p) => {
      if (!term) return true;
      const sp = getSpecs(p);
      return (
        p.nom?.toLowerCase().includes(term) ||
        sp.marque?.toLowerCase().includes(term) ||
        sp.annee?.toLowerCase().includes(term) ||
        p.nomBoutique?.toLowerCase().includes(term)
      );
    });
    const map = {};
    filtered.forEach((p) => {
      const vid = p.vendorId || p.vendeurId || "_";
      if (!map[vid]) map[vid] = [];
      map[vid].push(p);
    });
    return Object.entries(map);
  }, [products, searchTerm]);

  return (
    <div className="light-market">
      <header className="light-header" style={{ background: "#fff", borderBottom: "1px solid #eee" }}>
        <div className="header-main">
          <button type="button" onClick={() => navigate(-1)} className="btn-back">
            <ArrowLeft size={24} />
          </button>
          <h1>Véhicules</h1>
          <div className="header-cart" onClick={() => navigate("/marketplace")}>
            <Car size={22} color="#f59e0b" />
          </div>
        </div>
        <div className="search-bar-light">
          <Search size={18} />
          <input
            type="text"
            placeholder="Toyota, Mercedes, Rav4..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="assistance-notice" style={{ background: "#fef3c7", color: "#92400e" }}>
          <Info size={14} />
          <span>Payez un acompte via Wave pour réserver, ou contactez l'assistance.</span>
        </div>
      </header>

      <main className="light-content">
        {loading ? (
          <div className="no-data">Chargement des showrooms...</div>
        ) : byVendor.length === 0 ? (
          <div className="no-data">Aucun véhicule disponible.</div>
        ) : (
          byVendor.map(([vid, items]) => {
            const v = vendorsMap[vid] || {};
            const name =
              v.nomBoutique || v.enseigne || v.nomComplet || items[0]?.nomBoutique || "Concessionnaire";
            const logo = v.photoURL || v.logo || items[0]?.logoBoutique;
            return (
              <div key={vid} className="shelf-section">
                <div className="shelf-top">
                  <div className="vendor-brand" onClick={() => navigate(`/store/${vid}`)}>
                    <img
                      src={logo || "https://placehold.co/80x80/f59e0b/ffffff/png?text=Auto"}
                      alt={name}
                      className="brand-img"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://placehold.co/80x80/f59e0b/ffffff/png?text=Auto";
                      }}
                    />
                    <div className="brand-info">
                      <h3>{name}</h3>
                      <span className="location-info">Concessionnaire / Particulier</span>
                    </div>
                  </div>
                </div>

                <div className="horizontal-scroll-light">
                  {items.map((p) => {
                    const sp = getSpecs(p);
                    return (
                      <div
                        key={p.id}
                        className="light-product-card"
                        onClick={() => navigate(`/product/${p.id}`)}
                      >
                        <div className="p-img-box">
                          <img
                            src={
                              p.images?.[0] ||
                              p.imageUrl ||
                              p.image ||
                              "https://placehold.co/200x200/fef3c7/92400e/png?text=Auto"
                            }
                            alt={p.nom}
                          />
                          {(sp.annee || sp.marque) && (
                            <div
                              style={{
                                position: "absolute",
                                bottom: 5,
                                left: 5,
                                background: "#f59e0b",
                                color: "white",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: "0.6rem",
                                fontWeight: "bold",
                              }}
                            >
                              {sp.annee || sp.marque}
                            </div>
                          )}
                        </div>
                        <div className="p-info">
                          <p className="p-price-light" style={{ color: "#1e293b" }}>
                            {Number(p.prix || 0).toLocaleString()} FCFA
                          </p>
                          <p className="p-name-light">{p.nom}</p>
                          <p style={{ fontSize: "0.65rem", color: "#64748b" }}>
                            {[sp.transmission, sp.energie, sp.km ? `${sp.km} km` : ""]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </main>

      <style>{`
        .assistance-notice {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 16px; margin: 10px 16px;
          border-radius: 8px; font-size: 0.7rem; font-weight: 600;
        }
        .location-info { font-size: 0.7rem; color: #667085; display: block; }
      `}</style>
    </div>
  );
}
