import React, { useLayoutEffect, useRef } from 'react';

const ITEM_HEIGHT = 48;
const VISIBLE_ROWS = 5;
const SETTLE_MS = 120;

interface WheelPickerProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

// iOS-style scroll wheel: swipe or drag to spin, the row that snaps to the center band is picked.
export const WheelPicker: React.FC<WheelPickerProps> = ({
  label,
  options,
  value,
  onChange,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const selectedIndex = Math.max(0, options.indexOf(value));

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = selectedIndex * ITEM_HEIGHT;
    return () => {
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
      }
    };
    // Position once on mount; after that the wheel's own scroll drives the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToIndex = (index: number) => {
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    scrollerRef.current?.scrollTo({
      top: clamped * ITEM_HEIGHT,
      behavior: 'smooth',
    });
    if (options[clamped] !== value) onChange(options[clamped]);
  };

  const handleScroll = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT))
      );
      if (options[index] !== value) onChange(options[index]);
    }, SETTLE_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      scrollToIndex(selectedIndex - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      scrollToIndex(selectedIndex + 1);
    }
  };

  return (
    <div
      className="relative w-24"
      style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 rounded-xl bg-slate-100 border border-slate-200 pointer-events-none"
        style={{ top: ITEM_HEIGHT * 2, height: ITEM_HEIGHT }}
      />
      <div
        ref={scrollerRef}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={selectedIndex}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuetext={value}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="relative h-full overflow-y-auto no-scrollbar snap-y snap-mandatory overscroll-contain touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 rounded-xl"
        style={{
          paddingBlock: ITEM_HEIGHT * 2,
          maskImage:
            'linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)',
        }}
      >
        {options.map((option, i) => (
          <div
            key={option}
            aria-hidden="true"
            onClick={() => scrollToIndex(i)}
            className={`snap-center flex items-center justify-center font-black tabular-nums select-none cursor-pointer transition-colors ${
              i === selectedIndex ? 'text-slate-800' : 'text-slate-400'
            }`}
            style={{ height: ITEM_HEIGHT, fontSize: 30 }}
          >
            {option}
          </div>
        ))}
      </div>
    </div>
  );
};
