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
      case 'circle':
        return (
          <div
            className="relative flex items-center justify-center w-full h-full max-w-[min(80vw,80vh)] max-h-[min(80vw,80vh)]"
            style={{ aspectRatio: '1/1' }}
          >
            <div
              className="absolute w-[120%] h-[120%] rounded-full transition-transform ease-linear"
              style={{
                backgroundColor: `${color}33`,
                transform: `scale(${scale})`,
                transitionDuration: '50ms',
              }}
            />
            <div
              className="absolute w-[90%] h-[90%] rounded-full transition-transform ease-linear"
              style={{
                backgroundColor: `${color}80`,
                transform: `scale(${scale})`,
                transitionDuration: '50ms',
              }}
            />
            <div
              className="absolute w-[60%] h-[60%] rounded-full transition-transform ease-linear shadow-lg"
              style={{
                backgroundColor: color,
                transform: `scale(${scale})`,
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
                  className="absolute w-[15%] h-[40%] rounded-full transition-all ease-linear origin-bottom mix-blend-multiply opacity-80"
                  style={{
                    backgroundColor: color,
                    transform: `rotate(${rotation + expansion * 45}deg) translateY(-${10 + expansion * 30}%) scaleY(${0.8 + expansion * 0.4})`,
                    transitionDuration: '50ms',
                  }}
                />
              );
            })}
            <div
              className="absolute w-[25%] h-[25%] rounded-full transition-transform ease-linear z-10"
              style={{
                backgroundColor: `${color}ee`,
                transform: `scale(${scale})`,
                transitionDuration: '50ms',
              }}
            />
          </div>
        );
      }

      case 'wave':
        return (
          <div className="relative flex items-end justify-center w-full h-full overflow-hidden">
            <div
              className="absolute bottom-0 w-[200%] h-[200%] transition-transform ease-linear opacity-50"
              style={{
                backgroundColor: color,
                borderRadius: '45%',
                transform: `translateY(${100 - scale * 100}%) rotate(${progress * 360}deg)`,
                transitionDuration: '50ms',
              }}
            />
            <div
              className="absolute bottom-0 w-[200%] h-[200%] transition-transform ease-linear opacity-50"
              style={{
                backgroundColor: `${color}cc`,
                borderRadius: '43%',
                transform: `translateY(${100 - scale * 90}%) rotate(${-progress * 360}deg)`,
                transitionDuration: '50ms',
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
