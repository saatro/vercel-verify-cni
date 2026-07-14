import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Copy, ExternalLink, Camera,
  Loader2, CheckCircle2, AlertCircle,
  Sparkles, Zap, MessageCircle
} from 'lucide-react';
import { useWaveScan } from '../hooks/useWaveScan';
import { uploadToCloudinary } from '../utils/cloudinary'; // Importation correcte
import './UploadRecu.css';

const ADMIN_PHONE = '0778073456';
const WAVE_LINK = 'https://pay.wave.com/m/M_ci_fAQd8MgriWne/c/ci/';

export default function UploadRecu() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [step, setStep] = useState(1);
  const [userData, setUserData] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate('/acces');
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setUserData({ id: user.uid, ...snap.data() });
    });
    return unsub;
  }, [navigate]);

  const { scan, status, result, errorMsg, reset, isScanning } = useWaveScan({
    userData,
    merchantName: "Paiement LEGACY",
    mode: 'auto',
    uploadFunction: uploadToCloudinary, // Utilisation de votre utilitaire
    onSuccess: (res) => {
      console.info('[WaveScan] Crédité :', res.amount, 'F');
    },
  });

  const scanStateLabel = {
    idle: null,
    scanning: 'Analyse IA en cours — veuillez patienter…',
    success: `+${result?.amount?.toLocaleString() ?? '?'} F crédités avec succès !`,
    error: errorMsg || 'Reçu non conforme. Veuillez réessayer.',
  }[status];

  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    reset();
  }, [reset]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const copyPhone = () => {
    navigator.clipboard.writeText(ADMIN_PHONE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openWhatsApp = () => {
    const text = `Bonjour Assistance LEGACY,\nJe viens de valider mon paiement.\n\n*ID Transaction :* ${result?.transactionId}\n*Montant :* ${result?.amount} F CFA`;
    window.open(`https://wa.me/225${ADMIN_PHONE}?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (step === 1) return (
    <div className="ur-root">
      <button className="ur-back" onClick={() => navigate(-1)}>
        <ChevronLeft size={20} />
      </button>

      <div className="ur-card ur-animate-in">
        <div className="ur-badge"><Zap size={14} fill="currentColor" /> Wave Pay</div>
        <h1 className="ur-title">Recharger<br />mon compte</h1>
        <p className="ur-subtitle">
          Envoyez le montant souhaité au numéro ci-dessous,<br />
          puis importez votre reçu — la validation est instantanée.
        </p>

        <button className="ur-phone-box" onClick={copyPhone}>
          <span className="ur-phone-label">NUMÉRO WAVE</span>
          <span className="ur-phone-num">{ADMIN_PHONE}</span>
          <span className={`ur-copy-chip ${copied ? 'ur-copy-chip--done' : ''}`}>
            <Copy size={12} /> {copied ? 'Copié !' : 'Copier'}
          </span>
        </button>

        <a className="ur-wave-btn" href={WAVE_LINK} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} /> Ouvrir Wave
        </a>

        <button className="ur-cta" onClick={() => setStep(2)}>
          J'ai effectué le paiement →
        </button>
      </div>
    </div>
  );

  return (
    <div className="ur-root">
      <button className="ur-back" onClick={() => { setStep(1); reset(); setFile(null); setPreview(null); }}>
        <ChevronLeft size={20} />
      </button>

      <div className="ur-card ur-animate-in">
        {status === 'success' ? (
          <div className="ur-success">
            <div className="ur-success-ring">
              <CheckCircle2 size={52} strokeWidth={1.5} color="#10b981" />
            </div>
            <h2 className="ur-success-title">Reçu analysé !</h2>
            <p className="ur-success-amount">+{result?.amount?.toLocaleString()} F</p>
            
            <div className="ur-assistance-card">
              <div className="ur-assistance-header">
                <span className="ur-assistance-tag">⚠️ Dernière étape</span>
              </div>
              <p>
                Pour finaliser votre crédit, <strong>enregistrez le numéro d'assistance</strong> ci-dessous et envoyez-nous votre reçu complet sur WhatsApp.
              </p>
              <button className="ur-whatsapp-btn" onClick={openWhatsApp}>
                <MessageCircle size={18} /> Contacter l'assistance
              </button>
              <p className="ur-assistance-footer">Le contrôle est rapide et sécurisé.</p>
            </div>

            <div className="ur-txid">
              <span>ID Transaction</span>
              <code>{result?.transactionId}</code>
            </div>
            <button className="ur-cta" onClick={() => navigate(-1)}>
              Retour au tableau de bord
            </button>
          </div>
        ) : (
          <>
            <div className="ur-badge"><Sparkles size={14} /> Vérification IA</div>
            <h1 className="ur-title">Importer<br />le reçu</h1>

            <div
              className={`ur-dropzone
                ${preview ? 'ur-dropzone--filled' : ''}
                ${dragOver ? 'ur-dropzone--drag' : ''}
                ${isScanning ? 'ur-dropzone--scanning' : ''}
              `}
              onClick={() => !isScanning && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {isScanning && <div className="ur-scan-line" />}

              {preview ? (
                <img src={preview} alt="Reçu Wave" className="ur-preview" />
              ) : (
                <div className="ur-dropzone-placeholder">
                  <Camera size={40} strokeWidth={1.2} />
                  <span>Cliquez ou déposez le reçu Wave ici</span>
                </div>
              )}

              {isScanning && (
                <div className="ur-scanning-overlay">
                  <Loader2 size={28} className="ur-spin" />
                  <span>Analyse en cours…</span>
                </div>
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />

            {scanStateLabel && (
              <div className={`ur-status-banner ur-status-banner--${status}`}>
                {status === 'scanning' ? <Loader2 size={14} className="ur-spin" /> : <AlertCircle size={14} />}
                <span>{scanStateLabel}</span>
              </div>
            )}

            <button
              className={`ur-cta ${(!file || isScanning) ? 'ur-cta--disabled' : ''}`}
              disabled={!file || isScanning}
              onClick={() => scan(file)}
            >
              {isScanning ? <><Loader2 size={18} className="ur-spin" /> Analyse…</> : 'Valider le reçu'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}