## 2025-04-12 - Sidebar Text & Tracking Standardization
**Drift:** The Sidebar component used non-standard text sizes (`text-[13px]`) and tracking values (`tracking-[0.15em]`, `tracking-[0.2em]`).
**Fix:** Refactored these values to use the standard Tailwind classes `text-sm` and `tracking-widest` respectively, achieving alignment with the existing global standards found across other sidebar and settings panels.
