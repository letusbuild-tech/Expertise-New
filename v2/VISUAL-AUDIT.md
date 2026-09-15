# V2 visual audit — 15 September 2026

Implementation is isolated in polish.css, loaded after V2's existing stylesheet.
V1 HTML, CSS, JavaScript, and shared assets were not changed.
Content, section order, and existing interactive behavior are preserved.

## Shared rules

- Section spacing: fluid 56–88px; 56px on mobile.
- Major headings: one fluid 30–44px scale. Hero retains its display hierarchy.
- Body copy: 16px, 1.6 line height, readable line length.
- Eyebrows: 12px, medium weight, shared uppercase tracking.
- UI corners: 4px; cards/panels: 8px; glass frames: 18px, 14px on mobile.
  Circular progress rings, avatars and intentional pills remain round.
- Structural dividers: 1px stroke, 4px dash, 6px gap.
  Dark surfaces use white ink; light surfaces use dark ink.
- Control boundaries and glass highlights stay solid: their role differs from rulers.
- Gradient variables resolve locally so changing a surface's line color actually
  changes its dashed frame, rather than inheriting the root's resolved color.

## Section-by-section

| Area | Detail adjustments |
| --- | --- |
| Navigation | Shared button typography/radius, consistent navigation spacing and focus visibility. |
| Hero | Removed double mobile inset; normalized intro gaps, description contrast, CTA sizing and title measure. |
| Client strip | Compact spacing and a consistent eyebrow-to-logo gap. |
| Solution / agents | Shared heading scale, balanced introductory copy, quieter tabs, consistent card padding and corners. |
| Abstract visual | Existing interlude retained; shared outer ruler system. |
| Measured impact | Eyebrow now sits above the metrics, rather than beside them in a legacy flex row; consistent internal dividers. |
| Hands-on deployment | Shared heading rhythm, more readable card copy, consistent control spacing and asset frame. |
| Customer mosaic | Normalized section spacing and label proximity; original mosaic retained. |
| Case studies | Eyebrow sits above heading; removed doubled horizontal gutters; consistent panel, metric and picker separators. |
| Industries | Removed excess gap between eyebrow and title; consistent card radii; improved photo-text contrast and body sizing. Single-column mobile cards prevent cramped copy. |
| Security | Unified heading and body hierarchy, readable descriptions, regular spacing and divider geometry across credentials. |
| Customer voices | Unified quote sizing, card padding/radius, heading spacing and navigation control sizes. |
| Closing CTA | Shared final-section rhythm, restrained watermark opacity and consistent action sizing. |
| Footer | Reduced excess top padding; aligned text/link hierarchy; removed the empty legacy bottom rail; normalized divider. |

## Checks completed

- V1 file hashes match the pre-edit baseline.
- All 68 local HTML dependencies resolve.
- All custom properties used by the polish stylesheet are defined.
- Polish stylesheet delimiters are balanced.
- V2 JavaScript syntax check passes.
- Whitespace/error check passes.

## Verification limitation

The browser tool rejected access to the local file preview. This is a
source-based audit, not a completed rendered visual sign-off. Desktop/tablet/mobile
rendering still needs review, particularly long case-study titles, expanded industry
cards, the mobile navigation, and the three animated deployment panes.
