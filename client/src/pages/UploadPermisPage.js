import UploadPermis from "../components/UploadPermis";
import { useNavigate } from "react-router-dom";

export default function UploadPermisPage() {
  const navigate = useNavigate();

  return (
    <div>
      <UploadPermis onComplete={() => navigate("/livreur-home")} />
    </div>
  );
}
