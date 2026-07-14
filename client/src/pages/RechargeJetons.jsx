import { CheckCircle, DollarSign, Loader, Send, Wallet, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth, db } from "../firebase";
import { doc, onSnapshot, collection, addDoc, serverTimestamp, query, where } from "firebase/firestore";
import { uploadToCloudinary } from "../utils/cloudinary"; // Importation de votre utilitaire
import "./RechargeJetons.css";

export default function RechargeJetons() {
    const [amount, setAmount] = useState('');
    const [receiptFile, setReceiptFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState(null);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [isLoadingBalance, setIsLoadingBalance] = useState(true);
    const [pretEnCours, setPretEnCours] = useState(null);
    const [totalPretsApprouves, setTotalPretsApprouves] = useState(0);

    const user = auth.currentUser;

    // 1. Écoute du solde en temps réel
    useEffect(() => {
        if (!user) return;
        
        const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
            if (snap.exists()) {
                setCurrentBalance(snap.data().soldeJetons || 0);
            }
            setIsLoadingBalance(false);
        });

        return () => unsub();
    }, [user]);

    // 2. Écoute des prêts approuvés non remboursés
    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "prets"), 
            where("livreurId", "==", user.uid),
            where("status", "==", "approuve")
        );

        const unsub = onSnapshot(q, (snap) => {
            const prets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const total = prets.reduce((sum, p) => {
                const restant = p.montant - (p.montantRembourse || 0);
                return sum + restant;
            }, 0);
            
            setTotalPretsApprouves(total);
            
            if (prets.length > 0) {
                setPretEnCours({
                    total: total,
                    count: prets.length,
                    details: prets
                });
            } else {
                setPretEnCours(null);
            }
        });

        return () => unsub();
    }, [user]);

    const handleAmountChange = (e) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        setAmount(value);
        setMessage(null);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setReceiptFile(file);
            setMessage(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!user) {
            setMessage({ type: 'error', text: '❌ Connectez-vous pour continuer.' });
            return;
        }

        if (!amount || parseInt(amount) <= 0 || !receiptFile) {
            setMessage({ type: 'error', text: '⚠️ Montant et reçu obligatoires.' });
            return;
        }

        setIsSubmitting(true);
        setMessage({ type: 'loading', text: '⏳ Envoi sécurisé via Cloudinary...' });

        try {
            // Upload via Cloudinary
            const secureUrl = await uploadToCloudinary(receiptFile);

            // Enregistrement dans Firestore
            await addDoc(collection(db, "recharges"), {
                livreurId: user.uid,
                livreurNom: user.displayName || "Livreur",
                montant: parseInt(amount),
                recuURL: secureUrl,
                status: "en_attente",
                createdAt: serverTimestamp(),
                detteEnCours: totalPretsApprouves,
                hasDette: totalPretsApprouves > 0,
                pretsIds: pretEnCours?.details.map(p => p.id) || []
            });

            setMessage({
                type: 'success',
                text: pretEnCours 
                    ? `✅ Demande envoyée ! ${totalPretsApprouves} F seront déduits automatiquement.`
                    : `✅ Demande envoyée ! L'Admin validera après vérification du reçu.`,
            });

            setAmount('');
            setReceiptFile(null);
        } catch (error) {
            console.error(error);
            setMessage({ type: 'error', text: `❌ Erreur: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    const montantNet = pretEnCours ? Math.max(0, parseInt(amount || 0) - totalPretsApprouves) : parseInt(amount || 0);
    const isFormInvalid = !amount || isSubmitting || !user || !receiptFile;

    return (
        <div className="flex items-center justify-center min-h-screen p-4 font-sans bg-gray-50 md:p-8">
            <div className="w-full max-w-lg p-6 bg-white border border-indigo-100 shadow-2xl sm:p-8 rounded-xl">
                
                <header className="mb-8 text-center">
                    <Wallet className="w-10 h-10 mx-auto mb-2 text-indigo-600" />
                    <h2 className="text-3xl font-extrabold text-gray-900">Crédit Jetons</h2>
                    <p className="mt-1 text-sm text-gray-500">Envoyez votre reçu pour recharger votre compte.</p>
                </header>

                <div className="flex items-center justify-between p-4 mb-6 text-gray-700 border-l-4 border-indigo-500 rounded-lg bg-indigo-50">
                    <p className="text-sm font-medium">Mon Solde Actuel :</p>
                    {isLoadingBalance ? (
                        <Loader className="w-5 h-5 text-indigo-600 animate-spin" />
                    ) : (
                        <strong className="text-2xl font-bold text-indigo-700">{currentBalance} F</strong>
                    )}
                </div>

                {pretEnCours && (
                    <div className="p-4 mb-6 border-l-4 border-red-500 rounded-lg bg-red-50">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-red-800">
                                    Dette en cours : {totalPretsApprouves.toLocaleString()} F
                                </p>
                                <p className="mt-1 text-xs text-red-700">
                                    Ce montant sera automatiquement déduit de votre prochaine recharge.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-700">
                            Montant déposé (F CFA)
                        </label>
                        <div className="relative rounded-lg shadow-sm">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <DollarSign className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Ex: 5000"
                                value={amount}
                                onChange={handleAmountChange}
                                className="w-full py-3 pl-10 pr-4 font-mono text-lg border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>

                        {amount && pretEnCours && (
                            <div className="p-3 mt-3 space-y-2 border-l-4 border-orange-400 rounded-lg bg-orange-50">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Montant déposé :</span>
                                    <span className="font-bold text-gray-900">{parseInt(amount).toLocaleString()} F</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-red-600">Déduction dette :</span>
                                    <span className="font-bold text-red-700">-{totalPretsApprouves.toLocaleString()} F</span>
                                </div>
                                <div className="pt-2 border-t border-orange-200">
                                    <div className="flex justify-between">
                                        <span className="font-bold text-gray-700">Montant net :</span>
                                        <span className="text-xl font-black text-green-600">{montantNet.toLocaleString()} F</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-700">
                            Photo du Reçu
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        />
                        {receiptFile && (
                            <p className="mt-2 text-xs font-bold text-green-600">
                                ✓ Fichier sélectionné : {receiptFile.name}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isFormInvalid}
                        className="flex items-center justify-center w-full px-4 py-4 text-lg font-bold text-white transition-all bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader className="mr-2 animate-spin" /> : <Send className="mr-2" />}
                        {isSubmitting ? "Envoi..." : "Envoyer la preuve"}
                    </button>
                </form>

                {message && (
                    <div className={`mt-6 p-4 rounded-lg border-l-4 ${
                        message.type === 'error' 
                            ? 'bg-red-50 text-red-700 border-red-500' 
                            : message.type === 'loading'
                            ? 'bg-blue-50 text-blue-700 border-blue-500'
                            : 'bg-green-50 text-green-700 border-green-500'
                    }`}>
                        <p className="font-medium">{message.text}</p>
                    </div>
                )}
            </div>
        </div>
    );
}