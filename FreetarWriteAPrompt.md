Write a high quality prompt for the Codex IDE VS Code extension using GPT-5.1-Codex-Max for the Freetar “My Chord Library” project.

Inputs in this message:
- AGENTS.md between the 111s
- An example Codex prompt between the 222s
- A Task description in plain English between the 333s.

Your job

- Read AGENTS.md to understand the project, invariants, and patch rules.
- Study the example prompt to match its style, structure, and level of detail.
- Use the file tree only to choose a minimal set of files that obviously need to change for the Task.
- Then write a single Codex prompt that will:
  - Make Codex complete the Task correctly on the first pass as often as possible.
  - Keep token usage low by scoping files and instructions tightly.

Constraints for the Codex prompt you output

- Assume Codex already loads AGENTS.md. Do not paste AGENTS.md content into the prompt. Instead, refer to it briefly, for example:
  “AGENTS.md at the project root is your primary spec. Follow its editing, patch, and invariant rules. For this task, it is important you review x,y,z sections of the AGENTS.md spec and section w of the CHORD_INTERACTIONS.md”
- Follow the section structure of the example prompt: a short intro, then sections like “Task”, “Files”, “Behavior” (or similar), “Constraints”, and “Return”.
- Choose the smallest reasonable Files list for the Task. Do not list files that are clearly unrelated.
- Describe behavior and implementation details at a similar level of precision as the example, but avoid unnecessary repetition or restating invariants that AGENTS.md already covers.
- Keep natural language concise and directive.
- Do not mention 111 or 222 in the output. The output should look like a direct prompt I can paste into Codex.

Now here are the inputs.


111
# AGENTS.md (for reference)
```
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
```
111

---



222
# Example Prompt
```
You are editing the freetar repo. AGENTS.md at the project root is your primary spec. Follow its editing, patch, and invariant rules, including staying under freetar/ and never touching vendor bundles.

Task

Add a shared tooltip helper and wire it into both My Chords and My Collections so that data-tooltip attributes show balanced multi line tooltips.

Files

- freetar/static/tooltips.js (new)
- freetar/static/my-chords.css
- freetar/static/my-collections.css
- freetar/templates/my_chords.html
- freetar/templates/my_collections.html
- freetar/static/my-chords.page.js
- freetar/static/my-collections.page.js

Behavior

1) Tooltip behavior

- Use a data attribute pattern
  - Any element with data-tooltip uses the custom tooltip behavior
  - Existing controls like Add chord, Import chords, Undo, Redo, Lock should use this pattern
- Tooltip text rules
  - If length <= 20 chars, show as a single line
  - If longer, wrap at word boundaries into at most 3 or 4 lines
  - Prefer balanced line lengths and avoid a very short last line
  - Use a max characters per line driven by a CSS variable so we can tune width
  - Support either newline characters or <br> for line breaks, but final rendering must work cleanly with CSS

2) tooltips.js

Create freetar/static/tooltips.js with:

- A helper that reads a root CSS variable like --tooltip-max-ch and falls back to a default such as 36
- A function balanceTooltipLines(text, maxCharsPerLine, maxLines) that
  - Takes raw tooltip text
  - Returns the same text or a version with line breaks at word boundaries
  - Uses a simple scoring approach that
    - Penalizes lines much shorter than maxCharsPerLine
    - Penalizes a last line with only one or two words
    - Prefers using fewer total lines, up to maxLines
- An initTooltips function that
  - Finds elements with data-tooltip
  - Reads canonical text from data-tooltip-src if present, otherwise from data-tooltip and stores it in data-tooltip-src
  - For text longer than 20 characters, runs balanceTooltipLines and writes the balanced text back into data-tooltip
- A setupTooltipBoundary function that
  - Uses a boundary element (for example a main content wrapper) or document.body
  - Positions the tooltip bubble so it stays inside the boundary horizontally and inside the viewport vertically
  - Can rely on CSS and variables like --tooltip-offset-x and --tooltip-offset-y
- Expose only what is needed globally, for example window.initTooltips and window.setupTooltipBoundary

Keep tooltips.js self contained and framework free. Do not use chrome or extension specific APIs.

3) CSS

In my-chords.css and my-collections.css:

- Define shared tooltip bubble styles that read data-tooltip and use
  - text-wrap balance
  - white space settings that respect newlines or <br> from tooltips.js
  - a max width in ch, controlled by --tooltip-max-ch
- Ensure My Chords and My Collections share the same visual tooltip rules, with only layout differences if needed

4) Template and controller wiring

In my_chords.html and my_collections.html:

- Include tooltips.js as a separate script
  - Respect the script order invariants from AGENTS.md
  - Load tooltips.js after vendor scripts (morphdom, Sortable, Micromodal) and before page controllers so controllers can rely on tooltips

In my-chords.page.js and my-collections.page.js:

- On page init, call initTooltips and setupTooltipBoundary in an idempotent way
- Ensure that when morphdom updates content, rewireChordUI also triggers tooltip re initialisation for new or changed buttons

5) Integrate existing tooltips

- For buttons that already have tooltips or should have them (Add chord, Import chords, Undo, Redo, Lock)
  - Standardize on data-tooltip for display text
  - If title attributes are used, migrate or mirror to data-tooltip-src so tooltips.js can manage layout while preserving accessibility

Constraints

- Treat tooltips.js as a purely presentational enhancement
- Do not change persistence code, chord diagram semantics, click semantics, one note per string, or script order invariants defined in AGENTS.md

Return

- Patches for:
  - freetar/static/tooltips.js
  - freetar/static/my-chords.css
  - freetar/static/my-collections.css
  - freetar/templates/my_chords.html
  - freetar/templates/my_collections.html
  - freetar/static/my-chords.page.js
  - freetar/static/my-collections.page.js
- Use the patch format from AGENTS.md
- End with a short bullet summary covering
  - Where tooltips.js is wired
  - How the line balancing works
  - Any risks for accessibility, focus, or morphdom
```
222


333
# Task

333