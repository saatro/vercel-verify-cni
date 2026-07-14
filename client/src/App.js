import React from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, updateDoc, getDoc } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ProtectedRoute from "./components/ProtectedRoute";
import { auth, db, messaging } from "./firebase";

import { Loader2, MessageCircle } from "lucide-react";
import { CartProvider } from "./Context/CartContext";
import CartCourseWeb from "./pages/CartCourseWeb";
import PrivacyPolicy from './pages/PrivacyPolicy';

import AdminFraudDashboard from "./components/AdminFraudDashboard";
import MesCourses from "./components/MesCourses";
import ProfilClient from "./components/ProfilClient";
import AdminHome from "./pages/AdminHome";
import AdminLogin from "./pages/AdminLogin";
import AdminProofs from "./pages/AdminProofs";
import AssignationAutomatique from "./pages/AssignationAutomatique";
import AssignationCoursier from "./pages/AssignationCoursier";
import CartPage from "./pages/CartPage";
import ClientHome from "./pages/ClientHome";
import ConfirmationMarket from "./pages/Confirmation";
import EspaceCoursier from "./pages/EspaceCoursier";
import ForceOfflineEmergency from "./pages/ForceOfflineEmergency";
import GestionClients from "./pages/GestionClients";
import GestionConnexions from "./pages/GestionConnexions";
import GestionJetons from "./pages/GestionJetons";
import GestionLivreurs from "./pages/GestionLivreurs";
import GpsDiagnostic from "./pages/GpsDiagnostic";
import HistoriqueGains from "./pages/HistoriqueGains";
import ImmobilierPage from "./pages/ImmobilierPage";
import LivreurExterne from "./pages/LivreurHome";   // ou le vrai chemin du fichier
import LoginClient from "./pages/LoginClient";
import LoginCoursier from "./pages/LoginCoursier";
import LoginLivreur from "./pages/LoginLivreur";
import LoginMarketplace from "./pages/LoginMarketplace";
import MarketplaceFull from "./pages/MarketplaceFull";
import MigrationGPS from "./pages/MigrationGps";
import PageAcces from "./pages/PageAcces";
import PageConfirmation from "./pages/PageConfirmation";
import PageInscriptionClient from "./pages/PageInscriptionClient";
import PageInscriptionCoursier from "./pages/PageInscriptionCoursier";
import InscriptionLivreurSecteurs from "./pages/InscriptionLivreurSecteurs";
import ProductDetails from "./pages/ProductDetails";

import ProfilLivreur from "./pages/ProfilLivreur";
import RestoPage from "./pages/RestoPage";
import StorePage from "./pages/StorePage";
import SuccessPage from "./pages/SuccessPage";
import SupermarketPage from "./pages/SupermarketPage";
import Tracking from "./pages/Tracking";
import UploadRecu from "./pages/UploadRecu";
import VehiculePage from "./pages/VehiculePage";
import VendeurDashboard from "./pages/VendeurDashboard";
import VendeurLogin from "./pages/VendeurLogin";
import VendeurSignup from "./pages/VendeurSignup";
import PrintableQrPage from "./pages/PrintableQrPage";

// ── Configuration des rôles externes ───────────────────────────────────────
const EXTERNAL_ROLES = ["livreur-externe"];

