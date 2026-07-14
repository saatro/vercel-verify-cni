import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db } from "../firebase";
import { toast } from "react-toastify";
import { 
  User, Mail, Phone, MapPin, Edit2, Save, X, 
  ChevronLeft, Camera, ShieldCheck, Clock, Award
} from "lucide-react";
import ClientFooter from "../components/ClientFooter";
import "./ProfilClient.css";

export default function ProfilClient() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    telephone: "",
    email: "",
    adresse: ""
  });

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigate("/acces");
          return;
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setFormData({
            nom: data.nom || "",
            prenom: data.prenom || "",
            telephone: data.telephone || "",
            email: data.email || "",
            adresse: data.adresse || ""
          });
        }

        setLoading(false);
      } catch (error) {
        console.error("Erreur chargement profil:", error);
        toast.error("Erreur lors du chargement du profil");
        setLoading(false);
      }
    };

    loadUserData();
  }, [navigate]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const user = auth.currentUser;

      // Mise à jour Firestore
      await updateDoc(doc(db, "users", user.uid), {
        nom: formData.nom,
        prenom: formData.prenom,
        telephone: formData.telephone,
        adresse: formData.adresse,
        nomComplet: `${formData.prenom} ${formData.nom}`
      });

      // Mise à jour du profil Firebase Auth
      await updateProfile(user, {
        displayName: `${formData.prenom} ${formData.nom}`
      });

      setUserData({
        ...userData,
        ...formData,
        nomComplet: `${formData.prenom} ${formData.nom}`
      });

      setIsEditing(false);
      toast.success("Profil mis à jour avec succès !");
    } catch (error) {
      console.error("Erreur sauvegarde:", error);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      nom: userData.nom || "",
      prenom: userData.prenom || "",
      telephone: userData.telephone || "",
      email: userData.email || "",
      adresse: userData.adresse || ""
    });
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="profil-loading">
        <div className="spinner-large"></div>
        <p>Chargement du profil...</p>
      </div>
    );
  }

  return (
    <div className="profil-client-page">
      {/* HEADER */}
      <div className="profil-header">
        <button onClick={() => navigate("/client-home")} className="back-btn">
          <ChevronLeft size={21} />
        </button>
        <h1>Mon Profil</h1>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} className="edit-btn">
            <Edit2 size={17} />
          </button>
        ) : (
          <button onClick={handleCancel} className="cancel-btn">
            <X size={17} />
          </button>
        )}
      </div>

      {/* PHOTO DE PROFIL */}
      <div className="profile-avatar-section">
        <div className="avatar-wrapper">
          <div className="avatar">
            {userData?.photoProfileURL ? (
              <img src={userData.photoProfileURL} alt="Profile" />
            ) : (
              <User size={30} />
            )}
          </div>
          {isEditing && (
            <button className="change-photo-btn">
              <Camera size={13} />
            </button>
          )}
        </div>
        <h2 className="profile-name">
          {userData?.nomComplet || userData?.nom || "Client"}
        </h2>
        <div className="profile-badge">
          <ShieldCheck size={14} />
          <span>Client Vérifié</span>
        </div>
      </div>

      {/* STATISTIQUES */}
      <div className="stats-grid">
        <div className="stat-card">
          <Clock size={20} />
          <div>
            <div className="stat-value">12</div>
            <div className="stat-label">Courses</div>
          </div>
        </div>
        <div className="stat-card">
          <Award size={20} />
          <div>
            <div className="stat-value">4.8</div>
            <div className="stat-label">Note</div>
          </div>
        </div>
      </div>

      {/* FORMULAIRE */}
      <div className="profile-form">
        <div className="form-section">
          <h3>Informations personnelles</h3>
          
          <div className="input-group">
            <label>
              <User size={13} />
              <span>Prénom</span>
            </label>
            <input
              type="text"
              value={formData.prenom}
              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              disabled={!isEditing}
              placeholder="Votre prénom"
            />
          </div>

          <div className="input-group">
            <label>
              <User size={16} />
              <span>Nom</span>
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              disabled={!isEditing}
              placeholder="Votre nom"
            />
          </div>

          <div className="input-group">
            <label>
              <Mail size={16} />
              <span>Email</span>
            </label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="disabled"
            />
            <small>L'email ne peut pas être modifié</small>
          </div>

          <div className="input-group">
            <label>
              <Phone size={16} />
              <span>Téléphone</span>
            </label>
            <input
              type="tel"
              value={formData.telephone}
              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
              disabled={!isEditing}
              placeholder="0700000000"
            />
          </div>

          <div className="input-group">
            <label>
              <MapPin size={16} />
              <span>Adresse</span>
            </label>
            <input
              type="text"
              value={formData.adresse}
              onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
              disabled={!isEditing}
              placeholder="Votre adresse"
            />
          </div>
        </div>

        {isEditing && (
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="save-btn"
          >
            {saving ? (
              <>
                <div className="spinner-small"></div>
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <Save size={20} />
                <span>Enregistrer les modifications</span>
              </>
            )}
          </button>
        )}
      </div>

      <ClientFooter />
    </div>
  );
}