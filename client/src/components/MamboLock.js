import React, { useState, useEffect, useRef } from "react";
import "../pages/LoginClient.css"; // Correction du chemin d'import du CSS

export default function MamboLock({ onChange, loading, size = 150 }) {
  const [dots, setDots] = useState([]);
  const [currentLine, setCurrentLine] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const containerRef = useRef(null);

  // Initialisation des 9 points de la grille 3x3
  const gridDots = [
    { id: 1, x: 25, y: 25 },
    { id: 2, x: 75, y: 25 },
    { id: 3, x: 125, y: 25 },
    { id: 4, x: 25, y: 75 },
    { id: 5, x: 75, y: 75 },
    { id: 6, x: 125, y: 75 },
    { id: 7, x: 25, y: 125 },
    { id: 8, x: 75, y: 125 },
    { id: 9, x: 125, y: 125 },
  ];

  // Gestion des événements tactiles et souris avec { passive: false } pour éviter l'avertissement preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventDefaultTouch = (e) => {
      if (isDrawing) {
        e.preventDefault();
      }
    };

    container.addEventListener("touchmove", preventDefaultTouch, { passive: false });
    return () => {
      container.removeEventListener("touchmove", preventDefaultTouch);
    };
  }, [isDrawing]);

  const getDotFromCoordinates = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    for (let dot of gridDots) {
      const distance = Math.hypot(dot.x - x, dot.y - y);
      if (distance < 25) {
        return dot.id;
      }
    }
    return null;
  };

  const handleStart = (id, clientX, clientY) => {
    if (loading) return;
    setIsDrawing(true);
    setDots([id]);
    onChange([id]);
    
    const rect = containerRef.current.getBoundingClientRect();
    const dot = gridDots.find((d) => d.id === id);
    if (dot) {
      setCurrentLine({ x1: dot.x, y1: dot.y, x2: clientX - rect.left, y2: clientY - rect.top });
    }
  };

  const handleMove = (clientX, clientY) => {
    if (!isDrawing || loading) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const lastDotId = dots[dots.length - 1];
    const lastDot = gridDots.find((d) => d.id === lastDotId);

    if (lastDot) {
      setCurrentLine({ x1: lastDot.x, y1: lastDot.y, x2: x, y2: y });
    }

    const hitDotId = getDotFromCoordinates(clientX, clientY);
    if (hitDotId && !dots.includes(hitDotId)) {
      const newDots = [...dots, hitDotId];
      setDots(newDots);
      onChange(newDots);
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setCurrentLine(null);
  };

  return (
    <div 
      ref={containerRef}
      className="mambo-lock-container"
      style={{ width: size, height: size, position: "relative", touchAction: "none" }}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchEnd={handleEnd}
    >
      <svg className="mambo-svg-lines" style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
        {/* Lignes déjà validées */}
        {dots.map((dotId, index) => {
          if (index === 0) return null;
          const prevDot = gridDots.find((d) => d.id === dots[index - 1]);
          const currDot = gridDots.find((d) => d.id === dotId);
          if (!prevDot || !currDot) return null;
          return (
            <line 
              key={index}
              x1={prevDot.x}
              y1={prevDot.y}
              x2={currDot.x}
              y2={currDot.y}
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}

        {/* Ligne active en cours de tracé */}
        {currentLine && isDrawing && (
          <line 
            x1={currentLine.x1}
            y1={currentLine.y1}
            x2={currentLine.x2}
            y2={currentLine.y2}
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Points de la grille */}
      {gridDots.map((dot) => {
        const isSelected = dots.includes(dot.id);
        return (
          <div
            key={dot.id}
            className={`mambo-dot ${isSelected ? "selected" : ""}`}
            style={{
              position: "absolute",
              left: dot.x - 6,
              top: dot.y - 12,
              width: 21,
              height: 21,
              borderRadius: "34%",
              background: isSelected ? "#10b981" : "rgba(255, 255, 255, 0.2)",
              border: "1px solid #10b981",
              cursor: "pointer",
              transition: "background 0.2s, transform 0.2s",
              transform: isSelected ? "scale(1.2)" : "scale(1)"
            }}
            onMouseDown={(e) => handleStart(dot.id, e.clientX, e.clientY)}
            onMouseEnter={(e) => {
              if (isDrawing) handleMove(e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              handleStart(dot.id, touch.clientX, touch.clientY);
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              handleMove(touch.clientX, touch.clientY);
            }}
          />
        );
      })}
    </div>
  );
}