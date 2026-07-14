import React, { useState } from 'react';
import { Camera, X } from 'lucide-react';

export default function FormulaireExterieur({ typeVendeur }) {
  const [images, setImages] = useState([]);
  // LOGIQUE : 5 photos pour Particulier, 1 photo pour les autres
  const max = (typeVendeur === 'particulier') ? 5 : 1;

  const handleUpload = (e) => {
    const files = Array.from(e.target.files);
    if (images.length + files.length > max) return alert(`Max ${max} photos`);

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (f) => setImages(prev => [...prev, f.target.result]);
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="m-external-form">
      <div className="m-input-group">
        <label>NOM DE L'ARTICLE</label>
        <input type="text" placeholder="Titre de l'annonce" />
      </div>

      <div className="m-input-group">
        <label>PRIX (FCFA)</label>
        <input type="number" placeholder="0" />
      </div>

      <div className="m-upload-area">
        <label className="m-label-helper">PHOTOS ({images.length}/{max})</label>
        <div className="m-images-grid">
          {images.length < max && (
            <label className="m-add-box">
              <input type="file" multiple onChange={handleUpload} hidden />
              <Camera />
            </label>
          )}
          {images.map((img, i) => (
            <div key={i} className="m-img-card">
              <img src={img} alt="" />
              <button onClick={() => setImages(images.filter((_, idx) => idx !== i))}><X size={12}/></button>
            </div>
          ))}
        </div>
      </div>

      <button className="m-payment-redirect-btn">VALIDER L'ANNONCE</button>
    </div>
  );
}