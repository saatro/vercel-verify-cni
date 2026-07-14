import React, { createContext, useContext, useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

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

  // Fonction pour ajouter un produit au panier
  const addToCart = async (product, quantity = 1) => {
    if (!user) return false;
    const cartRef = doc(db, "carts", user.uid);
    try {
      const targetProductId = product.id || product.productId || Math.random().toString(36).substring(7);
      
      // Vérifier si le produit est déjà présent dans le panier local pour ajuster la quantité
      const existingItemIndex = cart.findIndex(item => item.productId === targetProductId);
      
      let updatedItems = [...cart];

      if (existingItemIndex > -1) {
        // ── ALTERNATIVE PROFESSIONNELLE DE QUANTITÉ ───────────────────────────
        // Si le produit existe déjà, on incrémente sa quantité au lieu de laisser
        // arrayUnion bloquer l'action en doublon.
        const currentQty = Number(updatedItems[existingItemIndex].quantity || 1);
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: currentQty + Number(quantity)
        };
      } else {
        // Si c'est un nouveau produit, on crée sa structure propre
        const cleanProduct = {
          id: targetProductId, // Doublé par sécurité pour la lecture dans StorePage
          productId: targetProductId,
          nom: product.nom || "Article sans nom",
          prix: Number(product.prix) || 0,
          image: product.image || product.imageUrl || "",
          vendorId: product.vendorId || null,
          type: product.type || "",
          categorie: product.categorie || "",
          nomBoutique: product.nomBoutique || "",
          quantity: Number(quantity)
        };
        updatedItems.push(cleanProduct);
      }

      // Envoi du tableau complet mis à jour à Firestore
      await setDoc(cartRef, {
        items: updatedItems
      }, { merge: true });

      return true;
    } catch (error) {
      console.error("Erreur lors de l'ajout au panier:", error);
      return false;
    }
  };

  // Fonction pour retirer un produit du panier
  const removeFromCart = async (productToRemove) => {
    if (!user) return false;
    const cartRef = doc(db, "carts", user.uid);
    try {
      // Filtrage par ID pour éviter les problèmes de suppression d'objets Firestore arrayRemove
      const updatedItems = cart.filter(item => 
        (item.productId !== productToRemove.productId) && (item.productId !== productToRemove.id)
      );

      await updateDoc(cartRef, {
        items: updatedItems
      });
      return true;
    } catch (error) {
      console.error("Erreur lors de la suppression du produit:", error);
      return false;
    }
  };

  // Fonction nécessaire pour le fonctionnement de CartPage.js après le paiement
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

  // Valeurs partagées à travers l'application
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

// 3. HOOK PERSONNALISÉ (useCart)
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart doit être utilisé à l'intérieur d'un CartProvider");
  }
  return context;
}