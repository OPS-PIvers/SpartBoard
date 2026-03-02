with open("components/widgets/Breathing/BreathingWidget.tsx", "r") as f:
    content = f.read()

import re

# Find the start of controls div
start_idx = content.find("          {/* Controls */}")

if start_idx != -1:
    before = content[:start_idx]

    controls_div = """          {/* Controls */}
          <div className="shrink-0 p-4 w-full flex justify-center gap-4 bg-white/50 dark:bg-black/20 backdrop-blur-sm z-20">
            <button
              onClick={toggleActive}
              className={`flex items-center justify-center rounded-2xl transition-all shadow-md active:scale-95 ${
                isActive
                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  : 'bg-brand-blue-primary text-white shadow-brand-blue-primary/30 hover:bg-brand-blue-light'
              }`}
              style={{
                width: 'min(56px, 18cqmin)',
                height: 'min(56px, 18cqmin)',
              }}
              aria-label={isActive ? 'Pause' : 'Start'}
            >
              {isActive ? (
                <Pause
                  fill="currentColor"
                  style={{
                    width: 'min(24px, 7cqmin)',
                    height: 'min(24px, 7cqmin)',
                  }}
                />
              ) : (
                <Play
                  fill="currentColor"
                  style={{
                    width: 'min(24px, 7cqmin)',
                    height: 'min(24px, 7cqmin)',
                    marginLeft: 'min(4px, 1cqmin)',
                  }}
                />
              )}
            </button>
            <button
              onClick={reset}
              disabled={!isActive && progress === 0}
              className="flex items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: 'min(56px, 18cqmin)',
                height: 'min(56px, 18cqmin)',
              }}
              aria-label="Reset"
            >
              <RotateCcw
                style={{
                  width: 'min(24px, 7cqmin)',
                  height: 'min(24px, 7cqmin)',
                }}
              />
            </button>
          </div>
        </div>
      }
    />
  );
};
"""
    with open("components/widgets/Breathing/BreathingWidget.tsx", "w") as f:
        f.write(before + controls_div)
