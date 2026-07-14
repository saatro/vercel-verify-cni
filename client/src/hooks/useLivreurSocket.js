import { useEffect, useState, useCallback } from "react";
import socket from "../socket";

/**
 * Hook pour suivre la position et le statut d'un livreur en temps réel
 * @param {object} currentOrder - La commande en cours
 * @returns {{ livreurPos: [number, number]|null, status: string, lastUpdate: Date|null, isConnected: boolean }}
 */
export default function useLivreurSocket(currentOrder) {
  const [state, setState] = useState({
    livreurPos: null,
    status: "en attente",
    lastUpdate: null,
    isConnected: false
  });

  // Gestionnaire de position
  const handlePosition = useCallback((data) => {
    if (!currentOrder) return;
    
    if (data.orderId === currentOrder.id) {
      console.log("📍 Position livreur mise à jour:", data.lat, data.lng);
      
      setState(prev => ({
        ...prev,
        livreurPos: [data.lat, data.lng],
        status: data.status || "en route",
        lastUpdate: new Date()
      }));
    }
  }, [currentOrder]);

  // Gestionnaire de livraison terminée
  const handleCompleted = useCallback((data) => {
    if (!currentOrder) return;
    
    if (data.orderId === currentOrder.id) {
      console.log("✅ Livraison terminée");
      
      setState(prev => ({
        ...prev,
        livreurPos: null,
        status: "livré",
        lastUpdate: new Date()
      }));
    }
  }, [currentOrder]);

  // Gestionnaire de statut de livraison
  const handleStatusUpdate = useCallback((data) => {
    if (!currentOrder) return;
    
    if (data.orderId === currentOrder.id) {
      console.log("📊 Statut mis à jour:", data.status);
      
      setState(prev => ({
        ...prev,
        status: data.status,
        lastUpdate: new Date()
      }));
    }
  }, [currentOrder]);

  // Gestionnaire de connexion Socket.IO
  const handleConnect = useCallback(() => {
    console.log("🔌 Socket connecté");
    setState(prev => ({ ...prev, isConnected: true }));
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log("🔌 Socket déconnecté");
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  const handleError = useCallback((error) => {
    console.error("❌ Erreur Socket:", error);
  }, []);

  useEffect(() => {
    // Si pas de commande, reset
    if (!currentOrder) {
      setState({
        livreurPos: null,
        status: "en attente",
        lastUpdate: null,
        isConnected: socket.connected
      });
      return;
    }

    console.log("🎧 Écoute socket pour la commande:", currentOrder.id);

    // S'abonner aux événements
    socket.on("livreurPosition", handlePosition);
    socket.on("deliveryCompleted", handleCompleted);
    socket.on("deliveryStatus", handleStatusUpdate);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("error", handleError);

    // Vérifier l'état de connexion initial
    setState(prev => ({ ...prev, isConnected: socket.connected }));

    // Rejoindre la room de la commande (si votre serveur le supporte)
    socket.emit("joinOrder", { orderId: currentOrder.id });

    // Cleanup
    return () => {
      console.log("🔇 Nettoyage socket pour la commande:", currentOrder.id);
      
      socket.off("livreurPosition", handlePosition);
      socket.off("deliveryCompleted", handleCompleted);
      socket.off("deliveryStatus", handleStatusUpdate);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("error", handleError);

      // Quitter la room (si applicable)
      socket.emit("leaveOrder", { orderId: currentOrder.id });
    };
  }, [currentOrder, handlePosition, handleCompleted, handleStatusUpdate, handleConnect, handleDisconnect, handleError]);

  return state;
}

/**
 * Hook simplifié (compatible avec votre code existant)
 * @param {object} currentOrder
 * @returns {{ livreurPos: [number, number]|null, status: string }}
 */
export function useLivreurSocketSimple(currentOrder) {
  const { livreurPos, status } = useLivreurSocket(currentOrder);
  return { livreurPos, status };
}

/**
 * Hook pour émettre la position du livreur (côté livreur)
 * @param {string} orderId - ID de la commande
 * @param {object} position - { lat, lng }
 * @param {number} interval - Intervalle d'envoi en ms (défaut: 5000)
 */
export function useEmitLivreurPosition(orderId, position, interval = 5000) {
  useEffect(() => {
    if (!orderId || !position || !socket.connected) return;

    // Fonction d'émission
    const emitPosition = () => {
      socket.emit("updatePosition", {
        orderId,
        lat: position.lat,
        lng: position.lng,
        timestamp: Date.now()
      });
    };

    // Émettre immédiatement
    emitPosition();

    // Puis à intervalle régulier
    const intervalId = setInterval(emitPosition, interval);

    return () => {
      clearInterval(intervalId);
    };
  }, [orderId, position, interval]);
}