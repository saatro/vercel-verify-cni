// components/CategorieDynamique.jsx
import React from 'react';
import {
  Globe, Store, UserCheck, Home, Car,
  Camera, X, Utensils, Info, ShoppingCart, Flame, HeartPulse,
} from 'lucide-react';

export const ROLES_CONFIG = [
  { id: 'boutique',         label: 'Boutique',     icon: <Store        size={22} />, maxPhotos: 2, color: '#10b981' },
  { id: 'supermarche',      label: 'Supermarché',  icon: <ShoppingCart size={22} />, maxPhotos: 3, color: '#0ea5e9' },
  { id: 'resto',            label: 'Resto',        icon: <Utensils     size={22} />, maxPhotos: 3, color: '#f59e0b' },
  { id: 'fastfood',         label: 'Fast-food',    icon: <Flame        size={22} />, maxPhotos: 3, color: '#f97316' },
  { id: 'en_ligne',         label: 'En Ligne',     icon: <Globe        size={22} />, maxPhotos: 2, color: '#7c3aed' },
  { id: 'deal_particulier', label: 'Particulier',  icon: <UserCheck    size={22} />, maxPhotos: 2, color: '#6366f1' },
  { id: 'immobilier',       label: 'Immobilier',   icon: <Home         size={22} />, maxPhotos: 4, color: '#ec4899' },
  { id: 'vehicule',         label: 'Véhicule',     icon: <Car          size={22} />, maxPhotos: 4, color: '#1c93e4' },
  { id: 'sante',            label: 'Santé',        icon: <HeartPulse   size={22} />, maxPhotos: 3, color: '#14b8a6' },
];

/**
 * Champs techniques spécifiques par type de commerce.
 * Ces champs sont enregistrés dans le document produit (Firestore).
 */
export const CATEGORY_FIELDS = {
  boutique: [
    { name: 'marque',     label: 'Marque',              type: 'text' },
    { name: 'taille',     label: 'Taille / Pointure',   type: 'text' },
    { name: 'couleur',    label: 'Couleur',             type: 'text' },
    { name: 'etat',       label: 'État',                type: 'select', options: ['Neuf', 'Comme neuf', 'Bon état', 'Occasion'] },
  ],
  supermarche: [
    { name: 'marque',       label: 'Marque',              type: 'text' },
    { name: 'poidsVolume',  label: 'Poids / Volume',      type: 'text', placeholder: 'ex: 500g, 1L' },
    { name: 'datelimit',    label: 'Date limite',         type: 'date' },
    { name: 'origine',      label: 'Origine / Provenance', type: 'text' },
    { name: 'conservation', label: 'Conservation',        type: 'select', options: ['Ambiant', 'Réfrigéré', 'Surgelé'] },
  ],
  resto: [
    { name: 'portion',   label: 'Portion', type: 'select', options: ['1 personne', '2 personnes', '3-4 personnes', 'Familial (5+)'] },
    { name: 'tempsPrep', label: 'Temps de préparation', type: 'select', options: ['10 min', '15 min', '20 min', '30 min', '45 min', '1 h+'] },
    // épices & allergènes : choisis par le client sur la vitrine (StorePage)
  ],
  fastfood: [
    { name: 'portion',   label: 'Taille du menu', type: 'select', options: ['Solo', 'Menu', 'Familial', 'Mega'] },
    { name: 'tempsPrep', label: 'Temps estimé', type: 'select', options: ['5 min', '10 min', '15 min', '20 min', '30 min'] },
    { name: 'accompagnements', label: 'Accompagnements inclus', type: 'select', options: ['Aucun', 'Frites', 'Boisson', 'Frites + Boisson', 'Salade'] },
  ],
  en_ligne: [
    { name: 'format',     label: 'Format',            type: 'select', options: ['PDF', 'Vidéo', 'Lien', 'Licence', 'Autre'] },
    { name: 'duree',      label: 'Durée / Accès',     type: 'text', placeholder: 'ex: à vie, 12 mois' },
    { name: 'livraison',  label: 'Mode de livraison', type: 'text', placeholder: 'ex: email, lien téléchargement' },
  ],
  deal_particulier: [
    { name: 'etat',       label: 'État',              type: 'select', options: ['Neuf', 'Comme neuf', 'Bon état', 'À réparer'] },
    { name: 'marque',     label: 'Marque',            type: 'text' },
    { name: 'annee',      label: 'Année d\'achat',    type: 'text' },
    { name: 'negociable', label: 'Négociable',        type: 'select', options: ['Oui', 'Non'] },
  ],
  immobilier: [
    { name: 'surface',    label: 'Surface (m²)',      type: 'number' },
    { name: 'pieces',     label: 'Nombre de pièces',  type: 'number' },
    { name: 'quartier',   label: 'Quartier / Zone',   type: 'text' },
    { name: 'meublement', label: 'Meublé',            type: 'select', options: ['Oui', 'Non', 'Semi-meublé'] },
    { name: 'bail',       label: 'Type de bail',      type: 'select', options: ['Location', 'Vente', 'Colocation'] },
  ],
  vehicule: [
    { name: 'marque',     label: 'Marque',            type: 'text' },
    { name: 'modele',     label: 'Modèle',            type: 'text' },
    { name: 'annee',      label: 'Année',             type: 'number' },
    { name: 'km',         label: 'Kilométrage',       type: 'number' },
    { name: 'boite',      label: 'Boîte de vitesses', type: 'select', options: ['Manuelle', 'Automatique'] },
    { name: 'carburant',  label: 'Carburant',         type: 'select', options: ['Essence', 'Diesel', 'Hybride', 'Électrique'] },
    { name: 'etat',       label: 'État',              type: 'select', options: ['Neuf', 'Occasion'] },
  ],
  sante: [
    { name: 'marque',       label: 'Marque / Laboratoire', type: 'text' },
    { name: 'forme',        label: 'Forme',                type: 'select', options: ['Comprimé', 'Sirop', 'Crème', 'Gélule', 'Autre'] },
    { name: 'posologie',    label: 'Posologie indicative', type: 'text' },
    { name: 'ordonnance',   label: 'Ordonnance requise',   type: 'select', options: ['Oui', 'Non'] },
    { name: 'datelimit',    label: 'Date de péremption',   type: 'date' },
  ],
};

