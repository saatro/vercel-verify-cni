import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  doc, collection, addDoc, updateDoc, serverTimestamp 
} from 'firebase/firestore'; 
import { X, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import CategorieDynamique, {
  CATEGORY_FIELDS,
  normalizeCategoryId,
} from '../components/CategorieDynamique';
import { uploadToCloudinary } from '../utils/cloudinary';

// ── Configuration Unifiée des Champs Spécifiques par Catégorie ────────────────
export default function ProductModal({ vendorId, product, onClose }) {
  const [loading, setLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [f, setF] = useState({ 
    nom: '', prix: '', stock: '', images: [], 
    description: '', categorie: '', detailsSpecifiques: {},
    type: '', marque: '', unite: '', poidsVolume: '', 
    conditionnement: '', temperature: '', datelimit: '', 
    allergenes: '', code_barre: '', reference: ''
  });

  useEffect(() => {
    if (product) {
      setF({ 
        ...product, 
        images: Array.isArray(product.images) ? product.images : [], 
        detailsSpecifiques: product.detailsSpecifiques || {},
        type: product.type || product.categorie || '',
        marque: product.marque || '',
        unite: product.unite || '',
        poidsVolume: product.poidsVolume || '',
        conditionnement: product.conditionnement || '',
        temperature: product.temperature || '',
        datelimit: product.datelimit || '',
        allergenes: product.allergenes || '',
        code_barre: product.code_barre || '',
        reference: product.reference || ''
      });
      setIsDrawerOpen(true);
    }
  }, [product]);

  const handleCategorySelect = (catId) => {
    const id = normalizeCategoryId(catId);
    setF((prev) => ({
      ...prev,
      categorie: id,
      // DB : supermarche pour historique filtre supermarket
      type: id === "supermarket" ? "supermarche" : id,
      detailsSpecifiques: {},
      // reset champs spécifiques
      marque: "",
      unite: "",
      poidsVolume: "",
      conditionnement: "",
      temperature: "",
      datelimit: "",
      allergenes: "",
      code_barre: "",
      reference: "",
    }));
    setIsDrawerOpen(true);
  };

  const handleSpecChange = (fieldId, value) => {
    const cat = normalizeCategoryId(f.categorie);
    // Supermarché / resto : champs à la racine du document produit
    if (cat === "supermarket" || cat === "resto_fastfood") {
      setF((prev) => ({ ...prev, [fieldId]: value }));
    } else {
      setF((prev) => ({
        ...prev,
        detailsSpecifiques: { ...(prev.detailsSpecifiques || {}), [fieldId]: value },
      }));
    }
  };

  const save = async () => {
    if (!f.nom || !f.prix || !f.categorie) return toast.error("Informations manquantes");
    setLoading(true);
    try {
      const uploadedUrls = [];
      
      for (const img of f.images) {
        if (typeof img === 'string' && img.startsWith('data:image')) {
          const response = await fetch(img);
          const blob = await response.blob();
          const file = new File([blob], "product.jpg", { type: "image/jpeg" });
          const url = await uploadToCloudinary(file);
          uploadedUrls.push(url);
        } else {
          uploadedUrls.push(img);
        }
      }

      // Normalisation type : supermarket (UI) → supermarche (DB historique) + alias
      const normalizedType =
        f.categorie === "supermarket" ? "supermarche" : (f.categorie || f.type || "boutique");

      const payload = {
        nom: f.nom,
        prix: Number(f.prix),
        stock: Number(f.stock) || 0,
        images: uploadedUrls,
        imageUrl: uploadedUrls[0] || null, // alias pour grilles / détails
        description: f.description || "",
        categorie: f.categorie || normalizedType,
        type: normalizedType,
        // Double clé vendeur pour ClientHome / Store / ProductGrid
        vendorId: vendorId,
        vendeurId: vendorId,
        updatedAt: serverTimestamp(),
      };

      if (normalizeCategoryId(f.categorie) === "supermarket" || normalizedType === "supermarche") {
        payload.type = "supermarche";
        payload.categorie = "supermarket"; // filtre marketplace
        payload.marque = f.marque || "";
        payload.unite = f.unite || "";
        payload.poidsVolume = f.poidsVolume || "";
        payload.conditionnement = f.conditionnement || "";
        payload.temperature = f.temperature || "";
        payload.datelimit = f.datelimit || "";
        payload.allergenes = f.allergenes || "";
        payload.code_barre = f.code_barre || "";
        payload.reference = f.reference || "";
        payload.detailsSpecifiques = {};
      } else {
        payload.detailsSpecifiques = f.detailsSpecifiques || {};
      }

      if (product?.id) {
        await updateDoc(doc(db, 'products', product.id), payload);
        toast.success("Annonce mise à jour");
      } else {
        await addDoc(collection(db, 'products'), { ...payload, createdAt: serverTimestamp() });
        toast.success("Annonce publiée");
      }
      onClose();
    } catch (e) {
      console.error("Erreur d'enregistrement Firestore:", e);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-modal-fs">
      <div className="m-modal-header">
        <button onClick={onClose} className="m-close-btn" style={{ border: 'none', background: 'none' }}>
          <X size={24}/>
        </button>
        <h3 style={{ fontWeight: 800 }}>{!isDrawerOpen ? "Catégorie" : "Détails de l'offre"}</h3>
        <button onClick={save} className="m-save-text-btn" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={18}/> : 'Enregistrer'}
        </button>
      </div>

      <div className="m-modal-scroll-body">
        {!isDrawerOpen ? (
          <div className="m-category-selection-wrapper fade-in">
            <CategorieDynamique 
              categorie={f.categorie} 
              onSelect={handleCategorySelect} 
              mode="selection"
            />
          </div>
        ) : (
          <div className="m-form-container-v4 fade-in" style={{ padding: '0 5px 40px' }}>
            
            <CategorieDynamique 
              categorie={f.categorie} 
              mode="photos-only" 
              images={f.images} 
              setImages={(imgs) => setF(prev => ({ ...prev, images: typeof imgs === 'function' ? imgs(prev.images) : imgs }))}
              limit={(normalizeCategoryId(f.categorie) === 'immobilier' || normalizeCategoryId(f.categorie) === 'vehicule') ? 5 : 3}
            />

            {/* Infomations Générales Obligatoires de l'Annonce */}
            <div className="m-specs-container" style={{ marginTop: '15px' }}>
              <div className="m-dynamic-fields-divider">
                <span>INFORMATIONS GÉNÉRALES</span>
              </div>
              
              <div className="m-input-group-v4">
                <label style={{ fontSize: '10px' }}>Nom du produit / Titre de l'annonce *</label>
                <input 
                  type="text" 
                  placeholder="Ex: Huile de Tournesol, Studio meublé..." 
                  value={f.nom} 
                  onChange={e => setF(prev => ({ ...prev, nom: e.target.value }))}
                  style={{ padding: '10px', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div className="m-input-group-v4">
                  <label style={{ fontSize: '10px' }}>Prix (FCFA) *</label>
                  <input 
                    type="number" 
                    placeholder="Ex: 5000" 
                    value={f.prix} 
                    onChange={e => setF(prev => ({ ...prev, prix: e.target.value }))}
                    style={{ padding: '10px', fontSize: '14px' }}
                  />
                </div>
                <div className="m-input-group-v4">
                  <label style={{ fontSize: '10px' }}>Quantité en stock</label>
                  <input 
                    type="number" 
                    placeholder="Ex: 12" 
                    value={f.stock} 
                    onChange={e => setF(prev => ({ ...prev, stock: e.target.value }))}
                    style={{ padding: '10px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="m-input-group-v4" style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '10px' }}>Description détaillée</label>
                <textarea 
                  placeholder="Décrivez votre article ici..." 
                  value={f.description} 
                  onChange={e => setF(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '10px', fontSize: '14px', width: '100%', minHeight: '80px', border: '1px solid #e2e8f0', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
            </div>

            {/* Spécificités Additionnelles selon la Catégorie choisie */}
            {CATEGORY_FIELDS[normalizeCategoryId(f.categorie)]?.length > 0 && (
              <CategorieDynamique
                mode="fields"
                categorie={f.categorie}
                fieldValues={
                  normalizeCategoryId(f.categorie) === "supermarket" ||
                  normalizeCategoryId(f.categorie) === "resto_fastfood"
                    ? f
                    : (f.detailsSpecifiques || {})
                }
                onFieldChange={handleSpecChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}