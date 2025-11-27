(() => {
    'use strict';

    const groupsRoot = document.getElementById('groups-root');
    if (!groupsRoot) return;

    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const genId = () => `c_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;

    let deleteModeGroup = null;
    let deleteModeOffHandler = null;
    let deleteModeDirty = false;
    let groupDeleteModeActive = false;
    let groupDeleteModeGroup = null;
    let deleteGroupModal = null;
    let confirmDeleteGroupBtn = null;
    let cancelDeleteGroupBtn = null;
    let hoverGroupInsert = null;
    let groupsSortableAttached = false;

    function ensureGroupHoverCSS() {
        if (document.getElementById('collections-group-hover-css')) return;
        const style = document.createElement('style');
        style.id = 'collections-group-hover-css';
        style.textContent = `
        .group .group-header .group-handle {
          opacity: 0;
          pointer-events: none;
          transition: opacity 120ms ease-in-out;
        }
        .group .group-header .add-chord,
        .group .group-header .delete-chords {
          opacity: 0;
          pointer-events: none;
          transition: opacity 120ms ease-in-out;
        }
        .group .group-header:hover .group-handle,
        .group .group-header:focus-within .group-handle {
          opacity: 1;
          pointer-events: auto;
        }
        .group:hover .group-header .add-chord,
        .group:hover .group-header .delete-chords,
        .group:focus-within .group-header .add-chord,
        .group:focus-within .group-header .delete-chords {
          opacity: 1;
          pointer-events: auto;
        }
        .group.insert-zone-hover .group-header .group-handle,
        .group.insert-zone-hover .group-header .add-chord,
        .group.insert-zone-hover .group-header .delete-chords {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        @media (hover: none) {
          .group .group-header:focus-within .group-handle {
            opacity: 1;
            pointer-events: auto;
          }
          .group:focus-within .group-header .add-chord,
          .group:focus-within .group-header .delete-chords {
            opacity: 1;
            pointer-events: auto;
          }
        }`;
        document.head.appendChild(style);
    }

    function updateEmptyMsg() {
        const msg = document.getElementById('empty-msg');
        if (!msg) return;
        msg.style.display = groupsRoot.querySelector('.group .chord-card') ? 'none' : '';
    }

    function rewireCollectionsUI() {
        qsa('.group', groupsRoot).forEach((groupEl) => {
            wireGroup(groupEl);
        });
        if (groupDeleteModeActive) {
            if (groupDeleteModeGroup && groupsRoot.contains(groupDeleteModeGroup)) {
                groupDeleteModeGroup.classList.add('deletable-group');
                const pill = ensureGroupDeletePill(groupDeleteModeGroup);
                if (pill) pill.style.display = '';
            } else {
                groupDeleteModeActive = false;
                groupDeleteModeGroup = null;
            }
        }
        ensureGroupSortable();
        if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
        updateEmptyMsg();
    }

    function buildCollectionsDataFromDOM() {
        const groups = [];
        qsa('.group', groupsRoot).forEach((groupEl) => {
            const rawGroupName = qs('.group-name', groupEl)?.value || '';
            const groupName = rawGroupName.trim() || '\u00A0';
            const collections = [];
            qsa('.chord-card', groupEl).forEach((card) => {
                const id = card.dataset.collectionId || genId();
                const input = qs('.chord-name-input', card);
                const title = qs('.chord-title', card);
                const rawName = (input?.value || title?.textContent || '').trim();
                const name = rawName || 'Collection';
                collections.push({
                    id,
                    name
                });
            });
            groups.push({
                group: groupName,
                collections
            });
        });
        return groups;
    }

    async function persistCollections(reason = '') {
        const url = window.MY_COLLECTIONS_EDIT_URL;
        if (!url) {
            console.warn('[collections] Missing MY_COLLECTIONS_EDIT_URL; skip persist.');
            return;
        }
        const payload = buildCollectionsDataFromDOM();
        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
            });
            // console.debug('[collections] persisted:', reason);
        } catch (e) {
            console.warn('[collections] Persist failed:', e);
        }
    }

    function ensureGroupSortable() {
        if (groupsSortableAttached) return;
        new Sortable(groupsRoot, {
            handle: '.group-handle',
            animation: 150,
            onEnd: () => {
                persistCollections('reorder-groups');
                document.dispatchEvent(new CustomEvent('collections-reordered'));
            },
        });
        groupsSortableAttached = true;
    }

    function enableCollectionDeleteMode(groupEl) {
        if (deleteModeGroup && deleteModeGroup !== groupEl) disableCollectionDeleteMode();
        deleteModeGroup = groupEl;
        enableGroupDeleteMode(groupEl);
        groupEl.querySelectorAll('.chord-card').forEach((card) => {
            card.classList.add('deletable');
            const btn = qs('.delete-collection-btn', card);
            if (btn) btn.style.display = 'block';
        });
        if (!deleteModeOffHandler) {
            deleteModeOffHandler = (ev) => {
                if (!deleteModeGroup) return;
                const t = ev.target;
                if (t.closest('.delete-chords')) return;
                if (t.closest('.delete-group-pill')) return;
                if (t.closest('#delete-group-modal')) return;
                const clickInGroup = deleteModeGroup.contains(t);
                const clickOnCard = t.closest('.chord-card');
                const clickOnMinus = t.closest('.delete-collection-btn');
                if (!clickInGroup || (!clickOnCard && !clickOnMinus)) disableCollectionDeleteMode();
            };
            document.addEventListener('click', deleteModeOffHandler, true);
        }
    }

    function disableCollectionDeleteMode() {
        if (!deleteModeGroup) return;
        disableGroupDeleteMode(deleteModeGroup);
        deleteModeGroup.querySelectorAll('.chord-card').forEach((card) => {
            card.classList.remove('deletable');
            const btn = qs('.delete-collection-btn', card);
            if (btn) btn.style.display = 'none';
        });
        if (deleteModeDirty) {
            persistCollections('delete-collections');
            deleteModeDirty = false;
        }
        deleteModeGroup = null;
        if (deleteModeOffHandler) {
            document.removeEventListener('click', deleteModeOffHandler, true);
            deleteModeOffHandler = null;
        }
    }

    function ensureGroupDeletePill(groupEl) {
        let pill = groupEl.querySelector('.delete-group-pill');
        if (!pill) {
            const header = qs('.group-header', groupEl);
            if (!header) return null;
            pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'delete-group-pill';
            pill.title = 'Delete group';
            pill.setAttribute('aria-label', 'Delete group');
            pill.innerHTML = '\u2212';
            header.appendChild(pill);
        }
        return pill;
    }

    function enableGroupDeleteMode(groupEl) {
        if (!groupEl) return;
        groupDeleteModeActive = true;
        groupDeleteModeGroup = groupEl;
        groupEl.classList.add('deletable-group');
        const pill = ensureGroupDeletePill(groupEl);
        if (pill) pill.style.display = '';
    }

    function disableGroupDeleteMode(targetGroup = groupDeleteModeGroup) {
        const groupEl = targetGroup;
        if (!groupEl) {
            groupDeleteModeActive = false;
            groupDeleteModeGroup = null;
            return;
        }
        groupEl.classList.remove('deletable-group');
        const pill = groupEl.querySelector('.delete-group-pill');
        if (pill) pill.style.display = 'none';
        if (groupEl === groupDeleteModeGroup) {
            groupDeleteModeActive = false;
            groupDeleteModeGroup = null;
        }
    }

    hoverGroupInsert = (() => {
        let insertPlusEl = null;
        let insertTooltipEl = null;
        let activeMode = null;
        let activeAfterGroup = null;
        let activeBeforeGroup = null;
        let activeZone = null;
        let activeGroup = null;
        let hoveringPlus = false;
        let emptyZone = null;

        const ensureElements = () => {
            if (insertPlusEl && insertTooltipEl) return;
            insertPlusEl = document.createElement('span');
            insertPlusEl.className = 'group-insert-plus material-icons-outlined';
            insertPlusEl.textContent = 'add_circle';
            insertPlusEl.style.display = 'none';

            insertTooltipEl = document.createElement('div');
            insertTooltipEl.className = 'group-insert-tooltip';
            insertTooltipEl.textContent = 'Add Group';
            insertTooltipEl.style.display = 'none';

            document.body.appendChild(insertPlusEl);
            document.body.appendChild(insertTooltipEl);

            insertPlusEl.addEventListener('mouseenter', () => {
                hoveringPlus = true;
                if (!insertPlusEl || insertPlusEl.style.display === 'none') return;
                const rect = insertPlusEl.getBoundingClientRect();
                insertTooltipEl.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
                insertTooltipEl.style.top = `${rect.top + window.scrollY}px`;
                insertTooltipEl.style.display = 'block';
            });

            insertPlusEl.addEventListener('mouseleave', (ev) => {
                hoveringPlus = false;
                if (insertTooltipEl) insertTooltipEl.style.display = 'none';
                const to = ev?.relatedTarget;
                if (activeZone && (to === activeZone || activeZone?.contains(to))) return;
                hideInsertUI();
            });

            insertPlusEl.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!groupsRoot) return;

                const newGroup = createGroupElement('Group Name', { append: false });
                if (!newGroup) return;

                let sibling = null;
                if (activeMode === 'before-first') {
                    sibling = activeBeforeGroup || groupsRoot.firstElementChild;
                } else if (activeMode === 'after-last') {
                    sibling = activeAfterGroup ? activeAfterGroup.nextElementSibling : null;
                } else if (activeMode === 'between') {
                    sibling = activeAfterGroup ? activeAfterGroup.nextElementSibling : null;
                }

                groupsRoot.insertBefore(newGroup, sibling);
                wireGroup(newGroup);
                ensureGroupSortable();
                if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
                updateEmptyMsg();
                await persistCollections('add-group-hover');
                const nameInput = qs('.group-name', newGroup);
                if (nameInput) {
                    nameInput.focus();
                    nameInput.select();
                }
                hideInsertUI();
            });
        };

        const hideInsertUI = () => {
            if (hoveringPlus) return;
            activeMode = null;
            activeAfterGroup = null;
            activeBeforeGroup = null;
            activeZone = null;
            if (activeGroup) {
                activeGroup.classList.remove('insert-zone-hover');
                activeGroup = null;
            }
            if (insertPlusEl) insertPlusEl.style.display = 'none';
            if (insertTooltipEl) insertTooltipEl.style.display = 'none';
        };

        const showAt = (left, top, mode, { afterGroup = null, beforeGroup = null, zone = null, group = null } = {}) => {
            ensureElements();
            activeMode = mode;
            activeAfterGroup = afterGroup;
            activeBeforeGroup = beforeGroup;
            activeZone = zone;
            if (activeGroup && activeGroup !== group) activeGroup.classList.remove('insert-zone-hover');
            activeGroup = group || null;
            if (activeGroup) activeGroup.classList.add('insert-zone-hover');
            insertPlusEl.style.left = `${left}px`;
            insertPlusEl.style.top = `${top}px`;
            insertPlusEl.style.display = 'flex';
        };

        const handleZoneEnter = (zone) => {
            if (!groupsRoot) return;
            ensureElements();
            const groups = Array.from(groupsRoot.querySelectorAll('.group'));
            const isEmpty = zone.classList.contains('group-insert-empty');
            if (isEmpty && !groups.length) {
                const zoneRect = zone.getBoundingClientRect();
                showAt(
                    zoneRect.left + zoneRect.width / 2 + window.scrollX,
                    zoneRect.top + zoneRect.height / 2 + window.scrollY,
                    'after-last',
                    {
                        afterGroup: null,
                        beforeGroup: null,
                        zone,
                        group: null,
                    },
                );
                return;
            }

            const group = zone.__groupRef;
            if (!group) return;
            const idx = groups.indexOf(group);
            if (idx === -1) return;
            const rect = group.getBoundingClientRect();
            const isTop = zone.classList.contains('group-insert-top');
            let y;
            let mode;
            let afterGroup = null;
            let beforeGroup = null;

            if (isTop) {
                if (idx === 0) {
                    mode = 'before-first';
                    beforeGroup = group;
                    y = rect.top + window.scrollY;
                } else {
                    const prev = groups[idx - 1];
                    const prevRect = prev.getBoundingClientRect();
                    mode = 'between';
                    afterGroup = prev;
                    y = (prevRect.bottom + rect.top) / 2 + window.scrollY;
                }
            } else {
                if (idx === groups.length - 1) {
                    mode = 'after-last';
                    afterGroup = group;
                    y = rect.bottom + window.scrollY;
                } else {
                    const next = groups[idx + 1];
                    const nextRect = next.getBoundingClientRect();
                    mode = 'between';
                    afterGroup = group;
                    y = (rect.bottom + nextRect.top) / 2 + window.scrollY;
                }
            }

            const x = rect.left + rect.width / 2 + window.scrollX;
            showAt(x, y, mode, { afterGroup, beforeGroup, zone, group });
        };

        const handleZoneLeave = (e) => {
            const to = e?.relatedTarget;
            if (insertPlusEl && (to === insertPlusEl || insertPlusEl?.contains(to))) return;
            activeZone = null;
            if (activeGroup) {
                activeGroup.classList.remove('insert-zone-hover');
                activeGroup = null;
            }
            if (!hoveringPlus) hideInsertUI();
        };

        const wireZone = (zone) => {
            if (zone.__wired) return;
            zone.addEventListener('mouseenter', () => handleZoneEnter(zone));
            zone.addEventListener('mouseleave', handleZoneLeave);
            zone.__wired = true;
        };

        const ensureZones = () => {
            if (!groupsRoot) return;
            ensureElements();
            const groups = Array.from(groupsRoot.querySelectorAll('.group'));
            if (!groups.length) {
                if (!emptyZone) {
                    emptyZone = document.createElement('div');
                    emptyZone.className = 'group-insert-zone group-insert-empty';
                    wireZone(emptyZone);
                    groupsRoot.appendChild(emptyZone);
                }
                emptyZone.style.display = '';
                return;
            }
            if (emptyZone) emptyZone.style.display = 'none';

            groups.forEach((group, idx) => {
                let topZone = group.querySelector('.group-insert-zone.group-insert-top');
                if (!topZone) {
                    topZone = document.createElement('div');
                    topZone.className = 'group-insert-zone group-insert-top';
                    group.appendChild(topZone);
                }
                let bottomZone = group.querySelector('.group-insert-zone.group-insert-bottom');
                if (!bottomZone) {
                    bottomZone = document.createElement('div');
                    bottomZone.className = 'group-insert-zone group-insert-bottom';
                    group.appendChild(bottomZone);
                }

                const isFirst = idx === 0;
                topZone.__groupRef = group;
                bottomZone.__groupRef = group;
                topZone.style.display = isFirst ? '' : 'none';
                topZone.style.pointerEvents = isFirst ? 'auto' : 'none';
                bottomZone.style.display = '';
                bottomZone.style.pointerEvents = 'auto';

                wireZone(topZone);
                wireZone(bottomZone);
            });
        };

        return {
            init() {
                ensureElements();
                ensureZones();
            },
            refresh() {
                ensureZones();
            },
        };
    })();

    document.addEventListener('collections-reordered', () => {
        if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
    });

    function createCollectionCard(name = 'New Collection', id = genId()) {
        const card = document.createElement('div');
        card.className = 'text-center chord-card collection-card mb-3 position-relative';
        card.dataset.collectionId = id;
        card.innerHTML = `
      <span class="material-icons-outlined collection-handle">drag_indicator</span>
      <button class="delete-collection-btn" type="button" title="Delete collection" tabindex="-1" style="display:none;">&#8722;</button>
      <span class="material-icons-outlined collection-edit" title="Edit collection">edit</span>
      <div class="d-flex align-items-center justify-content-between mb-1 position-relative collection-card-header">
        <span class="chord-title flex-grow-1 collection-title">${name}</span>
      </div>
      <textarea class="form-control form-control-sm chord-name-input collection-name-input" rows="2" style="display:none;">${name}</textarea>
      <div class="collection-body-placeholder"></div>
    `;
        return card;
    }

    function createGroupElement(initialName = 'Group Name', opts = {}) {
        const { append = true } = opts;
        const groupEl = document.createElement('div');
        groupEl.className = 'group mb-4';
        groupEl.innerHTML = `
          <div class="group-header mb-2">
            <div class="group-title-area">
              <span class="material-icons-outlined group-handle">drag_indicator</span>
              <input class="form-control form-control-sm group-name" value="${initialName}">
            </div>
            <div class="group-buttons">
              <button type="button" class="add-chord" aria-label="Add collection" data-tooltip="Add Collection">
                <span class="material-icons-outlined">add_circle</span>
              </button>
              <button type="button" class="delete-chords" aria-label="Delete collections" data-tooltip="Delete Collections">
                <span class="material-icons-outlined">remove_circle_outline</span>
              </button>
            </div>
          </div>
          <div class="d-grid chord-grid"></div>
        `;
        if (append) groupsRoot.appendChild(groupEl);
        if (groupDeleteModeActive && groupDeleteModeGroup === groupEl) {
            groupEl.classList.add('deletable-group');
            const pill = ensureGroupDeletePill(groupEl);
            if (pill) pill.style.display = '';
        }
        if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
        return groupEl;
    }

    function toggleEdit(card, show) {
        const title = qs('.chord-title', card);
        const input = qs('.chord-name-input', card);
        if (!title || !input) return;
        const resize = () => {
            input.style.height = 'auto';
            input.style.height = `${input.scrollHeight}px`;
        };
        card.classList.toggle('editing', !!show);
        input.style.display = show ? 'block' : 'none';
        title.style.display = show ? 'none' : 'block';
        if (show) {
            resize();
            input.focus();
            input.select();
        } else {
            title.textContent = input.value.trim() || 'Collection';
        }
        resize();
    }

    function wireCollectionCard(card, groupEl) {
        if (card._wired) return;
        card._wired = true;

        const input = qs('.chord-name-input', card);
        const deleteBtn = qs('.delete-collection-btn', card);
        const editIcon = qs('.collection-edit', card);

        // modern textarea styling + hover effects + 20 percent wider
        if (input) {
            input.style.width = '100%';
            input.style.maxWidth = '100%';
            input.style.borderRadius = '8px';
            input.style.border = '1px solid rgba(0,0,0,0.15)';
            input.style.background = 'inherit';
            input.style.padding = '2px 2px';
            input.style.fontSize = '0.95rem';
            input.style.transition = 'box-shadow 140ms, border-color 140ms, background 140ms';

            input.addEventListener('mouseenter', () => {
                if (!card.classList.contains('editing')) {
                    input.style.cursor = 'pointer';
                    input.style.borderColor = 'rgba(110,140,255,0.7)';
                    input.style.boxShadow = '0 3px 10px rgba(0,0,0,0.08)';
                    input.style.background = 'inherit';
                }
            });

            input.addEventListener('mouseleave', () => {
                if (!card.classList.contains('editing')) {
                    input.style.borderColor = 'rgba(0,0,0,0.15)';
                    input.style.boxShadow = 'none';
                    input.style.background = 'inherit';
                }
            });

            input.addEventListener('focus', () => {
                input.style.cursor = 'text';
                input.style.borderColor = 'rgba(60,120,255,0.9)';
                input.style.boxShadow = '0 0 0 2px rgba(60,120,255,0.25)';
                input.style.background = '#ffffff';
                input.style.height = 'auto';
                input.style.height = `${input.scrollHeight}px`;
            });

            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = `${input.scrollHeight}px`;
            });

            input.addEventListener('blur', () => {
                input.style.borderColor = 'rgba(0,0,0,0.15)';
                input.style.boxShadow = 'none';
                input.style.background = '#f8fafc';
                toggleEdit(card, false);
                persistCollections('edit-collection-name');
            });
        }

        if (editIcon) {
            editIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleEdit(card, true);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                card.remove();
                deleteModeDirty = true;
                updateEmptyMsg();
            });
        }

        card.addEventListener('click', (e) => {
            const inDeleteMode = deleteModeGroup === groupEl;
            if (inDeleteMode) return;
            if (card.classList.contains('editing')) return;
            if (
                e.target.closest('.chord-name-input') ||
                e.target.closest('.delete-collection-btn') ||
                e.target.closest('.chord-title') ||
                e.target.closest('.chord-handle, .collection-handle, .collection-edit')
            ) {
                return;
            }
            const id = card.dataset.collectionId;
            if (id) {
                window.location.href = `/my-collections/${id}`;
            }
        });
    }


    function wireGroup(groupEl) {
        if (groupEl._wired) return;
        groupEl._wired = true;
        const addBtn = qs('.add-chord', groupEl);
        const deleteBtn = qs('.delete-chords', groupEl);
        const nameInput = qs('.group-name', groupEl);
        const grid = qs('.chord-grid', groupEl);

        if (addBtn && grid) {
            addBtn.addEventListener('click', () => {
                const card = createCollectionCard();
                grid.appendChild(card);
                wireCollectionCard(card, groupEl);
                disableCollectionDeleteMode();
                toggleEdit(card, true);
                const input = qs('.chord-name-input', card);
                if (input) {
                    input.focus();
                    input.select();
                }
                persistCollections('add-collection');
                updateEmptyMsg();
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (deleteModeGroup === groupEl) disableCollectionDeleteMode();
                else enableCollectionDeleteMode(groupEl);
            });
        }

        if (nameInput) {
            nameInput.addEventListener('blur', () => persistCollections('edit-group-name'));
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    nameInput.blur();
                }
            });
        }

        if (grid) {
            qsa('.chord-card', grid).forEach((card) => wireCollectionCard(card, groupEl));
            Sortable.create(grid, {
                group: 'collections',
                handle: '.collection-handle',
                draggable: '.collection-card',
                animation: 150,
                scroll: true,
                bubbleScroll: true,
                scrollSensitivity: 60,
                scrollSpeed: 20,
                onEnd: () => {
                    persistCollections('reorder-collections');
                    document.dispatchEvent(new CustomEvent('collections-reordered'));
                },
            });
        }
        if (groupDeleteModeActive && groupDeleteModeGroup === groupEl) {
            groupEl.classList.add('deletable-group');
            const pill = ensureGroupDeletePill(groupEl);
            if (pill) pill.style.display = '';
        } else {
            groupEl.classList.remove('deletable-group');
            const pill = groupEl.querySelector('.delete-group-pill');
            if (pill) pill.style.display = 'none';
        }
    }

    function init() {
        ensureGroupHoverCSS();
        deleteGroupModal = document.getElementById('delete-group-modal');
        confirmDeleteGroupBtn = document.getElementById('confirm-delete-group');
        cancelDeleteGroupBtn = document.getElementById('cancel-delete-group');

        qsa('.group', groupsRoot).forEach((groupEl) => wireGroup(groupEl));
        ensureGroupSortable();
        if (hoverGroupInsert && hoverGroupInsert.init) hoverGroupInsert.init();

        groupsRoot.addEventListener(
            'blur',
            (e) => {
                const t = e.target;
                if (t && t.classList.contains('group-name')) {
                    persistCollections('group-name-blur');
                }
            },
            true,
        );

        groupsRoot.addEventListener('click', (e) => {
            const deleteGroupBtn = e.target.closest('.delete-group-pill');
            if (
                deleteGroupBtn &&
                deleteGroupModal &&
                groupDeleteModeActive &&
                deleteGroupBtn.closest('.group') === groupDeleteModeGroup
            ) {
                deleteGroupModal.style.setProperty('display', 'flex', 'important');
                deleteGroupModal._target = deleteGroupBtn.closest('.group') || null;
                e.preventDefault();
                e.stopPropagation();
            }
        });

        if (cancelDeleteGroupBtn) {
            cancelDeleteGroupBtn.addEventListener('click', () => {
                if (!deleteGroupModal) return;
                deleteGroupModal.style.setProperty('display', 'none', 'important');
                deleteGroupModal._target = null;
            });
        }
        if (confirmDeleteGroupBtn) {
            confirmDeleteGroupBtn.addEventListener('click', async () => {
                if (!deleteGroupModal || !deleteGroupModal._target) return;
                if (deleteModeGroup === deleteGroupModal._target) disableCollectionDeleteMode();
                if (groupDeleteModeActive && deleteGroupModal._target === groupDeleteModeGroup) {
                    disableGroupDeleteMode(deleteGroupModal._target);
                }
                deleteGroupModal.style.setProperty('display', 'none', 'important');
                const target = deleteGroupModal._target;
                deleteGroupModal._target = null;
                target.remove();
                if (!groupsRoot.querySelector('.group')) disableGroupDeleteMode();
                await persistCollections('delete-group');
                updateEmptyMsg();
                if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
            });
        }

        updateEmptyMsg();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.rewireCollectionsUI = rewireCollectionsUI;
})();
