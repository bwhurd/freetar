# My Chord Library Design System

My Chord Library follows a **contemporary minimalist design system** with material-influenced elevation and tactile lightness. All visual changes must align with this established aesthetic.

## Core Design Philosophy

- **Calm, premium minimalism** - Generous whitespace, precise alignment, consistent spacing rhythm
- **Soft elevation** - Subtle corner radius, faint borders, diffused shadows (depth without decoration)
- **Tactile lightness** - Surfaces feel elevated but not heavy
- **Quiet interactivity** - Subtle tonal shifts, clean hover feedback, strong focus rings
- **Refined motion** - Short ease-out fades, slight translation, material-like timing
- **Print-optimized light theme** - High contrast, minimal gradients, solid borders

## Typography System

### Font Family
**Inter** (Google Fonts) - loaded globally, used throughout the application

### Font Sizes

CSS custom properties for consistent sizing:

- `--fz-12`: 0.75rem (12px) - Small labels, breadcrumbs
- `--fz-14`: 0.875rem (14px) - Body text, buttons, labels
- `--fz-15`: 0.9375rem (15px) - Comfortable body text
- `--fz-16`: 1rem (16px) - Standard headings
- `--fz-17`: 1.0625rem (17px) - Chord titles (grid view)
- `--fz-18`: 1.125rem (18px) - Group names
- `--fz-20`: 1.25rem (20px) - Page titles, modal titles

### Font Weights

Use only three weights for consistency:

- **400** - Body text, subtle labels
- **500** - Buttons, labels, emphasis
- **600** - Headings, titles, strong emphasis

### Line Heights

- `--lh-tight`: 1.2 - Headings, titles
- `--lh-snug`: 1.3 - Compact text
- `--lh-normal`: 1.55 - Body text
- `--lh-relaxed`: 1.65 - Comfortable reading

### Letter Spacing

- **Headings/titles**: -0.01em to -0.005em (subtle negative tracking for visual tightness)
- **Body/labels**: 0 to 0.02em (neutral or slight positive tracking)
- **Never** use excessive tracking like 0.2em (too airy, breaks readability)

## Color Strategy

### Design Tokens

Always use CSS custom properties instead of hard-coded values:

- `--text-primary` - Primary text color
- `--text-secondary` - Secondary/muted text
- `--surface-elevated` - Elevated surfaces (cards, modals)
- `--border-subtle` - Subtle borders and dividers
- `--accent` - Primary accent color
- `--accent-soft` - Softer accent for backgrounds
- `--focus-ring` - Focus indicator color

### Color Mixing Pattern

Use the `color-mix()` CSS function for subtle hover states and background tints:

```css
/* Subtle hover background */
background: color-mix(in srgb, var(--accent-soft) 30%, transparent);

/* Strengthened border on hover */
border-color: color-mix(in srgb, var(--border-subtle) 150%, transparent);
```

Adjust percentages for intensity:
- **30%** = Subtle, barely there
- **50%** = Moderate, noticeable
- **150%** = Strengthened (for borders)

### Gradients

Use **atmospheric gradients only**, with very low opacity (0.03–0.05). Higher opacity feels too decorative and breaks the minimalist aesthetic.

```css
/* Example: Subtle background gradient */
background: linear-gradient(
  135deg,
  rgba(67, 223, 231, 0.04) 0%,
  rgba(255, 179, 102, 0.03) 100%
);
```

### Light Theme Considerations

The light theme is optimized for both screen viewing and print:

- **Higher contrast** for readability and print clarity
- **Borders**: rgba(0, 0, 0, 0.15) is typical
- **Backgrounds**: Minimal gradients or remove entirely
- **Shadows**: 50–60% reduced opacity vs dark theme

## Spacing Scale

Use design tokens for all spacing to maintain rhythm:

