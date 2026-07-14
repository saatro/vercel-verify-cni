// Home.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    setAccepted(true);
    navigate("/acces"); // Continue vers la page d'accès après acceptation
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <img
          src="/logo.png"
          alt="Logo"
          style={styles.logo}
        />
        <h1 style={styles.title}>Bienvenue sur Motorcycle Delivery</h1>
      </header>

      {/* Section d'informations */}
      <div style={styles.infoBox}>
        <h2 style={styles.subtitle}>Informations importantes</h2>
        <p style={styles.text}>
          Bienvenue dans notre application de livraison. Avant de continuer, merci de lire attentivement nos conditions d’utilisation.
        </p>

        <h3 style={styles.subtitle}>Conditions d'utilisation</h3>
        <div style={styles.conditions}>
          <p>
            1. L’utilisateur s’engage à fournir des informations exactes lors de la commande.
          </p>
          <p>
            2. Les livraisons sont effectuées sous réserve de disponibilité des livreurs.
          </p>
          <p>
            3. Les tarifs peuvent varier selon la distance et le type de livraison.
          </p>
          <p>
            4. L’utilisateur accepte de respecter les règles de sécurité et les consignes du livreur.
          </p>
          <p>
            5. Toute utilisation abusive de l’application peut entraîner la suspension du compte.
          </p>
          <p>
            (Vous pouvez compléter avec toutes les conditions réelles de votre service.)
          </p>
        </div>
      </div>

      {/* Bouton d'acceptation */}
      <button
        onClick={handleAccept}
        style={{
          ...styles.button,
          backgroundColor: accepted ? "#6b7280" : "#4f46e5",
          cursor: accepted ? "not-allowed" : "pointer",
        }}
        disabled={accepted}
      >
        {accepted ? "Conditions acceptées" : "J’accepte"}
      </button>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 20,
    boxSizing: "border-box",
  },
  header: {
    textAlign: "center",
    marginBottom: 20,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  infoBox: {
    maxWidth: 600,
    width: "100%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
    marginBottom: 20,
    overflowY: "auto",
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 15,
    marginBottom: 10,
    color: "#4b5563",
  },
  text: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "#374151",
    marginBottom: 15,
  },
  conditions: {
    maxHeight: 250,
    overflowY: "auto",
    paddingRight: 10,
  },
  button: {
    padding: "12px 30px",
    fontSize: 16,
    borderRadius: 8,
    color: "#fff",
    border: "none",
    width: "100%",
    maxWidth: 400,
    transition: "background-color 0.2s",
  },
};
