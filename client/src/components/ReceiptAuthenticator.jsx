import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { Upload, Camera, DollarSign, Calendar, Landmark, CheckCircle, XCircle, RefreshCw, AlertTriangle, Package } from 'lucide-react';

// --- Configuration Firebase et Initialisation ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Chemin d'accès à la configuration de l'IA (clé API)
const AI_CONFIG_PATH = `/artifacts/${appId}/public/data/ai_config`;
const AI_CONFIG_DOC_ID = 'settings';
const configDocRef = doc(db, AI_CONFIG_PATH, AI_CONFIG_DOC_ID);

// Configuration du Modèle et de l'API
const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Schéma JSON pour l'extraction de données structurées
const RECEIPT_SCHEMA = {
    type: "OBJECT",
    properties: {
        "vendorName": { "type": "STRING", "description": "Le nom du vendeur ou du magasin (par exemple, 'Carrefour', 'Amazon')." },
        "transactionDate": { "type": "STRING", "description": "La date de la transaction au format YYYY-MM-DD." },
        "totalAmount": { "type": "NUMBER", "description": "Le montant total du reçu, taxes comprises. Doit être un nombre décimal." },
        "currency": { "type": "STRING", "description": "La devise du montant total (par exemple, 'EUR', 'USD')." },
        "isReceiptValid": { "type": "BOOLEAN", "description": "Vrai si l'image est clairement un reçu de vente valide, faux autrement (ex: capture d'écran d'une commande, ticket de caisse flou)." },
        "validationNotes": { "type": "STRING", "description": "Notes brèves sur la validité, y compris les informations manquantes ou les problèmes d'image." }
    },
    required: ["vendorName", "transactionDate", "totalAmount", "currency", "isReceiptValid"]
};

// --- Fonctions utilitaires ---

/**
 * Fonction de délai pour l'exponentielle backoff
 * @param {number} ms - millisecondes
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Lit un fichier image et le convertit en Base64.
 * @param {File} file - Le fichier image à lire.
 * @returns {Promise<{base64Data: string, mimeType: string}>}
 */
const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve({ base64Data: base64String, mimeType: file.type });
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

/**
 * Appelle l'API Gemini Vision avec l'image Base64 et le schéma JSON.
 */
