import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { FaPaperPlane, FaArrowLeft, FaInbox } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

export default function LivreurInbox() {
    const navigate = useNavigate();
    const currentUser = auth.currentUser;

    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Écoute en temps réel des messages in-app pour le livreur connecté
    useEffect(() => {
        if (!currentUser) {
            setLoading(false);
            return;
        }

        const messagesRef = collection(db, 'inAppMessages');
        const q = query(
            messagesRef,
            where('receiverId', '==', currentUser.uid),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setMessages(fetchedMessages);
            setLoading(false);

            // Marquer les messages comme lus automatiquement
            snapshot.docs.forEach(async (document) => {
                if (document.data().read === false) {
                    try {
                        await updateDoc(doc(db, 'inAppMessages', document.id), { read: true });
                    } catch (err) {
                        console.error("Erreur mise à jour lecture message :", err);
                    }
                }
            });
        }, (error) => {
            console.error("Erreur lors de la récupération des messages Livreur :", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || !currentUser) return;

        try {
            await addDoc(collection(db, 'inAppMessages'), {
                text: inputText,
                senderId: currentUser.uid,
                senderName: currentUser.displayName || 'Livreur',
                receiverId: 'support',
                read: false,
                createdAt: serverTimestamp()
            });
            setInputText('');
        } catch (error) {
            console.error("Erreur lors de l'envoi du message livreur :", error);
        }
    };

    return (
        <div className="flex flex-col h-screen max-w-2xl mx-auto shadow-xl bg-gray-50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white bg-blue-600 shadow-md">
                <button onClick={() => navigate(-1)} className="p-2 transition rounded-full hover:bg-blue-700">
                    <FaArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                    <FaInbox size={20} />
                    <h1 className="text-lg font-bold">Messagerie Livreur</h1>
                </div>
                <div className="w-8"></div>
            </div>

            {/* Corps des messages */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                {loading ? (
                    <p className="py-10 text-center text-gray-500">Chargement de vos messages...</p>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <FaInbox size={48} className="mb-2 opacity-30" />
                        <p>Aucun message pour le moment.</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderId === currentUser?.uid;

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow-sm ${
                                    isMe 
                                        ? 'bg-blue-600 text-white rounded-br-none' 
                                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                                }`}>
                                    {!isMe && (
                                        <span className="text-[10px] font-bold block text-blue-600 mb-1">
                                            {msg.senderName || 'Support / Admin'}
                                        </span>
                                    )}
                                    <p className="text-sm">{msg.text}</p>
                                    <span className={`text-[10px] block mt-1 text-right ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                                        {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'À l\'instant'}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Formulaire d'envoi */}
            <form onSubmit={handleSendMessage} className="flex gap-2 p-3 bg-white border-t border-gray-200">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Écrivez votre message..."
                    className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    type="submit"
                    className="flex items-center justify-center text-white transition bg-blue-600 rounded-full shadow-md w-11 h-11 hover:bg-blue-700"
                >
                    <FaPaperPlane size={14} />
                </button>
            </form>
        </div>
    );
}