// Shared visual primitive for the bottom-anchored FAB clusters
// (BoardNavFab on the left, BoardActionsFab on the right). Keep both files
// importing from here so the glassmorphism treatment never drifts.
export const FAB_BASE =
  'w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-colors backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-40 disabled:cursor-not-allowed';
