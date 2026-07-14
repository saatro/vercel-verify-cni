import { CheckCircle, Loader, XCircle, TrendingUp, DollarSign } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db, auth } from "../firebase"; 
import { 
  doc, onSnapshot, collection, updateDoc, 
  writeBatch, getDoc, query, orderBy 
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';

export default function AdminDashboardVerification() {
    const [rechargeRequests, setRechargeRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            if (user) setUserId(user.uid);
            else signInAnonymously(auth).catch(() => {});
        });
        
        const q = query(collection(db, "pending-deposit"), orderBy("createdAt", "desc"));
        const unsubSnap = onSnapshot(q, (snapshot) => {
            setRechargeRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        });

        return () => { unsub(); unsubSnap(); };
    }, []);

    const processValidation = async (req, isApproved) => {
        if (!isApproved) {
            const raison = window.prompt("Raison du refus :");
            if (raison === null) return;
            await updateDoc(doc(db, "pending-deposit", req.id), { 
                status: 'rejeté', 
                motifRefus: raison 
            });
            return;
        }

        const batch = writeBatch(db);
        const livreurRef = doc(db, "users", req.livreurId);
        const livreurSnap = await getDoc(livreurRef);

        if (!livreurSnap.exists()) return alert("Livreur introuvable");

        const nouveauSolde = Number(livreurSnap.data().solde || 0) + Number(req.montant);

        batch.update(doc(db, "pending-deposit", req.id), { status: 'validé' });
        batch.update(livreurRef, { solde: nouveauSolde });

        await batch.commit();
        setMessage("Dépôt validé avec succès !");
        setTimeout(() => setMessage(null), 3000);
    };

    if (isLoading) return <div className="p-20 text-center animate-pulse">Chargement des données...</div>;

    return (
        <div className="max-w-6xl p-8 mx-auto font-sans">
            <h1 className="flex items-center gap-3 mb-8 text-3xl font-black">
                <TrendingUp size={32} className="text-indigo-600" />
                Tableau Admin
            </h1>

            {message && <div className="p-4 mb-6 text-green-700 bg-green-100 rounded-lg shadow-sm">{message}</div>}

            <div className="grid gap-4">
                {rechargeRequests.map(req => (
                    <div key={req.id} className="flex items-center justify-between p-6 bg-white border shadow-sm rounded-2xl">
                        <div>
                            <p className="font-mono text-xs text-gray-400">ID: {req.id}</p>
                            <p className="text-lg font-bold">{req.montant} FCFA</p>
                            <span className={`text-xs font-bold uppercase ${req.status === 'validé' ? 'text-green-500' : req.status === 'rejeté' ? 'text-red-500' : 'text-orange-500'}`}>
                                {req.status}
                            </span>
                        </div>
                        
                        {req.status === 'en_attente' && (
                            <div className="flex gap-2">
                                <button onClick={() => processValidation(req, true)} className="p-3 text-white transition bg-green-500 rounded-full hover:bg-green-600">
                                    <CheckCircle size={20} />
                                </button>
                                <button onClick={() => processValidation(req, false)} className="p-3 text-white transition bg-red-500 rounded-full hover:bg-red-600">
                                    <XCircle size={20} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}