import fs from "fs";

// Remplace le chemin par le fichier JSON que tu as téléchargé depuis Firebase
const serviceAccountPath = "./serviceAccountKey.json";

// Lire le fichier JSON
const raw = fs.readFileSync(serviceAccountPath, "utf8");
const json = JSON.parse(raw);

// Transformer la clé privée en format compatible .env
const privateKey = json.private_key.replace(/\n/g, "\\n");

// Afficher la ligne complète à copier dans ton .env
console.log(`FIREBASE_PRIVATE_KEY=${privateKey}`);
console.log(`FIREBASE_CLIENT_EMAIL=${json.client_email}`);
console.log(`FIREBASE_PROJECT_ID=${json.project_id}`);
