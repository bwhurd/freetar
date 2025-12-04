(() => {
  'use strict';

  const TOOLTIP_SELECTOR = '[data-tooltip]';
  const DEFAULT_MAX_CHARS = 36;
  const DEFAULT_MAX_LINES = 4;
  const SHORT_TOOLTIP_THRESHOLD = 20;

  // Suggestion: Add this in your CSS!
  // :root { --tooltip-max-ch: 36; }

  function localizeText(text) {
    if (!text) return text;
    if (text.startsWith('__MSG_') && text.endsWith('__')) {
      const msgKey = text.replace(/^__MSG_/, '').replace(/__$/, '');
      try {
        if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
          const msg = chrome.i18n.getMessage(msgKey);
          if (msg) return msg;
        }
      } catch (e) {
        // ignore localization errors and fall back to raw text
      }
    }
    return text;
  }

  function normalizeSource(text) {
    if (text == null) return '';
    return String(text)
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .trim();
  }

  /**
   * Balance tooltip text into 2–maxLines lines, keeping lines <= maxCharsPerLine.
   * Prefers fewer, longer lines and low spread. Respects existing \n.
   */
  function balanceTooltipLines(text, maxCharsPerLine = DEFAULT_MAX_CHARS, maxLines = DEFAULT_MAX_LINES) {
    if (!text || typeof text !== 'string') return text;
    if (text.includes('\n')) return text;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length <= SHORT_TOOLTIP_THRESHOLD) return text;

    const words = trimmed.split(/\s+/);
    if (words.length <= 1) return text;

    // tunables
    const MIN_FILL_FRAC = 0.72;
    const UNDERFILL_WEIGHT = 6;
    const SHORT_BREAK_WORDS = 2;
    const SHORT_BREAK_PENALTY = 80;
    const LAST_LINE_SLACK_MULT = 0.6;
    const LINECOUNT_PENALTY = 8;
    const MIN_CH_PER_LINE = 15;

    // clamp maxCharsPerLine so we do not end up with one word per line
    const maxCh = Math.max(MIN_CH_PER_LINE, maxCharsPerLine | 0);

    const lens = words.map((w) => w.length);
    const n = words.length;

    function lineLen(i, j) {
      let sum = 0;
      for (let k = i; k <= j; k += 1) sum += lens[k];
      return sum + (j - i);
    }

    function lineCost(len, isLast, wordCount) {
      if (len > maxCh) return Infinity;
      const slack = maxCh - len;
      let cost = (isLast ? LAST_LINE_SLACK_MULT : 1.0) * slack * slack;

      const minTarget = Math.floor(maxCh * MIN_FILL_FRAC);
      if (!isLast && len < minTarget) {
        cost += UNDERFILL_WEIGHT * (minTarget - len);
      }
      if (!isLast && wordCount <= SHORT_BREAK_WORDS) {
        cost += SHORT_BREAK_PENALTY;
      }
      // penalize very short lines in the middle even more
      if (!isLast && len < MIN_CH_PER_LINE && wordCount > 0) {
        cost += (MIN_CH_PER_LINE - len) * UNDERFILL_WEIGHT;
      }
      return cost;
    }

    function widowPenalty(wordCount) {
      if (wordCount <= 1) return 200;
      if (wordCount === 2) return 25;
      return 0;
    }

    const allowedLines = Math.max(2, Math.min(maxLines | 0, n));
    let bestText = trimmed;
    let bestScore = Infinity;

    // allow the single line layout if it fits well enough
    const singleLen = trimmed.length;
    if (singleLen <= maxCh) {
      bestScore = lineCost(singleLen, true, n);
      bestText = trimmed;
    }

    for (let L = 2; L <= allowedLines; L += 1) {
      const dp = Array.from({ length: L + 1 }, () => Array(n + 1).fill(Infinity));
      const prev = Array.from({ length: L + 1 }, () => Array(n + 1).fill(-1));
      dp[0][0] = 0;

      for (let l = 1; l <= L; l += 1) {
        for (let j = 1; j <= n; j += 1) {
          for (let i = l - 1; i <= j - 1; i += 1) {
            const isLast = l === L && j === n;
            const len = lineLen(i, j - 1);
            const wordCount = j - i;
            const lc = lineCost(len, isLast, wordCount);
            if (!Number.isFinite(lc)) continue;
            const wp = isLast ? widowPenalty(wordCount) : 0;
            const cand = dp[l - 1][i] + lc + wp;
            if (cand < dp[l][j]) {
              dp[l][j] = cand;
              prev[l][j] = i;
            }
          }
        }
      }

      if (!Number.isFinite(dp[L][n])) continue;
      const score = dp[L][n] + (L - 1) * LINECOUNT_PENALTY;
      if (score < bestScore) {
        bestScore = score;
        const breaks = [];
        let l = L;
        let j = n;
        while (l > 0) {
          const i = prev[l][j];
          breaks.push([i, j - 1]);
          j = i;
          l -= 1;
        }
        breaks.reverse();
        bestText = breaks.map(([i, j]) => words.slice(i, j + 1).join(' ')).join('\n');
      }
    }

    return bestText;
  }

  function getTooltipMaxChars() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return DEFAULT_MAX_CHARS;
    const root = document.documentElement;
    const raw = window.getComputedStyle(root).getPropertyValue('--tooltip-max-ch').trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CHARS;
  }

  function initTooltips(options = {}) {
    if (typeof document === 'undefined') return;

    const maxChars = Number.isFinite(options.maxCharsPerLine)
      ? options.maxCharsPerLine
      : getTooltipMaxChars();
    const maxLines = Number.isFinite(options.maxLines)
      ? options.maxLines
      : DEFAULT_MAX_LINES;

    const root = options.root instanceof Element ? options.root : document;

    root.querySelectorAll(TOOLTIP_SELECTOR).forEach((el) => {
      const rawSrc =
        el.dataset.tooltipSrc ||
        el.getAttribute('data-tooltip') ||
        el.getAttribute('title') ||
        '';
      const normalized = normalizeSource(localizeText(rawSrc));
      if (!normalized) return;

      el.dataset.tooltipSrc = normalized;

      const shouldBalance =
        normalized.length > SHORT_TOOLTIP_THRESHOLD && !normalized.includes('\n');
      const balanced = shouldBalance
        ? balanceTooltipLines(normalized, maxChars, maxLines)
        : normalized;

      // Write the final text
      el.setAttribute('data-tooltip', balanced);
      el.removeAttribute('title');

      // Ensure a unique, stable id for dynamic CSS rule
      if (!el.dataset.tooltipId) {
        el.dataset.tooltipId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      }

      // Measure the final box width using the same wrapping as the bubble
      const meas = getTooltipMeasureEl();
      // apply the bubble's padding to the measurer so width matches visual bubble
      meas.style.padding = '12px 20px';
      meas.style.maxWidth = `${maxChars}ch`;   // cap at the same width as CSS (e.g., 36ch)
      meas.style.width = 'auto';               // shrink-to-fit
      meas.textContent = balanced;

      const boxWidth = Math.max(1, Math.ceil(meas.offsetWidth));
      el.dataset.tooltipFixedW = String(boxWidth);

      // Install/update a dynamic rule that sets an exact inline-size for this element's ::after
      (function applyFixedWidthRule(node, px) {
        const styleId = 'tooltip-fixed-widths';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }
        const sheet = styleEl.sheet;
        const sel = `[data-tooltip][data-tooltip-id="${node.dataset.tooltipId}"]::after`;
        // remove any existing rule for this selector
        try {
          for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
            const r = sheet.cssRules[i];
            if (r.selectorText === sel) {
              sheet.deleteRule(i);
              break;
            }
          }
        } catch { }
        // insert updated rule with exact width
        const rule = `${sel}{ inline-size:${px}px !important; }`;
        try { sheet.insertRule(rule, sheet.cssRules.length); } catch { }
      })(el, boxWidth);
    });
  }

  function getTooltipBoundary(boundaryOpt) {
    if (boundaryOpt instanceof Element) return boundaryOpt;
    if (typeof boundaryOpt === 'string') {
      const node = document.querySelector(boundaryOpt);
      if (node) return node;
    }
    const attrBoundary = document.querySelector('[data-tooltip-boundary]');
    return attrBoundary || document.body;
  }

  function getTooltipMeasureEl() {
    if (getTooltipMeasureEl._el) return getTooltipMeasureEl._el;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed',
      'top:-99999px',
      'left:-99999px',
      'visibility:hidden',
      'pointer-events:none',
      'z-index:-1',
      'background:transparent',
      'color:inherit',
      'padding:0',
      'border:0',
      'border-radius:0',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
      'font-size:14px',
      'font-weight:500',
      'text-align:center',
      'white-space:pre-line',
      'text-wrap:balance',
      'overflow-wrap:normal',
      'word-break:keep-all',
      'display:inline-block',
      'box-sizing:border-box',
      'line-height:1.45',
    ].join(';');
    document.body.appendChild(el);
    getTooltipMeasureEl._el = el;
    return el;
  }

  /**
   * Compute a stable placement for a single hover:
   * - prefer top, fall back to bottom when there is no space
   * - center on the trigger, then clamp inside the viewport/boundary
   * - apply one set of offsets per show (no pointer tracking)
   */
  function positionTooltip(triggerEl, opts = {}) {
    if (!triggerEl || !triggerEl.isConnected) return;
    const text = triggerEl.getAttribute('data-tooltip') || '';
    if (!text) {
      triggerEl.style.removeProperty('--tooltip-offset-x');
      triggerEl.style.removeProperty('--tooltip-offset-y');
      triggerEl.style.removeProperty('--tooltip-caret-x');
      triggerEl.style.removeProperty('--tooltip-max-fit');
      delete triggerEl.dataset.tooltipPlacement;
      return;
    }

    const boundary = getTooltipBoundary(opts.boundary);
    const gap = Number.isFinite(opts.gap) ? opts.gap : 6;

    const boundaryRect =
      boundary && typeof boundary.getBoundingClientRect === 'function'
        ? boundary.getBoundingClientRect()
        : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    let clampLeft = Math.max(0, boundaryRect.left) + gap;
    let clampRight = Math.min(window.innerWidth, boundaryRect.right) - gap;
    let clampTop = Math.max(0, boundaryRect.top) + gap;
    let clampBottom = Math.min(window.innerHeight, boundaryRect.bottom) - gap;
    if (clampRight <= clampLeft || clampBottom <= clampTop) {
      clampLeft = gap;
      clampRight = window.innerWidth - gap;
      clampTop = gap;
      clampBottom = window.innerHeight - gap;
    }

    // Measure width/height based on final balanced text (prefer fixed width set earlier)
    const maxCh = getTooltipMaxChars();
    let bubbleWidth = parseFloat(triggerEl.dataset.tooltipFixedW || '') || 0;

    const meas = getTooltipMeasureEl();
    meas.style.padding = '12px 20px';
    meas.textContent = text;

    if (!bubbleWidth || !Number.isFinite(bubbleWidth)) {
      meas.style.maxWidth = `${maxCh}ch`;
      meas.style.width = 'auto';
      bubbleWidth = Math.max(1, Math.ceil(meas.offsetWidth));
      triggerEl.dataset.tooltipFixedW = String(bubbleWidth);
    }
    // lock width to get accurate height
    meas.style.maxWidth = 'none';
    meas.style.width = `${bubbleWidth}px`;
    let bubbleHeight = Math.ceil(meas.offsetHeight);
    const maxAllowedWidth = Math.max(1, clampRight - clampLeft);
    let finalWidth = bubbleWidth;
    if (bubbleWidth > maxAllowedWidth) {
      finalWidth = maxAllowedWidth;
      meas.style.width = `${finalWidth}px`;
      bubbleHeight = Math.ceil(meas.offsetHeight);
    }
    triggerEl.style.setProperty('--tooltip-max-fit', `${maxAllowedWidth}px`);

    const tRect = triggerEl.getBoundingClientRect();
    const centerX = tRect.left + tRect.width / 2;

    // Decide placement using available space and occlusion
    const spaceAbove = Math.max(0, tRect.top - clampTop);
    const spaceBelow = Math.max(0, clampBottom - tRect.bottom);
    let placement = 'top';
    let targetTop = tRect.top - gap - bubbleHeight;
    if (targetTop < clampTop && spaceBelow >= spaceAbove) {
      placement = 'bottom';
      targetTop = tRect.bottom + gap;
    }

    let targetLeft = centerX - finalWidth / 2;
    targetLeft = Math.min(Math.max(targetLeft, clampLeft), clampRight - finalWidth);
    const maxTop = clampBottom - bubbleHeight;
    targetTop = Math.max(clampTop, Math.min(targetTop, maxTop));

    const baseLeft = centerX - finalWidth / 2;
    const offsetX = Math.round(targetLeft - baseLeft);
    const baseTop =
      placement === 'top'
        ? tRect.top - bubbleHeight - tRect.height * 0.2
        : tRect.bottom + tRect.height * 0.2;
    const offsetY = Math.round(targetTop - baseTop);

    triggerEl.style.setProperty('--tooltip-offset-x', `${offsetX}px`);
    triggerEl.style.setProperty('--tooltip-offset-y', `${offsetY}px`);

    // Caret: aim back toward trigger center but keep inside bubble
    const caretHalf = 6;
    const maxCaretShift = Math.max(0, Math.floor(finalWidth / 2 - caretHalf - 2));
    let caretX = -offsetX;
    if (caretX < -maxCaretShift) caretX = -maxCaretShift;
    if (caretX > maxCaretShift) caretX = maxCaretShift;
    triggerEl.style.setProperty('--tooltip-caret-x', `${Math.round(caretX)}px`);

    if (placement === 'bottom') {
      triggerEl.dataset.tooltipPlacement = 'bottom';
    } else {
      delete triggerEl.dataset.tooltipPlacement;
    }
  }

  function setupTooltipBoundary(options = {}) {
    if (typeof document === 'undefined') return;
    if (setupTooltipBoundary._installed) return;
    const boundary = getTooltipBoundary(options.boundary);
    const baseOpts = {
      boundary,
      gap: Number.isFinite(options.gap) ? options.gap : 6,
    };

    let active = null; // Only allow one tooltip at a time
    let activeSource = null; // 'pointer' | 'focus'
    const restoreTimers = new WeakMap();

    function cancelRestore(el) {
      const t = restoreTimers.get(el);
      if (t) {
        clearTimeout(t);
        restoreTimers.delete(el);
      }
    }

    function clearActive(el) {
      if (!el) return;
      el.style.removeProperty('--tooltip-offset-x');
      el.style.removeProperty('--tooltip-offset-y');
      el.style.removeProperty('--tooltip-caret-x');
      el.style.removeProperty('--tooltip-max-fit');
      delete el.dataset.tooltipPlacement;
      delete el.dataset.tooltipPinned;
    }

    function onShow(e) {
      const el = e.target.closest(TOOLTIP_SELECTOR);
      if (!el || !el.matches(TOOLTIP_SELECTOR)) return;
      cancelRestore(el);
      if (!el.hasAttribute('data-tooltip') && el.dataset.tooltipSaved) {
        el.setAttribute('data-tooltip', el.dataset.tooltipSaved);
        delete el.dataset.tooltipSaved;
      }
      const isPointer = e.type.startsWith('pointer');
      // Hide previously active tooltip if any
      if (active && active !== el) {
        clearActive(active);
        // Restore native title if you want (optional)
        // active.setAttribute('title', active.dataset.tooltipSrc || '');
      }
      if (active === el && el.dataset.tooltipPinned === '1') {
        return; // already positioned for this hover/focus
      }
      active = el;
      // Preserve pointer source when click (focusin) follows pointerenter
      if (isPointer || activeSource === 'pointer') activeSource = 'pointer';
      else activeSource = 'focus';
      // Hide native title while custom tooltip is active
      el.removeAttribute('title');
      positionTooltip(el, baseOpts);
      el.dataset.tooltipPinned = '1';
    }

    function onHide(e) {
      const el = e.target.closest(TOOLTIP_SELECTOR);
      if (!el || !el.matches(TOOLTIP_SELECTOR)) return;
      if (active === el) {
        if (e.type === 'pointerleave') {
          const rt = e.relatedTarget;
          if (rt && el.contains(rt)) return; // still within the trigger (e.g., moving between children)
        }
        if (e.type === 'pointerleave' && activeSource !== 'pointer') {
          return; // keep showing for keyboard focus until focusout
        }
        if (activeSource === 'pointer') {
          const saved = el.getAttribute('data-tooltip') || el.dataset.tooltipSrc || '';
          if (saved) {
            cancelRestore(el);
            el.dataset.tooltipSaved = saved;
            el.removeAttribute('data-tooltip');
            const timer = window.setTimeout(() => {
              if (!el.isConnected) return;
              if (!el.hasAttribute('data-tooltip')) {
                el.setAttribute('data-tooltip', el.dataset.tooltipSaved || saved);
              }
              delete el.dataset.tooltipSaved;
              restoreTimers.delete(el);
            }, 3000);
            restoreTimers.set(el, timer);
          }
        }
        clearActive(active);
        // Optionally restore title for fallback after custom tooltip hides
        // active.setAttribute('title', active.dataset.tooltipSrc || '');
        active = null;
        activeSource = null;
      }
    }

    document.addEventListener('pointerenter', onShow, true);
    document.addEventListener('focusin', onShow, true);
    document.addEventListener('pointerleave', onHide, true);
    document.addEventListener('focusout', onHide, true);

    setupTooltipBoundary._installed = true;
  }

  window.initTooltips = initTooltips;
  window.setupTooltipBoundary = setupTooltipBoundary;
})();
