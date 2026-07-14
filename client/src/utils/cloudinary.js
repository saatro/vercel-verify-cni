/**
 * Upload une image vers Cloudinary
 * @param {File} file - Le fichier image provenant d'un input file
 * @returns {Promise<string>} - L'URL sécurisée de l'image
 */
export const uploadToCloudinary = async (file) => {
  if (!file) {
    console.error("Cloudinary: Aucun fichier fourni");
    return null;
  }
  
  // Lecture des variables via process.env, avec secours manuel si non définies
  const CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || "dh157ll3x";
  const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || "mambo-images";
  
  const data = new FormData();
  data.append("file", file);
  data.append("upload_preset", UPLOAD_PRESET);
  
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, 
      {
        method: "POST",
        body: data
      }
    );
    
    const fileData = await response.json();
    
    if (!response.ok) {
      console.error("Erreur Cloudinary détaillée:", fileData);
      throw new Error(fileData.error?.message || "Erreur lors de la communication avec Cloudinary");
    }
    
    return fileData.secure_url;
  } catch (err) {
    console.error("Cloudinary Upload Error:", err);
    throw err;
  }
};