import React, { useRef, useState, useEffect, useCallback } from 'react';

const MamboLock = ({ onChange, size = 260 }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [path, setPath] = useState([]);

  // Initialisation des 9 points
  useEffect(() => {
    const padding = size * 0.13;
    const spacing = (size - padding * 2) / 2;
    const newNodes = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        newNodes.push({
          x: padding + col * spacing,
          y: padding + row * spacing,
          id: row * 3 + col
        });
      }
    }
    setNodes(newNodes);
  }, [size]);

  const getCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    setPath([]);
    handleMove(e);
  };

  const handleMove = (e) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    
    nodes.forEach((node) => {
      const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (dist < 25 && !path.includes(node.id)) {
        const newPath = [...path, node.id];
        setPath(newPath);
      }
    });
    draw(x, y);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (path.length > 0) onChange(path);
    draw();
  };

  // Enveloppé dans useCallback pour stabiliser la référence mémoire et éliminer le warning ESLint
  const draw = useCallback((curX, curY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    // Dessiner les lignes
    if (path.length > 0) {
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7407f086';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      const firstNode = nodes[path[0]];
      if (firstNode) {
        ctx.moveTo(firstNode.x, firstNode.y);
        
        for (let i = 1; i < path.length; i++) {
          const node = nodes[path[i]];
          if (node) ctx.lineTo(node.x, node.y);
        }
        
        if (curX && curY) ctx.lineTo(curX, curY);
        ctx.stroke();
      }
    }

    // Dessiner les points
    nodes.forEach((node) => {
      const active = path.includes(node.id);
      ctx.beginPath();
      ctx.arc(node.x, node.y, active ? 12 : 8, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#8c06fa' : '#e2e8f0';
      ctx.fill();
      if (active) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });
  }, [nodes, path, size]);

  // 'draw' est désormais une dépendance stable et sécurisée
  useEffect(() => {
    draw();
  }, [nodes, path, draw]);

  return (
    <div style={{ touchAction: 'none', display: 'flex', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onMouseDown={startDrawing}
        onMouseMove={handleMove}
        onMouseUp={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={handleMove}
        onTouchEnd={stopDrawing}
        style={{ cursor: 'crosshair', background: '#f8fafc', borderRadius: '20px' }}
      />
    </div>
  );
};

export default MamboLock;