# Chord interactions spec

This document describes how chord diagrams behave in My Chord Library. Treat it as the reference for future changes to `chordDiagram.js` and `my-chords.page.js`.

The goal is that a code agent can extend behavior without breaking the existing model, click semantics, or base fret handling.

---

## Data model

### Shape strings

Shapes are six token strings, one per string, left to right:

- Index 0 is string 6 (low E)
- Index 5 is string 1 (high E)

Each position encodes:

- `x` or `X` for muted
- `0` for open
- Positive integers for fretted notes
- Brackets and parentheses for roots

Examples

- `x02210`
- `x[0]2210`
- `x([3])2210`

### Tokens and roots

Internally the diagram code uses two parallel arrays per chord:

- `tokens[i]`
  - `null` for muted
  - `0` for open
  - positive integer for a fret number
- `roots[i]`
  - `null` for no root
  - `'played'` for a played root
  - `'ghost'` for an omitted root

Invariant

- Each string has at most one stored note in `tokens`
- There is no representation of two simultaneous notes on the same string

Optional overlay ghost roots

- Advanced inputs may include a per string ghost root overlay inside a parenthesized segment, for example `(7,{8})09980`
  - Base `tokens` are still `7 0 9 9 8 0`
  - An extra overlay entry records the ghost fret for that string (string 6 at fret 8 in the example)
- Overlays are visual only: they render a second ghost root dot on the matching fret/string but do not change click behavior or base fret math
- The one note per string model still uses the primary `tokens`/`roots`; editing by click on that string can drop the overlay while standard shapes keep their current behavior

### Parsing and serialization

Use a single pair of helpers for all transformations:

- `parseTokensAndRootKinds(shape)`
  - Input is the shape string
  - Returns `{ tokens, roots }`
- `buildShapeFromTokensAndRootKinds(tokens, roots)` or equivalent
  - Input is the arrays
  - Returns the compact shape string

All click logic must go through these helpers rather than hand editing the string.

---

## Diagram layout

Each chord card contains

- `<table class="chord-diagram">`
  - `<thead>` with one header row
    - Per string header cell with the visible `X` or `0` marker
    - Each header cell contains a single `<span class="chord-header-label">` which is the click target above the nut
  - `<tbody>` with fret rows
    - Each fret row has
      - Left column `<td class="chord-fret-label">` with the fret number
      - Six `<td class="chord-string-cell">` cells
        - Each cell contains a `.chord-dot` wrapper and dot element
  - `<tfoot>` or a final footer row for the numeric labels under the diagram

Important classes

- `.chord-diagram` table root
- `.chord-header-label` span for above nut click targets
- `.chord-fret-label` left column fret label
- `.chord-string-cell` cells in the fretboard grid
- `.chord-dot` and root specific dot classes
- Root header classes for open string roots
  - for example `.chord-header-root-played` and `.chord-header-root-ghost`

---

## Base fret system

### Base fret state

Each chord card can carry a base fret in `card.dataset.baseFret`.

- When set
  - Top visible fret row is `baseFret`
  - The table renders frets `baseFret` through `baseFret + 3` or whatever fixed range is currently used
- When not set
  - The renderer derives a default top fret from `tokens`
    - If there is at least one fretted note, it picks a 4 fret window so the lowest fretted note sits on the lowest visible label (`topBase = minFret`, clamped to `1`)
    - If all strings are open or muted, it falls back to frets `1` through `4`

This normalization happens on every render (initial page load, undo/redo, morphdom updates) so the lowest fretted note always aligns with the lowest visible label unless an explicit `baseFret` is set.

`chordDiagram.js` is responsible for reading `card.dataset.baseFret` and building the diagram model accordingly.

### "Fret #?" modal

The base fret modal is a small numeric prompt that appears in two scenarios

1. Shape is all open or all muted on first interaction
2. The user clicks a fret number in the left column

Behavior

- Shown as a centered panel with
  - label text set by JS based on context
    - e.g., "What fret is the note you just added?" on the first fretted note prompt
    - e.g., "What fret should this line be?" when retargeting a fret label
  - text and background colors defined in `my-chords.css`
- There is no visible input element
- While the modal is open
  - First digit key from `0` to `9` is treated as the chosen fret
  - That digit
    - Is displayed in the modal value field if present
    - Immediately commits the base fret choice and closes the modal
  - Escape closes the modal without changes

The modal helper

- A single helper manages the modal, for example `showBaseFretModal(card, onConfirm)`
  - Stores the active card and a callback
  - Attaches a temporary keydown listener