const callGeminiVisionApi = async (base64ImageData, mimeType, apiKey) => {
    const userPrompt = "Veuillez analyser cette image de reçu de vente. Extrayez les données demandées et validez le document. Si le montant total est illisible, utilisez -1.";
    
    const payload = {
        contents: [{
            role: "user",
            parts: [
                { text: userPrompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64ImageData
                    }
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RECEIPT_SCHEMA
        },
    };

    let response;
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
        try {
            response = await fetch(`${API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429) { // Trop de requêtes
                retries++;
                const backoffTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
                await delay(backoffTime);
                continue;
            }

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const jsonText = candidate.content.parts[0].text;
                try {
                    // Le modèle est contraint de retourner du JSON
                    return JSON.parse(jsonText);
                } catch (e) {
                    throw new Error("L'IA n'a pas retourné le format JSON attendu.");
                }
            } else {
                throw new Error("La réponse de l'IA est vide ou structurée de manière inattendue.");
            }
        } catch (error) {
            console.error("Erreur lors de l'appel à l'API Gemini:", error);
            if (retries === maxRetries - 1) {
                throw new Error(`Échec de la communication après ${maxRetries} tentatives. (${error.message})`);
            }
            retries++;
            const backoffTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
            await delay(backoffTime);
        }
    }
    throw new Error("Toutes les tentatives d'appel à l'API Gemini ont échoué.");
};

/**
 * Composant principal de l'application d'authentification de reçus.
 */
const App = () => {
    // État d'authentification et de configuration
    const [apiKey, setApiKey] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [configStatus, setConfigStatus] = useState('Chargement de la configuration...');
    
    // État de l'application
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [ocrResult, setOcrResult] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);

    // 1. Authentification Firebase
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Utilisateur déjà authentifié
            } else {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Échec de l'authentification:", error);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // 2. Récupération de la Clé API depuis Firestore
    useEffect(() => {
        if (!isAuthReady) return;

        const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().ai_api_key) {
                setApiKey(docSnap.data().ai_api_key);
                setConfigStatus('Clé API Gemini chargée. Prêt pour l\'analyse d\'image.');
            } else {
                setApiKey(null);
                setConfigStatus("Clé API manquante. Veuillez la configurer.");
            }
        }, (error) => {
            console.error("Erreur d'écoute Firestore pour la clé API:", error);
            setConfigStatus("Erreur de connexion à la configuration Firestore.");
        });

        return () => unsubscribe();
    }, [isAuthReady]);

    // 3. Gestion de la sélection de fichier
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setOcrResult(null);
            setError(null);
        }
    };

    // 4. Gestion de l'analyse du reçu
    const handleAnalyzeReceipt = async () => {
        if (!apiKey) {
            setError("Impossible de contacter l'IA : Clé API manquante.");
            return;
        }
        if (!selectedFile) {
            setError("Veuillez sélectionner un fichier de reçu.");
            return;
        }

        setIsProcessing(true);
        setOcrResult(null);
        setError(null);

        try {
            const { base64Data, mimeType } = await fileToBase64(selectedFile);
            const result = await callGeminiVisionApi(base64Data, mimeType, apiKey);
            setOcrResult(result);
        } catch (err) {
            console.error(err);
            setError(err.message || "Une erreur inconnue est survenue lors de l'analyse.");
        } finally {
            setIsProcessing(false);
        }
    };

    // --- Composants de rendu ---

    const DataRow = ({ icon: Icon, label, value, isValidation = false }) => {
        const baseClasses = "flex items-center text-sm p-3 rounded-lg";
        let validationIcon = null;
        let validationClasses = "bg-gray-50 text-gray-700";

        if (isValidation) {
            if (value === true) {
                validationIcon = <CheckCircle className="w-5 h-5 mr-2 text-green-600" />;
                validationClasses = "bg-green-100 text-green-800 font-bold";
            } else if (value === false) {
                validationIcon = <XCircle className="w-5 h-5 mr-2 text-red-600" />;
                validationClasses = "bg-red-100 text-red-800 font-bold";
            }
        }
        
        const displayValue = isValidation ? (value === true ? 'OUI' : value === false ? 'NON' : 'N/A') : value;

        return (
            <div className={`${baseClasses} ${isValidation ? validationClasses : 'bg-white'}`}>
                {validationIcon || <Icon className="w-4 h-4 mr-3 text-indigo-500" />}
                <div className="flex justify-between w-full">
                    <span className="font-medium">{label} :</span>
                    <span className="ml-4 font-semibold text-right">{displayValue}</span>
                </div>
            </div>
        );
    };

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <RefreshCw className="w-6 h-6 mr-2 text-blue-500 animate-spin" />
                <p className="text-lg text-gray-700">Initialisation de l'application...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 font-sans bg-gray-50 sm:p-8">
            <header className="flex items-center justify-between p-4 mb-6 bg-white shadow-lg rounded-xl">
                <h1 className="flex items-center text-2xl font-extrabold text-indigo-700">
                    <Camera className="w-6 h-6 mr-2" />
                    Authentification de Reçus IA
                </h1>
                <div className="flex items-center text-xs text-gray-500">
                    {configStatus.includes('Clé API Gemini chargée') ? (
                        <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
                    ) : (
                        <AlertTriangle className="w-4 h-4 mr-1 text-orange-500 animate-pulse" />
                    )}
                    {configStatus}
                </div>
            </header>

            <div className="flex flex-col gap-6 lg:flex-row">
                {/* Volet Gauche: Téléchargement et Aperçu */}
                <div className="w-full p-6 space-y-4 bg-white shadow-lg lg:w-1/2 rounded-xl">
                    <h2 className="flex items-center mb-4 text-xl font-bold text-gray-800">
                        <Upload className="w-5 h-5 mr-2" />
                        Télécharger le Reçu
                    </h2>

                    <input
                        type="file"
                        accept="image/jpeg, image/png, image/webp"
                        id="receipt-upload"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <label 
                        htmlFor="receipt-upload" 
                        className="flex flex-col items-center justify-center w-full p-8 transition duration-150 border-2 border-indigo-300 border-dashed rounded-lg cursor-pointer hover:bg-indigo-50"
                    >
                        <Camera className="w-8 h-8 mb-2 text-indigo-500" />
                        <span className="font-semibold text-indigo-600">Cliquer pour sélectionner un reçu (JPG/PNG)</span>
                        <span className="mt-1 text-sm text-gray-500">{selectedFile ? `Fichier: ${selectedFile.name}` : 'Aucun fichier sélectionné'}</span>
                    </label>

                    {previewUrl && (
                        <div className="p-4 mt-4 border border-gray-200 rounded-lg bg-gray-50">
                            <h3 className="mb-2 font-medium text-gray-700">Aperçu du Reçu :</h3>
                            {/* [Image du reçu] */}
                            <img 
                                src={previewUrl} 
                                alt="Aperçu du reçu à analyser" 
                                className="w-full h-auto max-h-[400px] object-contain rounded-lg shadow-md border"
                            />
                        </div>
                    )}
                    
                    <button
                        onClick={handleAnalyzeReceipt}
                        disabled={!selectedFile || isProcessing || !apiKey}
                        className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-md text-white transition duration-200 ${
                            !selectedFile || isProcessing || !apiKey
                                ? 'bg-indigo-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                        }`}
                    >
                        {isProcessing ? (
                            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                        ) : (
                            <Package className="w-5 h-5 mr-2" />
                        )}
                        {isProcessing ? 'Analyse en cours...' : 'Analyser et Authentifier le Reçu'}
                    </button>
                    
                    {error && (
                        <div className="flex items-start p-4 text-red-700 bg-red-100 border border-red-300 rounded-lg">
                            <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                            <span className="font-medium">Erreur : {error}</span>
                        </div>
                    )}
                </div>

                {/* Volet Droit: Résultats de l'Analyse OCR/Validation */}
                <div className="w-full p-6 space-y-6 bg-white shadow-lg lg:w-1/2 rounded-xl">
                    <h2 className="flex items-center mb-4 text-xl font-bold text-gray-800">
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Résultats d'Authentification IA
                    </h2>
                    
                    {ocrResult ? (
                        <div className="space-y-3">
                            {/* Ligne de validation */}
                            <div className={`p-4 rounded-xl shadow-md transition-colors duration-300 ${
                                ocrResult.isReceiptValid ? 'bg-green-100 border-l-4 border-green-500' : 'bg-red-100 border-l-4 border-red-500'
                            }`}>
                                <DataRow 
                                    icon={ocrResult.isReceiptValid ? CheckCircle : XCircle} 
                                    label="STATUT D'AUTHENTIFICATION" 
                                    value={ocrResult.isReceiptValid} 
                                    isValidation={true} 
                                />
                            </div>

                            <DataRow icon={Landmark} label="Vendeur" value={ocrResult.vendorName || 'N/A'} />
                            <DataRow icon={Calendar} label="Date de Transaction" value={ocrResult.transactionDate || 'N/A'} />
                            <DataRow 
                                icon={DollarSign} 
                                label="Montant Total" 
                                value={
                                    ocrResult.totalAmount != null && ocrResult.totalAmount !== -1
                                    ? `${ocrResult.totalAmount.toFixed(2)} ${ocrResult.currency}` 
                                    : 'Illisible / Manquant'
                                } 
                            />
                            
                            {/* Notes de validation */}
                            {ocrResult.validationNotes && (
                                <div className="p-3 mt-4 border border-gray-200 rounded-lg bg-gray-50">
                                    <p className="text-sm font-medium text-gray-700">Notes d'Analyse :</p>
                                    <p className="mt-1 text-xs italic text-gray-600">{ocrResult.validationNotes}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-10 text-center text-gray-500 border-2 border-gray-300 border-dashed rounded-lg">
                            {isProcessing ? (
                                <p>Analyse en cours...</p>
                            ) : (
                                <p>Téléchargez une image de reçu pour démarrer l'analyse d'authentification par IA.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;