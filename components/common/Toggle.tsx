import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  id?: string;
  /**
   * Tailwind class for the active background color.
   * Defaults to 'bg-brand-blue-primary'.
   */
  activeColor?: string;
  /**
   * Whether to show "ON" and "OFF" labels inside the toggle.
   * Defaults to true.
   */
  showLabels?: boolean;
  /**
   * Visual style variant.
   * 'standard' - Opaque background (default)
   * 'transparent' - Semi-transparent background for dark containers
   */
  variant?: 'standard' | 'transparent';
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  className = '',
  size = 'md',
  activeColor = 'bg-brand-blue-primary',
  showLabels = true,
  variant = 'standard',
  id,
}) => {
  const sizes = {
    xs: {
      button: 'w-8 h-4',
      knob: 'w-3 h-3',
      translate: 'translate-x-4',
      padding: 'top-0.5 left-0.5',
    },
    sm: {
      button: 'w-10 h-5',
      knob: 'w-3 h-3',
      translate: 'translate-x-5',
      padding: 'top-1 left-1',
    },
    md: {
      button: 'w-11 h-6',
      knob: 'w-4 h-4',
      translate: 'translate-x-5',
      padding: 'top-1 left-1',
    },
  };

  const currentSize = sizes[size];
  const inactiveColor =
    variant === 'transparent' ? 'bg-white/30' : 'bg-slate-300';

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        ${currentSize.button}
        rounded-full relative transition-all duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue-primary
        ${checked ? activeColor : inactiveColor}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
        flex-shrink-0
      `}
    >
      {/* State Labels */}
      {showLabels && (
        <span className="absolute inset-0 flex items-center justify-between px-1.5 pointer-events-none select-none">
          <span
            className={`text-xxxs font-black leading-none text-white transition-opacity duration-200 ${
              checked ? 'opacity-100' : 'opacity-0'
            }`}
          >
            ON
          </span>
          <span
            className={`text-xxxs font-black leading-none transition-opacity duration-200 ${
              variant === 'transparent' ? 'text-white' : 'text-slate-900'
            } ${!checked ? 'opacity-100' : 'opacity-0'}`}
          >
            OFF
          </span>
        </span>
      )}

      <span
        className={`
          absolute ${currentSize.padding}
          bg-white rounded-full shadow transition-transform duration-200 ease-in-out
          ${currentSize.knob}
          ${checked ? currentSize.translate : 'translate-x-0'}
        `}
      />
    </button>
  );
};
