// components/CategorieDynamique.jsx
import React from 'react';
import {
  Globe, Store, UserCheck, Home, Car,
  Camera, X, Utensils, Zap, Info, ShoppingCart,
} from 'lucide-react';

export const ROLES_CONFIG = [
  { id:'boutique',         label:'Boutique',     icon:<Store        size={22}/>, maxPhotos:2, color:'#10b981' },
  { id:'supermarche',      label:'Supermarché',  icon:<ShoppingCart size={22}/>, maxPhotos:3, color:'#0ea5e9' },
  { id:'resto_fastfood',   label:'Resto',        icon:<Utensils     size={22}/>, maxPhotos:3, color:'#f59e0b' },
  { id:'en_ligne',         label:'En Ligne',     icon:<Globe        size={22}/>, maxPhotos:2, color:'#7c3aed' },
  { id:'deal_particulier', label:'Particulier',  icon:<UserCheck    size={22}/>, maxPhotos:2, color:'#6366f1' },
  { id:'immobilier',       label:'Immobilier',   icon:<Home         size={22}/>, maxPhotos:4, color:'#ec4899' },
  { id:'vehicule',         label:'Véhicule',     icon:<Car          size={22}/>, maxPhotos:4, color:'#1c93e4' },
  { id:'autre',            label:'Autre',        icon:<Zap          size={22}/>, maxPhotos:2, color:'#64748b' },
];

export default function CategorieDynamique({
  onSelect,
  categorie,
  mode      = 'selection',
  images    = [],        // tableau de { file: File, preview: string }
  setImages,
  maxPhotos = null,      // ✅ override optionnel — passer maxPhotos={1} depuis VendeurSignup
}) {
  const currentRole  = ROLES_CONFIG.find(r => r.id === categorie) || ROLES_CONFIG[0];
  const currentLimit = maxPhotos ?? currentRole.maxPhotos; // prop prioritaire sur config

  const handlePhoto = (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;

    const remaining = currentLimit - images.length;
    const toAdd = selected.slice(0, remaining);

    toAdd.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`Fichier trop lourd : ${file.name} (max 5 Mo)`);
        return;
      }
      const preview = URL.createObjectURL(file);
      setImages(prev => [...prev, { file, preview }]);
    });

    if (selected.length > remaining) {
      alert(`⚠️ Maximum ${currentLimit} photo(s) pour "${currentRole.label}".`);
    }

    e.target.value = "";
  };

  const removePhoto = (index) => setImages(prev => prev.filter((_, i) => i !== index));

  // ══ MODE GALERIE PHOTOS ══════════════════════════════════════════════════════
  if (mode === 'photos-only') {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Info size={14} color="#94a3b8"/>
          <span style={{ fontSize:12, color:'#64748b', fontWeight:600 }}>
            Photo{currentLimit > 1 ? 's' : ''} — {currentRole.label} &nbsp;({images.length}/{currentLimit})
          </span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:13 }}>
          {images.length < currentLimit && (
            <label style={{
              aspectRatio:'1/1', border:'2px dashed #cbd5e1', borderRadius:16,
              display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', cursor:'pointer', background:'#f8fafc',
            }}>
              <input type="file" multiple accept="image/*" onChange={handlePhoto} hidden/>
              <Camera size={20} color="#94a3b8"/>
              <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', marginTop:4 }}>Ajouter</span>
            </label>
          )}
          {images.map((item, i) => (
            <div key={i} style={{
              aspectRatio:'1/1', borderRadius:16, overflow:'hidden',
              position:'relative', border:'1px solid #e2e8f0',
              boxShadow:'0 4px 6px -1px rgba(0,0,0,.1)',
            }}>
              <img src={item.preview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              <button type="button" onClick={() => removePhoto(i)} style={{
                position:'absolute', top:5, right:5, background:'#ef4444', color:'#fff',
                border:'none', borderRadius:'50%', width:22, height:22,
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', boxShadow:'0 2px 4px rgba(0,0,0,.2)',
              }}>
                <X size={14} strokeWidth={3}/>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ══ MODE SÉLECTION ═══════════════════════════════════════════════════════════
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        {ROLES_CONFIG.map(role => {
          const sel = categorie === role.id;
          return (
            <button key={role.id} type="button" onClick={() => onSelect(role.id)} style={{
              border:     sel ? `2px solid ${role.color}` : '1.5px solid #e2e8f0',
              background: sel ? `${role.color}12` : '#fff',
              padding:    '10px 4px', borderRadius:16,
              display:'flex', flexDirection:'column', alignItems:'center', gap:5,
              cursor:'pointer', transition:'transform .15s',
              transform: sel ? 'scale(1.04)' : 'scale(1)',
            }}>
              <div style={{ color: sel ? role.color : '#94a3b8', transition:'transform .2s', transform: sel ? 'scale(1.12)' : 'scale(1)' }}>
                {role.icon}
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, fontWeight: sel ? 900 : 600, color: sel ? '#1e293b' : '#64748b', lineHeight:1.2 }}>
                  {role.label}
                </div>
                <div style={{ fontSize:8, color: sel ? role.color : '#cbd5e1', marginTop:2, fontWeight:700 }}>
                  {role.maxPhotos}p
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}