- `--space-micro`: 0.25rem (4px) - Internal component gaps
- `--space-xs`: 0.5rem (8px) - Tight element spacing
- `--space-s`: 0.75rem (12px) - Comfortable spacing
- `--space-m`: 1rem (16px) - Standard section spacing
- `--space-l`: 1.5rem (24px) - Group spacing
- `--space-xl`: 2rem (32px) - Major section breaks
- `--space-xxl`: 3rem (48px) - Page-level spacing

**Apply consistently across components.** Do not use arbitrary values like `0.12rem` or `2em` for new work.

## Border Radius Palette

Three levels for visual hierarchy:

- `--radius-component`: **8px** - Buttons, inputs, small elements
- `--radius-card`: **12px** - Cards, containers, modals
- `--radius-pill`: **999px** - True circles/pills (icon-only buttons)

### Guidelines

- **Never** use pill radius (999px) for rectangular buttons with text
- Use **8px** for most interactive elements
- Use **12px** for larger containers and modals
- Keep consistent within component categories

## Shadow Hierarchy

Four levels only for clear depth perception:

```css
--shadow-subtle: 0 1px 3px rgba(0, 0, 0, 0.12);
--shadow-standard: 0 4px 12px rgba(0, 0, 0, 0.15);
--shadow-elevated: 0 8px 24px rgba(0, 0, 0, 0.2);
--shadow-modal: 0 12px 40px rgba(0, 0, 0, 0.35);
```

**Light theme** reduces all opacity by ~50–60% for softer shadows that work better on white backgrounds.

### Usage

- **Subtle**: Hover states, slight elevation
- **Standard**: Cards, default elevated surfaces
- **Elevated**: Dragged items, floating panels
- **Modal**: Overlays, dropdowns, modals

## Interactive States

### Hover

```css
.element:hover {
    background: color-mix(in srgb, var(--accent-soft) 30%, transparent);
    border-color: color-mix(in srgb, var(--border-subtle) 150%, transparent);
    transform: translateY(-1px);  /* Subtle lift for buttons */
    transition: all 160ms cubic-bezier(0.4, 0.0, 0.2, 1);
}
```

### Focus

Clear, accessible focus indicators:

```css
.element:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
}
```

**No glow effects** - use solid outlines for clarity and accessibility.

### Active

Tactile feedback on press:

```css
.element:active {
    transform: translateY(0.5px);  /* Subtle press down */
}
```

**No heavy shadows or dramatic scale changes** - keep it subtle.

### Disabled

```css
.element:disabled {
    opacity: 0.4;  /* or 0.5 depending on context */
    cursor: not-allowed;
}
```

Disabled elements should have **no hover states**.

## Motion System

### Timing

Use specific durations for different interaction types:

- **Fast**: 120–140ms - Micro-interactions, icon changes
- **Standard**: 160–180ms - Hover, focus, color transitions
- **Moderate**: 220–260ms - Enter/exit animations, scale transforms

### Easing

Use Material Design's standard deceleration curve for all transitions:

```css
transition: all 160ms cubic-bezier(0.4, 0.0, 0.2, 1);
```

This curve creates a natural, physics-based feel. Use for all transitions unless a different curve is explicitly needed.

## Ghost Button Pattern

The preferred button style for modern minimalism:

```css
.button {
    background: transparent;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-component);  /* 8px */
    color: var(--text-primary);
    font-family: var(--font-inter);
    font-size: var(--fz-14);
    font-weight: 500;
    padding: var(--space-s) var(--space-m);  /* 12px 16px */
    transition: all 160ms cubic-bezier(0.4, 0.0, 0.2, 1);
}

.button:hover {
    background: color-mix(in srgb, var(--accent-soft) 30%, transparent);
    border-color: color-mix(in srgb, var(--border-subtle) 150%, transparent);
    transform: translateY(-1px);
}

.button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
}

.button:active {
    transform: translateY(0.5px);
}
```

### Why Ghost Buttons?

