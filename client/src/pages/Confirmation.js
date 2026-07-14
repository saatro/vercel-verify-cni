import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { CheckCircle, Loader2, Home, AlertTriangle } from 'lucide-react';

export default function Confirmation() {
  const location = useLocation();
  const navigate = useNavigate();

  const state = useMemo(() => location.state || {}, [location.state]);
  const { orderId } = state;

  const [statusText, setStatusText] = useState("Vérification...");
  const [createdCourseId, setCreatedCourseId] = useState(null);
  const [creationError, setCreationError] = useState(null);

  // Empêche une double écriture si l'effet se redéclenche (StrictMode,
  // changement d'état d'auth, etc.)
  const hasCreatedRef = useRef(false);

  useEffect(() => {
    console.log("=== DONNÉES REÇUES À CONFIRMATION ===", state);
  }, [state]);

  // Est-ce que cette visite correspond à une VRAIE réservation (VTC/moto/taxi)
  // envoyée par ClientHome, ou juste une redirection sans contexte de commande ?
  const isBookingPayload = state.pickupLocation && state.dropoffLocation && (state.price != null);

  const createCourseDocument = useCallback(async (uid) => {
    if (hasCreatedRef.current || !isBookingPayload) return;
    hasCreatedRef.current = true;

    setStatusText("Création de votre course...");

    try {
      // Nom / téléphone du destinataire réel de la course.
      let clientName = state.isForThirdParty ? state.thirdPartyName : "";
      let clientPhone = state.isForThirdParty ? state.thirdPartyPhone : "";

      if (!clientName || !clientPhone) {
        try {
          const profSnap = await getDoc(doc(db, "users", uid));
          if (profSnap.exists()) {
            const p = profSnap.data();
            clientName = clientName || p.nom || p.nomComplet || "Client Mambo";
            clientPhone = clientPhone || p.telephone || "";
          }
        } catch (e) {
          console.warn("Impossible de charger le profil client :", e);
        }
      }

      const zoneKey = state.zoneId || state.assignedCitySector || "abidjan";
      const isExterneZone = state.isRuralZone === true || state.currentZoneType === "rural";

      const courseData = {
        status: "pending",
        zone: zoneKey,
        isExterneZone,

        vehicleType: state.vehicleType || "vtc",     // catégorie large : moto / vtc / taxi
        vehicleId: state.vehicle || null,             // id précis : VtcEco, Moto, saloni...
        courseMode: state.mode || state.vehicle || "Standard",
        isCompteur: state.vehicle === "TaxiEco",

        price: Number(state.proposedPrice ?? state.price ?? 0),
        basePrice: Number(state.basePrice ?? state.price ?? 0),
        distance: Number(state.distance ?? 0),

        pickupAddress: state.pickup || "",
        destination: state.dest || "",
        pickupLocation: state.pickupLocation || null,
        dropoffLocation: state.dropoffLocation || null,

        clientId: uid,
        clientUserId: uid,
        clientName,
        clientPhone,

        wantClim: !!state.wantClim,
        wantArret: !!state.wantArret,

        rejectedBy: [],
        createdAt: serverTimestamp(),

        // Lien vers la commande boutique d'origine, si la course a été
        // lancée depuis le dashboard vendeur pour un tiers.
        isTiersOrder: !!state.orderId || !!state.vendeurId,
        linkedOrderId: state.orderId || null,
        vendeurId: state.vendeurId || null,
        vendeurNom: state.vendeurNom || null,
        montantArticles: Number(state.montantArticles || 0),
        montantLivraison: Number(state.montantLivraison || 0),
      };

      const courseRef = await addDoc(collection(db, "courses"), courseData);
      setCreatedCourseId(courseRef.id);

      // Si cette course provient d'une commande boutique existante, on la
      // relie et on met à jour son statut pour que le vendeur voie l'avancement.
      if (state.orderId) {
        try {
          await updateDoc(doc(db, "orders", state.orderId), {
            status: "attente_livreur",
            linkedCourseId: courseRef.id,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn("Impossible de mettre à jour la commande liée :", e);
        }
      }

      setStatusText("Course créée, recherche d'un livreur...");
    } catch (error) {
      console.error("Erreur création course:", error);
      setCreationError(error.message || "Erreur lors de la création de la course.");
      setStatusText("Erreur — merci de réessayer.");
    }
  }, [state, isBookingPayload]);

  const forceSmartRedirect = useCallback(async (uid) => {
    try {
      await createCourseDocument(uid);

      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const role = userSnap.data().role?.toLowerCase().trim();

        setTimeout(() => {
          if (role === 'admin') navigate('/admin-home', { replace: true });
          else if (role === 'vendeur') navigate('/vendeur-dashboard', { replace: true });
          else if (role === 'livreur') navigate('/livreur-home', { replace: true });
          else navigate('/client-home', { replace: true });
        }, 1800);
      } else {
        navigate('/client-home', { replace: true });
      }
    } catch (error) {
      console.error("Redirection error:", error);
      navigate('/');
    }
  }, [navigate, createCourseDocument]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setStatusText("Analyse de votre profil...");
        await forceSmartRedirect(user.uid);
      } else {
        const timeout = setTimeout(() => navigate('/acces'), 2500);
        return () => clearTimeout(timeout);
      }
    });

    return () => unsubscribe();
  }, [forceSmartRedirect, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-white">
      <div className="flex flex-col items-center duration-500 animate-in zoom-in">
        <div className="flex items-center justify-center w-24 h-24 mb-6 rounded-full bg-emerald-50">
          <CheckCircle className="text-emerald-500" size={48} />
        </div>
        
        <h1 className="mb-2 text-2xl font-black uppercase text-slate-900">COMMANDE VALIDÉE</h1>
        
        <p className="mb-8 text-center text-slate-500">
          ID: <span className="font-mono font-bold text-emerald-600">
            {(createdCourseId || orderId)?.slice(-8).toUpperCase() || "SUCCÈS"}
          </span>
        </p>

        {/* DEBUG */}
        <div style={{ margin: '20px 0', padding: '15px', background: '#f8fafc', borderRadius: '12px', fontSize: '12px', maxWidth: '90%' }}>
          <strong>Debug - Champs reçus :</strong><br/>
          Nom : {state.thirdPartyName || "—"}<br/>
          Téléphone : {state.thirdPartyPhone || "—"}<br/>
          Destination : {state.dest || state.targetDestination || "—"}<br/>
          Course Firestore : {createdCourseId ? `créée (${createdCourseId})` : (isBookingPayload ? "en cours..." : "aucune donnée de réservation reçue")}
        </div>

        {creationError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 20px', padding: '12px 16px', background: '#fef2f2', color: '#ef4444', borderRadius: '12px', fontSize: '12px', fontWeight: 700, maxWidth: '90%' }}>
            <AlertTriangle size={16} /> {creationError}
          </div>
        )}

        <div className="flex items-center gap-3 px-6 py-3 border bg-slate-50 rounded-2xl border-slate-100">
          <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
          <span className="text-sm font-bold tracking-tighter uppercase text-slate-600">
            {statusText}
          </span>
        </div>

        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 mt-12 text-sm font-medium transition-colors text-slate-400 hover:text-slate-900"
        >
          <Home size={16} /> Retour manuel
        </button>
      </div>
    </div>
  );
}