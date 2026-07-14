import { useEffect, useState } from "react";

export default function TestCORS() {
  const [status, setStatus] = useState("En cours...");

  useEffect(() => {
    const testFiles = async () => {
      try {
        // Remplace "test-file.jpg" par un fichier existant dans ton bucket
        const res = await fetch(
          "https://livraison-moto.firebasestorage.app/o/test-file.jpg?alt=media"
        );
        if (res.ok) {
          setStatus("✅ CORS OK! Le fichier est accessible.");
        } else {
          setStatus(`❌ Erreur: status ${res.status}`);
        }
      } catch (err) {
        setStatus("❌ Erreur fetch: " + err.message);
      }
    };
    testFiles();
  }, []);

  return <div style={{ padding: "20px" }}>Test CORS: {status}</div>;
}
