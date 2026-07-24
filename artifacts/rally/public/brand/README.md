# Aunt Lucy — Brand Assets

Mark: **the cosy teacup** — a warm, capable friend who puts the kettle on.
A stylised cup & saucer with a soft handle and two rising steam curls.

## Colours
| Role | Hex | Notes |
|------|-----|-------|
| Terracotta / rust (primary) | `#C4614A` | The cup outline, accents |
| Deep forest green (secondary) | `#2D5016` | Steam, wordmark |
| Warm linen / off-white (background) | `#F5F0E8` | Primary surface |
| Ink (single-colour dark) | `#2E2A24` | Mono lockups on light |

## Type
Wordmark set in **Newsreader** (Google Fonts), weight 500; tagline italic 500.
Load 400/500/600 + italics:
`https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500;1,6..72,600&display=swap`

> SVGs reference Newsreader by name — load the font wherever they render inline,
> or convert the wordmark to outlines for font-independent contexts (email, print, OG).

## Files
| File | Use |
|------|-----|
| `aunt-lucy-lockup-horizontal.svg` | Primary lockup, with tagline |
| `aunt-lucy-lockup-horizontal-notag.svg` | Primary lockup, no tagline |
| `aunt-lucy-lockup-stacked.svg` | Vertical lockup |
| `aunt-lucy-mark.svg` | Cup mark, full colour (terracotta cup + forest steam) |
| `aunt-lucy-mark-forest.svg` | Cup mark, all forest |
| `aunt-lucy-mark-mono.svg` | Cup mark, ink (single-colour on light) |
| `aunt-lucy-mark-reversed.svg` | Cup mark, linen (for dark backgrounds) |
| `aunt-lucy-app-icon.svg` | 512 app icon — linen cup on terracotta tile |
| `aunt-lucy-favicon.svg` | Simplified cup (no steam) — scalable favicon |
| `aunt-lucy-favicon-tile.svg` | Rounded terracotta tile favicon |

## Clear space & min sizes
- Clear space: keep at least the cup's saucer-width around the full lockup.
- Min lockup width: **150px**. Below that, use the mark or favicon.
- Favicon uses the *simplified* cup — steam curls drop out below ~32px so the
  silhouette stays crisp.

## Don't
- Recolour outside the palette, add gradients or drop shadows.
- Stretch or reproportion the cup; keep the handle on the right.
- Place the full-colour mark on mid-tone backgrounds — use the reversed/mono variants.

## Favicon / manifest
See `favicon-snippet.html`.

## PNG exports (`/brand/png`)
Raster fallbacks with the wordmark rendered in Newsreader (no font needed):
`app-icon-512`, `app-icon-192`, `favicon-32`, `favicon-16` (terracotta tile),
`mark-favicon-32`, `mark-512`, `lockup-horizontal-1600`.
