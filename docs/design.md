---
name: SoilProve Field Operations Console
colors:
  soil-black: '#000000'
  soil-deep-green: '#084E2D'
  field-iron: '#163B24'
  crop-green: '#2C8733'
  field-green: '#1B7F35'
  nitrogen-gold: '#F4AD04'
  yield-gold: '#F2C230'
  dusty-off-white: '#EBE9E0'
  equipment-white: '#FFFDF4'
  soft-white: '#F4F8F4'
  pure-white: '#FEFEFE'
  charcoal: '#1A1C1A'
  agri-gray: '#6B7264'
  clay-red: '#CD4C24'
  border-green: '#163B24'
  line-muted: '#D1C5AD'
  sky-wash: '#CFE3D5'
  success-wash: '#C3EDCB'
  warning-wash: '#FFDBD1'
  voice-glow: 'rgba(244, 173, 4, 0.28)'
typography:
  headline-lg:
    fontFamily: Oswald
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.15'
    letterSpacing: '0'
    textTransform: uppercase
  headline-md:
    fontFamily: Oswald
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: '0'
    textTransform: uppercase
  headline-sm:
    fontFamily: Oswald
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: '0'
    textTransform: uppercase
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
  button-text:
    fontFamily: Oswald
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: '0.04em'
    textTransform: uppercase
  label-caps:
    fontFamily: Oswald
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: '0.03em'
    textTransform: uppercase
rounded:
  none: 0
  sm: 2px
  DEFAULT: 2px
  md: 2px
  full: 9999px
spacing:
  base: 4px
  gutter: 16px
  margin-mobile: 12px
  margin-desktop: 24px
  border-width: 1px
  border-width-strong: 2px
shadow:
  industrial: '4px 4px 0 #163B24'
  industrial-soft: '3px 3px 0 rgba(22, 59, 36, 0.32)'
---

# Design System: SoilProve Field Operations Console

**Reference source:** `stitch_soilprove_precision_nutrient_management_prd` exports  
**Primary direction:** John Deere Operations Center-inspired agronomic command software  
**Secondary direction:** voice-first Raimond command layer inside the console

## 1. Visual Theme & Atmosphere

SoilProve should feel like field-tested agricultural operations software: sturdy, legible, auditable, and economically serious. The closest visual reference is a John Deere Operations Center-style desktop console, not a dark sci-fi dashboard.

The product lives mostly in daylight surfaces: dusty off-white workspaces, equipment-white cards, dark green structural navigation, yellow active states, dense data tables, file manifests, and map/report panes. It should look like something an operator, farmer, or agronomist can trust during a busy workday.

The prior dark Glass HUD direction should be reduced to an accent layer. Use it for Raimond voice state, live command feedback, selected map overlays, and compact telemetry. Do not make the entire application a black cockpit.

## 2. Design Thesis

The differentiator is not a generic fertilizer calculator with a coat of paint. The UI should make SoilProve feel like a guided, auditable field-decision workflow:

- voice-first intake for speed
- visible on-screen controls for older operators and demo clarity
- editable OCR review before any plan is generated
- agronomist-reviewed action plan language
- soil-report second opinion and agronomist meeting prep
- review packet that looks printable and defensible
- OEM export manifest that feels operational, not magical
- harvest verification and audit trail as first-class screens

The design must communicate: “This is a cautious field test with a clean paper trail.”

## 3. Brightness And Color Balance

Target primary desktop screens:

- 65-75% light workspace and report surfaces
- 15-25% dark green structural chrome
- 5-10% nitrogen/yield gold active states
- 0-5% dark HUD glow accents

Avoid screens that read as mostly black. Dark green is the chassis; off-white is the workspace.

## 4. Color Palette & Roles

