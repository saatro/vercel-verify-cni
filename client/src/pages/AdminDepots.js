import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    updateDoc, 
    increment, 
    orderBy 
} from 'firebase/firestore';
import { CheckCircle, XCircle, Clock, Wallet, User, Hash, ArrowLeft, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminDepots() {
    const [deposits, setDeposits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedImg, setSelectedImg] = useState(null); // Pour agrandir l'image
    const navigate = useNavigate();

    useEffect(() => {
        const q = query(
            collection(db, "pending-deposit"), 
            where("status", "==", "en_attente"),
            orderBy("createdAt", "desc")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDeposits(docs);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    const handleAction = async (deposit, isApproved) => {
        // Confirmation avant action critique
        const confirmMsg = isApproved 
            ? `Voulez-vous ajouter ${deposit.montant} jetons à ${deposit.livreurNom} ?` 
            : "Voulez-vous rejeter ce dépôt ?";
        
        if (!window.confirm(confirmMsg)) return;

        try {
            const depositRef = doc(db, "pending-deposit", deposit.id);
            const userRef = doc(db, "users", deposit.livreurId);

            if (isApproved) {
                await updateDoc(userRef, {
                    soldeJetons: increment(deposit.montant)
                });
                
                await updateDoc(depositRef, { 
                    status: 'validé',
                    validatedAt: new Date()
                });
            } else {
                await updateDoc(depositRef, { status: 'refusé' });
            }
        } catch (error) {
            console.error("Erreur:", error);
            alert("Erreur lors de la validation. Vérifiez la console.");
        }
    };

    return (
        <div className="min-h-screen p-4 pb-20 font-sans bg-slate-50 text-slate-900">
            <div className="max-w-2xl mx-auto">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-6 text-sm font-bold transition-colors text-slate-500 hover:text-indigo-600">
                    <ArrowLeft size={18} /> Retour Dashboard
                </button>

                <header className="mb-8">
                    <h1 className="flex items-center gap-3 text-3xl italic font-black tracking-tighter uppercase">
                        <Wallet className="text-indigo-600" size={32} /> Validation Dépôts
                    </h1>
                    <p className="text-xs font-bold tracking-widest uppercase text-slate-400">Flux financier entrant</p>
                </header>

                {loading ? (
                    <div className="flex justify-center py-20"><div className="w-10 h-10 border-t-4 border-indigo-600 rounded-full animate-spin"></div></div>
                ) : deposits.length === 0 ? (
                    <div className="bg-white p-12 rounded-[40px] text-center shadow-sm border border-slate-100">
                        <Clock className="mx-auto mb-4 text-slate-200" size={60} />
                        <p className="italic font-bold text-slate-400">Aucun dépôt en attente</p>
                    </div>
                ) : (
                    <div className="grid gap-6">
                        {deposits.map((dep) => (
                            <div key={dep.id} className="bg-white overflow-hidden rounded-[35px] shadow-sm border border-slate-100 transition-all hover:shadow-md">
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 font-black text-indigo-600">
                                                <User size={16} />
                                                <span className="text-sm uppercase">{dep.livreurNom}</span>
                                            </div>
                                            <div className="text-4xl font-black tracking-tighter text-slate-900">
                                                {dep.montant.toLocaleString()} <span className="text-xs tracking-widest uppercase text-slate-400">Jetons</span>
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full text-slate-500 uppercase">
                                            {dep.createdAt?.toDate().toLocaleDateString()}
                                        </div>
                                    </div>

                                    {/* APERÇU DU REÇU (NOUVEAU) */}
                                    {dep.imageUrl && (
                                        <div 
                                            className="relative mb-4 overflow-hidden border cursor-pointer group rounded-2xl bg-slate-100 border-slate-200"
                                            onClick={() => setSelectedImg(dep.imageUrl)}
                                        >
                                            <img src={dep.imageUrl} alt="Reçu" className="object-cover w-full h-40 transition-opacity opacity-80 group-hover:opacity-100" />
                                            <div className="absolute inset-0 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 bg-black/20">
                                                <div className="p-2 text-indigo-600 bg-white rounded-full shadow-lg"><Eye size={20} /></div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 p-3 mb-5 border bg-slate-50 rounded-2xl border-slate-100">
                                        <Hash size={14} className="text-slate-400" />
                                        <code className="text-[11px] font-bold text-slate-500 truncate">REF: {dep.transactionId || dep.id}</code>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button 
                                            onClick={() => handleAction(dep, false)}
                                            className="flex items-center justify-center gap-2 py-4 text-xs font-black transition-all bg-slate-100 text-slate-400 rounded-2xl active:scale-95 hover:bg-red-50 hover:text-red-500"
                                        >
                                            <XCircle size={18} /> REJETER
                                        </button>
                                        <button 
                                            onClick={() => handleAction(dep, true)}
                                            className="flex items-center justify-center gap-2 py-4 text-xs font-black text-white transition-all bg-indigo-600 shadow-lg rounded-2xl shadow-indigo-200 active:scale-95 hover:bg-indigo-700"
                                        >
                                            <CheckCircle size={18} /> VALIDER LE DÉPÔT
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* MODALE IMAGE PLEIN ÉCRAN (NOUVEAU) */}
            {selectedImg && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 p-4 backdrop-blur-sm" onClick={() => setSelectedImg(null)}>
                    <div className="relative flex flex-col items-center w-full max-w-4xl">
                        <img src={selectedImg} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl border-4 border-white" alt="Recu plein ecran" />
                        <button className="px-8 py-3 mt-6 font-black bg-white rounded-full shadow-xl text-slate-900 active:scale-95">FERMER</button>
                    </div>
                </div>
            )}
        </div>
    );
}