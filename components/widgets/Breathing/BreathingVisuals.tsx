import React from 'react';
import { BreathingConfig } from '../../../types';
import { BreathingPhase } from './useBreathing';

interface BreathingVisualsProps {
  visual: BreathingConfig['visual'];
  color: string;
  phase: BreathingPhase;
  progress: number;
  isActive: boolean;
}

export const BreathingVisuals: React.FC<BreathingVisualsProps> = ({
  visual,
  color,
  phase,
  progress,
  isActive,
}) => {
  const getScale = () => {
    if (!isActive && phase === 'ready') return 0.5;

    switch (phase) {
      case 'inhale':
        return 0.5 + 0.5 * progress;
      case 'hold1':
        return 1;
      case 'exhale':
        return 1 - 0.5 * progress;
      case 'hold2':
        return 0.5;
      default:
        return 0.5;
    }
  };

  const scale = getScale();

  const renderVisual = () => {
    switch (visual) {
      case 'circle': // Now renders as a 3D Sphere
        return (
          <div
            className="relative flex items-center justify-center w-full h-full max-w-[min(80vw,80vh)] max-h-[min(80vw,80vh)]"
            style={{ aspectRatio: '1/1' }}
          >
            <div
              className="absolute rounded-full transition-transform ease-linear"
              style={{
                width: '60%',
                height: '60%',
                background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${color} 40%, #000000 100%)`,
                boxShadow: `0 20px 40px -10px ${color}80, inset 0 -10px 20px rgba(0,0,0,0.5), inset 0 10px 20px rgba(255,255,255,0.8)`,
                transform: `scale(${scale * 1.5})`,
                transitionDuration: '50ms',
              }}
            />
          </div>
        );

      case 'lotus': {
        const numPetals = 8;
        return (
          <div
            className="relative flex items-center justify-center w-full h-full max-w-[min(80vw,80vh)] max-h-[min(80vw,80vh)]"
            style={{ aspectRatio: '1/1' }}
          >
            {Array.from({ length: numPetals }).map((_, i) => {
              const rotation = (360 / numPetals) * i;
              const expansion = isActive ? (scale - 0.5) * 2 : 0; // 0 to 1
              return (
                <div
                  key={i}
                  className="absolute transition-all ease-linear"
                  style={{
                    width: '30%',
                    height: '30%',
                    bottom: '50%',
                    left: '50%',
                    backgroundColor: color,
                    borderRadius: '50% 0 50% 0',
                    transformOrigin: 'bottom left',
                    opacity: 0.6,
                    transform: `rotate(${rotation + expansion * 15}deg) translate(${expansion * 15}%, -${expansion * 15}%) scale(${0.5 + expansion * 0.7})`,
                    transitionDuration: '50ms',
                    boxShadow: `0 0 15px ${color}40`,
                  }}
                />
              );
            })}
            <div
              className="absolute w-[20%] h-[20%] rounded-full transition-transform ease-linear z-10 shadow-lg"
              style={{
                backgroundColor: color,
                transform: `scale(${scale})`,
                transitionDuration: '50ms',
                background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${color} 50%, #000000 100%)`,
              }}
            />
          </div>
        );
      }

      case 'wave': // Now renders as Ripple
        return (
          <div
            className="relative flex items-center justify-center w-full h-full max-w-[min(80vw,80vh)] max-h-[min(80vw,80vh)]"
            style={{ aspectRatio: '1/1' }}
          >
            {[1, 2, 3].map((ring) => {
              const ringScale = scale * (1 + (ring - 1) * 0.4);
              const opacity = Math.max(
                0,
                0.8 - (ring - 1) * 0.25 - (isActive ? scale - 0.5 : 0)
              );
              return (
                <div
                  key={ring}
                  className="absolute rounded-full transition-all ease-linear border-[4px] md:border-[6px]"
                  style={{
                    width: '30%',
                    height: '30%',
                    borderColor: color,
                    opacity,
                    transform: `scale(${ringScale})`,
                    transitionDuration: '50ms',
                  }}
                />
              );
            })}
            <div
              className="absolute w-[20%] h-[20%] rounded-full transition-all ease-linear shadow-lg"
              style={{
                backgroundColor: color,
                transform: `scale(${scale})`,
                transitionDuration: '50ms',
                background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${color} 50%, #000000 100%)`,
              }}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {renderVisual()}
    </div>
  );
};
