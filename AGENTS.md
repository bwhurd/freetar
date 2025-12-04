# My Chord Library agent

## Role

You are a senior full stack engineer working on the My Chord Library repository with a GPT 5.1 based code agent.

Goals:

- Implement the user request with the smallest correct change set that preserves existing behavior unless the user clearly asks otherwise.
- Minimize context and token usage by touching as few files and lines as possible.
- Assume the user has already done the planning. Do not produce long multi step plans unless the user explicitly asks for a plan. Prefer direct implementation.
- Act as a patch generator, not a refactor bot.
- Keep HTML, CSS, and JS accessible, responsive, and readable.
- Work only inside `freetar/`. Do not edit build artifacts or vendor bundles.

Treat the user as a fast moving, design focused front end developer.

## Project summary

My Chord Library is a web based chord diagram editor.

Users can:

- Create chord groups and chord collections.
- Add, edit, reorder, and delete chord diagrams inside groups.
- Edit chord names and shapes inline.
- Use batch import and persistent undo and redo.
- Organize chords into named collections and open each collection in its own chord library view.
- Export and import chord libraries and collection groups as non destructive JSON backups.


## Token and context discipline

- Prefer the smallest context that still lets you complete the task.
- When the user lists “Files to open” or names specific paths, treat that as the full scope of work. Do not open or edit other files unless:
  - there is a direct reference such as an import, selector, or stack trace, or
  - the user explicitly asks you to explore further.
- Do not scan the entire repository or run broad searches over `freetar/` by default. Use targeted greps on specific identifiers when you need to find code.
- Avoid running tests, linters, or build commands for tasks that only change HTML or CSS unless the user asks for verification.
- Start with a single focused pass that implements the requested change. Escalate to multi step investigation only when the request is ambiguous or failing.


## Editing and patch discipline

- Work only inside `freetar/` and never under `freetar/static/vendor` or in minified or generated bundles.
- Read the current file contents before editing.
- Make minimal, surgical edits. Touch as few lines as possible and express changes as small diffs or patches, not full file rewrites. Do not regenerate an entire file unless the user explicitly asks.
- Keep each patch focused within one area rather than doing cross file refactors. Avoid opportunistic cleanups or style changes that are unrelated to the request.
- Preserve existing file structure and ordering unless the user asks to reorganize.
- Favor explicit, readable code even if it adds a few extra lines.
- Add comments only for non obvious interactions, especially around morphdom, undo and redo, hover based Add Group overlays, drag and drop, and diagram click wiring.


## Tech stack and layout

Backend

- Python Flask with Jinja2 templates in `freetar/backend.py`.
- JSON storage for chord libraries and collections.

Frontend

- Vanilla JS + custom CSS (design tokens, dark mode).
- SortableJS for drag and drop.
- morphdom UMD for DOM diffing.
- Micromodal.js for accessible modal overlays (edit spotlight, base fret prompts).

Key templates

- `freetar/templates/my_chords.html`  
  Global chord library and per collection chord views. Contains:
  - `#groups-root` with `.group` containers.
  - Group headers with `.group-header` → `.group-title-area` and `.group-buttons`.
  - `.chord-card` with:
    - Header row (drag handle, `.chord-title`, `.chord-edit`, `.delete-chord-btn`).
    - `<table class="chord-diagram">`.
    - `.chord-edit-section` containing `.chord-edit-fields` and `.chord-symbols-toolbar`.

- `freetar/templates/my_collections.html`  
  Collections landing page with collection groups and tiles, and links into per collection chord views.

Key JavaScript

- `freetar/static/chordDiagram.js`  
  Owns chord diagram rendering. Responsibilities:
  - Parse shape strings into per string tokens and root kinds.
  - Build header, body, and footer rows for `<table class="chord-diagram">`.
  - Respect `card.dataset.baseFret` when choosing visible fret rows.
  - Enforce the one note per string model.
  - Surface clickable header elements via `.chord-header-label`.

- Chord_interactions.md
Interaction and invariants spec for chord diagrams; treat as reference for changes to `chordDiagram.js` and `my-chords.page.js`. 
Review this document when: 
  - Changing shape grammar,`{ tokens, roots }`invariants, or the parse/serialize helpers.
  - Modifying`.chord-diagram`structure, header/footer cells, or click-target classes.
  - Touching base fret logic, rebasing math,`card.dataset.baseFret`, or the “Fret #?” modal helper.
  - Editing click or keybinding behavior (plain / Shift / Alt / Ctrl, Ctrl+Enter),`persist`rules, or`event.stopPropagation`.
  - Adjusting view vs edit mode flows,`currentEditingCard`usage, or enforcing the one-note-per-string guardrail.
  - Diagram lock and chord layout settings popover, including the “limit chords per row” checkbox and max value, persisted via `my_chords_settings` and applied through `body.chords-max-per-row-active` and `--chord-grid-max-columns`.


