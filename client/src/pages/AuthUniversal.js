import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { uploadToCloudinary } from "../utils/cloudinary"; // Import de votre utilitaire
import "./FormInscription.css";

export default function AuthUniversal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role") || "client";
  const [role, setRole] = useState(roleParam);

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [form, setForm] = useState({ nom: "", email: "", telephone: "", motdepasse: "" });
  const [recto, setRecto] = useState(null);
  const [verso, setVerso] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  /* ================= LOGIN ================= */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, form.email, form.motdepasse);
      const docSnap = await getDoc(doc(db, role === "client" ? "clients" : "livreurs", userCred.user.uid));
      if (docSnap.exists()) {
        navigate(role === "client" ? "/client-home" : "/livreur-home");
      } else {
        setErrorMsg("Utilisateur non trouvé.");
      }
    } catch { setErrorMsg("Email ou mot de passe incorrect."); }
    finally { setLoading(false); }
  };

  /* ================= REGISTER ================= */
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (role === "livreur" && (!recto || !verso)) {
        setErrorMsg("Veuillez uploader les deux côtés du permis.");
        setLoading(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, form.email, form.motdepasse);
      const user = cred.user;

      await setDoc(doc(db, role === "client" ? "clients" : "livreurs", user.uid), {
        uid: user.uid,
        nom: form.nom,
        email: form.email,
        telephone: form.telephone || "",
        role,
        createdAt: new Date(),
        permisValidated: role === "livreur" ? false : undefined,
      });

      // Uploads via Cloudinary
      if (role === "livreur") {
        const [urlRecto, urlVerso] = await Promise.all([
          uploadToCloudinary(recto),
          uploadToCloudinary(verso)
        ]);

        await updateDoc(doc(db, "livreurs", user.uid), {
          permisRecto: urlRecto,
          permisVerso: urlVerso,
        });
      }

      navigate(role === "client" ? "/client-home" : "/livreur-home");
    } catch (err) {
      setErrorMsg(err.code === "auth/email-already-in-use" ? "Email déjà utilisé." : err.message);
    } finally { setLoading(false); }
  };

  /* ================= GOOGLE & RESET ================= */
  // ... (Garder handleGoogle et handleResetPassword inchangés)

  return (
    <div className="inscription-page compact-form">
      <h1>{mode === "login" ? `Connexion ${role}` : `Inscription ${role}`}</h1>
      {/* ... reste du rendu identique ... */}
    </div>
  );
}