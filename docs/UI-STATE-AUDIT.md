# Interactive-state repair — 19 November 2026

## Root causes and changes

- A higher-specificity `.hub-page button:not(...)` rule forced a transparent background while selected chips inherited cream text. The new state contract uses shared CSS custom properties and explicit selected background/text/border values.
- White text on the original bright orange failed the normal-text contrast requirement. Accent controls now use dark ink on orange; hover/pressed variants preserve that contrast.
- Whole-button opacity reduced disabled text readability. Disabled and loading controls now use opaque, readable surface/text tokens.
- Several icon controls, chips and secondary buttons were below 44 px; shared minimum targets, readable labels and visible focus rings now apply.
- Selected state includes a checkmark and heavier text. Focus uses a three-pixel, offset, two-tone ring. Touch devices do not receive desktop sticky-hover styling. Reduced motion is respected.
- Light/dark tokens cover controls and existing surfaces. `/ui-states` exercises buttons, icon controls, tabs, filters, time choices, inputs, counters and media overlays.

## Verification scope

The token contrast tests read the actual CSS and check default, hover, selected, disabled, accent, secondary text, borders and focus in light/dark mode. They are static contract checks, not a claim of a full rendered WCAG audit.

Before/after screenshots, browser interaction tests and axe/Lighthouse are blocked: the browser tool rejected `http://127.0.0.1:3000` because the saved origin permission denies access. No alternate browser, headless-browser workaround or fabricated screenshot/report was used. Re-enable the permitted preview origin to run those checks.