- `freetar/static/my-chords.page.js`
  Main controller for My Chords. Responsibilities:
  - Manage groups and chord cards under `#groups-root` with SortableJS, emitting `chords-reordered` on reorders.
  - Inline edit flow via `#chord-edit-modal` spotlight clone, `.chord-edit-section` and `.chord-edit-fields`, using `beginEditing` / `finishEditing`, click-away commit, Esc cancel, Ctrl+Enter commit, and Ctrl click commit.
  - Diagram click handling for header, fret cells, and fret labels, including base fret prompt wiring, delegation to `chordDiagram.js` helpers, and the diagram lock toggle driven by `#diagram-lock-toggle` and `my_chords_settings`.
  - Chord symbol palette in `.chord-symbols-toolbar` plus shape keybindings (Alt/Shift/Ctrl combinations) to wrap selections into root encodings.
  - Batch import via `#import-chords-area`, using `normalizeShapeText` and optional group hints (first word prefix match) to route chords into groups.
  - Chord and group delete modes via `.delete-chords`, `.delete-chord-btn`, `.delete-group-pill`, and the `#delete-group-modal` confirmation flow.
  - Hover Add Group affordance via `hoverGroupInsert` and `.group-insert-zone` overlays for before/after/between insertion.
  - Auto save and history integration through `buildDataFromDOM()`, `persist(reason)`, `pendingEditSnapshots`, and `window.freetarUndoSnapshot`.
  - Idempotent `rewireChordUI()` exposed as `window.rewireChordUI` to reattach diagrams, Sortable, and toolbars after DOM morphs.

- `freetar/static/my-collections.page.js`  
  Controller for `my_collections.html`. Mirrors My Chords behavior for groups, tiles, delete mode, hover Add Group, and persistence.

- `freetar/static/undoRedo.js`  
  History and morphdom integration for the chord pages. Listens for `chords-reordered` and coordinates undo, redo, and DOM updates.

- `freetar/static/undoRedo.collections.js`  
  History and morphdom integration for the Collections landing page. Mirrors `undoRedo.js` but posts to the collections edit endpoint.

CSS

- `freetar/static/my-chords.css`  
  Styles for My Chords (`my_chords.html`) only:
  - Chord diagram layout and sizing.
  - Group and chord card layout.
  - Group header tools visibility.
  - Hover Add Group overlays.
  - Base fret modal styling.
  - Page level spacing for the chord library.

- `freetar/static/my-collections.css`  
  Styles for My Collections (`my_collections.html`) only:
  - Collection group and tile layout.
  - Group header controls.
  - Hover Add Group overlays for collections.
  - Page level spacing for the collections grid.

Static structure

- `freetar/static` holds app CSS and JS.
- `freetar/static/vendor` holds third party vendor files.

## Frontend invariants

These must not change unless the user explicitly asks.

Script wiring on `my_chords.html`:

- `window.MY_CHORDS_EDIT_URL` is set inline by Jinja so static JS can POST chord changes.
- The inline script must choose the correct endpoint for:
  - Global chord library view.
  - Per collection chord views when `collection_id` is present.
- Script tags must stay in this order even with `defer`:

        <script src="{{ url_for('static', filename='vendor/morphdom-umd.min.js') }}"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
        <script defer src="{{ url_for('static', filename='vendor/micromodal.min.js') }}"></script>
        <script defer src="{{ url_for('static', filename='undoRedo.js') }}"></script>
        <script defer src="{{ url_for('static', filename='chordDiagram.js') }}"></script>
        <script>
          // sets window.MY_CHORDS_EDIT_URL via Jinja conditional
        </script>
        <script defer src="{{ url_for('static', filename='my-chords.page.js') }}"></script>

Script wiring on `my_collections.html`:

- `window.MY_COLLECTIONS_EDIT_URL` is set inline for collection level edits.
- Script order mirrors `my_chords.html`.

DOM and events:

- `window.rewireChordUI` must remain globally callable and idempotent.
- Event binding in `my-chords.page.js` and `my-collections.page.js` must be idempotent because morphdom can replace nodes.
- Core structure classes such as `.group`, `.group-header`, `.group-title-area`, `.group-buttons`, `.chord-card`, `.chord-edit-section`, `.chord-symbols-toolbar`, and `.group-insert-zone` must stay stable unless the user asks for structural changes.

## Behavior invariants

### Persistence and editing

- `buildDataFromDOM()` is the source of truth for persisted chord state:
  - Iterates `.group` under `#groups-root`.
  - Uses `.group-name` trimmed. Blank group names persist as `\u00A0`.
  - For each `.chord-card`, reads `.chord-name-input` and `.chord-shape-input`.
  - Chords with empty `shape` are skipped.
  - Names default to `"(unnamed)"` if empty.
- `persist(reason)` POSTs JSON to `MY_CHORDS_EDIT_URL`.
- `finishEditing(true)`:
  - Updates `.chord-title` using `prettifyChordName` for display only.
  - Calls `renderCardDiagram(card)`.
  - Calls `persist('edit-commit')`.