**Dusty Off-White (#EBE9E0)** is the main app background. It gives the workspace the feel of industrial paper and reduces glare compared with pure white.

**Equipment White (#FFFDF4)** is used for cards, tables, modal bodies, packet previews, checklist surfaces, and review forms. It should carry most user-reading surfaces.

**Soft White (#F4F8F4)** and **Pure White (#FEFEFE)** come from the current brand assets. Use them for logo-safe backgrounds, high-contrast report surfaces, and export previews.

**Field Iron (#163B24)** is the structural green. Use it for top navigation, sidebar, panel headers, table emphasis, hard borders, and industrial drop shadows.

**Soil Deep Green (#084E2D)** is the darker brand green from the logo. Use it for brand anchoring, deepest nav states, voice shell accents, and selected map structure.

**Crop Green (#2C8733)** and **Field Green (#1B7F35)** are supporting field colors. Use them for map regions, healthy/complete states, subtle progress signals, and secondary green accents.

**Nitrogen Gold (#F4AD04)** is the current brand gold. Use it for primary CTAs, selected trial strips, Raimond active state, active nav items, and highlighted savings or export actions.

**Yield Gold (#F2C230)** remains acceptable for softer UI fills when the brighter brand gold is too intense.

**Charcoal (#1A1C1A)** is primary text on light surfaces.

**Agri-Gray (#6B7264)** is secondary text, metadata, disabled content, table labels, and explanatory notes.

**Clay Red (#CD4C24)** is reserved for warnings, OCR uncertainty, missing credentials, negative yield variance, and review-required states.

## 5. Typography Rules

Use **Oswald** for headings, page titles, card headers, buttons, and command labels. It gives the product the stamped-metal, equipment-console quality of the reference screens.

Use **IBM Plex Sans** for body copy, form labels, helper text, packet summaries, and readable workflow content.

Use **JetBrains Mono** for numbers, data tables, acres, rates, modeled savings, tool calls, export filenames, DBF fields, audit logs, and OCR-extracted values.

Typography should be dense and practical. Do not use hero-scale marketing type inside the product. Keep letter spacing at `0` for normal headings; use small positive tracking only for tiny labels and buttons.

## 6. Layout Principles

The default application shell uses:

- dark green top navigation or sidebar
- dusty off-white page background
- equipment-white work panels
- hard green borders
- 2px corner radius
- 4px offset industrial shadow
- dense 4px/8px/16px spacing rhythm

Desktop should feel like an operations console, with a persistent navigation frame and a main work area for field decisions. Mobile should collapse to a single-column task flow with Raimond, current step, primary action, and proof/status.

Do not build a landing page as the first experience. The first screen should be the actual usable command center.

## 7. Component Styling

### Buttons

Primary buttons use Nitrogen Gold (`#F4AD04`) or Yield Gold (`#F2C230`) with dark green or charcoal text. They have 1-2px dark green borders, 2px radius, uppercase Oswald text, and a hard 3-4px dark green offset shadow.

Secondary buttons use Equipment White with dark green border and dark green text.

Danger or review-required buttons use Clay Red sparingly and only when the action is truly risky or blocked.

### Navigation

Navigation is dark Field Iron or Soil Deep Green. Active nav items use Nitrogen Gold with dark text. Inactive nav items remain green/cream with high contrast and no mystery icons.

### Cards And Panels

Cards use Equipment White backgrounds, dark green borders, 2px radius, and hard offset shadows. Headers can be dark green with gold or white text when the panel needs operational hierarchy.

Avoid nested cards. Use rows, dividers, tabs, and table sections instead.

### Tables

Tables are central to the product. They should use dense rows, strong headers, clear cell borders, and monospaced numeric columns. Important data fields should be easy to scan:

- field
- acres
- zone
- soil test value
- current rate
- trial rate
- breakeven yield drag
- modeled input savings
- export status
- harvest verification status

### Status Chips

Status chips are rectangular or lightly rounded with strong borders. Use:

- green for complete/verified
- gold for active/in progress
- red/rust for missing, blocked, or review-required
- gray/cream for pending

### Forms And OCR Review

Inputs use Equipment White or Soft White fills with dark green borders. OCR-derived values must appear editable and review-gated. Any low-confidence value should show a visible warning state; never silently convert OCR into an applied plan.

### Review Packet

The review packet should look like a printable agronomy dossier placed inside the product shell. Use a light paper surface, dark green headers, monospaced evidence rows, signoff blocks, and clearly labeled assumptions.

The packet must reinforce conservative language: reviewable action plan, modeled input savings, breakeven yield drag, first controlled field test, harvest verification, and better agronomist meetings, not fewer meetings.

### OEM Export Manager

The export manager should closely match the older Stitch `export_manager` reference: light modal/surface, dark green title bar, yellow primary export CTA, machine format cards, file output preview, checklist rows, and strong borders.

OEM integrations are credential-gated. Never imply live OEM submission unless the credential and action result exist.

## 8. Raimond Voice Layer

Raimond remains the product’s interaction advantage, but the voice UI should sit inside the Field Operations Console instead of taking over the entire visual system.

Use a compact voice module with:

- green/yellow status ring
- visible `Start Raimond`, `Listening`, `Thinking`, `Needs review`, and `Tool complete` states
- transcript and tool-result log
- on-screen buttons for older operators
- clear signoff gates before plan/export actions

Voice surfaces may use darker green, subtle glow, and glass-like treatment. Keep the surrounding workspace light and operational.

Voice must never claim success until the underlying action result has returned.

## 9. Product Language

Use:

- agronomist-reviewed action plan
- soil report second opinion
- review packet
- modeled input savings
- breakeven yield drag
- illustrative comparable-field context
- savings assurance offer
- first controlled field test
- harvest verification

Avoid:

- final prescription
- replaces the agronomist
- proven neighbor result
- peer identity
- guaranteed yield
- autonomous fertilizer recommendation
- peer proof
- reduces the need for agronomists

## 10. Stitch Prompting Guidance

When prompting Stitch, ask for the older SoilProve Agronomic Command Center style:

- light Dusty Off-White / Equipment White workspace
- dark green John Deere-like structural nav
- gold active actions
- hard industrial borders and 4px offset shadows
- Oswald headings, IBM Plex Sans body, JetBrains Mono data
- dense tables, manifests, checklists, packets, and map panels

Explicitly say: “Do not make the app mostly black. Use dark HUD styling only for the Raimond voice module and selected live telemetry.”

## 11. Screen-Specific Direction

**Command Center Entry:** dark green nav, cream workspace, brand-forward header, compact Raimond module, demo path visible, current field/test state.

**Interactive Field Workspace:** map/data split view, light panels, dark green headers, gold selected strip, editable trial assumptions.

**OCR Soil Report Review:** document-like review surface with extracted fields, low-confidence warnings, editable values, and review gate.

**Agronomist-Reviewed Action Plan:** comparison table, breakeven yield drag, modeled input savings, signoff controls, assumptions panel, and questions prepared for the agronomist.

**Peer Context:** show only aggregated illustrative context, never individual peers; use >=5 comparable fields rule in copy and UI.

**Review Packet:** printable dossier inside the app shell.

**OEM Export Manager:** machine cards, shapefile ZIP manifest, `N_RATE_LBS` field visibility, credential-gated export status.

**Audit / Outcome Dashboard:** match the older outcome-tracking reference: cream workspace, dark green nav, KPI cards, dense table, map panel, verification checklist, and harvest result states.
