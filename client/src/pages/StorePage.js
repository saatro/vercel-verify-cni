/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase'; 
import { doc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { 
  MapPin, Search, Plus, ChevronLeft, Loader2, ShoppingBag, ArrowRight, 
  Gauge, Zap, Calendar, Trash2,
  Thermometer, Scale, AlertTriangle, Box
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import { useCart } from '../Context/CartContext'; 
import './StorePage.css';

export default function StorePage() {
  const { vendorId, productId } = useParams();
  console.log("vendorId reçu :", vendorId);
  console.log("productId reçu :", productId);
  const navigate = useNavigate();
  
  // Utilisation des valeurs disponibles dans le CartContext mis à jour
  const { cart, addToCart } = useCart();
  
  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [heroProduct, setHeroProduct] = useState(null);
  const [categories, setCategories] = useState(["Tous"]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  // ── ALTERNATIVE PROFESSIONNELLE DE CALCUL DU TOTAL ────────────────────────
  // Remplace l'ancien appel à getTotal() en calculant directement le montant
  // à partir du tableau stable du panier, empêchant ainsi le crash du composant.
  const totalAmount = useMemo(() => {
    return cart.reduce((acc, item) => acc + (Number(item.prix || 0) * (item.quantity || 1)), 0);
  }, [cart]);

  useEffect(() => {
    let isMounted = true;
    const fetchStoreData = async () => {
      try {
        setLoading(true);
        console.log("Recherche boutique par UID utilisateur :", vendorId);
        
        // 1. Récupération du vendeur depuis la collection 'users'
        let vDoc = await getDoc(doc(db, 'users', vendorId));
        let vendorData = null;

        if (vDoc.exists()) {
          vendorData = { id: vDoc.id, ...vDoc.data() };
        }

        // ── ALTERNATIVE PROFESSIONNELLE DE REPLI ────────────────────────────────
        // Si le vendeur n'existe pas dans 'users', on crée un profil fictif propre
        // au lieu de bloquer l'utilisateur ou de le rediriger de force.
        if (!vendorData) {
          console.warn("Utilisateur/Boutique introuvable dans 'users' :", vendorId);
          vendorData = {
            id: vendorId,
            nom: "Boutique Partenaire",
            statut: "Vendeur Vérifié",
            avatar: "https://placehold.co/100x100/7c3aed/ffffff/png?text=Boutique",
            isFallback: true
          };
        }

        if (isMounted) setVendor(vendorData);

        // 2. Récupération des produits rattachés à l'UID du vendeur (Tolérance vendorId et vendeurId)
        const q = query(collection(db, 'products'), where('vendorId', '==', vendorId));
        const snap = await getDocs(q);
        let prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Si aucun produit n'est trouvé avec 'vendorId', vérification par sécurité avec 'vendeurId'
        if (prods.length === 0) {
          const qAlternate = query(collection(db, 'products'), where('vendeurId', '==', vendorId));
          const snapAlternate = await getDocs(qAlternate);
          prods = snapAlternate.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        if (isMounted) {
          setProducts(prods);
          const uniqueCats = ["Tous", ...new Set(prods.map(p => p.categorie).filter(Boolean))];
          setCategories(uniqueCats);
        }

        // 3. Gestion du produit Hero mis en avant
        if (productId) {
          const found = prods.find(p => p.id === productId);
          if (found) setHeroProduct(found);
          else {
            const pDoc = await getDoc(doc(db, 'products', productId));
            if (pDoc.exists() && isMounted) setHeroProduct({ id: pDoc.id, ...pDoc.data() });
          }
        } else if (prods.length > 0 && isMounted) {
          setHeroProduct(prods[0]);
        }
      } catch (e) { 
        console.error("ERREUR STOREPAGE DÉTAILLÉE :", e);
        toast.error("Erreur de chargement de la vitrine."); 
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchStoreData();
    return () => { isMounted = false; };
  }, [vendorId, productId, navigate]);

  const handleDeleteProduct = async (e, pId, pName) => {
    e.stopPropagation();
    if (window.confirm(`Voulez-vous vraiment supprimer "${pName}" ?`)) {
      try {
        await deleteDoc(doc(db, 'products', pId));
        const updatedProducts = products.filter(p => p.id !== pId);
        setProducts(updatedProducts);
        if (heroProduct?.id === pId) setHeroProduct(updatedProducts[0] || null);
        toast.success("Produit supprimé");
      } catch (error) {
        toast.error("Erreur lors de la suppression");
      }
    }
  };

  const handleScroll = (e) => {
    setIsScrolled(e.target.scrollTop > 110);
  };

  const handleAddToCart = (p) => {
    // Sécurisation de l'identifiant pour s'assurer de la compatibilité avec le CartContext
    const productToCart = {
      ...p,
      id: p.id,
      vendorId: vendorId,
      quantity: 1,
      prix: Number(p.prix || 0),
      image: (p.images && p.images[0]) || p.image || 'https://placehold.co/150x150/7c3aed/ffffff/png?text=Produit'
    };
    
    console.log("Tentative d'ajout au panier de l'objet :", productToCart);
    addToCart(productToCart);
    toast.success(`${p.nom} ajouté !`);
  };

  if (loading) {
    return (
      <div className="s-loader-full">
        <Loader2 className="spinner-large animate-spin" color="#7c3aed" size={30} />
        <p>Mambo prépare la vitrine...</p>
      </div>
    );
  }

  const filteredProducts = products
    .filter(p => p.id !== heroProduct?.id)
    .filter(p => (activeCategory === "Tous" || p.categorie === activeCategory) && 
                 p.nom.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="s-page-wrapper">
      <ToastContainer theme="dark" position="top-center" autoClose={1500} hideProgressBar />

      <header className={`s-dynamic-header ${isScrolled ? 'shrunk' : 'large'}`}>
        <div className="s-header-content">
          <button className="s-icon-btn" onClick={() => navigate(-1)}><ChevronLeft size={24}/></button>
          <div className="s-vendor-brand" onClick={() => navigate(`/store/${vendorId}`)}>
            <img 
              src={vendor?.logo && !vendor.logo.includes('via.placeholder.com') ? vendor.logo : (vendor?.photoURL && !vendor.photoURL.includes('via.placeholder.com') ? vendor.photoURL : 'https://placehold.co/40x40/7c3aed/ffffff/png?text=Store')} 
              alt="Logo" 
              className="s-brand-logo" 
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://placehold.co/40x40/7c3aed/ffffff/png?text=Store';
              }}
            />
            <div className="s-brand-info">
              <h1>{vendor?.nomBoutique || vendor?.displayName || vendor?.nomComplet || "Boutique"}</h1>
              {!isScrolled && <span><MapPin size={10}/> {vendor?.adresse || 'Côte d\'Ivoire'}</span>}
            </div>
          </div>
          <button className="s-icon-btn cart-anchor" onClick={() => navigate('/cart')}>
            <ShoppingBag size={22} />
            {cart && cart.length > 0 && <span className="s-badge-dot">{cart.length}</span>}
          </button>
        </div>
      </header>

      <main className="s-main-scroll" onScroll={handleScroll}>
        <div className="s-content-buffer"></div>

        {heroProduct && (
          <section className={`s-hero-card ${isScrolled ? 'hero-compact' : 'hero-full'}`}>
            <div className="s-hero-inner">
              <div className="s-hero-visual">
                {heroProduct.images?.length > 0 ? (
                  <div className="s-slider-container">
                    <div className="s-slider-track">
                      {heroProduct.images.map((img, idx) => (
                        <img 
                          key={idx} src={img} alt={heroProduct.nom} 
                          className={idx === activeImgIndex ? 'active' : ''}
                          style={{ display: idx === activeImgIndex ? 'block' : 'none' }}
                        />
                      ))}
                    </div>
                    {heroProduct.images.length > 1 && (
                      <div className="s-slider-dots">
                        {heroProduct.images.map((_, i) => (
                          <div key={i} className={`s-dot ${i === activeImgIndex ? 'active' : ''}`} onClick={() => setActiveImgIndex(i)} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <img 
                    src={heroProduct.image && !heroProduct.image.includes('via.placeholder.com') ? heroProduct.image : 'https://placehold.co/400x400/7c3aed/ffffff/png?text=Produit'} 
                    alt={heroProduct.nom} 
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://placehold.co/400x400/7c3aed/ffffff/png?text=Produit';
                    }}
                  />
                )}
              </div>
              
              <div className="s-hero-meta">
                <div className="s-hero-text">
                  <div className="s-hero-top-row">
                    <span className="s-category-tag">{heroProduct.categorie}</span>
                    {heroProduct.marque && <span className="s-brand-tag"><Box size={10}/> {heroProduct.marque}</span>}
                  </div>
                  <h2>{heroProduct.nom}</h2>
                  
                  <div className="s-product-specs-grid">
                    {heroProduct.type === 'supermarche' && (
                      <>
                        <div className="s-spec-item">
                           <div className="s-spec-icon-box"><Scale size={14} /> <span className="s-spec-label">Contenance</span></div>
                           <div className="s-spec-value">{heroProduct.poidsVolume || "N/A"}</div>
                        </div>
                        <div className="s-spec-item">
                           <div className="s-spec-icon-box"><MapPin size={14} /> <span className="s-spec-label">Origine</span></div>
                           <div className="s-spec-value">{heroProduct.origine || "Côte d'Ivoire"}</div>
                        </div>
                        <div className="s-spec-item">
                           <div className="s-spec-icon-box"><Thermometer size={14} /> <span className="s-spec-label">Cons.</span></div>
                           <div className="s-spec-value">{heroProduct.temperature || "Ambiant"}</div>
                        </div>
                        <div className="s-spec-item">
                           <div className="s-spec-icon-box"><Calendar size={14} /> <span className="s-spec-label">DLC</span></div>
                           <div className="s-spec-value">{heroProduct.datelimit || 'N/A'}</div>
                        </div>
                      </>
                    )}
                    {heroProduct.categorie === 'auto' && (
                      <>
                        <div className="s-spec-item">
                           <div className="s-spec-icon-box"><Gauge size={14} /> <span className="s-spec-label">Kilométrage</span></div>
                           <div className="s-spec-value">{heroProduct.kilometrage} km</div>
                        </div>
                        <div className="s-spec-item">
                           <div className="s-spec-icon-box"><Zap size={14} /> <span className="s-spec-label">Boîte</span></div>
                           <div className="s-spec-value">{heroProduct.boite}</div>
                        </div>
                      </>
                    )}
                  </div>

                  {heroProduct.allergenes && (
                    <div className="s-hero-warning">
                      <AlertTriangle size={14} /> <span>Allergènes : {heroProduct.allergenes}</span>
                    </div>
                  )}

                  {heroProduct.description && <p className="s-hero-description">{heroProduct.description}</p>}

                  <div className="s-hero-price-group">
                    <span className="s-hero-price">{Number(heroProduct.prix || 0).toLocaleString()} F</span>
                    {heroProduct.unite && <span className="s-hero-unit">/ {heroProduct.unite}</span>}
                  </div>
                </div>
                <button className="s-hero-btn" onClick={() => handleAddToCart(heroProduct)}>
                  AJOUTER <Plus size={15} />
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="s-explore-zone">
          <div className="s-sticky-bar">
            <div className="s-search-input">
              <Search size={18} />
              <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="s-chips-row">
              {categories.map(c => (
                <button key={c} className={`s-chip ${activeCategory === c ? 'active' : ''}`} onClick={() => setActiveCategory(c)}>{c}</button>
              ))}
            </div>
          </div>

          <div className="s-products-grid">
            {filteredProducts.map(p => (
              <div key={p.id} className="s-item-card" onClick={() => navigate(`/store/${vendorId}/${p.id}`)}>
                <div className="s-item-img">
                  <img 
                    src={p.images?.[0] || p.image || 'https://placehold.co/200x200/7c3aed/ffffff/png?text=Produit'} 
                    alt={p.nom} 
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://placehold.co/200x200/7c3aed/ffffff/png?text=Produit';
                    }}
                  />
                  <button className="s-item-delete-btn" onClick={(e) => handleDeleteProduct(e, p.id, p.nom)}><Trash2 size={14} /></button>
                  {p.type === 'supermarche' && p.poidsVolume && <span className="s-card-weight-tag">{p.poidsVolume}</span>}
                </div>
                <div className="s-item-info">
                  <div className="s-item-header">
                     <span className="s-item-cat">{p.categorie}</span>
                     {p.marque && <span className="s-item-brand">{p.marque}</span>}
                  </div>
                  <h3>{p.nom}</h3>
                  <div className="s-item-price-row">
                    <span className="s-price-current">{Number(p.prix || 0).toLocaleString()} F</span>
                    <button onClick={(e) => { e.stopPropagation(); handleAddToCart(p); }} className="s-add-small"><Plus size={16}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {cart && cart.length > 0 && (
        <div className="s-cart-floating-card" onClick={() => navigate('/cart')}>
          <div className="s-cart-preview">
            <div className="s-cart-icon-wrapper">
              <ShoppingBag size={22} strokeWidth={2.5} />
              <span className="s-cart-badge-count">{cart.length}</span>
            </div>
            <div className="s-cart-info-text">
              <span className="s-cart-label">Votre Panier</span>
              <span className="s-cart-total">{totalAmount.toLocaleString()} F</span>
            </div>
          </div>
          <button className="s-cart-cta">
            <span>Finaliser</span>
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}