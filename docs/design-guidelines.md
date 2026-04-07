# ModSecurity Demo Design Guidelines

## 1) Visual system (concise)

### Palette
- `bg`: `#0B1220` (page)
- `surface`: `#111827` (cards/panels)
- `surface-2`: `#1F2937` (table/list rows)
- `text-primary`: `#E5E7EB`
- `text-secondary`: `#9CA3AF`
- `accent`: `#22C55E` (allow/safe)
- `warning`: `#F59E0B` (suspicious)
- `danger`: `#EF4444` (block/attack)
- `info`: `#38BDF8` (links/highlights)
- `border`: `#374151`

Usage rule: keep 1 primary accent (`accent`) + semantic statuses only.

### Typography
- Font stack: `Inter, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`
- Code/log font: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
- Scale:
  - H1 `32/40` semibold
  - H2 `24/32` semibold
  - H3 `18/28` medium
  - Body `16/24` regular
  - Small `14/20`
  - Caption/log `12/18` monospace

### Spacing, radius, layout
- 8px spacing system: `4, 8, 12, 16, 24, 32`
- Radius: `8px` cards, `6px` inputs/buttons
- Borders: `1px solid var(--border)`
- Shadow: subtle only (`0 2px 8px rgba(0,0,0,.25)`)
- Container max-width: `1200px`, centered, `16px` mobile gutters, `24px` desktop gutters

### Component states
- **Button**: default / hover / active / disabled / focus-visible
- **Input**: default border, hover border brighten, focus ring `2px info`, invalid `danger`
- **Status chip**: ALLOW (green), BLOCK (red), WARN (amber)
- **Timeline item**: neutral by default, highlighted when selected

## 2) UX principles for this security dashboard demo
- Show cause → effect quickly: request input, WAF decision, matched rules, and logs in one view.
- Keep user mental model linear: **Send request → Evaluate by WAF → Observe logs/outcome**.
- Prefer explicit labels over shorthand (rule IDs, action, source component).
- Keep demo speed high: quick attack presets for SQLi/XSS/LFI/path traversal.
- Minimize cognitive load: low-fidelity blocks first, progressive details in logs/timeline.

## 3) Single-page sections (required flow)
1. Hero: explain Nginx + Node.js + ModSecurity + OWASP CRS pipeline.
2. Live request tester: endpoint + payload input + send action.
3. Request/response timeline: ordered events from ingress to app response.
4. WAF decision panel: allow/block verdict + matched rule IDs.
5. Attack scenario quick actions: one-click payload presets.
6. Logs preview: access log + audit log snippets.
7. Footer next steps: integration and hardening actions.

## 4) Accessibility notes (WCAG 2.1 AA baseline)
- Contrast: normal text >= 4.5:1, large text >= 3:1.
- Keyboard: all controls reachable with logical tab order.
- Focus: visible, high-contrast focus outline on interactive elements.
- Touch targets: minimum 44x44px equivalent.
- Semantics: proper heading order, `label` for inputs, `button` for actions.
- Live updates: timeline/decision/log updates should use polite announcement region when implemented.
- Motion: avoid decorative motion by default; respect reduced-motion.

## 5) Demo behavior notes
- Allow benign payloads.
- Block obvious attack signatures and show matched CRS-style IDs.
- Keep logs synthetic but realistic and readable.
- Never imply production-grade detection coverage in demo copy.
