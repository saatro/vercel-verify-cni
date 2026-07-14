import { useEffect, useState } from "react";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";
import { app } from "./firebase"; // ton init Firebase

const db = getFirestore(app);

export default function AdminPanel() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "livraisons"), (snap) => {
      const data = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(data);
    });

    return () => unsub();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>🛠 Admin – Commandes Live</h1>

      {orders.map((o) => (
        <div key={o.id} style={{
          border: "1px solid #ddd",
          padding: 10,
          marginBottom: 10,
          borderRadius: 8
        }}>
          <p>📦 ID: {o.id}</p>
          <p>📍 Adresse: {o.address}</p>
          <p>📌 Statut: {o.status}</p>
          <p>🚚 Livreur: {o.livreurId || "Non assigné"}</p>
        </div>
      ))}
    </div>
  );
}
