import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { AlertTriangle, PowerOff } from "lucide-react";
import { useState } from "react";
import { db } from "../firebase";

export default function ForceOfflineEmergency() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const forceAllOffline = async () => {
    setLoading(true);
    setResult(null);

    try {
      console.log("🚨 DÉBUT DÉCONNEXION FORCÉE");

      // Récupérer TOUS les livreurs
      const livreursSnap = await getDocs(
        query(collection(db, "users"), where("role", "==", "livreur"))
      );

      console.log(`📋 Livreurs trouvés: ${livreursSnap.docs.length}`);

      // Créer un batch pour mise à jour atomique
      const batch = writeBatch(db);

      livreursSnap.docs.forEach(docSnap => {
        const livreur = docSnap.data();
        console.log(`👤 ${livreur.nom}: isOnline=${livreur.isOnline} (type: ${typeof livreur.isOnline})`);

        // ✅ FORCER isOnline à false (boolean)
        batch.update(doc(db, "users", docSnap.id), {
          isOnline: false  // Boolean, pas string
        });
      });

      // Exécuter le batch
      await batch.commit();

      console.log("✅ BATCH COMMIT RÉUSSI");

      // Vérification : relire les données
      const verificationSnap = await getDocs(
        query(collection(db, "users"), where("role", "==", "livreur"))
      );

      const verification = verificationSnap.docs.map(d => ({
        nom: d.data().nom,
        isOnline: d.data().isOnline,
        type: typeof d.data().isOnline
      }));

      console.log("🔍 VÉRIFICATION:", verification);

      setResult({
        success: true,
        total: livreursSnap.docs.length,
        verification: verification
      });

    } catch (error) {
      console.error("❌ ERREUR:", error);
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-gradient-to-br from-red-50 to-orange-50">
      <div className="w-full max-w-2xl p-12 bg-white shadow-2xl rounded-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-red-500 to-orange-500">
            <PowerOff size={48} className="text-white" />
          </div>
          <h1 className="mb-3 text-4xl italic font-black uppercase text-slate-900">
            Déconnexion Forcée
          </h1>
          <p className="text-lg font-semibold text-slate-600">
            Script d'urgence - Force TOUS les livreurs hors ligne
          </p>
        </div>

        {/* Warning */}
        <div className="p-6 mb-8 border-2 border-red-200 bg-red-50 rounded-2xl">
          <div className="flex items-start gap-4">
            <AlertTriangle size={24} className="flex-shrink-0 mt-1 text-red-600" />
            <div>
              <h3 className="mb-2 text-sm font-black text-red-900 uppercase">
                ⚠️ ACTION D'URGENCE
              </h3>
              <p className="text-sm font-semibold leading-relaxed text-red-800">
                Ce script va <strong>forcer isOnline = false</strong> pour TOUS les livreurs
                en utilisant un <strong>batch write</strong> atomique. Utilisez ce script
                uniquement si GestionConnexions ne fonctionne pas.
              </p>
            </div>
          </div>
        </div>

        {/* Bouton */}
        <button
          onClick={forceAllOffline}
          disabled={loading}
          className={`w-full py-6 rounded-2xl font-black text-white uppercase text-lg flex items-center justify-center gap-4 transition-all shadow-xl ${loading
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 active:scale-95'
            }`}
        >
          {loading ? (
            <>
              <div className="w-6 h-6 border-4 border-white rounded-full border-t-transparent animate-spin"></div>
              Déconnexion en cours...
            </>
          ) : (
            <>
              <PowerOff size={24} />
              FORCER TOUS HORS LIGNE
            </>
          )}
        </button>

        {/* Résultat */}
        {result && (
          <div className={`mt-8 p-6 rounded-2xl border-2 ${result.success
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
            }`}>
            {result.success ? (
              <>
                <h3 className="mb-4 text-lg font-black text-green-900 uppercase">
                  ✅ Succès !
                </h3>
                <p className="mb-4 text-sm font-bold text-green-800">
                  {result.total} livreur(s) forcé(s) hors ligne
                </p>

                <div className="p-4 bg-white border border-green-200 rounded-xl">
                  <h4 className="mb-3 text-xs font-black text-green-900 uppercase">
                    Vérification :
                  </h4>
                  <div className="space-y-2">
                    {result.verification.map((v, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">{v.nom}</span>
                        <span className={`px-3 py-1 rounded-lg font-black uppercase ${v.isOnline === false
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                          {v.isOnline === false ? '✅ false' : `❌ ${v.isOnline}`}
                          <span className="ml-2 opacity-60">({v.type})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 mt-4 border border-blue-200 bg-blue-50 rounded-xl">
                  <p className="text-xs font-bold text-blue-800">
                    💡 <strong>Prochaine étape :</strong> Ouvrez la console de AdminHome
                    et vérifiez les logs. Vous devriez voir "👥 Livreurs EN LIGNE: 0"
                  </p>
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-4 text-lg font-black text-red-900 uppercase">
                  ❌ Erreur
                </h3>
                <p className="text-sm font-bold text-red-800">
                  {result.error}
                </p>
              </>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="p-6 mt-8 border bg-slate-50 border-slate-200 rounded-2xl">
          <h4 className="mb-3 text-xs font-black uppercase text-slate-900">
            📋 Comment vérifier que ça marche
          </h4>
          <ol className="space-y-2 text-xs font-semibold text-slate-700">
            <li className="flex gap-2">
              <span className="font-black text-indigo-600">1.</span>
              <span>Cliquez sur le bouton ci-dessus</span>
            </li>
            <li className="flex gap-2">
              <span className="font-black text-indigo-600">2.</span>
              <span>Attendez le message de succès</span>
            </li>
            <li className="flex gap-2">
              <span className="font-black text-indigo-600">3.</span>
              <span>Vérifiez que tous les livreurs affichent "✅ false"</span>
            </li>
            <li className="flex gap-2">
              <span className="font-black text-indigo-600">4.</span>
              <span>Allez sur AdminHome et ouvrez la console (F12)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-black text-indigo-600">5.</span>
              <span>Créez une nouvelle course et regardez les logs</span>
            </li>
            <li className="flex gap-2">
              <span className="font-black text-indigo-600">6.</span>
              <span>Vous devriez voir "⛔ [Nom] IGNORÉ car isOnline=false"</span>
            </li>
          </ol>
        </div>

        {/* Vérification Firebase */}
        <div className="p-6 mt-6 border bg-amber-50 border-amber-200 rounded-2xl">
          <h4 className="mb-3 text-xs font-black uppercase text-amber-900">
            🔍 Vérification manuelle dans Firebase
          </h4>
          <ol className="space-y-2 text-xs font-semibold text-amber-800">
            <li>1. Allez dans Firebase Console</li>
            <li>2. Firestore Database → Collection "users"</li>
            <li>3. Ouvrez un document de livreur</li>
            <li>4. Vérifiez le champ "isOnline"</li>
            <li>5. Doit être : <code className="px-2 py-1 rounded bg-amber-100">false</code> (type: boolean)</li>
            <li>6. PAS : <code className="px-2 py-1 bg-red-100 rounded">"false"</code> (type: string)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}