/* my-chords.page.js
   Page-specific UI for My Chord Library.
   Expects:
   - window.MY_CHORDS_EDIT_URL (set in template)
   - SortableJS available as global Sortable
   - renderCardDiagram(card) global function
*/
(() => {
  'use strict';

  // DOM refs (filled in init)
  let groupsRoot, addGroupBtn, deleteGroupModal, confirmDeleteGroupBtn, cancelDeleteGroupBtn;

  // State
  let currentEditingCard = null;
  let deleteModeGroup = null;
  let deleteModeOffHandler = null;
  let deleteModeDirty = false;

  const EDIT_URL = () => window.MY_CHORDS_EDIT_URL || null;

  // ---------- helpers ----------
  function buildDataFromDOM() {
    const groups = [];
    groupsRoot.querySelectorAll('.group').forEach((groupEl) => {
      const gName = groupEl.querySelector('.group-name')?.value.trim() || '';
      const chords = [];
      groupEl.querySelectorAll('.chord-card').forEach((card) => {
        const nameInput = card.querySelector('.chord-name-input');
        const shapeInput = card.querySelector('.chord-shape-input');
        const titleEl = card.querySelector('.chord-title');
        const name = (nameInput?.value || titleEl?.textContent || '').trim();
        const shape = shapeInput?.value.trim() || '';
        if (!shape) return;
        chords.push({ name: name || '(unnamed)', shape });
      });
      groups.push({ group: gName || 'Group', chords });
    });
    return groups;
  }

  async function persist(reason) {
    const url = EDIT_URL();
    if (!url) {
      console.warn('Persist skipped: MY_CHORDS_EDIT_URL not set.', reason);
      return;
    }
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDataFromDOM()),
      });
    } catch (e) {
      console.warn('Auto-save failed:', reason, e);
    }
  }

  function beginEditing(card) {
    if (currentEditingCard === card) return;
    if (currentEditingCard && currentEditingCard !== card) finishEditing(true);
    const fields = card.querySelector('.chord-edit-fields');
    const nameInput = card.querySelector('.chord-name-input');
    const shapeInput = card.querySelector('.chord-shape-input');
    if (!fields || !nameInput || !shapeInput) return;
    currentEditingCard = card;
    card.dataset.originalName = nameInput.value;
    card.dataset.originalShape = shapeInput.value;
    fields.style.display = '';
    nameInput.focus();
    nameInput.select();
  }

  function finishEditing(commit) {
    const card = currentEditingCard;
    if (!card) return;
    const fields = card.querySelector('.chord-edit-fields');
    const title = card.querySelector('.chord-title');
    const nameInput = card.querySelector('.chord-name-input');
    const shapeInput = card.querySelector('.chord-shape-input');
    if (!fields || !title || !nameInput || !shapeInput) {
      currentEditingCard = null;
      return;
    }
    if (commit) {
      const newName = nameInput.value.trim();
      title.textContent = newName || '(unnamed)';
      renderCardDiagram(card);
      persist('edit-commit');
    } else {
      const originalName = card.dataset.originalName || '';
      const originalShape = card.dataset.originalShape || '';
      nameInput.value = originalName;
      shapeInput.value = originalShape;
      title.textContent = originalName || '(unnamed)';
    }
    fields.style.display = 'none';
    delete card.dataset.originalName;
    delete card.dataset.originalShape;
    currentEditingCard = null;
  }

  function wireChordCard(card) {
    const editBtn = card.querySelector('.chord-edit');
    const nameInput = card.querySelector('.chord-name-input');
    const shapeInput = card.querySelector('.chord-shape-input');
    if (!editBtn || !nameInput || !shapeInput) return;

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentEditingCard === card) finishEditing(true);
      else beginEditing(card);
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        shapeInput.focus();
        shapeInput.select();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishEditing(false);
      }
    });
    shapeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishEditing(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishEditing(false);
      }
    });
  }

  function addChordToGrid(grid, name = '(new)', shape = '000000') {
    const card = document.createElement('div');
    card.className = 'text-center chord-card mb-3';
    card.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-1 position-relative">
        <span class="material-icons-outlined chord-handle" style="cursor: move; font-size: 18px;">drag_indicator</span>
        <span class="chord-title flex-grow-1 text-truncate mx-1">${name}</span>
        <span class="material-icons-outlined chord-edit" style="cursor: pointer; font-size: 18px;">edit</span>
        <button class="delete-chord-btn" type="button" title="Delete chord" tabindex="-1" style="display:none;">&#8722;</button>
      </div>
      <div class="chord-edit-fields mb-2" style="display: none;">
        <input class="form-control form-control-sm mb-1 chord-name-input" value="${name}">
        <input class="form-control form-control-sm chord-shape-input" value="${shape}">
      </div>
      <table class="chord-diagram"></table>`;
    grid.appendChild(card);
    wireChordCard(card);
    renderCardDiagram(card);
    persist('add-chord');
    return card;
  }

  function wireGroup(groupEl) {
    const addChordBtn = groupEl.querySelector('.add-chord');
    const grid = groupEl.querySelector('.chord-grid');

    if (addChordBtn && grid && !addChordBtn.__wired) {
      addChordBtn.addEventListener('click', () => addChordToGrid(grid, '(new)', '000000'));
      addChordBtn.__wired = true;
    }

    if (grid && !grid.dataset.sortable) {
      Sortable.create(grid, {
        group: 'chords',
        handle: '.chord-handle',
        animation: 150,
        // Enable and tune autoscroll so long chord lists remain scrollable while dragging
        scroll: true, // page or nearest scroll container will scroll
        bubbleScroll: true, // allow parent containers/window to scroll
        scrollSensitivity: 60, // px from edge to start scrolling (default ~30)
        scrollSpeed: 20, // px/frame scroll speed (default ~10)
        onEnd: () => {
          persist('reorder-chords');
          document.dispatchEvent(new CustomEvent('chords-reordered'));
        },
      });
      grid.dataset.sortable = '1';
    }
  }

  // Ensure top-level Sortable for groups is attached once
  function ensureGroupSortable() {
    if (!groupsRoot || groupsRoot.dataset.groupSortable) return;
    Sortable.create(groupsRoot, {
      draggable: '.group',
      handle: '.group-handle',
      animation: 150,
      // Keep the window scrollable while dragging tall groups
      scroll: true,
      bubbleScroll: true,
      scrollSensitivity: 60,
      scrollSpeed: 20,
      onEnd: () => {
        persist('reorder-groups');
        document.dispatchEvent(new CustomEvent('chords-reordered'));
      },
    });
    groupsRoot.dataset.groupSortable = '1';
  }

  function updateEmptyMsg() {
    const msg = document.getElementById('empty-msg');
    if (!msg) return;
    msg.style.display = groupsRoot.querySelector('.group .chord-card') ? 'none' : '';
  }

  function rewireChordUI() {
    groupsRoot.querySelectorAll('.chord-card').forEach(wireChordCard);
    groupsRoot.querySelectorAll('.group').forEach(wireGroup);
    ensureGroupSortable();
    updateEmptyMsg();
  }

  function enableDeleteMode(group) {
    if (deleteModeGroup && deleteModeGroup !== group) disableDeleteMode();
    deleteModeGroup = group;
    group.querySelectorAll('.chord-card').forEach((card) => {
      card.classList.add('deletable');
      const btn = card.querySelector('.delete-chord-btn');
      if (btn) btn.style.display = 'block';
    });
    if (!deleteModeOffHandler) {
      deleteModeOffHandler = (ev) => {
        if (!deleteModeGroup) return;
        const t = ev.target;
        if (t.closest('.delete-chords')) return;
        const clickInGroup = deleteModeGroup.contains(t);
        const clickOnCard = t.closest('.chord-card');
        const clickOnMinus = t.closest('.delete-chord-btn');
        if (!clickInGroup || (!clickOnCard && !clickOnMinus)) disableDeleteMode();
      };
      document.addEventListener('click', deleteModeOffHandler, true);
    }
  }

  function disableDeleteMode() {
    if (!deleteModeGroup) return;
    deleteModeGroup.querySelectorAll('.chord-card').forEach((card) => {
      card.classList.remove('deletable');
      const btn = card.querySelector('.delete-chord-btn');
      if (btn) btn.style.display = 'none';
    });
    if (deleteModeDirty) {
      persist('delete-chords');
      deleteModeDirty = false;
    }
    deleteModeGroup = null;
    if (deleteModeOffHandler) {
      document.removeEventListener('click', deleteModeOffHandler, true);
      deleteModeOffHandler = null;
    }
  }

  // ---------- init & global wiring ----------
  function init() {
    groupsRoot = document.getElementById('groups-root');
    if (!groupsRoot) return console.warn('my-chords.page.js: #groups-root not found.');
    addGroupBtn = document.getElementById('add-group');
    deleteGroupModal = document.getElementById('delete-group-modal');
    confirmDeleteGroupBtn = document.getElementById('confirm-delete-group');
    cancelDeleteGroupBtn = document.getElementById('cancel-delete-group');

    rewireChordUI();

    // Add Group
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => {
        const groupEl = document.createElement('div');
        groupEl.className = 'group mb-4';
        groupEl.innerHTML = `
          <div class="d-flex align-items-center mb-2 group-header gap-2">
            <span class="material-icons-outlined group-handle" style="cursor: move; font-size: 18px;">drag_indicator</span>
            <input class="form-control form-control-sm group-name" value="New group">
            <button type="button" class="btn btn-sm btn-primary add-chord">Add chord</button>
            <button type="button" class="btn btn-sm btn-primary delete-chords">Delete Chords</button>
            <button type="button" class="btn btn-sm btn-primary delete-group">Delete Group</button>
          </div>
          <div class="d-grid chord-grid"
               style="row-gap: .5rem; column-gap: 3rem; grid-template-columns: repeat(auto-fill, minmax(min(120px, 100%), 1fr));"></div>`;
        groupsRoot.appendChild(groupEl);
        wireGroup(groupEl);
      });
    }

    // Delegated deletes (chords + groups)
    groupsRoot.addEventListener('click', (e) => {
      const deleteChordsBtn = e.target.closest('.delete-chords');
      if (deleteChordsBtn) {
        const group = deleteChordsBtn.closest('.group');
        if (!group) return;
        if (deleteModeGroup === group) disableDeleteMode();
        else enableDeleteMode(group);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const deleteChordBtn = e.target.closest('.delete-chord-btn');
      if (deleteChordBtn) {
        const card = deleteChordBtn.closest('.chord-card');
        if (card) {
          card.remove();
          deleteModeDirty = true;
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const deleteGroupBtn = e.target.closest('.delete-group');
      if (deleteGroupBtn && deleteGroupModal) {
        disableDeleteMode();
        deleteGroupModal.style.setProperty('display', 'flex', 'important');
        deleteGroupModal._target = deleteGroupBtn.closest('.group') || null;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    });

    // Modal controls
    if (cancelDeleteGroupBtn) {
      cancelDeleteGroupBtn.addEventListener('click', () => {
        deleteGroupModal.style.setProperty('display', 'none', 'important');
        deleteGroupModal._target = null;
      });
    }
    if (confirmDeleteGroupBtn) {
      confirmDeleteGroupBtn.addEventListener('click', async () => {
        if (deleteGroupModal._target) {
          if (deleteModeGroup === deleteGroupModal._target) disableDeleteMode();
          deleteGroupModal._target.remove();
          await persist('delete-group');
        }
        deleteGroupModal.style.setProperty('display', 'none', 'important');
        deleteGroupModal._target = null;
      });
    }

    // Click-away commit + Esc cancel while editing
    document.addEventListener('click', (e) => {
      if (!currentEditingCard) return;
      if (currentEditingCard.contains(e.target)) return;
      finishEditing(true);
    });
    document.addEventListener('keydown', (e) => {
      if (!currentEditingCard) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        finishEditing(false);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Expose for Undo/Redo DOM morphs (called after morphdom applies HTML)
  window.rewireChordUI = rewireChordUI;
})();
