import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export const useProducts = (category = null) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    
    // Récupérer uniquement les produits disponibles
    let q = query(
      collection(db, 'products'),
      where('isAvailable', '==', true)
    );

    // Filtrer par catégorie si spécifiée
    if (category) {
      q = query(q, where('categorie', '==', category));
    }

    // Écoute en temps réel
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const prods = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(prods);
        setLoading(false);
      }, 
      (err) => {
        console.error("Erreur useProducts:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [category]);

  return { products, loading, error };
};