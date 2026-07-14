// hooks/useWaveScan.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook réutilisable : scan reçu Wave → vérification serveur → crédit compte
//
// CORRECTIONS APPORTÉES :
// - Plus aucun appel direct à Gemini depuis le navigateur (la clé API n'est
//   plus jamais récupérée ni exposée côté client).
// - Plus aucune écriture directe (crédit de solde, paiements_verifies) depuis
//   le client : tout passe par la Cloud Function callable `verifyWaveTopUp`,
//   qui vérifie ET crédite de façon atomique côté serveur.
// - La déduplication anti-doublon est gérée côté serveur (transactionId comme
//   ID de document), donc plus de race condition possible.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ── Compression et encodage de l'image (reste côté client, pas sensible) ────
async function encodeImage(file, maxWidth = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Archivage Cloudinary (optionnel, non sensible : juste une image) ───────
async function uploadToCloudinary(file, cloudUrl, preset) {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', preset);
  const res = await fetch(cloudUrl, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.secure_url) throw new Error("Échec de l'archivage image.");
  return data.secure_url;
}

/**
 * @param {object} options
 * @param {object} options.userData         - User Firestore Doc (juste pour l'affichage local)
 * @param {string} options.mode             - "solde" | "jetons" | "pass" | "auto"
 * @param {number[]} [options.allowedAmounts] - Montants fixes (ex: [5000, 10000])
 */
export function useWaveScan({
  mode = 'auto',
  cloudinaryUrl = null,
  cloudinaryPreset = null,
  allowedAmounts = null,
  onSuccess = null,
} = {}) {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [errorMsg, setError] = useState('');

  const scan = useCallback(async (file) => {
    if (!file) return;

    setStatus('scanning');
    setError('');
    setResult(null);

    try {
      // 1. Encodage image
      const base64 = await encodeImage(file);

      // 2. Archivage Cloudinary (optionnel, avant l'appel serveur)
      let imageUrl = null;
      if (cloudinaryUrl && cloudinaryPreset) {
        imageUrl = await uploadToCloudinary(file, cloudinaryUrl, cloudinaryPreset);
      }

      // 3. Vérification + crédit — entièrement côté serveur.
      // La clé Gemini reste dans les secrets de la Cloud Function, jamais
      // exposée au client. Le serveur fait aussi la déduplication et le
      // crédit dans une même transaction Firestore atomique.
      const functions = getFunctions();
      const verifyWaveTopUp = httpsCallable(functions, 'verifyWaveTopUp');
      const response = await verifyWaveTopUp({
        base64Image: base64,
        mode,
        allowedAmounts,
        imageUrl,
      });

      const data = response.data;
      setResult(data);
      setStatus('success');
      onSuccess?.(data);
    } catch (err) {
      // Les erreurs HttpsError du callable arrivent avec un message lisible
      // (ex: "Ce reçu Wave a déjà été utilisé.")
      console.error('[useWaveScan]', err);
      setError(err.message || 'Erreur lors de la vérification du reçu.');
      setStatus('error');
    }
  }, [mode, cloudinaryUrl, cloudinaryPreset, allowedAmounts, onSuccess]);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError('');
  }, []);

  return { scan, status, result, errorMsg, reset, isScanning: status === 'scanning' };
}