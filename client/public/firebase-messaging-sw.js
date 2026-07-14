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
const CACHE_NAME = "mambo-v9"; // Incrémenté en v9 pour purger le cache et enregistrer le correctif de routage
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

// 3. STRATÉGIE FETCH PROFESSIONNELLE AVEC FILTRAGE DES CARTES EXTERNES
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

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

  // EXCLUSION SÉCURISÉE DES ASSETS LOCAUX ET WEBPACK POUR L'ENVIRONNEMENT DEV
  if (
    url.includes("/static/") || 
    url.includes("/media/") || 
    url.includes("hot-update")
  ) {
    return;
  }

  // RE-ROUTAGE STRATÉGIQUE DES NAVIGATIONS CLIENTS (ex: /acces, /marketplace-full)
  // Évite d'interroger le serveur pour des routes virtuelles d'une SPA React
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((response) => {
        return response || fetch(event.request);
      }).catch(() => {
        return fetch(event.request);
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
        })
        .catch((error) => {
          console.error("[SW] Erreur de capture réseau sur :", url, error);
          
          return new Response("", {
            status: 408,
            statusText: "Network Request Failed"
          });
        });
    })
  );
});