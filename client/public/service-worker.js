/* eslint-disable no-restricted-globals */

// Nom du cache mis à jour pour Mambo Premium
const CACHE_NAME = "livraison-moto-cache-v3";

// Ressources indispensables pour l'installation initiale (Splash screen & coquille de l'app)
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/logo192.png",
  "/logo512.png"
];

// Installation : Mise en cache immédiate de la structure minimale
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Activation : Nettoyage drastique des anciennes versions de caches de l'application
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("🧹 Suppression de l'ancien cache PWA :", name);
            return caches.delete(name);
          }
          return Promise.resolve();
        })
      );
    })
  );
  self.clients.claim();
});

// Interception des requêtes (Stratégie hybride optimisée pour la Côte d'Ivoire)
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // 1. IGNORER : Firestore, Authentification, Cloud Functions et extensions Chrome
  if (
    url.includes("firestore.googleapis.com") || 
    url.includes("identitytoolkit.googleapis.com") ||
    url.startsWith("chrome-extension://") ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // 2. STRATÉGIE POUR LES ASSETS STATIQUES LOURDS (Images, Logos, Fonts) -> Cache-First
  if (
    event.request.destination === 'image' || 
    url.includes('.png') || 
    url.includes('.jpg') || 
    url.includes('placehold.co')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
          }
          return networkResponse;
        }).catch(() => null); // Évite de crasher si l'image hors-ligne échoue
      })
    );
    return;
  }

  // 3. STRATÉGIE POUR LE RESTE (HTML, JS, CSS) -> Network-First avec repli sur Cache
  // Idéal pour Mambo : l'app cherche toujours la version du serveur (prix/boutiques à jour)
  // et ne prend le cache que si le réseau est coupé ou trop lent.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Si la réponse est valide, on met à jour le cache dynamiquement
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
        }
        return networkResponse;
      })
      .catch(() => {
        // En cas d'échec total du réseau (Zone blanche), on regarde dans le cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si même la sous-route n'est pas cachée, on renvoie le point d'entrée index.html pour React Router
          return caches.match("/");
        });
      })
  );
});