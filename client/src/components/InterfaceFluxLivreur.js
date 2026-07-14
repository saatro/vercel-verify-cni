import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { X,  ShieldCheck, Loader2, AlertTriangle, Coins, CheckCircle2, ArrowRight, Smartphone, Bell } from 'lucide-react';

const InterfaceFluxLivreur = ({ orderId, orderType, onClose, onOrderCompleted }) => {
  // Étapes du flux : 'SCAN_INITIAL', 'ATTENTE_DEPOT_CLIENT', 'COMMISSION_COURSIER', 'SCAN_CLIENT', 'CONTROLE_WAVE', 'SUCCES'
  const [currentStep, setCurrentStep] = useState(orderType === "supermarche" ? "SCAN_INITIAL" : "SCAN_CLIENT");
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanError, setScanError] = useState("");
  const [coursierData, setCoursierData] = useState(null);
  const [waveReceipt, setWaveReceipt] = useState("");
  const scannerRef = useRef(null);

  // Traitement du Scan du QR Code
  const handleScanSuccess = useCallback(async (decodedText) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setScanError("");

    try {
      const qrData = JSON.parse(decodedText);

      if (qrData.orderId !== orderId) {
        throw new Error("Ce QR Code appartient à une autre commande.");
      }

      if (scannerRef.current) {
        await scannerRef.current.clear();
      }

      // Cas 1 : Scan du Coursier Rayons (Supermarché)
      if (currentStep === "SCAN_INITIAL" && orderType === "supermarche") {
        if (qrData.type !== "coursier_supermarche") {
          throw new Error("QR Code invalide. Vous devez scanner le QR du COURSIER des rayons.");
        }
        setCoursierData(qrData);
        setIsProcessing(false);
        
        // Nouvelle étape : On bascule d'abord sur l'attente du dépôt de la part du client
        setCurrentStep("ATTENTE_DEPOT_CLIENT");
        
        // Code d'alerte vers le client (Ex: appel à votre Cloud Function ou mise à jour Firestore)
        // db.collection('orders').doc(orderId).update({ status: 'attente_depot_client' });
      } 
      
      // Cas 2 : Scan du Client (Fin de livraison)
      else if (currentStep === "SCAN_CLIENT" || (currentStep === "SCAN_INITIAL" && orderType !== "supermarche")) {
        if (qrData.type !== "client_reception") {
          throw new Error("QR Code invalide. Vous devez scanner le QR Code de réception du CLIENT.");
        }
        setIsProcessing(false);
        setCurrentStep("CONTROLE_WAVE");
      }

    } catch (err) {
      console.error(err);
      setScanError(err.message || "Code QR invalide ou illisible.");
      setIsProcessing(false);
    }
  }, [isProcessing, orderId, orderType, currentStep]);

  // Initialisation du scanner photo
  useEffect(() => {
    if (currentStep !== "SCAN_INITIAL" && currentStep !== "SCAN_CLIENT") return;

    const config = { 
      fps: 12,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      aspectRatio: 1.0,
    };

    const scanner = new Html5QrcodeScanner("reader-livreur", config, false);
    scannerRef.current = scanner;

    scanner.render(handleScanSuccess, () => {});

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.warn("Nettoyage camera", e));
      }
    };
  }, [currentStep, handleScanSuccess]);

  // Écouteur en temps réel (Simulation) pour détecter quand le client a payé son dépôt
  useEffect(() => {
    if (currentStep !== "ATTENTE_DEPOT_CLIENT") return;

    // Simulation d'une écoute Firestore (onSnapshot) qui s'active quand le dépôt du client est validé
    const intervalCheck = setInterval(() => {
      // Si le dépôt est détecté côté serveur, on passe à l'étape suivante : libérer la commission du coursier
      clearInterval(intervalCheck);
      setCurrentStep("COMMISSION_COURSIER");
    }, 4000); // Démo : déblocage auto après 4 secondes

    return () => clearInterval(intervalCheck);
  }, [currentStep]);

  // Déclenchement du virement de la commission vers le coursier rayons
  const transfererCommissionCoursier = async () => {
    setIsProcessing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulation API Wave
      setIsProcessing(false);
      setCurrentStep("SCAN_CLIENT");
    } catch (err) {
      setScanError("Le transfert Wave de la commission a échoué. Veuillez réessayer.");
      setIsProcessing(false);
    }
  };

  // Soumission finale du reçu Wave complet (À destination chez le client)
  const validerRecuPaiementWave = (e) => {
    e.preventDefault();
    if (!waveReceipt.trim()) return;

    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setCurrentStep("SUCCES");
      if (onOrderCompleted) onOrderCompleted(waveReceipt);
    }, 1500);
  };

  return (
    <div className="flux-overlay">
      <div className="flux-card">
        
        {/* ENTÊTE UNIQUE */}
        <div className="flux-header">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
              <ShieldCheck size={18} className="text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white uppercase">CONTRÔLE LIVRAISON</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {orderType === "supermarche" ? "MODE SUPERMARCHÉ" : "MODE STANDARD"} : #{orderId.slice(-6).toUpperCase()}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* CORPS DE L'INTERFACE */}
        <div className="p-5">
          
          {/* ÉTAPES DE SCAN CAMERA */}
          {(currentStep === "SCAN_INITIAL" || currentStep === "SCAN_CLIENT") && (
            <div className="flex flex-col items-center">
              <div className="w-full mb-4 text-center">
                <span className="px-2.5 py-1 bg-slate-800 text-[10px] font-extrabold text-emerald-400 rounded-full tracking-wider uppercase">
                  {currentStep === "SCAN_INITIAL" ? "Étape 1 : Flash Coursier" : "Étape 3 : Remise Client"}
                </span>
                <p className="mt-2 text-xs font-medium text-slate-300">
                  {currentStep === "SCAN_INITIAL" 
                    ? "Scannez le QR Code du COURSIER RAYONS pour notifier le client d'effectuer le dépôt."
                    : "Scannez le QR Code de confirmation sur le smartphone du CLIENT."
                  }
                </p>
              </div>

              <div className="relative w-full overflow-hidden bg-black border aspect-square rounded-2xl border-slate-800">
                <div id="reader-livreur" className="w-full h-full" />
                {isProcessing && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 mb-2 text-emerald-500 animate-spin" />
                    <p className="text-xs font-bold tracking-widest text-white uppercase">Analyse sécurisée...</p>
                  </div>
                )}
              </div>

              {scanError && (
                <div className="flex items-start gap-2 p-3 mt-3 border bg-rose-500/10 border-rose-500/20 rounded-xl text-rose-400">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold leading-snug">{scanError}</p>
                </div>
              )}
            </div>
          )}

          {/* NOUVELLE ÉTAPE : ATTENTE DU DÉPÔT DU CLIENT */}
          {currentStep === "ATTENTE_DEPOT_CLIENT" && (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="relative mb-4">
                <div className="flex items-center justify-center border rounded-full w-14 h-14 bg-amber-500/10 text-amber-500 border-amber-500/20">
                  <Bell className="w-6 h-6 animate-pulse" />
                </div>
                <span className="absolute flex w-3 h-3 -top-1 -right-1">
                  <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-rose-400"></span>
                  <span className="relative inline-flex w-3 h-3 rounded-full bg-rose-500"></span>
                </span>
              </div>
              
              <h4 className="text-sm font-black tracking-tight text-white uppercase">Notification Client Envoyée</h4>
              <p className="px-4 mt-2 text-xs leading-relaxed text-slate-400">
                Le client a été alerté sur son application. Nous attendons qu'il confirme le dépôt de la provision Wave pour couvrir la commission.
              </p>

              <div className="flex items-center justify-center w-full gap-3 p-4 my-6 border bg-slate-900 border-slate-800 rounded-xl">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-xs font-bold tracking-wider uppercase text-slate-400 animate-pulse">
                  Attente de la validation du dépôt...
                </span>
              </div>
              
              <p className="text-[11px] text-slate-500 italic">
                Ne prenez pas le colis tant que cet écran ne passe pas au vert.
              </p>
            </div>
          )}

          {/* ÉTAPE DE LIQUIDATION DE LA COMMISSION AU COURSIER */}
          {currentStep === "COMMISSION_COURSIER" && coursierData && (
            <div className="py-2 text-center">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 border rounded-full bg-emerald-500/10 border-emerald-500/20 text-emerald-500">
                <Coins size={24} />
              </div>
              <h4 className="text-sm font-black tracking-tight text-white uppercase">Dépôt Client Reçu ✓</h4>
              <p className="px-4 mt-1 text-xs leading-relaxed text-slate-400">
                Le client a approvisionné les fonds. Vous pouvez maintenant transférer la commission au coursier rayons et charger le colis.
              </p>

              <div className="p-4 my-5 text-left border bg-slate-900 rounded-2xl border-slate-800">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-medium text-slate-400">Bénéficiaire (Coursier) :</span>
                  <span className="font-mono text-xs font-bold text-white">{coursierData.coursierWavePhone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Commission Rayons :</span>
                  <span className="text-sm font-black text-emerald-400">{coursierData.commissionAmount} FCFA</span>
                </div>
              </div>

              <button
                onClick={transfererCommissionCoursier}
                disabled={isProcessing}
                className="flex items-center justify-center w-full gap-2 py-3 text-xs font-black tracking-wider uppercase transition-colors bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 rounded-xl"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Envoi des fonds par Wave...
                  </>
                ) : (
                  <>
                    Libérer la commission & Prendre le Colis
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ÉTAPE CONTRÔLE REÇU WAVE FINAL (ARRIVÉE CLIENT) */}
          {currentStep === "CONTROLE_WAVE" && (
            <div>
              <div className="flex items-center gap-3 p-3 mb-4 text-blue-400 border bg-blue-500/10 border-blue-500/20 rounded-xl">
                <Smartphone size={20} className="shrink-0" />
                <p className="text-xs font-bold leading-tight tracking-wider uppercase">
                  Enregistrement du contact assistance et contrôle du reçu complet requis.
                </p>
              </div>

              <form onSubmit={validerRecuPaiementWave} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    Coller ici le reçu complet Wave de la transaction :
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={waveReceipt}
                    onChange={(e) => setWaveReceipt(e.target.value)}
                    placeholder="Ex: Wave Chèque... Transfert réussi de... Émis le... Réf..."
                    className="w-full p-3 font-mono text-xs text-white transition-colors border resize-none bg-slate-900 border-slate-800 rounded-xl placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing || !waveReceipt.trim()}
                  className="flex items-center justify-center w-full gap-2 py-3 text-xs font-black tracking-wider uppercase transition-colors bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 rounded-xl"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Analyse du reçu Wave...
                    </>
                  ) : (
                    "Vérifier le reçu complet & Clôturer"
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ÉTAPE SUCCÈS FINAL */}
          {currentStep === "SUCCES" && (
            <div className="py-4 text-center">
              <div className="flex items-center justify-center mx-auto mb-4 border rounded-full w-14 h-14 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 animate-bounce">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-base font-black tracking-tight text-white uppercase">Livraison Clôturée</h4>
              <p className="px-2 mt-1 text-xs leading-relaxed text-slate-400">
                Le reçu Wave a été validé, la commission a été sécurisée, et la commande est archivée avec succès.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
              >
                Fermer la fenêtre
              </button>
            </div>
          )}

        </div>
      </div>

      <style jsx>{`
        .flux-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.96);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          backdrop-filter: blur(16px);
        }
        .flux-card {
          background: #0f172a;
          width: 100%;
          max-width: 390px;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid #1e293b;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
        }
        .flux-header {
          padding: 14px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #1e293b;
          background: #0f172a;
        }
        #reader-livreur video { object-fit: cover; }
        #reader-livreur__dashboard_section_csr button {
          background: #10b981 !important;
          color: white !important;
          border-radius: 8px !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
        }
      `}</style>
    </div>
  );
};

export default InterfaceFluxLivreur;