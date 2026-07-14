// src/components/DeliveryOption.js
import "./DeliveryOption.css";

export default function DeliveryOption({ option, selected, onSelect }) {
  // Associer une icône selon l'option
  const getIcon = (id) => {
    switch (id) {
      case "moto":
        return "🏍️";
      case "cargo":
        return "🚚";
      case "fixe":
        return "⏱️";
      default:
        return "📦";
    }
  };

  return (
    <div
      className={`option-card ${selected ? "selected" : ""}`}
      onClick={() => onSelect(option.id)}
    >
      <div className="option-header">
        <span className="option-icon">{getIcon(option.id)}</span>
        <h3>{option.label}</h3>
      </div>
      <p>
        ⏱ {option.time} | 💰 {option.price}
      </p>
    </div>
  );
}
