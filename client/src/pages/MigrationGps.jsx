import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { AlertTriangle, CheckCircle, Loader, Play } from "lucide-react";
import { useState } from "react";
import { db } from "../firebase";

export default function MigrationGps() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);

  const migrateDrivers = async () => {
    setLoading(true);
    setResults([]);
    setSummary(null);

    try {
      // Récupérer tous les livreurs
      const livreursSnap = await getDocs(
        query(collection(db, "users"), where("role", "==", "livreur"))
      );

      const migrations = [];
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const docSnap of livreursSnap.docs) {
        const livreur = docSnap.data();
        const uid = docSnap.id;
        const updates = {};
        const issues = [];

        // ✅ Vérifier et corriger chaque champ

        // 1. nomComplet (manquant chez Douagoury et Baudoin)
        if (!livreur.nomComplet && livreur.nom) {
          updates.nomComplet = livreur.nom;
          issues.push("nomComplet ajouté");
        }

        // 2. gpsAccuracy (manquant chez Douagoury et Baudoin)
        if (livreur.lat && livreur.lng && livreur.gpsAccuracy === undefined) {
          updates.gpsAccuracy = 50; // Valeur par défaut raisonnable
          issues.push("gpsAccuracy ajouté (50m)");
        }

        // 3. lastGpsUpdate (manquant chez Douagoury et Baudoin)
        if (livreur.lat && livreur.lng && !livreur.lastGpsUpdate) {
          updates.lastGpsUpdate = new Date().toISOString();
          issues.push("lastGpsUpdate ajouté");
        }

        // 4. Vérifier que lat/lng sont des numbers (pas des strings)
        if (livreur.lat && typeof livreur.lat === 'string') {
          updates.lat = parseFloat(livreur.lat);
          issues.push("lat converti en number");
        }
        if (livreur.lng && typeof livreur.lng === 'string') {
          updates.lng = parseFloat(livreur.lng);
          issues.push("lng converti en number");
        }

        // 5. Normaliser typeVehicule (lowercase + trim)
        if (livreur.typeVehicule) {
          const normalized = livreur.typeVehicule.toLowerCase().trim();
          if (normalized !== livreur.typeVehicule) {
            updates.typeVehicule = normalized;
            issues.push(`typeVehicule normalisé: "${livreur.typeVehicule}" → "${normalized}"`);
          }
        }

        // 6. Vérifier isOnline existe
        if (livreur.isOnline === undefined) {
          updates.isOnline = true;
          issues.push("isOnline initialisé à true");
        }

        // 7. Vérifier isVerified existe
        if (livreur.isVerified === undefined) {
          updates.isVerified = true; // Par défaut vérifiés
          issues.push("isVerified initialisé à true");
        }

        // Appliquer les mises à jour si nécessaire
        if (Object.keys(updates).length > 0) {
          try {
            await updateDoc(doc(db, "users", uid), updates);
            migrations.push({
              success: true,
              nom: livreur.nom,
              type: livreur.typeVehicule,
              issues: issues,
              updates: updates
            });
            updated++;
          } catch (error) {
            migrations.push({
              success: false,
              nom: livreur.nom,
              type: livreur.typeVehicule,
              issues: ["Erreur: " + error.message],
              updates: {}
            });
            errors++;
          }
        } else {
          migrations.push({
            success: true,
            nom: livreur.nom,
            type: livreur.typeVehicule,
            issues: ["✅ Déjà à jour"],
            updates: {}
          });
          skipped++;
        }
      }

      setResults(migrations);
      setSummary({
        total: livreursSnap.docs.length,
        updated,
        skipped,
        errors
      });

    } catch (error) {
      console.error("Erreur migration:", error);
      alert("Erreur lors de la migration: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="p-8 mb-6 bg-white shadow-xl rounded-3xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl">
              <AlertTriangle size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl italic font-black uppercase text-slate-900">
                Migration GPS
              </h1>
              <p className="font-semibold text-slate-600">
                Normaliser les données de tous les livreurs
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="p-6 mb-6 border-2 bg-amber-50 border-amber-200 rounded-2xl">
            <h3 className="mb-3 text-sm font-black uppercase text-amber-900">
              ⚠️ Corrections appliquées
            </h3>
            <ul className="space-y-2 text-sm font-semibold text-amber-800">
              <li>• Ajout du champ <code className="px-2 py-1 rounded bg-amber-100">nomComplet</code> si manquant</li>
              <li>• Ajout du champ <code className="px-2 py-1 rounded bg-amber-100">gpsAccuracy</code> si manquant (50m par défaut)</li>
              <li>• Ajout du champ <code className="px-2 py-1 rounded bg-amber-100">lastGpsUpdate</code> si manquant</li>
              <li>• Conversion lat/lng en <code className="px-2 py-1 rounded bg-amber-100">number</code> si strings</li>
              <li>• Normalisation <code className="px-2 py-1 rounded bg-amber-100">typeVehicule</code> (lowercase + trim)</li>
              <li>• Initialisation <code className="px-2 py-1 rounded bg-amber-100">isOnline</code> et <code className="px-2 py-1 rounded bg-amber-100">isVerified</code> si manquants</li>
            </ul>
          </div>

          {/* Bouton de migration */}
          <button
            onClick={migrateDrivers}
            disabled={loading}
            className={`w-full py-4 rounded-2xl font-black text-white uppercase text-sm flex items-center justify-center gap-3 transition-all ${loading
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl active:scale-95'
              }`}
          >
            {loading ? (
              <>
                <Loader size={20} className="animate-spin" />
                Migration en cours...
              </>
            ) : (
              <>
                <Play size={20} />
                Lancer la migration
              </>
            )}
          </button>
        </div>

        {/* Résumé */}
        {summary && (
          <div className="p-6 mb-6 bg-white shadow-lg rounded-2xl">
            <h3 className="mb-4 text-lg font-black uppercase text-slate-900">
              📊 Résumé
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 border-2 bg-slate-50 rounded-xl border-slate-200">
                <div className="mb-1 text-2xl font-black text-slate-900">{summary.total}</div>
                <div className="text-xs font-bold uppercase text-slate-600">Total</div>
              </div>
              <div className="p-4 border-2 border-green-200 bg-green-50 rounded-xl">
                <div className="mb-1 text-2xl font-black text-green-600">{summary.updated}</div>
                <div className="text-xs font-bold text-green-700 uppercase">Mis à jour</div>
              </div>
              <div className="p-4 border-2 border-blue-200 bg-blue-50 rounded-xl">
                <div className="mb-1 text-2xl font-black text-blue-600">{summary.skipped}</div>
                <div className="text-xs font-bold text-blue-700 uppercase">Déjà OK</div>
              </div>
              <div className="p-4 border-2 border-red-200 bg-red-50 rounded-xl">
                <div className="mb-1 text-2xl font-black text-red-600">{summary.errors}</div>
                <div className="text-xs font-bold text-red-700 uppercase">Erreurs</div>
              </div>
            </div>
          </div>
        )}

        {/* Résultats détaillés */}
        {results.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-black uppercase text-slate-900">
              📋 Détails des modifications
            </h3>
            {results.map((result, index) => (
              <div
                key={index}
                className={`bg-white rounded-2xl shadow-lg p-6 border-2 ${result.success && Object.keys(result.updates).length > 0
                    ? 'border-green-200'
                    : result.success
                      ? 'border-blue-200'
                      : 'border-red-200'
                  }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${result.type === 'vtc'
                      ? 'bg-gradient-to-br from-indigo-500 to-blue-500'
                      : 'bg-gradient-to-br from-orange-500 to-red-500'
                    }`}>
                    <span className="text-2xl font-black text-white">
                      {result.nom?.charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-lg font-black uppercase text-slate-900">
                        {result.nom}
                      </h4>
                      <span className={`px-2 py-1 rounded-lg text-xs font-black uppercase ${result.type === 'vtc'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-orange-100 text-orange-700'
                        }`}>
                        {result.type}
                      </span>
                      {result.success ? (
                        <CheckCircle size={16} className="text-green-600" />
                      ) : (
                        <AlertTriangle size={16} className="text-red-600" />
                      )}
                    </div>

                    <div className="space-y-1">
                      {result.issues.map((issue, i) => (
                        <div
                          key={i}
                          className={`text-xs font-bold px-3 py-2 rounded-lg ${issue.startsWith('✅')
                              ? 'bg-blue-50 text-blue-700'
                              : issue.startsWith('Erreur')
                                ? 'bg-red-50 text-red-700'
                                : 'bg-green-50 text-green-700'
                            }`}
                        >
                          {issue}
                        </div>
                      ))}
                    </div>

                    {Object.keys(result.updates).length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs font-bold cursor-pointer text-slate-600 hover:text-slate-900">
                          Voir les modifications JSON
                        </summary>
                        <pre className="p-3 mt-2 overflow-x-auto text-xs rounded-lg bg-slate-100">
                          {JSON.stringify(result.updates, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !loading && (
          <div className="p-12 text-center bg-white shadow-lg rounded-2xl">
            <div className="mb-4 text-6xl">🚀</div>
            <h3 className="mb-2 text-xl font-black uppercase text-slate-900">
              Prêt à migrer
            </h3>
            <p className="font-semibold text-slate-600">
              Cliquez sur le bouton ci-dessus pour normaliser les données de tous les livreurs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}