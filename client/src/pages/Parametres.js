import { Bell, Globe, Lock, Settings, Zap } from "lucide-react"; // Ajout d'icônes
import { useEffect, useState } from "react";

import "./Parametres.css"; // Assurez-vous d'utiliser ce nom de fichier CSS

export default function Parametres() {
    // --- États des paramètres ---
    const [theme, setTheme] = useState("light");
    const [notifications, setNotifications] = useState(true);
    const [language, setLanguage] = useState("fr");
    // Nouveaux paramètres simulés
    const [twoFactorAuth, setTwoFactorAuth] = useState(false);
    const [autoLogout, setAutoLogout] = useState(30); // Durée en minutes

    const [saved, setSaved] = useState(false);

    useEffect(() => {
        // 🔹 Charger les paramètres sauvegardés depuis localStorage
        const storedTheme = localStorage.getItem("theme") || "light";
        // La notification doit être lue comme une chaîne avant la conversion en booléen
        const storedNotif = localStorage.getItem("notifications") === "false" ? false : true;
        const storedLang = localStorage.getItem("language") || "fr";
        const stored2FA = localStorage.getItem("twoFactorAuth") === "true";
        const storedAutoLogout = localStorage.getItem("autoLogout") || 30;

        setTheme(storedTheme);
        setNotifications(storedNotif);
        setLanguage(storedLang);
        setTwoFactorAuth(stored2FA);
        setAutoLogout(Number(storedAutoLogout));

        // 🔹 Appliquer le thème au <body>
        document.body.className = storedTheme === "dark" ? "dark-theme" : "";
    }, []);

    const handleSave = () => {
        // Sauvegarde dans localStorage
        localStorage.setItem("theme", theme);
        localStorage.setItem("notifications", notifications);
        localStorage.setItem("language", language);
        localStorage.setItem("twoFactorAuth", twoFactorAuth);
        localStorage.setItem("autoLogout", autoLogout);

        // Appliquer le thème immédiatement
        document.body.className = theme === "dark" ? "dark-theme" : "";

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="parametre-page">
           

            <div className="parametre-content">
                <h2><Settings size={24} className="icon-main" /> Paramètres</h2>

                {/* ----------------- SECTION APPARENCE ----------------- */}
                <div className="settings-group">
                    <h3 className="group-title"><Zap size={18} /> Préférences Générales</h3>

                    <div className="parametre-section">
                        <label>Thème :</label>
                        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                            <option value="light">Clair 🌞</option>
                            <option value="dark">Sombre 🌙</option>
                        </select>
                    </div>

                    <div className="parametre-section">
                        <label><Bell size={18} /> Notifications :</label>
                        <input
                            type="checkbox"
                            checked={notifications}
                            onChange={(e) => setNotifications(e.target.checked)}
                            className="toggle-switch"
                        />
                    </div>

                    <div className="parametre-section">
                        <label><Globe size={18} /> Langue :</label>
                        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                            <option value="fr">Français 🇫🇷</option>
                            <option value="en">English 🇬🇧</option>
                        </select>
                    </div>
                </div>

                <hr className="separator" />

                {/* ----------------- SECTION SÉCURITÉ ----------------- */}
                <div className="settings-group">
                    <h3 className="group-title"><Lock size={18} /> Sécurité et Session</h3>

                    <div className="parametre-section">
                        <label>Authentification à deux facteurs (2FA) :</label>
                        <input
                            type="checkbox"
                            checked={twoFactorAuth}
                            onChange={(e) => setTwoFactorAuth(e.target.checked)}
                            className="toggle-switch"
                        />
                    </div>

                    <div className="parametre-section">
                        <label>Déconnexion automatique (minutes d'inactivité) :</label>
                        <select value={autoLogout} onChange={(e) => setAutoLogout(Number(e.target.value))}>
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>60 minutes</option>
                            <option value={0}>Jamais</option>
                        </select>
                    </div>
                </div>

                <div className="footer-actions">
                    <button className="button-save" onClick={handleSave}>
                        💾 Sauvegarder les changements
                    </button>
                    {saved && <p className="success-msg">✅ Paramètres sauvegardés !</p>}
                </div>

            </div>
        </div>
    );
}