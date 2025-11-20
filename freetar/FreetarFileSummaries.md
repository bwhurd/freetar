Each summarized file is delimited by '---'. You can ask for the full file for any given referenced file if needed to complete the task you are working on. 

---
Summary: freetar/static/chordDiagram.js

Role
Pure frontend utility that renders six string chord diagrams as HTML tables. Safe to load on any page and mirrors backend parsing so client and server stay consistent.

Core functions
-`parseShapeTokens(shape)`Normalizes compact strings like`x32010`into a six element token array, padding or trimming as needed and mapping`x`/`X`to`null`.
-`buildDiagramModel(shape)`Converts tokens into a diagram model with header markers (`X`,`O`, fret numbers), computes a starting fret, and builds four fret rows with per string occupancy flags.
-`buildChordTableInnerHTML(model)`Generates`<thead>`and`<tbody>`markup for the diagram, including header cells, per fret rows, and footer fret labels, all wired to chord specific CSS classes.
-`renderCardDiagram(card)`Reads`.chord-shape-input`from a chord card, builds the model, creates or reuses a`.chord-diagram`table positioned after`.chord-edit-fields`, and injects the generated inner HTML.

---

Summary: freetar/static/my-chords.page.js (My Chord Library page UI)

Role
Client side controller for the My Chords page. Manages group and chord card lifecycle, inline editing, delete modes, drag and drop ordering, and auto persistence to`MY_CHORDS_EDIT_URL`. Exposes`window.rewireChordUI`so undo/redo morphs can reattach behavior.
Data extraction and persistence
-`buildDataFromDOM()`Walks`.group`containers, collects group names and`.chord-card`entries, reading name from`.chord-name-input`or`.chord-title`and shape from`.chord-shape-input`. Filters out chords without a shape and assigns default names and group titles. Produces the JSON payload sent to the backend.
-`persist(reason)`POSTs the current groups structure to`MY_CHORDS_EDIT_URL`as JSON for auto save on edits, reorders, additions, and deletions. Logs soft failures instead of surfacing UI errors.
Inline editing flow
- Tracks a single`currentEditingCard`.
-`beginEditing(card)`Opens`.chord-edit-fields`, snapshots original name and shape on`dataset`, focuses and selects the name input after closing any previous card.
-`finishEditing(commit)`On commit, updates the`.chord-title`, re renders the diagram, and calls`persist('edit-commit')`. On cancel, restores original values from`dataset`. Always hides edit fields and clears state.
-`wireChordCard(card)`Binds the edit icon, Enter, and Escape behavior on name and shape inputs to drive focus, commit, or cancel. Global click away commits edits, and global Escape cancels the active edit.
Chord creation and group wiring
-`addChordToGrid(grid, name, shape)`Creates the chord card DOM (handle, title, edit icon, hidden delete button, inline editors, and empty table), appends it to the grid, wires editing, renders the diagram, and persists the addition.
-`wireGroup(groupEl)`Wires the group level Add chord button and initializes a`Sortable`instance on the`.chord-grid`if not already present. Dragging with`.chord-handle`triggers`persist('reorder-chords')`and dispatches`chords-reordered`for undo tracking.
-`rewireChordUI()`Re wires all chord cards and groups (safe after morphdom) and updates the empty state banner via`updateEmptyMsg()`.
Delete modes for chords and groups
-`enableDeleteMode(group)`Activates chord delete mode for a single group, marking cards as deletable and showing each`.delete-chord-btn`. Installs a capturing document click handler that exits delete mode when clicking outside cards and minus buttons for that group.
-`disableDeleteMode()`Hides delete affordances, removes the click away handler, and if any chords were removed while in delete mode (`deleteModeDirty`), persists`delete-chords`.
- Group delete uses a small modal
  Click on`.delete-group`opens`#delete-group-modal`and stores the target group on the modal instance. Confirm removes the group and persists`delete-group`. Cancel simply hides the modal.
- Delegated click handling on`#groups-root`drives toggling chord delete mode, removing individual cards in delete mode, and opening the delete group modal.
Initialization and global exposure
-`init()`Caches key DOM references, runs`rewireChordUI()`for server rendered groups, wires the Add group button to create a new`.group`block with header controls and an empty`.chord-grid`, and connects modal controls and global click and keydown handlers for edit behavior.
- Startup
  Runs`init()`on DOM ready and sets`window.rewireChordUI = rewireChordUI`so the undo/redo system can reattach all page interactions after applying new HTML.

---


---


---


---


---


---