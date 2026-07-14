import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { X, Camera, ShieldCheck, Loader2 } from 'lucide-react';

const ScannerLivreur = ({ userName, onScanSuccess, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerRef = useRef(null);

  const handleScanSuccess = useCallback(async (decodedText) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      if (scannerRef.current) {
        await scannerRef.current.clear();
      }
      onScanSuccess(decodedText);
    } catch (err) {
      console.error("Erreur arrêt scanner:", err);
      onScanSuccess(decodedText);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, onScanSuccess]);

  useEffect(() => {
    const config = { 
      fps: 12,
      qrbox: { width: 260, height: 260 },
      rememberLastUsedCamera: true,
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      aspectRatio: 1.0,
      disableFlip: false
    };

    const scanner = new Html5QrcodeScanner("reader", config, false);
    scannerRef.current = scanner;

    const onError = (err) => {
      // Ignorer les erreurs de détection normales
    };

    scanner.render(handleScanSuccess, onError);

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.warn("Cleanup scanner error", e));
      }
    };
  }, [handleScanSuccess]);

  return (
    <div className="scanner-overlay">
      <div className="scanner-container">
        <div className="scanner-header">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
              <ShieldCheck size={18} className="text-emerald-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-black uppercase tracking-tight">TRANSMISSION SÉCURISÉE</span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">{userName || "CLIENT"}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 transition-colors text-slate-400 hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="relative overflow-hidden bg-black aspect-square">
          <div id="reader" className="w-full h-full" />

          {isProcessing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm">
              <Loader2 className="w-12 h-12 mb-4 text-emerald-500 animate-spin" />
              <p className="text-sm font-bold text-white">VÉRIFICATION EN COURS...</p>
            </div>
          )}

          {/* Cadre de guidage */}
          <div className="absolute inset-0 pointer-events-none border-[50px] border-slate-950/60">
            <div className="w-full h-full border-2 border-dashed border-emerald-500/60 rounded-2xl" />
          </div>
        </div>

        <div className="scanner-footer">
          <div className="flex items-center gap-2 mb-2 text-emerald-400">
            <Camera size={16} />
            <span className="text-xs font-black tracking-widest uppercase">Scanner de sécurité</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Scannez le <span className="font-bold text-white">QR Code du Coursier</span> pour confirmer la prise en charge du colis.
          </p>
        </div>
      </div>

      <style jsx>{`
        .scanner-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.95);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          backdrop-filter: blur(12px);
        }
        .scanner-container {
          background: #0f172a;
          width: 100%;
          max-width: 400px;
          border-radius: 28px;
          overflow: hidden;
          border: 1px solid #1e293b;
          box-shadow: 0 25px 50px -12px rgb(0 0 0 / 70%);
        }
        .scanner-header {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: white;
          border-bottom: 1px solid #1e293b;
        }
        .scanner-footer {
          padding: 20px;
          text-align: center;
          color: #64748b;
          font-size: 12px;
          background: linear-gradient(to bottom, #0f172a, #020617);
        }
        #reader video { object-fit: cover; }
        #reader__dashboard_section_csr button {
          background: #10b981 !important;
          color: white !important;
          border-radius: 9999px !important;
          font-weight: 700 !important;
        }
      `}</style>
    </div>
  );
};

export default ScannerLivreur;