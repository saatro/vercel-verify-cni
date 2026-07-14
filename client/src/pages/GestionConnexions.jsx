import { collection, doc, getDocs, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { Power, PowerOff, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "../firebase";

export default function GestionConnexions() {
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Écouter les livreurs en temps réel
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), where("role", "==", "livreur")),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setLivreurs(data);
      }
    );
    return unsubscribe;
  }, []);

  // Déconnecter tous les livreurs
  const disconnectAll = async () => {
    if (!window.confirm("⚠️ Déconnecter TOUS les livreurs ?")) return;

    setLoading(true);
    try {
      const livreursSnap = await getDocs(
        query(collection(db, "users"), where("role", "==", "livreur"))
      );

      const updates = livreursSnap.docs.map(docSnap =>
        updateDoc(doc(db, "users", docSnap.id), { isOnline: false })
      );

      await Promise.all(updates);
      alert(`✅ ${updates.length} livreur(s) déconnecté(s)`);
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Connecter tous les livreurs
  const connectAll = async () => {
    if (!window.confirm("✅ Connecter TOUS les livreurs ?")) return;

    setLoading(true);
    try {
      const livreursSnap = await getDocs(
        query(collection(db, "users"), where("role", "==", "livreur"))
      );

      const updates = livreursSnap.docs.map(docSnap =>
        updateDoc(doc(db, "users", docSnap.id), { isOnline: true })
      );

      await Promise.all(updates);
      alert(`✅ ${updates.length} livreur(s) connecté(s)`);
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle un seul livreur
  const toggleLivreur = async (livreur) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, "users", livreur.id), {
        isOnline: !livreur.isOnline
      });
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const livreursOnline = livreurs.filter(l => l.isOnline).length;
  const livreursOffline = livreurs.filter(l => !l.isOnline).length;

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="p-8 mb-6 bg-white shadow-xl rounded-3xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl">
              <Users size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl italic font-black uppercase text-slate-900">
                Gestion Connexions
              </h1>
              <p className="font-semibold text-slate-600">
                Contrôler l'état de connexion des livreurs
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 border-2 bg-slate-50 rounded-2xl border-slate-200">
              <div className="mb-1 text-3xl font-black text-slate-900">{livreurs.length}</div>
              <div className="text-xs font-bold uppercase text-slate-600">Total</div>
            </div>
            <div className="p-4 border-2 border-green-200 bg-green-50 rounded-2xl">
              <div className="mb-1 text-3xl font-black text-green-600">{livreursOnline}</div>
              <div className="text-xs font-bold text-green-700 uppercase">En ligne</div>
            </div>
            <div className="p-4 border-2 border-red-200 bg-red-50 rounded-2xl">
              <div className="mb-1 text-3xl font-black text-red-600">{livreursOffline}</div>
              <div className="text-xs font-bold text-red-700 uppercase">Hors ligne</div>
            </div>
          </div>

          {/* Actions globales */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={connectAll}
              disabled={loading}
              className="flex items-center justify-center gap-3 py-4 text-sm font-black text-white uppercase transition-all shadow-lg bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Power size={20} />
              Connecter tous
            </button>
            <button
              onClick={disconnectAll}
              disabled={loading}
              className="flex items-center justify-center gap-3 py-4 text-sm font-black text-white uppercase transition-all shadow-lg bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl hover:from-red-700 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <PowerOff size={20} />
              Déconnecter tous
            </button>
          </div>
        </div>

        {/* Liste des livreurs */}
        <div className="space-y-4">
          {livreurs.map(livreur => (
            <div
              key={livreur.id}
              className={`bg-white rounded-2xl shadow-lg p-6 border-2 transition-all ${livreur.isOnline
                  ? 'border-green-200 bg-green-50/30'
                  : 'border-slate-200'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white ${livreur.typeVehicule === 'vtc'
                      ? 'bg-gradient-to-br from-indigo-500 to-blue-500'
                      : 'bg-gradient-to-br from-orange-500 to-red-500'
                    }`}>
                    {livreur.nom?.charAt(0).toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl italic font-black uppercase text-slate-900">
                        {livreur.nom || "Sans nom"}
                      </h3>
                      <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${livreur.typeVehicule === 'vtc'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-orange-100 text-orange-700'
                        }`}>
                        {livreur.typeVehicule || "moto"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-bold text-slate-600">{livreur.telephone}</span>
                      <span className={`flex items-center gap-2 px-3 py-1 rounded-lg font-black text-xs uppercase ${livreur.isOnline
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${livreur.isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                          }`}></span>
                        {livreur.isOnline ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Toggle button */}
                <button
                  onClick={() => toggleLivreur(livreur)}
                  disabled={loading}
                  className={`px-6 py-3 rounded-xl font-black text-sm uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${livreur.isOnline
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                >
                  {livreur.isOnline ? (
                    <>
                      <PowerOff size={16} className="inline mr-2" />
                      Déconnecter
                    </>
                  ) : (
                    <>
                      <Power size={16} className="inline mr-2" />
                      Connecter
                    </>
                  )}
                </button>
              </div>

              {/* GPS Info */}
              {livreur.lat && livreur.lng && (
                <div className="pt-4 mt-4 border-t border-slate-200">
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="block mb-1 font-bold text-slate-500">Latitude</span>
                      <span className="font-mono font-black text-slate-900">{livreur.lat.toFixed(6)}</span>
                    </div>
                    <div>
                      <span className="block mb-1 font-bold text-slate-500">Longitude</span>
                      <span className="font-mono font-black text-slate-900">{livreur.lng.toFixed(6)}</span>
                    </div>
                    <div>
                      <span className="block mb-1 font-bold text-slate-500">Précision</span>
                      <span className="font-black text-slate-900">
                        {livreur.gpsAccuracy ? `±${Math.round(livreur.gpsAccuracy)}m` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {livreurs.length === 0 && (
          <div className="p-12 text-center bg-white shadow-lg rounded-2xl">
            <RefreshCw size={48} className="mx-auto mb-4 text-slate-300 animate-spin" />
            <h3 className="mb-2 text-xl font-black uppercase text-slate-900">
              Chargement...
            </h3>
            <p className="font-semibold text-slate-600">
              Récupération des livreurs en cours.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}