/* Persistent Undo/Redo for Chord Collections
   - Stores a snapshot history in localStorage separate from chords.
   - Applies a snapshot by POSTing it to /my-collections/edit, then morphs #groups-root.
   - No external dependencies; self-contained IIFE.
*/
(() => {
  'use strict';

  // ---------- Config ----------
  const ENDPOINT = window.MY_COLLECTIONS_EDIT_URL || '/my-collections/edit';
  const STORAGE_KEY = 'freetar:collections:history:v1';
  const MAX_SNAPSHOTS = 50;
  const BTN_ROW_SELECTOR = '.page-title-row'; // top button row

  const groupsRoot = document.getElementById('groups-root');
  if (!groupsRoot) return;

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const jstr = (o) => JSON.stringify(o);

  // Build the JSON expected by /my-collections/edit
  function serializeFromDOM() {
    const groups = [];
    $$('.group', groupsRoot).forEach((groupEl) => {
      const nameInput = $('.group-name', groupEl);
      const rawGroupName = nameInput ? nameInput.value : '';
      const groupName = rawGroupName.trim() || '\u00A0';
      const collections = [];
      $$('.collection-card', groupEl).forEach((card) => {
        const nameInput = $('.collection-name-input', card);
        const titleEl = $('.collection-title', card);
        const rawName = (
          nameInput && nameInput.value ? nameInput.value : titleEl ? titleEl.textContent : ''
        ).trim();
        const name = rawName || 'Collection';
        const id = card.dataset.collectionId || '';
        collections.push({ id, name });
      });
      groups.push({ group: groupName, collections });
    });
    return groups;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [], index: -1 };
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.items) || typeof parsed.index !== 'number') throw new Error('bad history');
      return parsed;
    } catch {
      return { items: [], index: -1 };
    }
  }

  function saveHistory(hist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hist));
    } catch (e) {
      console.warn('[collections:undo] failed to persist history', e);
    }
  }

  function statesEqual(a, b) {
    return jstr(a) === jstr(b);
  }

  function pushSnapshot(reason = '') {
    const hist = loadHistory();
    const current = serializeFromDOM();
    const last = hist.items[hist.items.length - 1];

    if (last && statesEqual(last, current)) {
      updateButtons();
      return;
    }

    if (hist.index < hist.items.length - 1) {
      hist.items = hist.items.slice(0, hist.index + 1);
    }

    hist.items.push(current);
    if (hist.items.length > MAX_SNAPSHOTS) {
      const cut = hist.items.length - MAX_SNAPSHOTS;
      hist.items = hist.items.slice(cut);
      hist.index = hist.items.length - 1;
    } else {
      hist.index = hist.items.length - 1;
    }

    saveHistory(hist);
    updateButtons();
    // console.debug('[collections:undo] snapshot pushed:', reason);
  }

  async function applySnapshotAndPersist(targetState, reason = '') {
    try {
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetState),
      });

      const res = await fetch(window.location.href, {
        cache: 'no-store',
        headers: { 'X-Requested-With': 'fetch' },
      });
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      const html = await res.text();

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newRoot = doc.getElementById('groups-root');
      const curRoot = document.getElementById('groups-root');

      if (!newRoot || !curRoot) throw new Error('#groups-root missing in fetched HTML');
      if (typeof window.morphdom !== 'function') throw new Error('morphdom not loaded');

      window.morphdom(curRoot, newRoot, { childrenOnly: true });

      if (window.rewireCollectionsUI) window.rewireCollectionsUI();
      if (window.rewireChordUI) window.rewireChordUI(); // harmless if chords UI is present
      updateButtons();
    } catch (e) {
      console.warn('[collections:undo] Live morph failed; falling back to reload. Reason:', e);
      window.location.reload();
    }
  }

  function canUndo() {
    const hist = loadHistory();
    return hist.index > 0;
  }
  function canRedo() {
    const hist = loadHistory();
    return hist.index >= 0 && hist.index < hist.items.length - 1;
  }

  function doUndo() {
    const hist = loadHistory();
    if (hist.index <= 0) return;
    hist.index -= 1;
    saveHistory(hist);
    updateButtons();
    applySnapshotAndPersist(hist.items[hist.index], 'undo');
  }

  function doRedo() {
    const hist = loadHistory();
    if (hist.index >= hist.items.length - 1) return;
    hist.index += 1;
    saveHistory(hist);
    updateButtons();
    applySnapshotAndPersist(hist.items[hist.index], 'redo');
  }

  // ---------- Buttons UI ----------
  function insertButtons() {
    const row = $(BTN_ROW_SELECTOR);
    if (!row) return;

    let wrap = document.getElementById('undo-redo-wrap');
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.id = 'undo-redo-wrap';
      wrap.style.marginLeft = 'auto';
      wrap.style.display = 'flex';
      wrap.style.gap = '0.5rem';
      wrap.style.alignItems = 'center';
      row.appendChild(wrap);
    }

    let btnUndo = $('#undo-history-btn');
    if (!btnUndo) {
      btnUndo = document.createElement('button');
      btnUndo.id = 'undo-history-btn';
      btnUndo.className = 'btn btn-sm btn-primary';
      btnUndo.title = 'Undo';
      btnUndo.setAttribute('aria-label', 'Undo');
      btnUndo.innerHTML = '<span class="material-icons-outlined" aria-hidden="true">undo</span>';
      btnUndo.addEventListener('click', (e) => {
        e.preventDefault();
        doUndo();
      });
      wrap.appendChild(btnUndo);
    }

    let btnRedo = $('#redo-history-btn');
    if (!btnRedo) {
      btnRedo = document.createElement('button');
      btnRedo.id = 'redo-history-btn';
      btnRedo.className = 'btn btn-sm btn-primary';
      btnRedo.title = 'Redo';
      btnRedo.setAttribute('aria-label', 'Redo');
      btnRedo.innerHTML = '<span class="material-icons-outlined" aria-hidden="true">redo</span>';
      btnRedo.addEventListener('click', (e) => {
        e.preventDefault();
        doRedo();
      });
      wrap.appendChild(btnRedo);
    }
  }

  function updateButtons() {
    const undoBtn = $('#undo-history-btn');
    const redoBtn = $('#redo-history-btn');
    if (!undoBtn || !redoBtn) return;
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  }

  // ---------- Event capture ----------
  function installCapture() {
    groupsRoot.addEventListener(
      'blur',
      (e) => {
        const t = e.target;
        if (t && (t.classList.contains('group-name') || t.classList.contains('collection-name-input'))) {
          pushSnapshot('edit-blur');
        }
      },
      true,
    );

    groupsRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('.add-chord');
      if (!btn) return;
      setTimeout(() => pushSnapshot('add-collection'), 0);
    });

    groupsRoot.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('.delete-chord-btn');
        if (!btn) return;
        setTimeout(() => pushSnapshot('delete-collection'), 0);
      },
      true,
    );

    const confirmDeleteGroupBtn = document.getElementById('confirm-delete-group');
    if (confirmDeleteGroupBtn) {
      confirmDeleteGroupBtn.addEventListener('click', () => {
        setTimeout(() => pushSnapshot('delete-group'), 0);
      });
    }

    const addGroupBtn = document.getElementById('add-group');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => {
        setTimeout(() => pushSnapshot('add-group'), 0);
      });
    }

    document.addEventListener('collections-reordered', () => {
      pushSnapshot('reorder-collections');
    });
  }

  // ---------- Initialize / Reconcile ----------
  function reconcileOnLoad() {
    const hist = loadHistory();
    const current = serializeFromDOM();

    if (hist.items.length === 0) {
      hist.items = [current];
      hist.index = 0;
      saveHistory(hist);
      return;
    }

    const curStr = jstr(current);
    let found = -1;
    for (let i = hist.items.length - 1; i >= 0; i--) {
      if (jstr(hist.items[i]) === curStr) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      hist.index = found;
      saveHistory(hist);
    } else {
      hist.items.push(current);
      if (hist.items.length > MAX_SNAPSHOTS) hist.items = hist.items.slice(hist.items.length - MAX_SNAPSHOTS);
      hist.index = hist.items.length - 1;
      saveHistory(hist);
    }
  }

  // ---------- Boot ----------
  insertButtons();
  reconcileOnLoad();
  installCapture();
  updateButtons();

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) updateButtons();
  });
})();
