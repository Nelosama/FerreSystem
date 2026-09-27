# Palette's UX Journal

## 2026-09-26 - Accessible Icon Buttons in Header Navigation
**Learning:** Icon-only header controls in SaaS navigation (e.g. notification bell toggle, modal/panel close buttons, branch dropdowns) often lack accessible names (`aria-label`) and state descriptors (`aria-expanded`), leaving screen reader users unable to discern their purpose or current expanded state.
**Action:** Always verify `aria-label` and `aria-expanded` attributes on interactive icon-only elements in navigation bars and floating overlays across all client components.
