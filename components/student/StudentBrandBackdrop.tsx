import React from 'react';

// The dotted page with the brand-blue and brand-red glows every student page shares.
export const StudentBrandBackdrop: React.FC<{ fixed?: boolean }> = ({
  fixed = true,
}) => (
  <div
    aria-hidden="true"
    className={`pointer-events-none inset-0 overflow-hidden ${fixed ? 'fixed' : 'absolute'}`}
  >
    <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-size-[16px_16px] opacity-40" />
    <div className="absolute left-[-15%] top-[-10%] h-[500px] w-[500px] rounded-full bg-brand-blue-primary/15 blur-[120px]" />
    <div className="absolute bottom-[-15%] right-[-10%] h-[500px] w-[500px] rounded-full bg-brand-red-primary/10 blur-[120px]" />
  </div>
);
