import React from 'react';
import { Package, ShoppingBag, MessageSquare, User } from 'lucide-react';

const styles = {
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '64px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #f1f5f9',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 'env(safe-area-inset-bottom)',
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.05)',
    zIndex: 999,
  },
  navButton: {
    background: 'transparent',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    gap: '4px',
  },
  activeNavButton: {
    color: '#6d28d9',
    transform: 'translateY(-1px)',
  },
  navLabel: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.02em',
  }
};

export default function VendeurNav({ activeTab, setActiveTab }) {
  return (
    <nav style={styles.bottomNav}>
      <button 
        style={{ ...styles.navButton, ...(activeTab === 'stock' ? styles.activeNavButton : {}) }} 
        onClick={() => setActiveTab('stock')}
      >
        <Package size={22} strokeWidth={activeTab === 'stock' ? 2.5 : 1.8} />
        <span style={styles.navLabel}>Stock</span>
      </button>

      <button 
        style={{ ...styles.navButton, ...(activeTab === 'ventes' ? styles.activeNavButton : {}) }} 
        onClick={() => setActiveTab('ventes')}
      >
        <ShoppingBag size={22} strokeWidth={activeTab === 'ventes' ? 2.5 : 1.8} />
        <span style={styles.navLabel}>Ventes</span>
      </button>

      <button 
        style={{ ...styles.navButton, ...(activeTab === 'messagerie' ? styles.activeNavButton : {}) }} 
        onClick={() => setActiveTab('messagerie')}
      >
        <MessageSquare size={22} strokeWidth={activeTab === 'messagerie' ? 2.5 : 1.8} />
        <span style={styles.navLabel}>Messagerie</span>
      </button>

      <button 
        style={{ ...styles.navButton, ...(activeTab === 'profil' ? styles.activeNavButton : {}) }} 
        onClick={() => setActiveTab('profil')}
      >
        <User size={22} strokeWidth={activeTab === 'profil' ? 2.5 : 1.8} />
        <span style={styles.navLabel}>Profil</span>
      </button>
    </nav>
  );
}