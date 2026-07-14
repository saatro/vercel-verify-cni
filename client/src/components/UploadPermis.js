import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db, storage } from "../firebase";
import "./UploadPermis.css";

export default function UploadPermis({ onComplete }) {
  const [recto, setRecto] = useState(null);
  const [verso, setVerso] = useState(null);
  const [rectoPreview, setRectoPreview] = useState(null);
  const [versoPreview, setVersoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);

    if (type === "recto") {
      setRecto(file);
      setRectoPreview(preview);
    } else {
      setVerso(file);
      setVersoPreview(preview);
    }
    
    if (!auth.currentUser) {
  setError("Vous devez être connecté pour envoyer le permis.");
  return;
}

  };

  const handleUpload = async () => {
    if (!recto || !verso) {
      setError("Veuillez sélectionner les deux fichiers.");
      return;
    }

    if (!auth.currentUser) {
      setError("Utilisateur non connecté.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const uid = auth.currentUser.uid;

      const rectoExt = recto.name.split(".").pop();
      const versoExt = verso.name.split(".").pop();

      const rectoRef = ref(storage, `permis/${uid}_recto.${rectoExt}`);
      const versoRef = ref(storage, `permis/${uid}_verso.${versoExt}`);

      await uploadBytes(rectoRef, recto);
      await uploadBytes(versoRef, verso);

      const rectoURL = await getDownloadURL(rectoRef);
      const versoURL = await getDownloadURL(versoRef);

      await updateDoc(doc(db, "livreurs", uid), {
        permisRecto: rectoURL,
        permisVerso: versoURL,
        permisValidated: false
      });

      if (onComplete) onComplete();
    } catch (err) {
      console.error(err);
      if (err.code === "storage/unauthorized") {
        setError("Vous n'avez pas la permission d'uploader ce fichier.");
      } else {
        setError("Erreur lors de l'upload, réessayez.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-permis">
      <h2>Upload de votre permis de conduire</h2>

      {error && <p className="error">{error}</p>}

      <div className="file-inputs">
        <div>
          <label>Recto :</label>
          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, "recto")} />
          {rectoPreview && <img src={rectoPreview} alt="Prévisualisation recto" className="preview" />}
        </div>

        <div>
          <label>Verso :</label>
          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, "verso")} />
          {versoPreview && <img src={versoPreview} alt="Prévisualisation verso" className="preview" />}
        </div>
      </div>

      <button onClick={handleUpload} disabled={loading}>
        {loading ? "Upload..." : "Confirmer et envoyer"}
      </button>
    </div>
  );
}