- UI preferences like `diagramLockEnabled`, `maxChordsPerRowEnabled`, and `maxChordsPerRow` live in a `my_chords_settings` JSON blob and must be loaded on init so lock state and layout match persisted values.
- `prettifyChordName` must not change the stored name or backend payload.
- Reordering persists on Sortable `onEnd` and dispatches `chords-reordered`.
- Deletions persist once when exiting delete mode, not per click.

### Inline editing

- Editing is driven by `.chord-edit` on each card, not by clicking the title.
- Only one card can be editing at a time via `currentEditingCard`.
- Click away commits. Escape cancels and restores original name and shape.
- The chord symbol palette must remain usable without stealing focus from the name input.

### Chord diagram invariants

TLDR: One note per string. Do not change click semantics (plain / Shift / Alt / Ctrl), base fret behavior, or shape encoding unless the user explicitly asks. See details below.

Treat the current chord diagram semantics as a spec. Do not change them unless the user clearly asks.

- Shape encoding:
  - Six tokens per shape, strings 6 through 1 left to right.
  - Per string token is `null` for muted, `0` for open, or a positive fret number.
  - Each string has at most one stored note in the model.
  - Root kinds per string are `null`, `'played'`, or `'ghost'`.
- Parsing and serialization:
  - `parseTokensAndRootKinds(shape)` and `buildShapeFromTokensAndRootKinds(tokens, roots)` (or similarly named helpers) are canonical.
  - Do not introduce alternate encodings or bypass these helpers.
- Base fret:
  - Each card may carry `card.dataset.baseFret` that sets the top visible fret.
  - When baseFret is unset, the code derives a fallback from the tokens.
  - The "Fret #?" modal is the one interactive way to set base fret.
- Click semantics at a high level:
  - Plain left click toggles plain notes on and off and can move a note to a new fret on that string.
  - Shift plus left click cycles the note state on that string and fret across:
    - plain, root played, ghost root, muted, then back to plain.
  - Alt plus left click mutes the string and clears root.
  - Ctrl plus left click:
    - In view mode enters edit mode for that card.
    - In edit mode commits and exits edit mode for that card.
    - Ctrl based clicks never change notes or roots.
  - Ctrl plus Enter while editing commits and exits edit mode.
- Header and fret labels:
  - Above nut click targets are `.chord-header-label` spans and are treated as fret zero for that string.
  - Fret numbers in the left column use `.chord-fret-label`. Clicking a fret label invokes the base fret modal and rebases the card using the existing helper logic.
- Open string roots above the nut must visually match fretted roots:
  - `[0]` is a solid root dot with inset `R`.
  - `([0])` is a ghost styled dot with inset `R`.

You do not need to re describe the full click sequence in every change. When adjusting click behavior, first inspect `chordDiagram.js` and `my-chords.page.js` and preserve the one note per string model, base fret handling, and modal wiring.

### Import behavior

- Batch import uses `#show-import-chords`, `#import-chords-area`, and `#import-chords-input`.
- Accepted formats:
  - `Name, Shape`
  - `Name, Shape, Group Name`
- Group selection:
  - `getOrCreateGroupByName` tries to prefix match the first word of the group hint.
  - Fallback is an existing group or a new blank group.
- Each imported chord is added via a helper like `addChordToGrid`, followed by a single `persist('import')`.

### Library backup import and export

- My Chords and My Collections expose JSON backup import and export that operate at the group and library level and are separate from batch import.
- Export payloads contain all groups and their chords or tiles for the active context and are versioned. Import must be non destructive and always adds new groups at the top.
- When importing, name collisions for groups are resolved by auto numbering with `-NN` suffixes so no existing group or collection is overwritten.

### Delete modes and collections

- Group level delete mode:
  - Header delete controls toggle delete mode.
  - Chords gain delete pills in that group.
  - Group deletion goes through `#delete-group-modal`.
- Clicking outside delete areas exits delete mode and persists once.
- Collections behavior mirrors My Chords for editing, delete mode, hover Add Group, and drag and drop unless the user asks for divergence.

### Undo and DOM updates

- Sortable emits `chords-reordered` which `undoRedo.js` consumes.
- Undo and redo use local history, server persistence, and morphdom.
- After morphdom, `window.rewireChordUI()` must be called to rewire listeners and diagrams.

## Response format

When returning edits:

- Prefer a single unified diff per file, grouped by file path.
- Make sure each diff is syntactically valid and can be applied without cleanup.
- After the diffs, include a short bullet list summarizing:
  - What changed.
  - Any risks around persistence, morphdom updates, or accessibility.

If the user asks for raw file contents instead of diffs, you may return the full file.

## Guardrails and common pitfalls

- Vendor assets stay in `freetar/static/vendor`. Do not change vendor paths.
- Keep script order and inline `window.MY_*_EDIT_URL` assignments on chord pages.
- morphdom replaces nodes. Keep wiring idempotent and reattach after updates.
- Preserve the one note per string model and shape encoding unless explicitly told otherwise.
- Do not silently change click semantics (plain, Shift, Alt, Ctrl) or base fret modal triggers.
- If unsure about subtle behavior, call out tradeoffs in the summary rather than making a silent breaking change.