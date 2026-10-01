import React, { useState } from "react";

export default function CniVerificationModal({ user, onVerificationSuccess, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const expectedName = `${user?.prenom || ""} ${user?.nom || user?.nomComplet || ""}`.trim();

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Veuillez sélectionner une photo claire de votre pièce d'identité.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const imageBase64 = await convertToBase64(file);

      const response = await fetch("/api/verify-cni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          expectedName,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        const message = data.reasons && data.reasons.length > 0 
          ? data.reasons.join(" ") 
          : (data.error || "Échec de la vérification.");
        setError(message);
      } else {
        // Succès : transmission des données à l'application
        if (onVerificationSuccess) {
          onVerificationSuccess(data);
        }
      }
    } catch (err) {
      setError("Erreur de connexion avec le serveur. Vérifiez votre réseau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md p-6 bg-white shadow-xl rounded-xl">
        <h2 className="mb-2 text-xl font-bold text-gray-800">Verification CNI / Pièce d'identité</h2>
        <p className="mb-4 text-sm text-gray-600">
          Nom attendu : <span className="font-semibold text-gray-900">{expectedName || "Non spécifié"}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Photo de la CNI / Attestation
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-500 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-red-700 border border-red-200 rounded-lg bg-red-50">
              ⚠️ {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {loading ? "Vérification IA..." : "Soumettre la pièce"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}