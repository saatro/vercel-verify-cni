import React, { createContext, useContext, useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { toast } from "react-toastify";

// 1. CRÉATION DU CONTEXTE
const CartContext = createContext();

// 2. LE PROVIDER GLOBAL (CartProvider)
export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Écoute de l'état de connexion de l'utilisateur
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setCart([]);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Écoute en temps réel du panier Firestore de l'utilisateur connecté
  useEffect(() => {
    if (!user) return;

    const cartRef = doc(db, "carts", user.uid);
    const unsubscribeSnapshot = onSnapshot(
      cartRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setCart(docSnap.data().items || []);
        } else {
          setCart([]);
        }
        setLoading(false);
      },
      (error) => {
        console.warn("⚠️ Accès au panier Firestore restreint :", error.code);
        setLoading(false);
      }
    );

    return () => unsubscribeSnapshot();
  }, [user]);

  // Fonction pour ajouter un produit au panier (robuste et normalisée)
  const addToCart = async (product, quantity = 1) => {
    if (!user) {
      toast.error("Veuillez vous connecter pour ajouter des articles au panier.");
      return false;
    }
    const cartRef = doc(db, "carts", user.uid);
    try {
      const targetProductId = product.id || product.productId || product.uid || Math.random().toString(36).substring(7);
      const targetVendorId = product.vendorId || product.vendeurId || 'default';
      
      // Vérifier si le produit est déjà présent dans le panier
      const existingItemIndex = cart.findIndex(item => 
        (item.productId === targetProductId) || (item.id === targetProductId)
      );
      
      let updatedItems = [...cart];

      if (existingItemIndex > -1) {
        const currentQty = Number(updatedItems[existingItemIndex].quantity || updatedItems[existingItemIndex].quantite || 1);
        const newQty = currentQty + Number(quantity);
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: newQty,
          quantite: newQty
        };
      } else {
        const cleanProduct = {
          id: targetProductId,
          productId: targetProductId,
          nom: product.nom || product.title || product.name || "Article sans nom",
          prix: Number(product.prix || product.price || 0),
          image: product.image || product.imageUrl || product.photo || "",
          vendorId: targetVendorId,
          vendeurId: targetVendorId,
          type: product.type || "",
          categorie: product.categorie || product.category || "",
          nomBoutique: product.nomBoutique || product.storeName || "Boutique Partenaire",
          quantity: Number(quantity),
          quantite: Number(quantity)
        };
        updatedItems.push(cleanProduct);
      }

      await setDoc(cartRef, {
        items: updatedItems
      }, { merge: true });

      toast.success("Article ajouté au panier !");
      return true;
    } catch (error) {
      console.error("Erreur lors de l'ajout au panier:", error);
      toast.error("Erreur lors de l'ajout au panier.");
      return false;
    }
  };

  // Fonction pour retirer un produit du panier
  const removeFromCart = async (productToRemove) => {
    if (!user) return false;
    const cartRef = doc(db, "carts", user.uid);
    try {
      const targetId = productToRemove.productId || productToRemove.id;
      const updatedItems = cart.filter(item => 
        (item.productId !== targetId) && (item.id !== targetId)
      );

      await updateDoc(cartRef, {
        items: updatedItems
      });
      toast.info("Article retiré du panier.");
      return true;
    } catch (error) {
      console.error("Erreur lors de la suppression du produit:", error);
      return false;
    }
  };

  // Fonction pour vider le panier après paiement
  const clearCart = async () => {
    if (!user) return false;
    const cartRef = doc(db, "carts", user.uid);
    try {
      await updateDoc(cartRef, {
        items: []
      });
      return true;
    } catch (error) {
      console.error("Erreur lors du vidage du panier:", error);
      return false;
    }
  };

  const value = {
    cart,
    loading,
    addToCart,
    removeFromCart,
    clearCart
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart doit être utilisé à l'intérieur d'un CartProvider");
  }
  return context;
}