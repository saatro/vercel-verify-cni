/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, Loader2, ShoppingCart, ShieldCheck } from 'lucide-react';
import { useCart } from '../Context/CartContext';
import { toast, ToastContainer } from 'react-toastify';

export default function ProductDetails() {
  // Extraction sécurisée des paramètres d'URL
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  // Fonction unifiée pour extraire l'ID du vendeur
  const getVendorId = (productData) => {
    return (
      productData.vendeurId ||
      productData.vendorId ||
      productData.uid ||
      productData.storeId ||
      productData.sellerId ||
      productData.userId ||
      null
    );
  };

  useEffect(() => {
    let isMounted = true;

    const fetchProductData = async () => {
      // Nettoyage de sécurité au cas où l'identifiant contient des caractères de routage corrompus
      const cleanProductId = productId ? productId.replace(/\//g, '').trim() : null;

      if (!cleanProductId) {
        toast.error("Identifiant du produit invalide");
        setLoading(false);
        navigate('/');
        return;
      }

      try {
        setLoading(true);
        const pDoc = await getDoc(doc(db, 'products', cleanProductId));
        
        if (!pDoc.exists()) {
          toast.error("Ce produit n'existe plus ou a été retiré");
          if (isMounted) {
            setProduct(null);
            setLoading(false); // VERROU : Arrêt indispensable du spinner si le document est introuvable
          }
          return;
        }

        if (isMounted) {
          const data = pDoc.data();
          setProduct({ 
            id: pDoc.id, 
            ...data,
            // Prise en charge unifiée de l'image principale par défaut
            imageUrl: data.images?.[0] || data.image || data.imageUrl || null
          });
        }
      } catch (e) {
        console.error("Erreur de récupération de la fiche produit :", e);
        toast.error("Impossible de charger les détails du produit");
      } finally {
        // Sécurité ultime : le chargement est systématiquement débrayé quoi qu'il arrive
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProductData();

    return () => {
      isMounted = false;
    };
  }, [productId, navigate]);

  const handleAddToCart = () => {
    if (!product) return;
    addToCart({
      ...product,
      quantity: 1,
      image: product.images?.[0] || product.image || product.imageUrl || 'https://placehold.co/300x300/1e293b/94a3b8/png?text=Produit'
    });
    toast.success(`${product.nom} ajouté au panier !`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '12px', color: '#64748b' }}>
        <Loader2 className="animate-spin" color="#7c3aed" size={32} />
        <p style={{ fontSize: '14px', fontWeight: 500 }}>Analyse des détails du produit...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: '16px', fontWeight: 600 }}>Fiche produit indisponible</p>
        <button 
          onClick={() => navigate('/')}
          style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
        >
          Retour à l'accueil
        </button>
      </div>
    );
  }

  // Calcul du prix (gestion des promotions éventuelles)
  const isPromo = product.isPromo && product.prixPromo && Number(product.prixPromo) < Number(product.prix);
  const currentPrice = isPromo ? product.prixPromo : product.prix;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px', minHeight: '100vh', background: '#fff' }}>
      <ToastContainer theme="dark" position="top-center" autoClose={1500} hideProgressBar />
      
      {/* Barre de navigation haute */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: '#f1f5f9', padding: '10px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={22} color="#1e293b" />
        </button>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Détails de l'article
        </span>
        <div style={{ width: '42px' }}></div>
      </header>

      {/* Rendu visuel du produit */}
      <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#f8fafc', marginBottom: '20px', aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img 
          src={product.images?.[activeImgIndex] || product.image || product.imageUrl || 'https://placehold.co/300x300/1e293b/94a3b8/png?text=Produit'} 
          alt={product.nom}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        
        {product.images?.length > 1 && (
          <div style={{ position: 'absolute', bottom: '12px', left: '0', right: '0', display: 'flex', justifyContent: 'center', gap: '6px' }}>
            {product.images.map((_, i) => (
              <button 
                key={i}
                onClick={() => setActiveImgIndex(i)}
                style={{ width: '8px', height: '8px', borderRadius: '50%', border: 'none', padding: 0, background: i === activeImgIndex ? '#7c3aed' : '#cbd5e1', transition: 'all 0.2s', cursor: 'pointer' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Informations Textuelles */}
      <main style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ background: '#f3e8ff', color: '#6b21a8', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>
            {product.type || product.categorie || 'Général'}
          </span>
          {product.marque && (
            <span style={{ background: '#e2e8f0', color: '#334155', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
              {product.marque}
            </span>
          )}
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.3', marginBottom: '12px' }}>
          {product.nom}
        </h1>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '20px' }}>
          <span style={{ fontSize: '26px', fontWeight: 900, color: '#7c3aed' }}>
            {Number(currentPrice || 0).toLocaleString()}
          </span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#7c3aed', marginRight: '4px' }}>F</span>
          
          {isPromo && (
            <span style={{ fontSize: '16px', color: '#94a3b8', textDecoration: 'line-through', marginRight: '8px', fontWeight: 500 }}>
              {Number(product.prix || 0).toLocaleString()} F
            </span>
          )}

          {product.unite && (
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
              / {product.unite}
            </span>
          )}
        </div>

        {/* Bloc Spécificités Supermarché */}
        {(product.type === 'supermarche' || product.type === 'supermarket') && (
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px' }}>FICHE TECHNIQUE TRACABILITÉ</span>
            
            {product.poidsVolume && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: 500 }}>Contenance / Volume</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>{product.poidsVolume}</span>
              </div>
            )}
            {product.temperature && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: 500 }}>Conservation</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>{product.temperature}</span>
              </div>
            )}
            {product.datelimit && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: 500 }}>Date Limite (DLC)</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>{product.datelimit}</span>
              </div>
            )}
            {product.conditionnement && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: 500 }}>Format Emballage</span>
                <span style={{ color: '#475569', fontWeight: 600 }}>{product.conditionnement}</span>
              </div>
            )}
            {product.allergenes && (
              <div style={{ marginTop: '4px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '12px', color: '#b45309', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <ShieldCheck size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Allergènes signalés :</strong> {product.allergenes}</span>
              </div>
            )}
          </div>
        )}

        {/* Bloc Description Standard */}
        {product.description && (
          <div style={{ marginBottom: '100px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Description</h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', margin: 0 }}>{product.description}</p>
          </div>
        )}
      </main>

      {/* Barre d'Action Flottante Basse */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', zIndex: 100 }}>
        <button 
          onClick={handleAddToCart}
          style={{ width: '100%', maxWidth: '568px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)' }}
        >
          <ShoppingCart size={18} />
          <span>Ajouter au panier</span>
        </button>
      </div>
    </div>
  );
}