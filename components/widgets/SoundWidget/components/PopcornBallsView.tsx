import React, { useRef, useEffect } from 'react';
import { POSTER_LEVELS } from '../constants';

export const PopcornBallsView: React.FC<{
  volume: number;
  width: number;
  height: number;
}> = ({ volume, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const balls = useRef<{ x: number; y: number; vy: number; color: string }[]>(
    []
  );

  // ⚡ Bolt Optimization: Use ref for volume to prevent loop recreation on every frame
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Handle resizing and ball re-initialization
  useEffect(() => {
    balls.current = []; // Reset balls on resize to reposition them
    for (let i = 0; i < 30; i++) {
      balls.current.push({
        x: Math.random() * width,
        y: height - 10,
        vy: 0,
        color:
          POSTER_LEVELS[Math.floor(Math.random() * POSTER_LEVELS.length)].color,
      });
    }
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const impulse = (volumeRef.current / 100) * (height * 0.1);

      balls.current.forEach((b) => {
        // Physics logic
        if (b.y >= height - 10 && impulse > 2) {
          b.vy = -impulse * (0.5 + Math.random());
        }
        b.vy += 0.5; // Gravity
        b.y += b.vy;

        if (b.y > height - 10) {
          b.y = height - 10;
          b.vy = 0;
        }

        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      animId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animId);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      width={width}
      height={height}
    />
  );
};
