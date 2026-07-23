/* eslint-disable no-restricted-globals */
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 1. INITIALISATION FIREBASE (COMPAT)
firebase.initializeApp({
  apiKey: "AIzaSyAUXDW7BnDcbjhXVIvvCOpU7jkgD3aGnUc",
  authDomain: "livraison-moto.firebaseapp.com",
  projectId: "livraison-moto",
  storageBucket: "livraison-moto.firebasestorage.app",
  messagingSenderId: "534110018801",
  appId: "1:534110018801:web:6a9684490997ce74f39d50"
});

const messaging = firebase.messaging();

// Gestion des messages en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Message reçu en arrière-plan:', payload);
  const notificationTitle = payload.notification?.title || "Mambo Livraison";
  const notificationOptions = {
    body: payload.notification?.body || "Vous avez une nouvelle mise à jour.",
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: 'mambo-notification',
    renotify: true
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 2. LOGIQUE PWA / CACHING
const CACHE_NAME = "mambo-v10"; // Version incrémentée pour purger l'ancien cache local
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo192.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. STRATÉGIE FETCH OPTIMISÉE POUR FIRESTORE ET ENVIRONNEMENT DEV
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // PROTECTION DEV : Ne pas intercepter le réseau en environnement local (localhost / 127.0.0.1)
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return;
  }

  // PROTECTION CRITIQUE 1 : Ignorer les requêtes non-http ou non-GET
  if (!url.startsWith('http') || event.request.method !== 'GET') return;

  // PROTECTION CRITIQUE 2 : Ne jamais intercepter le SDK Firebase (Auth, Firestore, Messaging)
  if (
    url.includes("firestore.googleapis.com") || 
    url.includes("identitytoolkit.googleapis.com") ||
    url.includes("securetoken.googleapis.com") ||
    url.includes("google.com/recaptcha") ||
    url.includes("fcmbackend")
  ) {
    return;
  }

  // EXCLUSION DES TUILES DE CARTES EXTERNES (CartoDB, OpenStreetMap, Mapbox, etc.)
  if (
    url.includes("basemaps.cartocdn.com") || 
    url.includes("openstreetmap.org") || 
    url.includes("tile.openstreetmap")
  ) {
    return;
  }

  // EXCLUSION SÉCURISÉE DES ASSETS LOCAUX ET WEBPACK
  if (
    url.includes("/static/") || 
    url.includes("/media/") || 
    url.includes("hot-update")
  ) {
    return;
  }

  // RE-ROUTAGE STRATÉGIQUE DES NAVIGATIONS CLIENTS (SPA React)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // En cas d'absence totale de réseau, servir le fallback index.html depuis le cache
        return caches.match('/index.html');
      })
    );
    return;
  }

  // STRATÉGIE STANDARD POUR LES AUTRES RESSOURCES (Images, Ajax, Fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          // Vérification stricte : exclusion des réponses opaques
          if (networkResponse.type === 'basic' || networkResponse.type === 'cors') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (event.request.url.startsWith('http')) {
                cache.put(event.request, responseToCache).catch((err) => {
                  console.warn("[SW] Échec d'écriture dans le cache dynamique:", err);
                });
              }
            });
          }
          return networkResponse;
        });
    })
  );
});