- **Light visual weight** - doesn't compete with content
- **Modern aesthetic** - clean, minimal, contemporary
- **Consistent with design system** - uses design tokens
- **Accessible** - clear borders and focus states
- **Flexible** - works in both light and dark themes

## Design Guardrails

### DO ✅

- Use design tokens (`--fz-*`, `--space-*`, `--radius-*`, `--shadow-*`)
- Apply the ghost button pattern for modern buttons
- Use `color-mix()` for subtle hover states
- Follow the 160ms cubic-bezier timing
- Keep borders subtle (1px, low opacity)
- Use 2px solid focus rings with 2px offset
- Maintain Inter typography throughout
- Test in both light and dark themes
- Preserve existing functionality when styling

### DON'T ❌

- Use hard-coded colors (use tokens instead)
- Create heavy, opaque shadows
- Use excessive gradients (keep <0.05 opacity)
- Apply pill radius to rectangular buttons
- Use glow effects for focus (use solid outlines)
- Mix font families (Inter only, except specialized cases like chord diagrams)
- Use arbitrary spacing values (use `--space-*` tokens)
- Create dramatic animations (keep subtle and fast)
- Make CSS changes that break JavaScript functionality

## Reference Implementations

For detailed examples of this design system in practice, see these sections in `freetar/static/my-chords.css`:

### Help Modal (lines ~2392-2658)
**Canonical implementation** of the contemporary minimalist aesthetic. Shows:
- Inter typography with proper hierarchy
- Soft elevation with subtle shadows
- Ghost button pattern
- Generous spacing with design tokens
- Refined motion with cubic-bezier timing

### Page Header (lines ~491-560)
Shows breadcrumb, page title, and button group styling:
- Subtle breadcrumb (12px, 70% opacity)
- Clean title typography
- Ghost button styling for all actions
- Proper flexbox gaps using spacing tokens

### Ghost Buttons (lines ~2845-2900)
Complete implementation of primary buttons, lock button, help toggle, and settings toggle:
- Transparent backgrounds
- Subtle borders with `color-mix()` hovers
- Consistent padding and transitions
- Semantic icon colors preserved (teal/rose for lock states)

### Settings Menu (lines ~2917-3000)
Dropdown menu with refined typography:
- Modal shadow level for depth
- Inter fonts throughout
- Proper spacing scale
- Smooth open/close animations

## Print Optimization

The light theme is optimized for printing:

```css
@media print {
    /* Force high contrast */
    * { box-shadow: none !important; }

    /* Strengthen borders */
    .chord-card { border: 1px solid #000000 !important; }

    /* Hide interactive elements */
    button, .group-buttons, .chord-edit { display: none !important; }

    /* Ensure readability */
    .chord-title { color: #000000 !important; font-weight: 600 !important; }
}
```

Key principles:
- Remove all shadows for crisp output
- Use solid black borders
- Hide interactive elements
- Ensure high contrast text

## Component-Specific Guidelines

### Chord Cards
- Use `--shadow-standard` for default state
- Use `--shadow-elevated` on hover
- Border radius: `--radius-card` (12px)
- Internal padding: `--space-s` (12px)

### Modals
- Use `--shadow-modal` for strong separation
- Border radius: `--radius-card` (12px)
- Padding: `--space-m` to `--space-xl` depending on content
- Backdrop: `rgba(0, 0, 0, 0.26)` with `blur(16px)`

### Forms
- Input border radius: `--radius-component` (8px)
- Label font weight: 500
- Focus ring: 2px solid with 2px offset
- Error states: Use semantic colors, not design tokens

### Tooltips
- Background: `--surface-elevated`
- Shadow: `--shadow-standard`
- Border radius: `--radius-component` (8px)
- Font size: `--fz-12` or `--fz-14`
- Max width: Keep under 300px for readability

## Version History

- **v1.0** (2025-01) - Initial design system documentation
  - Contemporary minimalist aesthetic established
  - Inter typography system
  - Ghost button pattern
  - Four-level shadow hierarchy
  - Complete spacing and sizing scales