export default function App() {
  const [user, setUser]       = useState(null);
  // Remplacement de la valeur initiale par "loading" pour bloquer le statut "Guest" prématuré
  const [role, setRole]       = useState("loading");
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const isAssignPage   = location.pathname.includes('/assignation-') || location.pathname.includes('/cart-course/');
  const isUploadPage   = location.pathname.includes('/upload-recu');
  const isCoursierPage = location.pathname.includes('/espace-coursier');
  const isTrackingPage = location.pathname.includes('/tracking');

  const contactAssistance = useCallback((orderId = "") => {
    const phone = "2250778073456";
    const text  = orderId
      ? `Bonjour Mambo Assistance, j'enregistre votre numéro pour confirmer le paiement Wave de la commande *${orderId}*.`
      : `Bonjour Mambo Assistance, j'enregistre votre numéro pour confirmer mon paiement Wave.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  }, []);

  const setupNotifications = useCallback(async (userId) => {
    if (!userId || !messaging) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const reg   = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, {
        vapidKey: "BDE5b26fkUCHbCy7IzjX30eDjJpfQev7GWOrKc6yJxUV48L0XInKEd2urQwzuqUgjQ5UAfP9EcvZ3gtXYI52oII",
        serviceWorkerRegistration: reg,
      });
      if (token) await updateDoc(doc(db, "users", userId), { fcmToken: token, notificationsEnabled: true, lastTokenUpdate: serverTimestamp() }).catch(() => {});
    } catch { console.warn("⚠️ FCM non configuré"); }
  }, []);

  useEffect(() => {
    let unsubscribeRole = null;
    let isSubscribed    = true;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeRole) { unsubscribeRole(); unsubscribeRole = null; }

      if (firebaseUser) {
        setUser(firebaseUser);
        setupNotifications(firebaseUser.uid);

        const waitForDoc = async (retries = 5, delay = 1000) => {
          for (let i = 0; i < retries; i++) {
            try { 
              const s = await getDoc(doc(db, "users", firebaseUser.uid)); 
              if (s.exists()) return s; 
            } catch {}
            await new Promise(r => setTimeout(r, delay));
          }
          return null;
        };

        if (isSubscribed && auth.currentUser) {
          unsubscribeRole = onSnapshot(
            doc(db, "users", firebaseUser.uid),
            async (docSnap) => {
              if (!isSubscribed) return;
              if (docSnap.exists()) {
                const d = docSnap.data();
                if (d.banned) { 
                  await signOut(auth); 
                  setRole("guest"); 
                } else { 
                  setRole(d.role?.toLowerCase().trim() || "client"); 
                }
                setLoading(false);
              } else {
                const snap = await waitForDoc();
                if (!isSubscribed) return;
                if (snap?.exists()) {
                  setRole(snap.data().role?.toLowerCase().trim() || "client");
                } else { 
                  try { 
                    const cs = await getDoc(doc(db, "coursiers", firebaseUser.uid)); 
                    setRole(cs.exists() ? "coursier" : "client");
                  } catch { 
                    setRole("client"); 
                  } 
                }
                setLoading(false);
              }
            },
            async (error) => {
              console.warn("onSnapshot réinitialisé ou bloqué, code :", error.code);
              if (unsubscribeRole) { unsubscribeRole(); unsubscribeRole = null; }
              if (!isSubscribed) return;
              
              try {
                const snap = await waitForDoc();
                if (!isSubscribed) return;
                setRole(snap?.exists() ? (snap.data().role?.toLowerCase().trim() || "client") : "client");
              } catch (err) {
                console.error("Échec critique du fallback :", err);
                setRole("client");
              } finally {
                setLoading(false);
              }
            }
          );
        }
      } else { 
        setUser(null); 
        setRole("guest"); 
        setLoading(false); 
      }
    });

    return () => { isSubscribed = false; unsubAuth(); if (unsubscribeRole) unsubscribeRole(); };
  }, [setupNotifications]);

  // ── Redirection racine simplifiée ───────────────────────────────────────
  const rootRedirect = () => {
    if (role === "loading") return <div className="min-h-screen bg-slate-900" />;
    if (!user)                          return <Navigate to="/acces" replace />;
    if (role === "admin")               return <Navigate to="/admin-home" replace />;
    if (role === "livreur")             return <Navigate to="/livreur-home" replace />;
    if (role === "vendeur")             return <Navigate to="/vendeur-dashboard" replace />;
    if (role === "coursier")            return <Navigate to="/espace-coursier" replace />;
    
    if (EXTERNAL_ROLES.includes(role)) {
      const zone = user?.sectorZone || "default";
      return <Navigate to={`/livreur-secteur/${zone}`} replace />;
    }

    return <Navigate to="/client-home" replace />;
  };

  return (
    <CartProvider>
      <div className="min-h-screen antialiased bg-slate-50 text-slate-800">
        <ToastContainer 
          position="top-center" 
          autoClose={3500} 
          limit={1} 
          closeButton={false}
        />

        {/* Bouton d'assistance fixe */}
        {(isAssignPage || isUploadPage || isCoursierPage || isTrackingPage) && role !== "admin" && (
          <button 
            onClick={() => contactAssistance()} 
            className="fixed bottom-32 right-6 z-[2000] bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-full shadow-xl shadow-emerald-900/10 transform hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center group"
            aria-label="Contacter l'assistance"
          >
            <MessageCircle size={22} className="group-hover:animate-pulse" />
          </button>
        )}

        {loading ? (
          <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm transition-all duration-300">
            <div className="relative flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
              <div className="absolute w-12 h-12 border rounded-full border-emerald-600/20 animate-ping" />
            </div>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={rootRedirect()} />

            {/* Auth */}
            <Route path="/acces"                   element={<PageAcces />} />
            <Route path="/login-client"           element={<LoginClient />} />
            <Route path="/login-marketplace"      element={<LoginMarketplace />} />
            <Route path="/login-livreur/:zone"    element={<LoginLivreur />} />
            <Route path="/login-livreur"          element={<LoginLivreur />} />
            <Route path="/login-coursier"         element={<LoginCoursier />} />
            <Route path="/admin-login"            element={<AdminLogin />} />
            <Route path="/vendeur-login"          element={<VendeurLogin />} />
            <Route path="/vendeur-signup"         element={<VendeurSignup />} />
            <Route path="/inscription-client"     element={<PageInscriptionClient />} />
            <Route path="/inscription-coursier"   element={<PageInscriptionCoursier />} />
            <Route path="/register-livreur/:zone" element={<InscriptionLivreurSecteurs />} />
            <Route path="/register-livreur"       element={<InscriptionLivreurSecteurs />} />

            {/* Client & Services */}
            <Route path="/client-home" element={
              <ProtectedRoute allow={["client","admin","vendeur","guest"]} userRole={role}>
                <ClientHome />
              </ProtectedRoute>
            }/>

            <Route path="/marketplace"      element={<MarketplaceFull />} />
            <Route path="/marketplace-full" element={<MarketplaceFull />} />
            <Route path="/product/:id" element={<ProductDetails />} />
            <Route path="/cart"        element={<CartPage />} />

            <Route path="/store"                     element={<StorePage />} />
            <Route path="/store/:vendorId"           element={<StorePage />} />
            <Route path="/store/:vendorId/:productId" element={<StorePage />} />

            <Route path="/supermarket" element={<ProtectedRoute allow={["client","admin"]} userRole={role}><SupermarketPage /></ProtectedRoute>} />
            <Route path="/resto"       element={<ProtectedRoute allow={["client","admin"]} userRole={role}><RestoPage /></ProtectedRoute>} />
            <Route path="/vtc"         element={<ProtectedRoute allow={["client","admin"]} userRole={role}><VehiculePage /></ProtectedRoute>} />
            <Route path="/immobilier"  element={<ProtectedRoute allow={["client","admin"]} userRole={role}><ImmobilierPage /></ProtectedRoute>} />
            <Route path="/vehicule"  element={<ProtectedRoute allow={["client","admin"]} userRole={role}><VehiculePage /></ProtectedRoute>} />
            <Route path="/mes-courses" element={<ProtectedRoute allow={["client","admin"]} userRole={role}><MesCourses /></ProtectedRoute>} />
            <Route path="/profil-client" element={<ProtectedRoute allow={["client","admin"]} userRole={role}><ProfilClient /></ProtectedRoute>} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />

            {/* Confirmations & Suivi */} 
            <Route path="/confirmation"        element={<PageConfirmation />} />
            <Route path="/page-confirmation"   element={<PageConfirmation />} />
            <Route path="/tracking/:id"        element={<Tracking />} />
            <Route path="/success"             element={<SuccessPage />} />
            <Route path="/confirmation-market" element={<ConfirmationMarket />} />
            <Route path="/cart-course/:orderId" element={<CartCourseWeb />} />

            {/* Livreurs / Coursiers */}
            <Route path="/espace-coursier"       element={<ProtectedRoute allow={["coursier","admin"]} userRole={role}><EspaceCoursier /></ProtectedRoute>} />
            <Route path="/profil-livreur"        element={<ProtectedRoute allow={["livreur", "livreur-externe", "coursier","admin"]} userRole={role}><ProfilLivreur /></ProtectedRoute>} />
            <Route path="/upload-recu"           element={<ProtectedRoute allow={["livreur", "livreur-externe", "coursier", "vendeur","admin"]} userRole={role}><UploadRecu /></ProtectedRoute>} />
            <Route path="/livreur-home"          element={<ProtectedRoute allow={["livreur","admin"]} userRole={role}><LivreurExterne /></ProtectedRoute>} />
            <Route path="/livreur-secteur/:zone" element={<ProtectedRoute allow={["livreur-externe","admin"]} userRole={role}><LivreurExterne /></ProtectedRoute>} />
            {/* Vendeur */}
            <Route path="/vendeur-dashboard" element={<ProtectedRoute allow={["vendeur","admin"]} userRole={role}><VendeurDashboard /></ProtectedRoute>} />
            <Route path="/historique-gains"      element={<ProtectedRoute allow={["livreur","livreur-externe","coursier","admin"]} userRole={role}><HistoriqueGains /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/assignation-automatique/:orderId" element={<ProtectedRoute allow={["admin"]} userRole={role}><AssignationAutomatique /></ProtectedRoute>} />
            <Route path="/assignation-coursier/:orderId"    element={<ProtectedRoute allow={["admin"]} userRole={role}><AssignationCoursier /></ProtectedRoute>} />
            <Route path="/admin-home"          element={<ProtectedRoute allow={["admin"]} userRole={role}><AdminHome /></ProtectedRoute>} />
            <Route path="/admin/print-qr"      element={<ProtectedRoute allow={["admin"]} userRole={role}><PrintableQrPage /></ProtectedRoute>} />
            <Route path="/gestion-livreurs"    element={<ProtectedRoute allow={["admin"]} userRole={role}><GestionLivreurs /></ProtectedRoute>} />
            <Route path="/gestion-clients"     element={<ProtectedRoute allow={["admin"]} userRole={role}><GestionClients /></ProtectedRoute>} />
            <Route path="/gestion-jetons"      element={<ProtectedRoute allow={["admin"]} userRole={role}><GestionJetons /></ProtectedRoute>} />
            <Route path="/gestion-connexions"  element={<ProtectedRoute allow={["admin"]} userRole={role}><GestionConnexions /></ProtectedRoute>} />
            <Route path="/admin-frauds"        element={<ProtectedRoute allow={["admin"]} userRole={role}><AdminFraudDashboard /></ProtectedRoute>} />
            <Route path="/admin-proofs"        element={<ProtectedRoute allow={["admin"]} userRole={role}><AdminProofs /></ProtectedRoute>} />

            {/* Outils */}
            <Route path="/gps-diagnostic"    element={<GpsDiagnostic />} />
            <Route path="/migration-gps"     element={<MigrationGPS />} />
            <Route path="/emergency-offline" element={<ForceOfflineEmergency />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </div>
    </CartProvider>
  );
}