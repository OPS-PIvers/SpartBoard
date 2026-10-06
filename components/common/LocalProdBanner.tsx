import React from 'react';

// Warns that a local dev server is reading and writing real teacher data.
export const LocalProdBanner: React.FC = () => (
  <div
    role="alert"
    className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] bg-red-600 py-0.5 text-center text-xs font-bold tracking-wide text-white"
  >
    Localhost on production. Changes here affect real teachers.
  </div>
);
