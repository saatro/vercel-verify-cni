import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";

/**
 * Hook qui surveille si une course reste en "pending" trop longtemps
 * Si oui, propose des alternatives au client
 */
export const useNoCourseAvailable = (course) => {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [waitTime, setWaitTime] = useState(0);

  useEffect(() => {
    if (!course || course.status !== "pending") {
      setShowAlternatives(false);
      setWaitTime(0);
      return;
    }

    // Attendre 30 secondes avant de proposer des alternatives
    const timer = setTimeout(() => {
      console.log("⚠️ Aucun chauffeur trouvé après 30s - Proposition d'alternatives");
      setShowAlternatives(true);
    }, 30000); // 30 secondes

    // Compteur visuel
    const interval = setInterval(() => {
      setWaitTime(prev => prev + 1);
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [course]);

  const selectAlternative = async (newCourseData) => {
    try {
      const courseRef = doc(db, "courses", course.id);
      await updateDoc(courseRef, {
        courseMode: newCourseData.courseMode,
        vehicleType: newCourseData.vehicleType,
        price: newCourseData.price,
        updatedAt: new Date()
      });

      console.log("✅ Alternative sélectionnée:", newCourseData.courseMode);
      setShowAlternatives(false);
      setWaitTime(0);
    } catch (error) {
      console.error("❌ Erreur lors de la sélection d'alternative:", error);
    }
  };

  const cancelCourse = async () => {
    try {
      const courseRef = doc(db, "courses", course.id);
      await updateDoc(courseRef, {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: "Aucun chauffeur disponible"
      });

      console.log("🚫 Course annulée par le client");
      setShowAlternatives(false);
    } catch (error) {
      console.error("❌ Erreur lors de l'annulation:", error);
    }
  };

  return {
    showAlternatives,
    waitTime,
    selectAlternative,
    cancelCourse
  };
};

export default useNoCourseAvailable;  