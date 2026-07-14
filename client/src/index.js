import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { CartProvider } from './Context/CartContext'; // ✅ Import du Provider
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      {/* ✅ Le CartProvider doit envelopper App pour que useCart fonctionne partout */}
      <CartProvider> 
        <App />
      </CartProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// ✅ ACTIVÉ - Enregistrement du Service Worker pour PWA
serviceWorkerRegistration.register({
  onSuccess: (registration) => {
    console.log('✅ Service Worker enregistré avec succès:', registration);
  },
  onUpdate: (registration) => {
    console.log('🔄 Nouvelle version disponible. Rafraîchissez pour mettre à jour.');
    
    if (window.confirm('Une nouvelle version est disponible ! Voulez-vous actualiser ?')) {
      window.location.reload();
    }
  }
});

// ✅ Détection de l'installation PWA
window.addEventListener('appinstalled', () => {
  console.log('🎉 MAMBO installé avec succès sur cet appareil !');
});