/**
 * Normalise l'identifiant d'une catégorie.
 */
export function normalizeCategoryId(id) {
  if (!id) return 'boutique';
  const normalized = String(id).toLowerCase().trim();
  const found = ROLES_CONFIG.find((r) => r.id === normalized);
  if (found) return found.id;

  if (normalized.includes('fast')) return 'fastfood';
  if (normalized.includes('resto') || normalized.includes('restaurant')) return 'resto';
  if (normalized.includes('super')) return 'supermarche';
  if (normalized.includes('immobilier') || normalized.includes('immo')) return 'immobilier';
  if (normalized.includes('vehicule') || normalized.includes('voiture')) return 'vehicule';
  if (normalized.includes('particulier')) return 'deal_particulier';
  if (normalized.includes('ligne')) return 'en_ligne';
  if (normalized.includes('sante') || normalized.includes('pharma') || normalized.includes('autre')) return 'sante';

  return 'boutique';
}

/**
 * Sous-catégories associées à un type de commerce.
 */
export function getSubCategories(type) {
  const normalized = normalizeCategoryId(type);
  switch (normalized) {
    case 'resto':
      return ['Menu Complet', 'Entrées', 'Plats Principaux', 'Desserts', 'Boissons', 'Spécialités'];
    case 'fastfood':
      return ['Burgers', 'Tacos', 'Pizzas', 'Sandwichs', 'Frites & Snacks', 'Menus Combo', 'Boissons'];
    case 'supermarche':
      return ['Épicerie', 'Fruits & Légumes', 'Viandes & Poissons', 'Produits laitiers', 'Boissons', 'Surgelés', 'Hygiène & Beauté', 'Bébé', 'Entretien', 'Autre'];
    case 'immobilier':
      return ['Studio', 'Chambre Salon', '2 Pièces', '3 Pièces', '4 Pièces', 'Villa', 'Duplex', 'Terrain', 'Bureau'];
    case 'vehicule':
      return ['Berline', 'SUV / 4x4', 'Moto', 'Camion', 'Pick-up', 'Utilitaire'];
    case 'sante':
      return ['Pharmacie', 'Parapharmacie', 'Indigena', 'Appareils médicaux', 'Bien-être', 'Soins personnels'];
    case 'en_ligne':
      return ['Logiciels', 'Formations', 'Abonnements', 'Services', 'Design', 'Coaching', 'Tickets', 'Autre'];
    case 'deal_particulier':
      return ['Mode', 'Téléphones', 'Ordinateurs', 'Électronique', 'Meubles', 'Vélos', 'Jeux', 'Autre'];
    case 'boutique':
    default:
      return ['Mode', 'Électronique', 'Beauté', 'Parfumerie', 'Maison', 'Jeux', 'Téléphones', 'Accessoires', 'Autre'];
  }
}

