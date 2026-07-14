import { QRCodeSVG } from "qrcode.react";
import { Download, Printer, ShieldCheck, ArrowLeft, MessageCircle, Send, Facebook } from "lucide-react";
import { useNavigate } from "react-router-dom";
import mamboLogo from '../assets/logo.png';
import AdminBottomMenu from "../components/AdminBottomMenu";
import "./PrintableQrPage.css";

export default function PrintableQrPage() {
  const appUrl = "https://livraison-moto.web.app";
  const navigate = useNavigate();

  const handlePrint = () => {
    window.print();
  }; 
  

  const shareToWhatsApp = () => {
    const message = encodeURIComponent(
      `📱 Téléchargez l'application MAMBO et commandez facilement !\n\n` +
      `🔗 Lien direct : ${appUrl}\n\n` +
      `Rapide • Sécurisé • Sans Store`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const shareToTelegram = () => {
    const message = encodeURIComponent(
      `📱 MAMBO - Application de Livraison\n\n` +
      `Téléchargez ici : ${appUrl}\n` +
      `Commandez en quelques secondes !`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${message}`, '_blank');
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}`, '_blank');
  };

  return (
    <div className="print-page-wrapper">
      {/* Boutons d'action administrateur */}
      <div className="no-print-zone">
        <div className="action-buttons-group" style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          
          <button 
            onClick={() => navigate(-1)} 
            className="back-trigger-btn"
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "12px", fontSize: "12px", fontWeight: "900", color: "#334155" }}
          >
            <ArrowLeft size={18} /> Retour
          </button>

          <button onClick={handlePrint} className="print-trigger-btn">
            <Printer size={18} /> 
          </button>

          {/* WhatsApp */}
          <button 
            onClick={shareToWhatsApp}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", backgroundColor: "#25D366", color: "white", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: "900" }}
          >
            <MessageCircle size={18} /> 
          </button>

          {/* Telegram */}
          <button 
            onClick={shareToTelegram}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", backgroundColor: "#229ED9", color: "white", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: "900" }}
          >
            <Send size={18} /> 
          </button>

          {/* Facebook */}
          <button 
            onClick={shareToFacebook}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", backgroundColor: "#1877F2", color: "white", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: "900" }}
          >
            <Facebook size={18} /> 
          </button>
        </div>
        
        <p className="print-hint">Cliquez sur les boutons pour partager le lien d'installation.</p>
      </div>

      {/* Zone imprimable (inchangée) */}
      <div className="printable-card">
        <div className="printable-header">
          <div className="brand-badge">
            <img src={mamboLogo} alt="MAMBO Logo" className="brand-logo" />
            
          </div>
          <p className="brand-tagline">LIVRAISON RAPIDE & SÉCURISÉE</p>
        </div>

        <div className="headline-section">
          <h2>SCANNEZ POUR INSTALLER L'APPLICATION</h2>
          <p>Accédez instantanément à vos courses et validez vos paiements Wave en un clin d'œil.</p>
        </div>

        <div className="qr-container-box">
          <div className="qr-border-frame">
            <QRCodeSVG
              value={appUrl}
              size={150}
              bgColor={"#ffffff"}
              fgColor={"#0f172a"}
              level={"H"}
              includeMargin={false}
            />
          </div>
          <div className="scan-pill">
            <Download size={14} className="icon-bounce" />
            <span>OUVERTURE DIRECTE SANS TÉLÉCHARGEMENT STORE</span>
          </div>
        </div>

       

        <div className="printable-footer">
          <div className="security-notice">
            <ShieldCheck size={14} />
            <span>Application Web Officielle Sécurisée — mambo.ci</span>
          </div>
        </div>
      </div>

      <div className="no-print-zone" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1002 }}>
        <AdminBottomMenu />
      </div>
    </div>
  );
}