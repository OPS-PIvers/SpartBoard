import React, { useRef, useEffect, useState } from 'react';
import { POSTER_LEVELS } from '../constants';

/**
 * Bouncing-balls noise visualizer. Renders to a `<canvas>`, whose 2D drawing
 * buffer requires concrete pixel dimensions, so this component measures its own
 * container with a `ResizeObserver` rather than receiving pre-computed pixel
 * props. This keeps the canvas resolution in lock-step with the actual rendered
 * area (which the parent's `container-type: size` context governs) instead of
 * relying on the widget's stored dimensions minus a hard-coded header offset.
 */
export const PopcornBallsView: React.FC<{
  volume: number;
}> = ({ volume }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const balls = useRef<{ x: number; y: number; vy: number; color: string }[]>(
    []
  );

  // Mirror volume into a ref so the rAF render loop below (keyed only on
  // width/height) always reads the latest value without being torn down and
  // recreated on every volume change. Synced via an effect rather than a
  // bare render-body write because this repo's enabled `react-hooks/refs`
  // lint rule rejects mutating a ref during render. Matches the sibling
  // `sensitivityRef` pattern in SoundWidget/Widget.tsx.
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Measure the actual rendered canvas area. The container fills the widget
  // content region, so its size already excludes header/footer chrome — no
  // magic pixel subtraction required.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        setSize({ width: Math.round(w), height: Math.round(h) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Handle resizing and ball re-initialization
  useEffect(() => {
    if (width === 0 || height === 0) return;
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
    if (width === 0 || height === 0) return;
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
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        width={width}
        height={height}
      />
    </div>
  );
};
