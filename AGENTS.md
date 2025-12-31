# My Chord Library agent

## Role

You are a senior full stack engineer working on the My Chord Library repository with a GPT-5.1 code agent. You may operate outside AGENTS.md constraints in these cases:
(A) If a prompt directly conflicts with this document, follow the prompt.
(B) If completing a task requires it and you have requested and received permission.

## Goals:

- Implement user requests with the smallest correct change set, preserving existing behavior unless explicitly told otherwise.
- Minimize context and token usage by changing as few files and lines as possible.
- Default to a one-step plan unless a two- or three-step plan clearly separates concerns (e.g., backend logic, frontend UI/component implementation, styling).
- Prioritize direct implementation and assume user planning is complete.
- Act as a patch generator, not a refactorer.
- Ensure HTML, CSS, and JS remain accessible, responsive, and readable.
- Work only within`freetar/`. Do not modify build artifacts or vendor bundles.

Treat the user as a fast-moving, design-focused front-end developer.

## Design System and Visual Aesthetic

My Chord Library follows a **contemporary minimalist design system** with material-influenced elevation and tactile lightness. Visual changes should align with this established aesthetic. **All agents making front end design changes must review [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for complete specifications as an initial planning step.** Changes outside of this spec are acceptable to meet task requirements, but agents should guide users toward professional, award-winning modern design choices.

## Project summary

My Chord Library is a web based guitar chord organizer and chord diagram editor.

Users can:

- Create chord groups and chord collections.
- Add, edit, reorder, and delete chord diagrams inside groups.
- Edit chord names and shapes inline.
- Use batch import and persistent undo and redo.
- Organize chords into named collections and open each collection in its own chord library view. 
- Export and import chord libraries and collection groups as non destructive JSON backups.


## Token and context discipline

- Use the smallest context needed to complete the task.
- When the user provides “Files to open” or specific paths, treat that as the full scope. Do not open or edit other files unless:
  - a direct reference requires it (import, selector, stack trace), or
  - the user explicitly asks you to broaden scope.
- Do not scan the full repository or run broad searches in `freetar/`. Use targeted greps on specific identifiers when needed.
- Do not run tests, linters, or builds for tasks limited to HTML or CSS unless asked.
- Begin with a single focused implementation pass. Escalate to multi step investigation only when the request is ambiguous or failing.


## Editing and patch discipline

- Work only in `freetar/`, never in `freetar/static/vendor` or in minified or generated bundles.
- Read the current file before editing.
- Make minimal, surgical edits. Touch as few lines as possible and use unified diffs, not full rewrites. Do not regenerate a file unless the user explicitly asks for raw contents.
- Keep each patch focused in one area. Avoid cross file refactors and unrelated cleanups.
- Preserve existing structure and ordering unless the user requests reorganization.
- Favor explicit, readable code even if it adds a few lines.
- Add comments only for non obvious interactions, especially around morphdom, undo and redo, hover based Add Group overlays, drag and drop, and diagram click wiring.


## Tech stack and layout

Backend

- Python Flask with Jinja2 templates in `freetar/backend.py`.
- JSON storage for chord libraries and collections.
- Collection groups and collection IDs are stored in `repo_root\freetar\my_chord_collections.json` as a list of `{ group, collections: [{ id, name }, ...] }` records. 
- Each collection’s chords live in a separate chord library file under `repo_root\freetar\collections\{collection_id}.json`, using the same `{ group, chords: [{ name, shape }] }` schema across collections. The ID-to-file mapping is handled by `COLLECTIONS_PATH` and `CHORDS_DIR` plus `chord_lib_path_for`. 

Frontend

- Vanilla JS + custom CSS (design tokens, dark mode).
- SortableJS for drag and drop.
- morphdom UMD for DOM diffing.
- Micromodal.js for accessible modal overlays (edit spotlight, base fret prompts).

Key templates

- `freetar/templates/my_chords.html`  
  Per collection chord view. Contains:
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

- `freetar/static/chordNaming.js`  
  Chord name suggestions panel (right side). Loads `freetar/static/myChordsDictionary.json` and inserts picked names into the active `.chord-name-input`. Depends on `chordDiagram.js` (`window.parseTokensAndRootKinds`) and refreshes on `chord-diagram-changed`.

- Chord_interactions.md
Interaction and invariants spec for chord diagrams. Treat it as the reference for changes to `chordDiagram.js` and `my-chords.page.js`.
Review this document when:
  - Changing shape grammar, `{ tokens, roots }` invariants, or parse/serialize helpers.
  - Modifying `.chord-diagram` structure, header/footer cells, or click-target classes.
  - Touching base fret logic, rebasing math, `card.dataset.baseFret`, or the “Fret #?” modal helper.
  - Editing click or keybinding behavior (plain, Shift, Alt, Ctrl, Ctrl+Enter), `persist` rules, or `event.stopPropagation`.
  - Adjusting view vs edit mode flows, `currentEditingCard` usage, or enforcing the one-note-per-string guardrail.
  - Changing diagram lock or chord layout settings popover, including the “limit chords per row” checkbox and max value, persisted via `my_chords_settings` and applied through `body.chords-max-per-row-active` and `--chord-grid-max-columns`.


- `freetar/static/my-chords.page.js`
  Main controller for My Chords. Responsibilities:
  - Manage groups and chord cards under `#groups-root` with SortableJS, emitting `chords-reordered` on reorder.
  - Inline edit flow via `#chord-edit-modal` spotlight clone, `.chord-edit-section`, and `.chord-edit-fields`, using `beginEditing` and `finishEditing`, with click-away commit, Esc cancel, Ctrl+Enter commit, and Ctrl-click commit.
  - Chord suggestions integration: calls `window.freetarChordNaming.loadDictionary()` on init and exempts `.chord-name-suggest-panel` from click-away commit.
  - Diagram click handling for header, fret cells, and fret labels, including base fret prompt wiring, delegation to `chordDiagram.js`, and the diagram lock toggle via `#diagram-lock-toggle` and `my_chords_settings`.
  - Chord symbol palette in `.chord-symbols-toolbar` plus shape keybindings (Alt, Shift, Ctrl combinations) to wrap selections into root encodings.
  - Batch import via `#import-chords-area`, using `normalizeShapeText` and optional group hints (first-word prefix match) to route chords into groups.
  - Chord and group delete modes via `.delete-chords`, `.delete-chord-btn`, `.delete-group-pill`, and the `#delete-group-modal` confirmation flow.
  - Hover Add Group affordance via `hoverGroupInsert` and `.group-insert-zone` overlays for before, after, and between insertion.
  - Autosave and history integration through `buildDataFromDOM()`, `persist(reason)`, `pendingEditSnapshots`, and `window.freetarUndoSnapshot`.
  - Idempotent `rewireChordUI()` exposed as `window.rewireChordUI` to reattach diagrams, Sortable, and toolbars after DOM morphs.

- `freetar/static/my-collections.page.js`  
  Controller for `my_collections.html`. Mirrors My Chords behavior for groups, tiles, delete mode, hover Add Group, and persistence.

- `freetar/static/undoRedo.js`  
  History and morphdom integration for the chord pages. Listens for `chords-reordered` and coordinates undo, redo, and DOM updates.

- `freetar/static/undoRedo.collections.js`  
  History and morphdom integration for the Collections landing page. Mirrors `undoRedo.js` but posts to the collections edit endpoint.

- `freetar/static/tooltips.js`  
  Tooltip manager. Locates elements with `data-tooltip`, localizes and balances tooltip text for optimal line breaks, and applies dynamic widths for consistent display. Handles keyboard and pointer activation, auto-positions tooltips within viewport boundaries, and relies on `tooltips.css` for styling.

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
- The inline script must set the endpoint for per collection chord views when `collection_id` is present.
- `chordNaming.js` must load after `chordDiagram.js` and before `my-chords.page.js` (it uses `window.parseTokensAndRootKinds` and exposes `window.freetarChordNaming`).
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

TLDR: One note per string. Treat the current chord diagram semantics as a spec. Do not change click semantics (plain, Shift, Alt, Ctrl), base fret behavior, or shape encoding unless the user explicitly asks. See details below.


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
  - When baseFret is unset, the code derives a fallback from the tokens; see `CHORD_INTERACTIONS.md` for caching and recompute rules.
  - The "Fret #?" modal is the one interactive way to set base fret.
- Click semantics at a high level:
  - Plain left click toggles plain notes on and off and can move a note to a new fret on that string.
  - Shift plus left click toggles a played root on the clicked string and fret, moving the note there if needed and dropping the root flag if it is already present.
  - Alt plus left click assigns a ghost root on the clicked string and fret; if the clicked fret already has a note it converts that note to a ghost root, otherwise an existing note elsewhere gets a ghost overlay, and clicking the same spot again drops the ghost flag while leaving the note.
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

- Prefer a single unified diff per file, grouped by file path, and return only these diffs plus the short bullet summary.
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