export default function CategorieDynamique({
  onSelect,
  categorie,
  mode = 'selection',
  images = [],
  setImages,
  maxPhotos = null,
  children,
}) {
  const currentRole = ROLES_CONFIG.find((r) => r.id === categorie) || ROLES_CONFIG[0];
  const currentLimit = maxPhotos ?? currentRole.maxPhotos;

  const handlePhoto = (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;

    const remaining = currentLimit - images.length;
    const toAdd = selected.slice(0, remaining);

    toAdd.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`Fichier trop lourd : ${file.name} (max 5 Mo)`);
        return;
      }
      const preview = URL.createObjectURL(file);
      setImages((prev) => [...prev, { file, preview }]);
    });

    if (selected.length > remaining) {
      alert(`⚠️ Maximum ${currentLimit} photo(s) pour "${currentRole.label}".`);
    }

    e.target.value = '';
  };

  const removePhoto = (index) => setImages((prev) => prev.filter((_, i) => i !== index));

  // ══ MODE GALERIE PHOTOS ══════════════════════════════════════════════════════
  if (mode === 'photos-only') {
    return (
      <div className="photo-uploader-modern" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Info size={14} color="#94a3b8" />
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            Photo{currentLimit > 1 ? 's' : ''} — {currentRole.label} &nbsp;({images.length}/{currentLimit})
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>
          {images.length < currentLimit && (
            <label
              style={{
                aspectRatio: '1/1',
                border: '2px dashed #cbd5e1',
                borderRadius: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: '#f8fafc',
              }}
            >
              <input type="file" multiple accept="image/*" onChange={handlePhoto} hidden />
              <Camera size={20} color="#94a3b8" />
              <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', marginTop: 4 }}>Ajouter</span>
            </label>
          )}
          {images.map((item, i) => {
            const src = typeof item === 'string' ? item : item.preview || item.url || '';
            return (
              <div
                key={i}
                style={{
                  aspectRatio: '1/1',
                  borderRadius: 16,
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
                }}
              >
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  style={{
                    position: 'absolute',
                    top: 5,
                    right: 5,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,.2)',
                  }}
                >
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ══ MODE SÉLECTION ═══════════════════════════════════════════════════════════
  return (
    <div className="category-selector-modern" style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {ROLES_CONFIG.map((role) => {
          const sel = categorie === role.id;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onSelect(role.id)}
              style={{
                border: sel ? `2px solid ${role.color}` : '1.5px solid #e2e8f0',
                background: sel ? `${role.color}12` : '#fff',
                padding: '10px 4px',
                borderRadius: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                transition: 'transform .15s',
                transform: sel ? 'scale(1.04)' : 'scale(1)',
              }}
            >
              <div
                style={{
                  color: sel ? role.color : '#94a3b8',
                  transition: 'transform .2s',
                  transform: sel ? 'scale(1.12)' : 'scale(1)',
                }}
              >
                {role.icon}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: sel ? 900 : 600,
                    color: sel ? '#1e293b' : '#64748b',
                    lineHeight: 1.2,
                  }}
                >
                  {role.label}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: sel ? role.color : '#cbd5e1',
                    marginTop: 2,
                    fontWeight: 700,
                  }}
                >
                  {role.maxPhotos}p
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="dynamic-fields-scroll-container"
        style={{
          marginTop: '16px',
          maxHeight: '60vh',
          overflowY: 'auto',
          paddingRight: '4px',
          paddingBottom: '30px',
          scrollbarWidth: 'thin',
        }}
      >
        {children}
      </div>
    </div>
  );
}
