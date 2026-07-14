import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from "../firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { FileText, Loader } from 'lucide-react';
import { toast } from 'react-toastify';

const AdminExportPDF = () => {
    const [isExporting, setIsExporting] = useState(false);

    const generatePDF = async () => {
        setIsExporting(true);
        try {
            // 1. Récupération des données Firestore
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

            // 2. Initialisation du PDF
            const doc = new jsPDF();
            const dateStr = new Date().toLocaleDateString('fr-FR');

            // --- EN-TÊTE DU PDF ---
            doc.setFontSize(20);
            doc.setTextColor(79, 70, 229); // Couleur Indigo
            doc.text("RAPPORT DE LIVRAISONS", 14, 22);
            
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Généré le : ${dateStr}`, 14, 30);
            doc.text("Système de Gestion de Livraisons v2.0", 14, 35);

            // 3. Préparation des lignes du tableau
            const tableRows = [];
            let totalCA = 0;

            querySnapshot.docs.forEach(doc => {
                const item = doc.data();
                const montant = Number(item.price) || 0;
                totalCA += montant;

                const rowData = [
                    doc.id.substring(0, 8), // ID court
                    item.createdAt?.toDate().toLocaleDateString('fr-FR') || "N/A",
                    item.livreurNom || "N/A",
                    item.destination || "N/A",
                    `${montant.toLocaleString()} F`
                ];
                tableRows.push(rowData);
            });

            // --- AJOUT DU TABLEAU ---
            autoTable(doc, {
                startY: 45,
                head: [['ID', 'Date', 'Livreur', 'Destination', 'Montant']],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229], fontSize: 10 },
                styles: { fontSize: 9 },
                margin: { top: 45 },
            });

            // --- RÉSUMÉ FINAL ---
            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.setFont(undefined, 'bold');
            doc.text(`TOTAL CHIFFRE D'AFFAIRES : ${totalCA.toLocaleString()} FCFA`, 14, finalY);

            // 4. Sauvegarde
            doc.save(`Rapport_Activite_${dateStr.replace(/\//g, '-')}.pdf`);
            toast.success("Rapport PDF téléchargé !");

        } catch (error) {
            console.error("Erreur PDF:", error);
            toast.error("Échec de la génération PDF");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <button
            onClick={generatePDF}
            disabled={isExporting}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg
                ${isExporting 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-red-200'}`}
        >
            {isExporting ? <Loader className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            {isExporting ? "Création..." : "Exporter en PDF"}
        </button>
    );
};

export default AdminExportPDF;