- When the user types a digit
  - Parses the number
  - Calls `onConfirm(fret)` with the chosen value
  - Hides the modal and removes the keydown listener

Never add multiple separate base fret modals. Always reuse this helper.

### First fretted note prompt

- When a diagram is all open or muted and has no `card.dataset.baseFret`
  - The first body click prompts for the fret number with the title "What fret is the note you just added?"
  - The click handler captures the clicked string index and the visible fret row index so the note stays on the same visual line
- After the user types an absolute fret `N`
  - The clicked string is set to `N` in `tokens`
  - `baseFret` is set to `max(1, N - rowIndex)` so the labels slide to keep the dot on that row
  - The diagram rerenders and persists through the normal `persist('toggle-root-click')` flow in view mode
- Example
  - Labels show `1 2 3 4`
  - User clicks the third row and types `7`
  - Labels become `5 6 7 8` and the dot remains on the third row

These base fret prompts do not change the one note per string invariant, the shape encoding, or any modifier click semantics.

---

## Click behavior

All diagram clicks share common rules

- In view mode
  - Changes update the shape and diagram
  - `persist(reason)` is called once per click path
- In edit mode
  - Changes update the shape and diagram
  - Edit mode stays active
  - Diagram clicks do not call `finishEditing`
  - Diagram clicks do not call `persist` directly

In all cases the click handler must

- Call `event.stopPropagation()` so global click away handlers do not treat diagram clicks as outside clicks
- Use `currentEditingCard === card` to detect edit mode

### Plain left click

Plain left click is the simple toggle for notes and muting

Input

- `stringIndex` from 0 to 5
- `fret` an integer
  - `0` for header clicks on `.chord-header-label`
  - positive fret for body cells

Logic

- Let `t = tokens[stringIndex]`

Cases

- If `t` is a positive integer and equals `fret`
  - Remove the note and mute this string
  - `tokens[stringIndex] = null`
  - `roots[stringIndex] = null`
- Else if `t` is `0` and the click is on the header cell for this string
  - Remove the open note and mute this string
  - `tokens[stringIndex] = null`
  - `roots[stringIndex] = null`
- Else
  - Place a plain note at the clicked fret and clear root
  - `tokens[stringIndex] = fret`
  - `roots[stringIndex] = null`

Then

- Serialize with `buildShapeFromTokensAndRootKinds`
- Update `.chord-shape-input`
- Call `renderCardDiagram(card)`
- In edit mode
  - Keep editing, no `persist`
- In view mode
  - Call `persist('toggle-root-click')` or similar

Plain clicks never set root state. They only manage mute and plain notes.

### Shift plus left click

Shift plus left click uses the complex cycle

- It operates on the targeted string and fret
- It can move a note to the clicked fret if it was on another fret

Cycle per string and fret

- plain note at that fret
- root played
- ghost root
- muted
- back to plain note at that fret

Implementation outline

- Let `t = tokens[stringIndex]`
- Let `r = roots[stringIndex]`

Step A: ensure the note is at the clicked fret

- If `t` is `null` or `0` or a different fret than `fret`
  - Set `tokens[stringIndex] = fret`
  - Set `roots[stringIndex] = null`

Step B: if the note is already at the clicked fret, cycle the root state

- If `tokens[stringIndex] === fret`
  - If `roots[stringIndex]` is `null`
    - set to `'played'`
  - Else if `'played'`
    - set to `'ghost'`
  - Else if `'ghost'`
    - set `tokens[stringIndex] = null`
    - set `roots[stringIndex] = null`
  - Else
    - fall back to plain
    - set `tokens[stringIndex] = fret`
    - set `roots[stringIndex] = null`

Then

- Serialize
- Update input and diagram
- In edit mode keep editing, no `persist`
- In view mode call `persist('toggle-root-click')`

### Alt plus left click

Alt plus left click is a direct mute

- Regardless of `fret` or existing state

Behavior

- `tokens[stringIndex] = null`
- `roots[stringIndex] = null`
- Serialize and update diagram
- Edit mode
  - keep editing, no `persist`
- View mode
  - persist with an appropriate reason

### Ctrl plus left click

Ctrl clicks never change notes or roots. They only control edit mode.

Behavior

- If not editing any card
  - Enter edit mode for this card using the same path as the `.chord-edit` icon
- If editing another card
  - Follow the same behavior as clicking edit on a new card
    - commit or cancel the previous card as existing code does
    - then enter edit for this card
- If editing this card
  - Commit and exit edit mode using the same code path as the normal edit commit

