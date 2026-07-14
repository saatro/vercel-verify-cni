import { CheckCircle, Gift, Star, TrendingUp, Zap } from "lucide-react";
import "./WelcomeModal.css";

export default function WelcomeModal({ isOpen, onClose, driverName, bonusAmount = 3000 }) {
    if (!isOpen) return null;

    return (
        <div className="welcome-modal-overlay">
            <div className="welcome-modal-container">
                {/* Confettis animation */}
                <div className="confetti-container">
                    {[...Array(30)].map((_, i) => (
                        <div
                            key={i}
                            className="confetti"
                            style={{
                                left: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 3}s`,
                                backgroundColor: ['#fbbf24', '#f97316', '#10b981', '#3b82f6', '#a855f7'][Math.floor(Math.random() * 5)]
                            }}
                        />
                    ))}
                </div>

                {/* Content */}
                <div className="welcome-content">
                    {/* Icon principal */}
                    <div className="welcome-icon-wrapper">
                        <div className="icon-glow"></div>
                        <Gift size={64} className="welcome-icon" />
                    </div>

                    {/* Titre */}
                    <h1 className="welcome-title">
                        Félicitations {driverName} !
                    </h1>

                    <p className="welcome-subtitle">
                        Bienvenue dans la famille des chauffeurs
                    </p>

                    {/* Bonus card */}
                    <div className="bonus-card">
                        <div className="bonus-icon">
                            <Star size={32} />
                        </div>
                        <div className="bonus-content">
                            <p className="bonus-label">Bonus de bienvenue</p>
                            <p className="bonus-amount">{bonusAmount.toLocaleString()} F</p>
                            <p className="bonus-description">
                                Créditée automatiquement en jetons
                            </p>
                        </div>
                    </div>

                    {/* Info commission */}
                    <div className="commission-info">
                        <div className="commission-section">
                            <div className="commission-header">
                                <Zap size={20} className="text-green-500" />
                                <h3>Recharge directe</h3>
                            </div>
                            <p className="commission-rate">Commission : 13%</p>
                            <p className="commission-desc">Sur les rechargements</p>
                        </div>

                        <div className="commission-divider"></div>

                        <div className="commission-section">
                            <div className="commission-header">
                                <Gift size={20} className="text-orange-500" />
                                <h3>Bonus & Jetons</h3>
                            </div>
                            <p className="commission-rate">Commission : 21%</p>
                            <p className="commission-desc">Sur les jetons bonus</p>
                        </div>
                    </div>

                    {/* Avantages */}
                    <div className="benefits-list">
                        <div className="benefit-item">
                            <CheckCircle size={20} className="benefit-icon" />
                            <span>Commencez à gagner dès maintenant</span>
                        </div>
                        <div className="benefit-item">
                            <TrendingUp size={20} className="benefit-icon" />
                            <span>Augmentez vos revenus chaque jour</span>
                        </div>
                        <div className="benefit-item">
                            <Star size={20} className="benefit-icon" />
                            <span>Devenez un chauffeur 5 étoiles</span>
                        </div>
                    </div>

                    {/* Bouton CTA */}
                    <button
                        onClick={onClose}
                        className="welcome-cta-button"
                    >
                        Commencer à gagner
                    </button>

                    <p className="welcome-footer">
                        Vos {bonusAmount.toLocaleString()} F de bonus sont disponibles immédiatement
                    </p>
                </div>
            </div>
        </div>
    );
}