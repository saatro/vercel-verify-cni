import React from 'react';
import { Bell, LogOut, ShieldCheck, MapPin, Phone } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function VendeurHeader({ user, pendingCount, onProfileClick, onBellClick }) {
  // Récupération des données réelles du document de la collection 'users'
  const boutiqueNom = user?.nomBoutique || user?.enseigne || user?.nomComplet || "Chargement...";
  const boutiqueLogo = user?.photoURL || 'https://ui-avatars.com/api/?name=Boutique&background=6d28d9&color=fff';
  const boutiqueTelephone = user?.telephone;
  const boutiqueAdresse = user?.adresse;
  const estVerifie = user?.isVerified ?? false;
  const estActif = user?.isActive ?? false;

  return (
    <header className="m-header-premium" style={styles.header}>
      <div className="m-header-top" style={styles.headerTop}>
        
        {/* Section Profil GAUCHE */}
        <div className="m-vendor-profile" onClick={onProfileClick} style={styles.vendorProfile}>
          <div style={styles.logoContainer}>
            <div style={styles.logoWrapper}>
              <img 
                src={boutiqueLogo} 
                alt={boutiqueNom} 
                style={styles.logo} 
              />
              {estVerifie && (
                <div style={styles.verifiedBadge} title="Vendeur Vérifié">
                  <ShieldCheck size={14} color="#ffffff" fill="#22c55e" />
                </div>
              )}
            </div>
            {estActif && <span style={styles.onlineStatus} title="Boutique Active"></span>}
          </div>
          
          <div className="m-vendor-info" style={styles.vendorInfo}>
            <h3 style={styles.title}>{boutiqueNom}</h3>
            {(boutiqueTelephone || boutiqueAdresse) && (
              <div style={styles.subtitle}>
                {boutiqueTelephone && (
                  <span style={styles.infoSpan}>
                    <Phone size={11} style={S.iconSpacing} /> {boutiqueTelephone}
                  </span>
                )}
                {boutiqueTelephone && boutiqueAdresse && <span style={styles.separator}>•</span>}
                {boutiqueAdresse && (
                  <span style={{ ...styles.infoSpan, ...styles.locationText }}>
                    <MapPin size={11} style={S.iconSpacing} /> {boutiqueAdresse}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section Actions DROITE */}
        <div className="m-header-actions" style={styles.headerActions}>
          
          {/* Notification Cloche */}
          <button className="m-icon-badge" onClick={onBellClick} style={styles.iconButton}>
            {pendingCount > 0 && <span style={styles.pulseRing}></span>}
            <Bell 
              size={22} 
              color={pendingCount > 0 ? '#ff9800' : '#475569'} 
              style={{ transition: 'color 0.2s ease' }}
            />
            {pendingCount > 0 && (
              <span className="m-badge-count" style={styles.badgeCount}>
                {pendingCount}
              </span>
            )}
          </button>
          
          <div style={styles.actionDivider}></div>

          {/* Déconnexion */}
          <button className="m-logout-minimal" onClick={() => signOut(auth)} style={styles.logoutButton} title="Se déconnecter">
            <LogOut size={20} color="#94a3b8" style={styles.logoutIcon} />
          </button>
        </div>

      </div>
    </header>
  );
}

// ── Utilitaires d'icônes internes ───────────────────────────────────
const S = {
  iconSpacing: {
    marginRight: '2px',
    display: 'inline-block',
    verticalAlign: 'middle'
  }
};

// ── Styles Premium Épurés & Modernisés ───────────────────────────────
const styles = {
  header: {
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid #f1f5f9',
    padding: '12px 16px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 1px 3px rgba(0,0,0,0.01)'
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  vendorProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  logoContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  logoWrapper: {
    position: 'relative',
  },
  logo: {
    width: '48px',
    height: '48px',
    borderRadius: '14px',
    objectFit: 'cover',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
    background: '#f8fafc',
    border: '1px solid #f1f5f9'
  },
  verifiedBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    background: '#ffffff',
    borderRadius: '50%',
    padding: '1.5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
  },
  onlineStatus: {
    position: 'absolute',
    bottom: '-1px',
    right: '-1px',
    width: '12px',
    height: '12px',
    backgroundColor: '#10b981',
    borderRadius: '50%',
    border: '2.5px solid #ffffff',
    boxShadow: '0 1px 4px rgba(16, 185, 129, 0.4)'
  },
  vendorInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  title: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#0f172a',
    margin: 0,
    letterSpacing: '-0.02em',
    lineHeight: '1.2'
  },
  subtitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#64748b',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  infoSpan: {
    display: 'flex',
    alignItems: 'center',
  },
  separator: {
    color: '#cbd5e1',
    fontWeight: '400',
    right: '-10px',
  },
  locationText: {
    color: '#64748b',
    
    fontSize: '10px',
    letterSpacing: '0.3px'
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  iconButton: {
    position: 'relative',
    background: '#f8fafc',
    border: '1px solid #f1f5f9',
    borderRadius: '12px',
    right: '-6px',
    width: '30px',
    height: '30px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  badgeCount: {
    position: 'absolute',
    top: '-4px',
    right: '-6px',
    background: '#ef4444',
    color: '#ffffff',
    fontSize: '8px',
    fontWeight: '900',
    borderRadius: '8px',
    padding: '2px 3px',
    border: '2px solid #ffffff',
    minWidth: '17px',
    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)'
  },
  pulseRing: {
    position: 'absolute',
    inset: '-1px',
    borderRadius: '12px',
    border: '2px solid #ff9800',
    animation: 'mambo-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
    opacity: 0.5,
  },
  actionDivider: {
    width: '1px',
    height: '20px',
    background: '#e2e8f0',
    margin: '0 4px'
  },
  logoutButton: {
    background: 'transparent',
    border: 'none',
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s ease'
  },
  logoutIcon: {
    transition: 'color 0.2s ease, transform 0.2s ease'
  }
};