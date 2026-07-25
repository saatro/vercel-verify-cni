/**
 * Upload une image ou une chaîne Data URI vers Cloudinary
 * @param {File|Blob|string} file - Le fichier image ou la chaîne Data URI
 * @returns {Promise<string>} - L'URL sécurisée de l'image
 */
export const uploadToCloudinary = async (file) => {
  if (!file) {
    console.error("Cloudinary: Aucun fichier fourni");
    return null;
  }
  
  // Si c'est déjà une URL distante Cloudinary/Web, inutile de ré-uploader
  if (typeof file === 'string' && file.startsWith('http')) {
    return file;
  }
  
  // Extraction du fichier si c'est un objet enveloppé (ex: { file: File })
  const fileToUpload = file.file || file.raw || file;
  
  const CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || "dh157ll3x";
  const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || "mambo-images";
  
  const data = new FormData();
  data.append("file", fileToUpload);
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