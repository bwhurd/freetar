/* chordDiagram.js
   Pure, reusable chord diagram utilities.
   Safe to load on any page; no Jinja vars needed.
   Exposes: parseShapeTokens, buildDiagramModel, buildChordTableInnerHTML, renderCardDiagram (globals)
*/

// Mirror backend.py _parse_shape_tokens
function parseShapeTokens(shape) {
  const s = (shape || '').trim();
  const tokens = [];
  for (const ch of s) {
    if (ch.toLowerCase() === 'x') tokens.push(null);
    else if (/\d/.test(ch)) tokens.push(parseInt(ch, 10));
  }
  if (tokens.length === 0) return [null, null, null, null, null, null];
  if (tokens.length < 6) return new Array(6 - tokens.length).fill(null).concat(tokens);
  if (tokens.length > 6) return tokens.slice(-6);
  return tokens;
}

function buildDiagramModel(shape) {
  const tokens = parseShapeTokens(shape);
  const header = tokens.map((t) => (t == null ? 'X' : t === 0 ? 'O' : String(t)));
  const used = tokens.filter((t) => t != null && t !== 0);
  let start = used.length ? Math.min(...used) : 1;
  if (start <= 1) start = 1;
  const frets = [start, start + 1, start + 2, start + 3];
  const rows = frets.map((fret) => ({
    fret,
    strings: tokens.map((t) => (t === fret ? 1 : 0)),
  }));
  return { header, rows };
}

function buildChordTableInnerHTML(model) {
  const headerCells = model.header
    .map((x, i, arr) => {
      const pos = i === 0 ? ' string-left' : i === arr.length - 1 ? ' string-right' : '';
      const cls =
        x === 'X' ? 'chord-header-muted' : x === 'O' ? 'chord-header-open' : 'chord-header-fret';
      const label = x === 'X' || x === 'O' ? `<span class="chord-header-label">${x}</span>` : '';
      return `<th class="${cls} string-col${pos}">${label}</th>`;
    })
    .join('');

  const bodyRows = model.rows
    .map((row) => {
      const cells = model.header
        .map((_, i, arr) => {
          const pos = i === 0 ? ' string-left' : i === arr.length - 1 ? ' string-right' : '';
          const dot = row.strings[i] ? ' chord-dot-filled' : '';
          return `<td class="chord-string-cell${pos}"><div class="chord-dot-wrap"><div class="chord-dot${dot}"></div></div></td>`;
        })
        .join('');
      return `<tr><td class="chord-fret-label">${row.fret}</td>${cells}</tr>`;
    })
    .join('');

  const footerCells = model.header
    .map((x) =>
      x === 'X' || x === 'O'
        ? `<td class="chord-footer-cell"></td>`
        : `<td class="chord-footer-cell"><span class="chord-footer-label">${x}</span></td>`,
    )
    .join('');

  return `
    <thead>
      <tr>
        <th class="chord-header-spacer"></th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="chord-footer-row">
        <td class="chord-footer-spacer"></td>
        ${footerCells}
      </tr>
    </tbody>
  `;
}

function renderCardDiagram(card) {
  const shapeInput = card.querySelector('.chord-shape-input');
  const shape = shapeInput ? (shapeInput.value || '').trim() : '000000';
  const model = buildDiagramModel(shape);
  let table = card.querySelector('table.chord-diagram');
  if (!table) {
    table = document.createElement('table');
    table.className = 'chord-diagram';
    // place after edit fields to match server structure
    const fields = card.querySelector('.chord-edit-fields');
    if (fields && fields.nextSibling) {
      card.insertBefore(table, fields.nextSibling);
    } else {
      card.appendChild(table);
    }
  }
  table.innerHTML = buildChordTableInnerHTML(model);
}
