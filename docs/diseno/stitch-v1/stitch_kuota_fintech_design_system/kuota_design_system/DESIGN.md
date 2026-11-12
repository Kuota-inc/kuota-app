---
name: Kuota Design System
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e1e8f8'
  surface-container-highest: '#dce3f2'
  on-surface: '#151c27'
  on-surface-variant: '#444653'
  inverse-surface: '#29313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#757685'
  outline-variant: '#c5c5d6'
  surface-tint: '#3754c7'
  primary: '#00248b'
  on-primary: '#ffffff'
  primary-container: '#1a3bb0'
  on-primary-container: '#a4b3ff'
  inverse-primary: '#b8c3ff'
  secondary: '#495e89'
  on-secondary: '#ffffff'
  secondary-container: '#b6ccfd'
  on-secondary-container: '#405680'
  tertiary: '#1b3253'
  on-tertiary: '#ffffff'
  tertiary-container: '#33496b'
  on-tertiary-container: '#a2b8e0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c3ff'
  on-primary-fixed: '#001356'
  on-primary-fixed-variant: '#1839af'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#b1c7f8'
  on-secondary-fixed: '#001a41'
  on-secondary-fixed-variant: '#304670'
  tertiary-fixed: '#d5e3ff'
  tertiary-fixed-dim: '#b1c7f0'
  on-tertiary-fixed: '#001c3b'
  on-tertiary-fixed-variant: '#314769'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce3f2'
  surface-white: '#FFFEFF'
  text-secondary: '#4A5F7E'
  scrim: rgba(11, 37, 69, 0.40)
  pressed-state: rgba(11, 37, 69, 0.08)
  disabled-track: rgba(175, 197, 246, 0.50)
  disabled-content: rgba(11, 37, 69, 0.50)
  decorative-overlay: rgba(175, 197, 246, 0.25)
typography:
  metric:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  title:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
  button:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
  label:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system embraces an airy, high-clarity mobile ethos anchored by strict tonal cohesion, soft volumetric forms, and deliberate restraint. Built around the foundational principle of "One Hero Per Screen," the interface dedicates 85%+ of canvas real estate to tranquil light fields (Lavender, White, and Periwinkle), reserving vibrant chromatic energy strictly for primary intent and focal metrics.

The visual style blends modern soft-utility minimalism with tactile, pill-shaped affordances. It eschews generic black shades and harsh drop shadows, achieving structural definition through high-contrast Prussian Blue typography, crisp Periwinkle border geometry, and subtle luminous elevations. The resulting experience feels calm, intuitive, and remarkably focused, instilling effortless trust and financial poise for mobile users navigating quotas, balances, and operational workflows.

## Colors

The design system operates on an uncompromising single light-mode engine constructed from five primary chromatic anchors:

- **Lavender (`#E6EDFD`)**: The universal canvas background across all views, infusing the application with an atmospheric, gentle tint.
- **Surface White (`#FFFEFF`)**: Elevated standard containers, sheets, and interactive controls requiring immediate clarity over the canvas.
- **Periwinkle (`#AFC5F6`)**: The connective tissue of the interface. Serves as structural divider borders, unselected chip outlines, progress bar tracks, and soft auxiliary cards.
- **Persian Blue (`#1A3BB0`)**: The primary brand and action driver. Reserved for primary CTA pills, focused input rings, hero container fills, and live chart highlights. Treat this color as scarce capital: apply it to only 8%–12% of a screen's viewport.
- **Prussian Blue (`#0B2545`)**: The definitive ink of the system. Used for headers, primary typography, inverse buttons, and iconography. Error states and validation warnings leverage this deep ink paired with descriptive microcopy rather than jarring destructive reds.
- **Muted Navy (`#4A5F7E`)**: Derived secondary text token providing accessible legibility for helper text, placeholders, and axis values.

## Typography

The typography strategy unites the sculpted, geometry-rich curves of **Plus Jakarta Sans** with the utilitarian precision of **Inter**. 

### Editorial Hierarchy
- **Plus Jakarta Sans** commands all hierarchy gates: bold screen titles, impactful numerical metric readouts (`48px`), section headings, button labels, and concise chip indicators. All titles follow clean sentence case.
- **Inter** handles high-density cognitive tasks: continuous paragraph copy, instructional captions, and numeric data arrays.

### Numerical Representation
To guarantee perfect column alignment in financial logs, quota gauges, and transaction histories, the `data` role mandates `font-variant-numeric: tabular-nums`. Numerical metrics in hero banners drop from `48px` to `24px–32px` dynamically when nested in compressed split-card layouts.

## Layout & Spacing

A strict **4px spatial rhythm** governs mobile screen composition. Viewports adhere to a fixed margin of `20px` (`1.25rem`) on both vertical borders, protecting touch bounds while ensuring edge-to-edge balance across varying device widths.

### Compositional Rules
- **Grid Structure**: Internal card groups run on a 2-column symmetric layout with consistent `12px` (`0.75rem`) horizontal and vertical gutters.
- **Section Rhythm**: A generous `24px` (`1.5rem`) gap separates discrete card clusters and content domains, while section titles sit precisely `12px` (`0.75rem`) above their related containers.
- **Floating Island Clearance**: The persistent bottom navigation sits elevated `16px` (`1rem`) inward from the screen edge and bottom viewport offset, requiring a mandatory `96px` scroll clearance padding at the foot of all scroll views.

