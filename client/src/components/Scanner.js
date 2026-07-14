const handleFinalisationSequence = async (orderId, totalService) => {
  // 1. On informe le livreur qu'il doit vérifier le paiement
  // 2. On ouvre la modal de scan (via un état local par exemple)
  setOrderIdToFinalize(orderId);
  setShowWaveValidationModal(true);
};

// Dans ta fonction de succès du scan (onSuccess du hook useWaveScan)
const handleWaveSuccess = async (waveData) => {
  // Vérification que le montant du reçu correspond aux frais attendus
  if (waveData.amount < totalService) {
    showAlert("Le montant sur le reçu est inférieur aux frais de service !", "error");
    return;
  }

  try {
    setIsProcessing(true);
    const orderRef = doc(db, "orders", orderIdToFinalize);
    
    await updateDoc(orderRef, {
      status: "delivered", 
      deliveredAt: serverTimestamp(),
      serviceFeePaid: true,
      serviceFeeAmount: waveData.amount,
      waveTransactionId: waveData.transactionId, // On stocke l'ID Wave pour l'assistance
      finalizedBy: auth.currentUser.uid
    });
    
    // Fermeture des modaux et succès
    setShowWaveValidationModal(false);
    showAlert("✅ Livraison validée par reçu Wave !", "success");
    
    if (typeof confetti === 'function') confetti();
    
  } catch (error) {
    showAlert("Erreur lors de la mise à jour finale");
  } finally {
    setIsProcessing(false);
  }
};