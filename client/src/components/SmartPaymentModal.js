import React, { useState, useRef } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Camera, CheckCircle2, AlertCircle, Loader2, X, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function SmartPaymentModal({ isOpen, onClose, orderData }) {
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("idle"); 
  const [errorMsg, setErrorMsg] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // 1. Activer la caméra directement
  const startCamera = async () => {
    setIsCameraActive(true);
    setStatus("idle");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } // Utilise la caméra arrière sur mobile
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Erreur caméra:", err);
      setErrorMsg("Impossible d'accéder à la caméra.");
      setIsCameraActive(false);
    }
  };

  // 2. Prendre la photo automatiquement
  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL("image/png");
      setPreview(imageData);
      
      // Stopper la caméra
      const stream = video.srcObject;
      stream.getTracks().forEach(track => track.stop());
      setIsCameraActive(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!preview) return;
    setStatus("scanning");
    
    try {
      // --- APPEL IA GEMINI (Simulation) ---
      setTimeout(async () => {
        // Validation simulée
        await addDoc(collection(db, "orders"), {
          userId: auth.currentUser?.uid,
          items: orderData.items,
          total: orderData.total,
          status: "en_attente_admin",
          paymentVerifiedByIA: true,
          createdAt: serverTimestamp(),
          vendorId: orderData.vendorId
        });
        setStatus("success");
        setTimeout(() => { onClose(); }, 2500);
      }, 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg("Échec de la validation.");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="payment-modal-overlay">
        <motion.div 
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          className="payment-modal-content"
        >
          <div className="modal-header">
            <div className="header-text">
              <h3>Vérification IA</h3>
              <p className="subtitle">Placez votre reçu Wave devant l'objectif</p>
            </div>
            <button className="close-x" onClick={onClose}><X size={24} /></button>
          </div>

          <div className="payment-alert-box">
             <AlertCircle size={18} />
             <span>Conservez bien ce reçu jusqu'à la livraison.</span>
          </div>

          <div className="camera-viewport">
            {isCameraActive ? (
              <div className="video-container">
                <video ref={videoRef} autoPlay playsInline />
                <div className="camera-overlay">
                    <div className="scan-frame"></div>
                </div>
                <button className="capture-trigger-btn" onClick={takePhoto}>
                   <div className="inner-circle"></div>
                </button>
              </div>
            ) : preview ? (
              <div className="preview-confirmed">
                <img src={preview} alt="Capture reçu" />
                <button className="retake-btn" onClick={startCamera}>
                  <RefreshCw size={16} /> Reprendre
                </button>
              </div>
            ) : (
              <div className="camera-placeholder" onClick={startCamera}>
                <Camera size={48} color="#4318ff" />
                <p>Appuyez pour scanner le reçu</p>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} style={{ display: "none" }} />

          <div className="order-footer">
            <div className="price-tag">
               <span>Total à payer</span>
               <strong>{orderData.total} FCFA</strong>
            </div>

            {status === "scanning" ? (
               <div className="ia-loading">
                  <Loader2 className="spin" /> <span>Analyse Gemini en cours...</span>
               </div>
            ) : status === "success" ? (
               <div className="ia-success">
                  <CheckCircle2 /> <span>Paiement validé !</span>
               </div>
            ) : (
              <button 
                className={`main-pay-btn ${!preview ? "disabled" : ""}`}
                disabled={!preview}
                onClick={handleVerifyPayment}
              >
                Confirmer l'achat
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}