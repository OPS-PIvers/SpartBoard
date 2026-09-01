import React, { forwardRef } from 'react';
import { DEFAULT_GLOBAL_STYLE, GlobalStyle } from '@/types';
import { hexToRgba } from '@/utils/styles';

const WINDOW_RADIUS_PX: Record<string, string> = {
  none: '0px',
  sm: '2px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
};

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  gradientOverlay?: boolean;
  transparency?: number;
  cornerRadius?: string;
  globalStyle?: GlobalStyle;
  allowInvisible?: boolean;
  selected?: boolean;
  disableBlur?: boolean;
  bgClass?: string;
  bgHex?: string;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      children,
      className = '',
      gradientOverlay = true,
      transparency: propTransparency,
      cornerRadius: propCornerRadius,
      globalStyle: propGlobalStyle,
      disableBlur = false,
      selected = false,
      allowInvisible: _allowInvisible,
      bgClass,
      bgHex,
      style,
      ...props
    },
    ref
  ) => {
    const globalStyle = propGlobalStyle ?? DEFAULT_GLOBAL_STYLE;

    // Determine values, prioritizing props over global settings
    const finalTransparency =
      propTransparency ?? globalStyle.windowTransparency;

    const finalRadiusClass = propCornerRadius
      ? `rounded-${propCornerRadius}`
      : globalStyle.windowBorderRadius === 'none'
        ? 'rounded-none'
        : `rounded-${globalStyle.windowBorderRadius}`;

    const radiusKey = propCornerRadius ?? globalStyle.windowBorderRadius;
    // Exposed as a CSS variable so nested widget roots can match the frame corners
    const radiusPx = WINDOW_RADIUS_PX[radiusKey] ?? WINDOW_RADIUS_PX['2xl'];

    // Scale intensity of glass effects based on transparency
    // We normalize to the default transparency so it looks consistent at 80%
    const factor = finalTransparency / DEFAULT_GLOBAL_STYLE.windowTransparency;

    // If bgClass is set, append it to the wrapper class and do not apply an inline background color
    return (
      <div
        ref={ref}
        className={`${finalRadiusClass} ${bgClass ?? ''} ${className}`}
        style={{
          ['--window-radius' as string]: radiusPx,
          backgroundColor: bgClass
            ? undefined
            : hexToRgba(bgHex, finalTransparency),
          border: `1px solid rgba(255, 255, 255, ${Math.min(1, 0.3 * factor)})`,
          boxShadow: selected
            ? `0 0 0 2px rgba(99, 102, 241, 0.5), 0 25px 50px -12px rgba(0, 0, 0, 0.25)`
            : `0 8px 32px 0 rgba(0, 0, 0, ${Math.min(1, 0.36 * factor)})`,
          backdropFilter:
            !disableBlur && finalTransparency > 0
              ? `blur(${12 * factor}px)`
              : 'none',
          ...style,
        }}
        {...props}
      >
        {/* Glossy gradient overlay */}
        {gradientOverlay && (
          <div
            className="absolute inset-0 pointer-events-none rounded-[inherit] -z-10"
            style={{
              background: `linear-gradient(to bottom right, rgba(255, 255, 255, ${Math.min(1, 0.2 * factor)}), transparent)`,
            }}
          />
        )}
        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';
