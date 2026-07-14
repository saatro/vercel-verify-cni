import { XCircleIcon } from "@heroicons/react/24/solid";
import { useNavigate } from "react-router-dom";
import SideMenu from "../components/SideMenu";
import "./Refuser.css";

export default function Refuser() {
  const navigate = useNavigate();

  return (
    <div className="page-fullscreen">
      <button className="button-back" onClick={() => navigate(-1)}>← Retour</button>
      <SideMenu />

      <div className="page-header">
        <h1><XCircleIcon className="icon danger" /> Mission Refusée</h1>
      </div>

      <div className="page-content">
        <p>Indiquez la raison du refus :</p>
        <textarea placeholder="Raison du refus" className="input-textarea"></textarea>
        <button className="danger-btn"><XCircleIcon className="icon" /> Envoyer</button>
      </div>
    </div>
  );
}
