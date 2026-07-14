import React, { useEffect, useState, useRef, useCallback } from "react";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import { X, Camera, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

const ScannerLivreur = ({ userName, onScanSuccess, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");

  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const readerId = useRef(`reader-${Math.random().toString(36).slice(2)}`);

  /**
   * 🔐 Gestion scan sécurisé
   */
  const handleScanSuccess = useCallback(
    async (decodedText) => {
      if (processingRef.current) return;

      processingRef.current = true;
      setIsProcessing(true);
      setScanError("");

      try {
        // 🔎 Validation QR (important sécurité)
        let parsed;
        try {
          parsed = JSON.parse(decodedText);
        } catch {
          throw new Error("QR Code invalide ou non reconnu.");
        }

        // 🛑 Stop scanner proprement
        if (scannerRef.current) {
          try {
            await scannerRef.current.clear();
          } catch {
            console.warn("Scanner déjà stoppé");
          }
        }

        // 🚀 Callback parent
        await onScanSuccess(parsed);
      } catch (err) {
        console.error(err);
        setScanError(err.message || "Erreur lors du scan.");
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [onScanSuccess]
  );

  /**
   * 🎥 Init scanner
   */
  useEffect(() => {
    let isMounted = true;

    const config = {
      fps: 8,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0,
      rememberLastUsedCamera: true,
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
    };

    const scanner = new Html5QrcodeScanner(readerId.current, config, false);
    scannerRef.current = scanner;

    const onError = (err) => {
      if (!isMounted) return;

      if (typeof err === "string" && err.includes("NotAllowedError")) {
        setCameraError("Autorisation caméra refusée.");
      }
    };

    if (isMounted) {
      scanner.render(handleScanSuccess, onError);
    }

    return () => {
      isMounted = false;

      if (scannerRef.current) {
        scannerRef.current
          .clear()
          .catch(() => {})
          .finally(() => {
            scannerRef.current = null;
          });
      }
    };
  }, [handleScanSuccess]);

  return (
    <div className="scanner-overlay">
      <div className="scanner-container">
        {/* HEADER */}
        <div className="scanner-header">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
              <ShieldCheck size={18} className="text-emerald-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-black uppercase">
                Transmission sécurisée
              </span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase">
                {userName || "CLIENT"}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>

        {/* SCANNER */}
        <div className="relative overflow-hidden bg-black aspect-square">
          <div id={readerId.current} className="w-full h-full" />

          {/* LOADING */}
          {isProcessing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm">
              <Loader2 className="w-12 h-12 mb-4 text-emerald-500 animate-spin" />
              <p className="text-sm font-bold text-white">
                Vérification en cours...
              </p>
            </div>
          )}

          {/* GUIDE FRAME */}
          <div className="absolute inset-0 pointer-events-none border-[50px] border-slate-950/60">
            <div className="w-full h-full border-2 border-dashed border-emerald-500/60 rounded-2xl" />
          </div>
        </div>

        {/* FOOTER */}
        <div className="scanner-footer">
          <div className="flex items-center justify-center gap-2 mb-2 text-emerald-400">
            <Camera size={16} />
            <span className="text-xs font-black uppercase">
              Scanner sécurisé
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Scannez le <span className="font-bold text-white">QR Code</span> pour
            confirmer l’opération.
          </p>

          {/* ERREURS */}
          {cameraError && (
            <div className="flex items-center gap-2 mt-3 text-xs text-rose-400">
              <AlertTriangle size={14} />
              {cameraError}
            </div>
          )}

          {scanError && (
            <div className="flex items-center gap-2 mt-2 text-xs text-rose-400">
              <AlertTriangle size={14} />
              {scanError}
            </div>
          )}
        </div>
      </div>

      {/* STYLE */}
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
          font-size: 12px;
          background: linear-gradient(to bottom, #0f172a, #020617);
        }

        video {
          object-fit: cover;
        }

        button {
          transition: all 0.2s ease;
        }
      `}</style>
    </div>
  );
};

export default ScannerLivreur;