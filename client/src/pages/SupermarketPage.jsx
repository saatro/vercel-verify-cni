// SupermarketPage.jsx
// Structure Firestore réelle :
//   { type:"supermarche", nom, prix, unite, marque, poidsVolume, reference,
//     stock, categorie, description, images[], image, nomBoutique, logoBoutique,
//     vendorId, marque, conservation, allergenes, code_barre, origine }

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ShoppingCart, Search, Store, ChevronRight,
  Tag, Package, Info, AlertCircle, Plus,
} from "lucide-react";
import { useCart } from "../Context/CartContext";
import { toast, ToastContainer } from "react-toastify";
import "./SupermarketPage.css";


// ── Catégories alimentaires (depuis les données réelles Firestore) ─────────────
const SUPER_CATEGORIES = [
  "Tout", "Alimentation", "Fruits & Légumes", "Viandes & Poissons",
  "Produits laitiers", "Boissons", "Surgelés", "Hygiène & Beauté",
  "Bébé", "Entretien", "Épicerie",
];

// ── Badge stock ────────────────────────────────────────────────────────────────
function StockBadge({ stock }) {
  if (stock === undefined || stock === null) return null;
  if (stock === 0) return (
    <span style={{...S.badge, background:'#fef2f2', color:'#ef4444', border:'1px solid #fecaca'}}>
      <AlertCircle size={10}/> Épuisé
    </span>
  );
  if (stock <= 5) return (
    <span style={{...S.badge, background:'#fffbeb', color:'#f59e0b', border:'1px solid #fde68a'}}>
      Plus que {stock}
    </span>
  );
  return (
    <span style={{...S.badge, background:'#ecfdf5', color:'#10b981', border:'1px solid #a7f3d0'}}>
      ✓ Dispo
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function SupermarketPage() {
  const navigate    = useNavigate();
  const { addToCart } = useCart();

  const [products,   setProducts]   = useState([]);
  const [vendors,    setVendors]     = useState({});   // { vendorId: vendorData }
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab,  setActiveTab]  = useState("Tout");
  const [loading,    setLoading]    = useState(true);

  // ── Produits type supermarché ──────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "products"), where("type", "==", "supermarche"));
    const unsub = onSnapshot(q, (snap) => {
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(prods.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)));
      setLoading(false);

      // Charge les vendeurs uniques non encore chargés
      const uniqueVIds = [...new Set(prods.map(p => p.vendorId).filter(Boolean))];
      setVendors(prev => {
        const missing = uniqueVIds.filter(id => !prev[id]);
        if (!missing.length) return prev;
        // Snapshot vendeurs
        missing.forEach(vid => {
          import("firebase/firestore").then(({ doc, getDoc }) => {
            getDoc(doc(db, "vendors", vid)).then(s => {
              if (s.exists()) setVendors(v => ({ ...v, [vid]: { id: s.id, ...s.data() } }));
            });
          });
        });
        return prev;
      });
    });
    return () => unsub();
  }, []);

  // ── Filtrage ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return products.filter(p => {
      const matchCat  = activeTab === "Tout" || p.categorie === activeTab;
      const matchTerm = !term || [p.nom, p.nomBoutique, p.marque, p.description]
        .some(v => v?.toLowerCase().includes(term));
      return matchCat && matchTerm;
    });
  }, [products, searchTerm, activeTab]);

  // ── Grouper par vendeur ────────────────────────────────────────────────────
  const byVendor = useMemo(() => {
    const map = {};
    filtered.forEach(p => {
      const vid = p.vendorId || "_";
      if (!map[vid]) map[vid] = { vendorId: vid, products: [] };
      map[vid].products.push(p);
    });
    return Object.values(map);
  }, [filtered]);

  const handleAdd = useCallback((e, p) => {
    e.stopPropagation();
    if ((p.stock || 0) === 0) { toast.error("Produit épuisé"); return; }
    addToCart({ ...p, quantity: 1 });
    toast.success(`${p.nom} ajouté au panier !`, { autoClose: 1200, hideProgressBar: true });
  }, [addToCart]);

  // ── Compteur total catégories ──────────────────────────────────────────────
  const catCounts = useMemo(() => {
    const c = { Tout: products.length };
    products.forEach(p => { if (p.categorie) c[p.categorie] = (c[p.categorie]||0)+1; });
    return c;
  }, [products]);

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.root}>
      <ToastContainer position="top-center" autoClose={1200} hideProgressBar/>

      {/* ── HEADER ── */}
      <header style={S.header}>
        <div style={S.headerTop}>
          <button style={S.iconBtn} onClick={() => navigate(-1)}><ArrowLeft size={22}/></button>
          <div style={{flex:1,textAlign:'center'}}>
            <h1 style={S.headerTitle}>Supermarchés</h1>
            <p style={S.headerSub}>{products.length} article{products.length!==1?'s':''} disponibles</p>
          </div>
          <button style={S.iconBtn} onClick={() => navigate('/cart')}>
            <ShoppingCart size={22}/>
          </button>
        </div>

        {/* Recherche */}
        <div style={S.searchBox}>
          <Search size={16} color="#94a3b8"/>
          <input style={S.searchInput} type="text"
            placeholder="Bananes, Nestlé, Lait…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}/>
          {searchTerm && (
            <button onClick={()=>setSearchTerm("")} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8'}}>✕</button>
          )}
        </div>

        {/* Info Wave */}
        <div style={S.waveBanner}>
          <Info size={14} style={{flexShrink:0}}/>
          <p style={{margin:0,fontSize:11,lineHeight:1.5}}>
            Paiement <strong>Wave</strong> accepté — Reçu validé par IA en quelques secondes.
          </p>
        </div>

        {/* Onglets catégories */}
        <div style={S.tabs}>
          {SUPER_CATEGORIES.filter(c => c==="Tout" || (catCounts[c]||0)>0).map(cat => (
            <button key={cat} onClick={()=>setActiveTab(cat)}
              style={{...S.tabBtn, ...(activeTab===cat ? S.tabActive : {})}}>
              {cat}
              {catCounts[cat]>0 && <span style={{...S.tabCount, background: activeTab===cat?'rgba(255,255,255,.25)':'#e0e7ff', color: activeTab===cat?'#fff':'#6366f1'}}>{catCounts[cat]}</span>}
            </button>
          ))}
        </div>
      </header>

      {/* ── CONTENU ── */}
      <main style={S.main}>
        {loading ? (
          <div style={S.loader}>
            <ShoppingCart size={36} color="#0ea5e9" style={{animation:'pulse 1.5s infinite'}}/>
            <p style={{color:'#94a3b8',fontSize:13,marginTop:10}}>Initialisation des rayons…</p>
          </div>
        ) : byVendor.length === 0 ? (
          <div style={S.empty}>
            <Package size={52} color="#e2e8f0"/>
            <p style={{color:'#94a3b8',fontSize:13,marginTop:12}}>Aucun article trouvé.</p>
            {searchTerm && <button onClick={()=>setSearchTerm("")} style={{marginTop:10,background:'#0ea5e9',color:'#fff',border:'none',borderRadius:10,padding:'8px 18px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Tout afficher</button>}
          </div>
        ) : (
          byVendor.map(group => {
            const v = vendors[group.vendorId] || {};
            const logo  = v.logo  || group.products[0]?.logoBoutique;
            const name  = v.nomBoutique || group.products[0]?.nomBoutique || "Supermarché";
            const addr  = v.adresse || "";
            return (
              <section key={group.vendorId} style={S.vendorSection}>
                {/* En-tête vendeur */}
                <div style={S.vendorHeader} onClick={()=>navigate(`/store/${group.vendorId}`)}>
                  <div style={S.vendorLeft}>
                    {logo
                      ? <img src={logo} alt={name} style={S.vendorLogo}/>
                      : <div style={{...S.vendorLogo, background:'#e0f2fe', display:'flex',alignItems:'center',justifyContent:'center'}}><Store size={18} color="#0ea5e9"/></div>
                    }
                    <div>
                      <h3 style={{fontSize:14,fontWeight:800,color:'#0f172a',margin:0}}>{name}</h3>
                      {addr && <p style={{fontSize:10,color:'#94a3b8',margin:0}}>{addr}</p>}
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:'#0ea5e9',display:'flex',alignItems:'center',gap:3}}>
                    Boutique <ChevronRight size={14}/>
                  </span>
                </div>

                {/* Grille produits */}
                <div style={S.productsGrid}>
                  {group.products.map(p => (
                    <ProductCard key={p.id} product={p} onAdd={handleAdd}
                      onClick={()=>navigate(`/store/${p.vendorId}/${p.id}`)}/>
                  ))}
                </div>
              </section>
            );
          })
        )}
        <div style={{height:40}}/>
      </main>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}

