import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import { MapPin, Loader2 } from "lucide-react";

export default function TrackingRural() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;

    // Écoute en temps réel de l'état de la course
    const unsubscribe = onSnapshot(doc(db, "courses", courseId), (doc) => {
      if (doc.exists()) {
        setCourse({ id: doc.id, ...doc.data() });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [courseId]);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="tracking-rural-container">
      <header className="p-4 bg-white shadow-sm">
        <h1 className="text-xl font-bold">Suivi de Course Rural</h1>
        <p className="text-sm text-gray-500">Zone : {course?.specificZoneId?.toUpperCase()}</p>
      </header>

      <div className="p-4 space-y-4">
        <div className="p-4 bg-white shadow-md rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="text-blue-500" />
            <div>
              <p className="text-xs text-gray-400">DESTINATION</p>
              <p className="font-semibold">{course?.dropoffAddress}</p>
            </div>
          </div>
          
          <div className="pt-4 mt-4 border-t">
            <p className="text-sm font-bold">Statut : 
              <span className={course?.status === "accepted" ? "text-green-600" : "text-orange-500"}>
                {" "}{course?.status?.toUpperCase()}
              </span>
            </p>
          </div>
        </div>

        {course?.status === "pending" && (
          <div className="p-4 text-sm text-blue-700 border border-blue-200 rounded-lg bg-blue-50">
            ⏳ Recherche de votre chauffeur dans la zone {course?.specificZoneId}...
          </div>
        )}
      </div>
    </div>
  );
}