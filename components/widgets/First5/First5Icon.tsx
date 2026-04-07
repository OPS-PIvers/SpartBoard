import React from 'react';

export const First5Icon: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <text
        x="12"
        y="18"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="18"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        5
      </text>
    </svg>
  );
};
