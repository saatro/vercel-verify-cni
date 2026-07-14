import { auth } from "../../firebase";

const ADMIN_UID = "TON_UID_FIREBASE_ICI";

useEffect(() => {
  const loadSecure = async () => {
    if (!auth.currentUser) return;

    if (auth.currentUser.uid !== ADMIN_UID) {
      console.warn("Accès admin refusé");
      return;
    }

    const snap = await getDocs(collection(db, "pending_deposits"));
    setRecus(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  loadSecure();
}, []);