## Elevation & Depth

Visual depth in this design system is driven by contrast boundaries rather than heavy shadow stacking. The canvas relies primarily on chromatic relationships—such as White containers floating naturally against the Lavender ground. When elevation is required for floating elements, subtle Prussian Blue tints create soft, atmospheric separation.

### Elevation Hierarchy
- **Level 0 (Flat)**: `elevation: none`. Base cards and soft surfaces resting flush on the Lavender background rely on explicit surface contrast and optional `1px solid #AFC5F6` borders.
- **Level 1 (Card Rest)**: `box-shadow: 0 2px 8px rgba(11, 37, 69, 0.06)`. Used sparingly on pure White surface cards when they overlap or sit alongside soft Periwinkle blocks.
- **Level 2 (Floating Action & Nav)**: `box-shadow: 0 8px 24px rgba(11, 37, 69, 0.12)`. Applied to the detached bottom navigation island, the central Kuotear FAB, modal bottom sheets, and fleeting toast banners.
- **Scrim Overlay**: Full-screen modal sheets employ a `40%` opacity tint of Prussian Blue (`rgba(11, 37, 69, 0.40)`), softening the underlying interface while directing focus upward.

## Shapes

The design system employs friendly, sculptural curves that balance soft organic containment with crisp internal architecture.

### Corner Radii Guidelines
- **`8px` (Extra Small)**: Tooltips, top caps for vertical bar charts, and selection checkboxes.
- **`12px` (Small)**: Content thumbnails and compact inline badges.
- **`16px` (Medium)**: Text input fields, dropdown triggers, and notification message containers.
- **`24px` (Large)**: Standard surface cards (`card-default`), soft utility modules, and system dialog sheets.
- **`28px` (Extra Large)**: Dominant Hero metric cards (`card-hero`) and top rounding for modal bottom sheets.
- **`9999px` (Pill / Full)**: Primary, secondary, and inverse CTA buttons, chip pills, search capsules, linear progress meters, circular avatar masks, and the floating bottom navigation bar.

## Components

### Buttons & Interactive CTAs
- **Primary Button**: Full pill (`9999px`), `56px` height, filled with Persian Blue (`#1A3BB0`). Text is Plus Jakarta Sans SemiBold `16px` in Surface White (`#FFFEFF`). Accommodates centered labels or leading icon pairs.
- **Secondary Button**: Full pill, `56px` height, filled with Periwinkle (`#AFC5F6`) with Prussian Blue (`#0B2545`) text.
- **Button on Dark**: Pure White pill with Persian Blue or Prussian Blue text, used exclusively within Hero cards.
- **Icon Action Button (Inverse)**: `44px × 44px` circular Prussian Blue disc with a centered White icon (`20px`). Commonly features the upward diagonal arrow (`↗`) anchored in the top-right of cards to trigger detail views.
- **Press States**: Native 150ms transform scale down (`0.98`) with an `8%` Prussian Blue overlay (`rgba(11, 37, 69, 0.08)`).

### Input Fields & Controls
- **Text Inputs**: Height `56px`, corner radius `16px`, background Surface White (`#FFFEFF`), bordered by `1px solid #AFC5F6`. Text is Inter Regular `16px` in Prussian Blue; placeholder in Muted Navy (`#4A5F7E`).
- **Focus State**: Replaces border with `2px solid #1A3BB0`. Error states use `2px solid #0B2545` paired with a caption alert icon.
- **Switches**: `52px × 32px` Periwinkle track (`#AFC5F6`) transitioning to Persian Blue (`#1A3BB0`) when active; smooth `24px` circular White thumb.
- **Checkboxes**: `24px × 24px` square with `8px` rounded corners and a `2px solid #1A3BB0` border, filling with Persian Blue and displaying a White checkmark when selected.

### Filter & Selection Chips
- Height `36px`, full pill radius (`9999px`), internal horizontal padding `16px`.
- **Unselected**: Surface White background, `1px solid #AFC5F6`, Prussian Blue text (`13px` SemiBold).
- **Selected**: Persian Blue fill (`#1A3BB0`), no border, Surface White text.

### Cards & Surfaces
- **Default Card (`card-default`)**: Surface White (`#FFFEFF`), `24px` corner radius, `16px` padding, Level 0 elevation or subtle Level 1 shadow.
- **Soft Card (`card-soft`)**: Periwinkle fill (`#AFC5F6`), `24px` radius, borderless.
- **Hero Card (`card-hero`)**: Deep Persian Blue fill (`#1A3BB0`), `28px` corner radius, `20px` padding. Houses White display typography (`48px` Metric), subtle decorative vertical pill shapes at 20% opacity, and high-contrast White action pills.

### Floating Bottom Navigation Bar
- A detached floating pill container measuring `64px` in height, suspended `16px` above the bottom safe area with `16px` lateral margins.
- Surface is pure White (`#FFFEFF`) held by Level 2 elevation (`0 8px 24px rgba(11, 37, 69, 0.12)`).
- **Central Action ("Kuotear" FAB)**: Prominent `48px` or `56px` Persian Blue circular button elevated at the center of the bar with an inner White plus or brand glyph.
- **Destinations**: Inactive tabs render in Lavender/Muted Navy; the active tab highlights with a `44px` circular Periwinkle (`#AFC5F6`) target indicator enclosing a Prussian Blue icon.