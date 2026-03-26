1. **Unify hardcoded hex codes for primary brand colors**:
   - `components/widgets/Schedule/ScheduleWidget.tsx`: Replace `border-[#2d3f89]` and `bg-[#2d3f89]` with `border-brand-blue-primary` and `bg-brand-blue-primary`.
2. **Standardize arbitrary `text-[9px]` classes**:
   - `components/common/DriveDisconnectBanner.tsx`: Replace `text-[9px]` with `text-xxxs`.
   - `components/widgets/MiniApp/components/MiniAppEditor.tsx`: Replace `text-[9px]` with `text-xxxs` (2 instances).
   - `components/widgets/MathToolInstance/Settings.tsx`: Replace `text-[9px]` with `text-xxxs`.
   - `components/admin/CalendarConfigurationModal.tsx`: Replace `text-[9px]` with `text-xxxs`.
   - `components/admin/SpecialistScheduleConfigurationModal.tsx`: Replace `text-[9px]` with `text-xxxs` (2 instances) and `text-[11px]` with `text-xxs`.
3. **Write `.Jules/unifier.md`**:
   - Log the architectural drift (Hardcoded hex values for brand colors and arbitrary text sizes bypassing the design system config in tailwind.config.js).
