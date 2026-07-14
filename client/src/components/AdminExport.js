import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from "../firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";

// Avant : import { FileSpreadsheet, Download, Loader } from 'lucide-react';
import { FileSpreadsheet, Loader } from 'lucide-react';
import { toast } from 'react-toastify';

const AdminExport = () => {
    const [isExporting, setIsExporting] = useState(false);

    const exportToExcel = async () => {
        setIsExporting(true);
        try {
            // 1. Récupérer uniquement les livraisons terminées
            const q = query(
                collection(db, "livraisons"),
                where("status", "==", "completed"),
                orderBy("createdAt", "desc")
            );
            
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                toast.info("Aucune donnée à exporter");
                setIsExporting(false);
                return;
            }

            // 2. Formater les données pour Excel
            const data = querySnapshot.docs.map(doc => {
                const item = doc.data();
                return {
                    "ID Commande": doc.id,
                    "Date": item.createdAt?.toDate().toLocaleDateString('fr-FR') || "N/A",
                    "Heure": item.createdAt?.toDate().toLocaleTimeString('fr-FR') || "N/A",
                    "Client": item.clientNom || "Inconnu",
                    "Livreur": item.livreurNom || "N/A",
                    "Destination": item.destination || "N/A",
                    "Montant (FCFA)": item.price || 0,
                    "Statut": "Terminé"
                };
            });

            // 3. Création du classeur Excel
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Livraisons");

            // 4. Téléchargement du fichier
            const fileName = `Rapport_Ventes_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            
            toast.success("Fichier Excel généré !");
        } catch (error) {
            console.error("Erreur export:", error);
            toast.error("Échec de l'exportation");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <button
            onClick={exportToExcel}
            disabled={isExporting}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg
                ${isExporting 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-emerald-200'}`}
        >
            {isExporting ? (
                <Loader className="w-5 h-5 animate-spin" />
            ) : (
                <FileSpreadsheet className="w-5 h-5" />
            )}
            {isExporting ? "Génération..." : "Exporter en Excel"}
        </button>
    );
};

export default AdminExport;