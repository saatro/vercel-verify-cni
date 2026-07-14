import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle, ArrowRight } from 'lucide-react';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use'; // Optionnel: npm install react-use

export default function RecapCourse() {
    const navigate = useNavigate();
    const { width, height } = useWindowSize();
    const [stats, setStats] = useState(null);
    const orderId = sessionStorage.getItem("lastLivraisonId");

    useEffect(() => {
        const fetchLastOrder = async () => {
            if (!orderId) {
                // Si pas d'ID, on redirige après un court instant
                setTimeout(() => navigate('/livreur-home'), 2000);
                return;
            }
            
            try {
                const snap = await getDoc(doc(db, "livraisons", orderId));
                if (snap.exists()) {
                    setStats(snap.data());
                } else {
                    navigate('/livreur-home');
                }
            } catch (error) {
                console.error("Erreur recap:", error);
            }
        };
        fetchLastOrder();
    }, [orderId, navigate]);

    // Nettoyage de la session quand on quitte la page
    const handleFinish = () => {
        sessionStorage.removeItem("lastLivraisonId");
        navigate('/livreur-home');
    };

    if (!stats) return (
        <div className="flex items-center justify-center min-h-screen font-bold text-gray-500">
            Chargement du résumé...
        </div>
    );

    // Sécurité pour les calculs
    const prixTotal = stats.price || 0;
    const commission = stats.commissionPrelevee || (prixTotal * 0.10); // 10% par défaut si absent
    const gainNet = prixTotal - commission;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-green-50">
            {/* Confetti s'adapte à la taille de l'écran */}
            <Confetti width={width} height={height} recycle={false} numberOfPieces={300} gravity={0.2} />
            
            <div className="w-full max-w-md p-8 bg-white shadow-2xl rounded-3xl">
                <div className="flex justify-center mb-6">
                    <div className="p-3 bg-green-100 rounded-full">
                        <CheckCircle className="text-green-500" size={60} />
                    </div>
                </div>

                <h1 className="mb-2 text-3xl font-black text-gray-800">Beau travail !</h1>
                <p className="mb-8 text-gray-500">La mission est terminée. Voici le détail de vos revenus pour cette course.</p>

                <div className="mb-8 overflow-hidden border border-gray-100 rounded-2xl">
                    {/* Prix Course */}
                    <div className="flex items-center justify-between p-4 bg-white">
                        <span className="font-medium text-gray-600">Prix de la course</span>
                        <span className="font-bold text-gray-900">{prixTotal.toLocaleString()} F</span>
                    </div>
                    
                    {/* Commission */}
                    <div className="flex items-center justify-between p-4 bg-red-50">
                        <span className="font-medium text-red-600">Commission Service (10%)</span>
                        <span className="font-bold text-red-600">-{commission.toLocaleString()} F</span>
                    </div>

                    {/* Gain Net */}
                    <div className="flex items-center justify-between p-5 bg-green-600">
                        <span className="text-lg font-bold text-white">Votre Gain Net</span>
                        <span className="text-2xl font-black text-white">{gainNet.toLocaleString()} F</span>
                    </div>
                </div>

                <button 
                    onClick={handleFinish}
                    className="flex items-center justify-center w-full gap-3 py-5 text-lg font-bold text-white transition-all transform bg-gray-900 shadow-lg rounded-2xl hover:bg-black active:scale-95"
                >
                    REPRENDRE LE TRAVAIL <ArrowRight size={22} />
                </button>
            </div>
            
            <p className="mt-8 text-sm text-gray-400">ID Mission: {orderId}</p>
        </div>
    );
}