The handler must reuse existing helpers such as `beginEditing(card)` and `finishEditing(true)` rather than inventing a parallel path.

### Ctrl plus Enter

When `currentEditingCard` is not null

- Ctrl plus Enter commits the current edit and exits edit mode using the same commit path as the edit UI

Typical hook

- A keydown listener checks for `event.key === 'Enter'` and `event.ctrlKey`
- When true
  - calls `finishEditing(true)` for `currentEditingCard`

---

## Header clicks

Header clicks are clicks above the nut on `.chord-header-label`.

- Each header cell has exactly one `.chord-header-label`
  - Visible content is `X`, `0`, root dot markup, or `&nbsp;` as placeholder
- The click handler treats header clicks as `fret = 0` and uses the same dispatch as body clicks

Mapping

- `event.target.closest('.chord-header-label')` identifies a header click
- The containing header row and cell index compute `stringIndex`
- `fret` is set to `0`
- Then the plain, Shift, Alt dispatch is reused

This ensures that above nut behavior is consistent with the fretboard.

Open string roots

- When `tokens[i] === 0` and `roots[i]` is
  - `'played'`
    - header shows a solid root dot with inset `R`
  - `'ghost'`
    - header shows a ghost styled dot with inset `R`

These header styles should reuse the same visual language as fretted roots and ghost roots.

---

## Fret label clicks and rebasing

Fret label clicks operate on `.chord-fret-label` cells in the left column.

Step 1 — invoke the base fret modal

- On click of `.chord-fret-label`
  - The diagram click handler determines the zero-based row index and current label for that line
  - It calls the modal helper with the title "What fret should this line be?" and waits for a digit
- When the first digit is typed
  - The modal hides
  - The callback receives the chosen fret `F` for that line

Step 2 — compute rebase delta

Inside the callback

- Read the current shape and parse tokens and roots
- Determine the current top fret `currentBase`

  Logic

  - If `card.dataset.baseFret` is set to a positive integer, use that
  - Else if the current label and row index are available, derive `currentBase = label - rowIndex`
  - Else fall back to the renderer’s window: if any fretted notes exist use `maxFret - 3` (clamped to `1`), otherwise use `1`

- Compute `newBase = max(1, F - rowIndex)` so the clicked label moves to `F`
- Compute `delta = newBase - currentBase`

Step 3 — shift fretted tokens

For each string index

- Let `t = tokens[i]`
- If `t` is a number greater than `0`
  - set `tokens[i] = t + delta`
- If `t` is `0` or `null`
  - leave it unchanged

Then

- Serialize `tokens` and `roots`
- Update `.chord-shape-input`
- Set `card.dataset.baseFret = newBase`
- Call `renderCardDiagram(card)`

Example

- Diagram shows `5 6 7 8` and shape `xx678x`
- Clicking the top label (`rowIndex = 0`) and typing `7` sets `newBase = 7`, slides labels to `7 8 9 10`, and shifts the notes up by `+2` so the interval structure stays intact

Edit vs view mode

- In edit mode
  - Do not call `finishEditing`
  - Do not call `persist`
- In view mode
  - Call `persist('rebase-frets-click')` or similar

The rebase operation is always a constant shift. Do not try to compress or expand the shape beyond this delta.

---

## View vs edit mode summary

For diagram interactions

- Edit mode (`currentEditingCard === card`)
  - Plain, Shift, Alt clicks update the shape and diagram only
  - They keep the card in edit mode
  - No calls to `persist` from these handlers
  - Ctrl click and Ctrl plus Enter commit and exit via the standard editing path
- View mode
  - Plain, Shift, Alt clicks update shape and diagram
  - Each successful change calls `persist` once with a descriptive reason
  - Ctrl click enters edit and does not change notes

Global click away

- A click outside `currentEditingCard` should commit the active edit
- Diagram clicks call `stopPropagation` so they are not treated as outside clicks

---

## Guardrails

When changing chord interactions

- Do not change the one note per string invariant
- Do not introduce new encodings that bypass `parseTokensAndRootKinds` and the serializer
- Do not invent new modal flows for base fret
  - Reuse the existing "Fret #?" modal helper
- Do not change the semantics of plain, Shift, Alt, or Ctrl clicks without an explicit spec change
- Preserve the split between view mode and edit mode
  - view mode persists
  - edit mode updates locally and commits only through the edit flow

Before modifying behavior

- Inspect `freetar/static/chordDiagram.js` for rendering and header layout
- Inspect `freetar/static/my-chords.page.js` for click handlers and edit state
- Keep changes small and local to the relevant helpers