// ── Carte produit supermarché ──────────────────────────────────────────────────
function ProductCard({ product: p, onAdd, onClick }) {
  const img = p.images?.[0] || p.image;
  const outOfStock = (p.stock || 0) === 0;

  return (
    <div style={{...S.card, opacity: outOfStock ? 0.7 : 1}} onClick={onClick}>
      {/* Image */}
      <div style={S.cardImg}>
        {img
          ? <img src={img} alt={p.nom} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          : <div style={{width:'100%',height:'100%',background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center'}}><Package size={28} color="#cbd5e1"/></div>
        }
        {/* Badge prix promo si applicable */}
        {p.prixPromo && Number(p.prixPromo) < Number(p.prix) && (
          <div style={S.promoBadge}>-{Math.round(((p.prix-p.prixPromo)/p.prix)*100)}%</div>
        )}
        {/* Bouton add rapide */}
        <button
          style={{...S.addBtn, background: outOfStock ? '#e2e8f0' : '#0ea5e9'}}
          disabled={outOfStock}
          onClick={e=>onAdd(e, p)}
        >
          <Plus size={16} color="#fff"/>
        </button>
      </div>

      {/* Infos */}
      <div style={S.cardBody}>
        {/* Marque */}
        {p.marque && (
          <span style={S.brandTag}><Tag size={9}/> {p.marque}</span>
        )}

        <h4 style={S.cardName}>{p.nom}</h4>

        {/* Poids / unité */}
        {(p.poidsVolume || p.unite) && (
          <p style={S.cardSub}>
            {[p.poidsVolume, p.unite ? `par ${p.unite}` : null].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Référence */}
        {p.reference && (
          <p style={{...S.cardSub, color:'#cbd5e1'}}>Réf. {p.reference}</p>
        )}

        {/* Prix + stock */}
        <div style={S.cardFooter}>
          <div>
            <span style={S.price}>{Number(p.prix).toLocaleString()} F</span>
            {p.unite && <span style={{fontSize:9,color:'#94a3b8',marginLeft:3}}>/{p.unite}</span>}
            {p.prixPromo && Number(p.prixPromo) < Number(p.prix) && (
              <span style={{fontSize:10,color:'#94a3b8',textDecoration:'line-through',marginLeft:5}}>
                {Number(p.prix).toLocaleString()}
              </span>
            )}
          </div>
          <StockBadge stock={p.stock}/>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root:   { minHeight:'100dvh', background:'#f0f9ff', fontFamily:"'DM Sans',system-ui,sans-serif", paddingBottom:60 },
  header: { background:'#fff', position:'sticky', top:0, zIndex:50, boxShadow:'0 2px 8px rgba(0,0,0,.05)' },
  headerTop: { display:'flex', alignItems:'center', gap:8, padding:'14px 16px 8px' },
  headerTitle: { fontSize:16, fontWeight:900, color:'#0f172a', margin:0 },
  headerSub:   { fontSize:10, color:'#94a3b8', margin:0 },
  iconBtn: { width:38,height:38,borderRadius:12,background:'#f1f5f9',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 },
  searchBox: { display:'flex',alignItems:'center',gap:10,background:'#f1f5f9',margin:'8px 16px',borderRadius:14,padding:'10px 14px' },
  searchInput: { flex:1,background:'transparent',border:'none',outline:'none',fontSize:13,color:'#1e293b' },
  waveBanner: { display:'flex',alignItems:'center',gap:10,background:'#0ea5e9',color:'#fff',margin:'8px 16px 0',borderRadius:12,padding:'10px 14px' },
  tabs: { display:'flex',gap:8,overflowX:'auto',padding:'10px 16px',scrollbarWidth:'none' },
  tabBtn: { flexShrink:0,padding:'6px 12px',borderRadius:100,border:'none',background:'#e0f2fe',color:'#0369a1',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:5,transition:'all .2s' },
  tabActive: { background:'#0ea5e9', color:'#fff' },
  tabCount: { borderRadius:100,padding:'1px 6px',fontSize:9,fontWeight:900 },
  main: { padding:'16px 16px 0' },
  loader: { display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 0' },
  empty:  { display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 0',textAlign:'center' },
  vendorSection: { background:'#fff',borderRadius:20,marginBottom:16,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.06)' },
  vendorHeader: { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid #f1f5f9',cursor:'pointer' },
  vendorLeft: { display:'flex',alignItems:'center',gap:10 },
  vendorLogo: { width:40,height:40,borderRadius:10,objectFit:'cover',border:'1px solid #e2e8f0',flexShrink:0 },
  productsGrid: { display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:1,background:'#f1f5f9' },
  card: { background:'#fff',cursor:'pointer',transition:'opacity .2s' },
  cardImg: { position:'relative',aspectRatio:'1/1',overflow:'hidden',background:'#f8fafc' },
  promoBadge: { position:'absolute',top:8,left:8,background:'#ef4444',color:'#fff',fontSize:9,fontWeight:900,padding:'3px 7px',borderRadius:100 },
  addBtn: { position:'absolute',bottom:8,right:8,width:30,height:30,borderRadius:'50%',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 2px 8px rgba(0,0,0,.15)' },
  cardBody: { padding:'10px 12px 12px' },
  brandTag: { display:'inline-flex',alignItems:'center',gap:3,fontSize:9,fontWeight:700,color:'#0ea5e9',background:'#e0f2fe',padding:'2px 7px',borderRadius:100,marginBottom:4 },
  cardName: { fontSize:12,fontWeight:800,color:'#0f172a',margin:'4px 0 2px',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' },
  cardSub: { fontSize:10,color:'#94a3b8',margin:'2px 0',fontWeight:600 },
  cardFooter: { display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8,gap:4 },
  price: { fontSize:14,fontWeight:900,color:'#0f172a' },
  badge: { display:'inline-flex',alignItems:'center',gap:3,fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:100 },
};