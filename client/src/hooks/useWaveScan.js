// hooks/useWaveScan.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook réutilisable : scan reçu Wave OU activation Pass Free → vérification
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ── Compression et encodage de l'image ──────────────────────────────────────
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

// ── Archivage Cloudinary ───────────────────────────────────────────────────
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
 * Redirige l'utilisateur vers la numérotation pour enregistrer le contact assistance
 */
export function saveAssistanceContact(phone = "+2250000000000") {
  window.location.href = `tel:${phone}`;
}

/**
 * @param {object} options
 * @param {object} options.userData         - User Firestore Doc
 * @param {string} options.mode             - "solde" | "jetons" | "pass" | "auto"
 * @param {number[]} [options.allowedAmounts] - Montants fixes
 * @param {boolean} [options.isContactSaved] - Indique si le contact assistance est enregistré
 * @param {function} [options.onSuccess]    - Callback après validation
 */
export function useWaveScan({
  mode = 'auto',
  cloudinaryUrl = null,
  cloudinaryPreset = null,
  allowedAmounts = null,
  isContactSaved = false,
  onSuccess = null,
} = {}) {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [errorMsg, setError] = useState('');

  const scan = useCallback(async (file = null, passOptions = {}) => {
    // 1. Contrôle obligatoire de l'enregistrement du contact assistance
    if (!isContactSaved) {
      const msg = "Veuillez d'abord enregistrer le contact assistance dans votre répertoire pour confirmer votre paiement depuis l'interface Wave.";
      setError(msg);
      setStatus('error');
      saveAssistanceContact(); // Redirection automatique
      return;
    }

    // 2. Si on n'est pas en mode "pass", un fichier image est obligatoire pour le scan
    if (mode !== 'pass' && !file) {
      setError("Veuillez sélectionner une image du reçu Wave.");
      setStatus('error');
      return;
    }

    setStatus('scanning');
    setError('');
    setResult(null);

    try {
      const functions = getFunctions();
      const verifyWaveTopUp = httpsCallable(functions, 'verifyWaveTopUp');
      let response;

      // 3. LOGIQUE PASS FREE (Sans aucun scan d'image)
      if (mode === 'pass') {
        response = await verifyWaveTopUp({
          mode: 'pass',
          hours: passOptions.hours || 12,
          amount: passOptions.amount || 1000,
          allowedAmounts,
        });
      } 
      // 4. LOGIQUE DE SCAN CLASSIQUE (Reçu / Image)
      else {
        const base64 = await encodeImage(file);
        let imageUrl = null;
        if (cloudinaryUrl && cloudinaryPreset) {
          imageUrl = await uploadToCloudinary(file, cloudinaryUrl, cloudinaryPreset);
        }

        response = await verifyWaveTopUp({
          base64Image: base64,
          mode,
          allowedAmounts,
          imageUrl,
        });
      }

      const data = response.data;
      setResult(data);
      setStatus('success');
      onSuccess?.(data);
    } catch (err) {
      console.error('[useWaveScan]', err);
      setError(err.message || 'Erreur lors du traitement de l\'opération.');
      setStatus('error');
    }
  }, [mode, cloudinaryUrl, cloudinaryPreset, allowedAmounts, isContactSaved, onSuccess]);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError('');
  }, []);

  return { scan, status, result, errorMsg, reset, isScanning: status === 'scanning', saveAssistanceContact };
}