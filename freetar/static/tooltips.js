((global) => {


  const TooltipModule = (() => {
    // === Tooltip helpers (localize + balance) ============================

    function localizeText(text) {
      if (!text) return text;
      if (text.startsWith('__MSG_') && text.endsWith('__')) {
        const msgKey = text.replace(/^__MSG_/, '').replace(/__$/, '');
        const getMessage = global.chrome?.i18n?.getMessage;
        const msg = typeof getMessage === 'function' ? getMessage(msgKey) : null;
        if (msg) return msg;
      }
      return text;
    }

    /**
     * Balance into 2–maxLines lines while keeping lines <= maxCharsPerLine.
     * Uses DP to pick optimal breakpoints (no greedy packing), prefers fewer lines,
     * and avoids 1-word widows/orphans.
     */
    function balanceTooltipLines(text, maxCharsPerLine = 36, maxLines = 4) {
      if (!text || text.includes('\n') || text.length <= maxCharsPerLine) return text;

      const words = text.trim().split(/\s+/);
      if (words.length === 1) return text;

      // --- tunables ---
      const MIN_FILL_FRAC = 0.72; // target ≥72% of max on non-last lines
      const UNDERFILL_WEIGHT = 6; // penalty per char below the target
      const SHORT_BREAK_WORDS = 2; // avoid lines with ≤2 words (non-last)
      const SHORT_BREAK_PENALTY = 80; // strong penalty for short non-last lines
      const LAST_LINE_SLACK_MULT = 0.6; // last line can be looser
      const LINECOUNT_PENALTY = 8; // bias toward fewer lines
      // -----------------

      // compute length of words[i..j] including spaces between
      const lens = words.map((w) => w.length);
      function lineLen(i, j) {
        let sum = 0;
        for (let k = i; k <= j; k++) sum += lens[k];
        return sum + (j - i); // spaces
      }

      function lineCost(len, isLast, wordCount) {
        if (len > maxCharsPerLine) return Infinity;

        const slack = maxCharsPerLine - len;
        let cost = (isLast ? LAST_LINE_SLACK_MULT : 1.0) * slack * slack;

        // Prefer fuller non-last lines; avoid early short breaks like "Enable to"
        if (!isLast) {
          const minTarget = Math.floor(maxCharsPerLine * MIN_FILL_FRAC);
          if (len < minTarget) {
            cost += UNDERFILL_WEIGHT * (minTarget - len);
          }
          if (wordCount <= SHORT_BREAK_WORDS) {
            cost += SHORT_BREAK_PENALTY;
          }
        }
        return cost;
      }

      function widowPenalty(wordCount) {
        if (wordCount <= 1) return 200; // no 1-word last line
        if (wordCount === 2) return 25; // discourage 2-word widow
        return 0;
      }

      let bestText = null;
      let bestScore = Infinity;

      // Try exact line counts; score picks the best, preferring fewer lines.
      for (let L = 2; L <= Math.min(maxLines, words.length); L++) {
        const n = words.length;
        const dp = Array.from({ length: L + 1 }, () => Array(n + 1).fill(Infinity));
        const prev = Array.from({ length: L + 1 }, () => Array(n + 1).fill(-1));
        dp[0][0] = 0;

        for (let l = 1; l <= L; l++) {
          for (let j = 1; j <= n; j++) {
            for (let i = l - 1; i <= j - 1; i++) {
              const isLast = l === L && j === n;
              const len = lineLen(i, j - 1);
              const wordCount = j - i;

              const lc = lineCost(len, isLast, wordCount);
              if (lc === Infinity) continue;

              const wp = isLast ? widowPenalty(wordCount) : 0;
              const cand = dp[l - 1][i] + lc + wp;

              if (cand < dp[l][j]) {
                dp[l][j] = cand;
                prev[l][j] = i;
              }
            }
          }
        }

        if (dp[L][n] === Infinity) continue;

        const score = dp[L][n] + (L - 2) * LINECOUNT_PENALTY;

        if (score < bestScore) {
          bestScore = score;

          // reconstruct breaks
          const breaks = [];
          let l = L;
          let j = n;
          while (l > 0) {
            const i = prev[l][j];
            breaks.push([i, j - 1]);
            j = i;
            l--;
          }
          breaks.reverse();

          bestText = breaks.map(([i, j]) => words.slice(i, j + 1).join(' ')).join('\n');
        }
      }

      return bestText || text;
    }

    // Syncs with CSS --tooltip-max-ch variable
    function getTooltipMaxCh() {
      const docEl = global.document?.documentElement;
      if (!docEl) return 36;
      const raw = getComputedStyle(docEl).getPropertyValue('--tooltip-max-ch');
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 36;
    }

    function initTooltips() {
      const maxCh = getTooltipMaxCh(); // stays in sync with CSS
      const doc = global.document;

      doc.querySelectorAll('.info-icon-tooltip[data-tooltip]').forEach((el) => {
        // Keep a separate, untouched source so other features (like "send edited message")
        // can read the unmodified value.
        if (!el.dataset.tooltipSrc) {
          el.dataset.tooltipSrc = el.getAttribute('data-tooltip') || '';
        }

        const raw = el.dataset.tooltipSrc;
        let tooltip = localizeText(raw);
        if (tooltip) tooltip = balanceTooltipLines(tooltip, maxCh, 4);

        // Only write if it actually changed to avoid churn
        if (el.getAttribute('data-tooltip') !== tooltip) {
          el.setAttribute('data-tooltip', tooltip);
        }
      });
    }

    // === Boundary-aware tooltip nudge ====================================

    /**
     * Finds the boundary container (add data-tooltip-boundary to your main wrapper),
     * falls back to document.body if not present.
     */
    function getTooltipBoundary() {
      const doc = global.document;
      return doc.querySelector('[data-tooltip-boundary]') || doc.body;
    }

    /**
     * Create (or reuse) a hidden measuring node that mimics the tooltip bubble.
     * We size it using the same typography and width rules so measured width ≈ render width.
     */
    function getTooltipMeasureEl() {
      if (getTooltipMeasureEl._el) return getTooltipMeasureEl._el;

      const doc = global.document;
      const el = doc.createElement('div');
      el.style.cssText = [
        'position:fixed',
        'top:-99999px',
        'left:-99999px',
        'visibility:hidden',
        'pointer-events:none',
        'z-index:-1',
        'background:rgba(20,20,20,0.98)',
        'color:#fff',
        'padding:12px 20px',
        'border-radius:10px',
        'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
        'font-size:14px',
        'font-weight:500',
        'text-align:center',
        // Match tooltip wrapping exactly
        'white-space:normal',
        'text-wrap:balance',
        'overflow-wrap:normal',
        'word-break:keep-all',
        // Match the tooltip width rule
        'inline-size:clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw)',
        'max-inline-size:calc(var(--tooltip-max-ch) * 1ch)',
        'box-sizing:border-box',
        'line-height:1.45',
      ].join(';');

      doc.body.appendChild(el);
      getTooltipMeasureEl._el = el;
      return el;
    }

    /**
     * Compute offsets so the tooltip:
     * - stays inside the container horizontally
     * - stays inside the viewport vertically (top/bottom)
     * - never covers the current mouse pointer (horizontal sidestep)
     *
     * Applies CSS vars: --tooltip-offset-x, --tooltip-offset-y, --tooltip-max-fit.
     */
    function nudgeTooltipIntoBounds(
      triggerEl,
      { gap = 6, mouse = null, avoidMouseMargin = 10 } = {},
    ) {
      const boundary = getTooltipBoundary();
      const text = triggerEl.getAttribute('data-tooltip') || '';
      if (!text) {
        triggerEl.style.removeProperty('--tooltip-offset-x');
        triggerEl.style.removeProperty('--tooltip-offset-y');
        triggerEl.style.removeProperty('--tooltip-max-fit');
        return;
      }

      // Container horizontal limits (so we don't spill out of cards/panels)
      const cRect = boundary.getBoundingClientRect();
      const usableLeft = cRect.left + gap;
      const usableRight = cRect.right - gap;
      const usableWidth = Math.max(0, usableRight - usableLeft);

      // Viewport vertical limits (so we never leave the visible window)
      const vTop = gap; // viewport top edge
      const vBottom = global.innerHeight - gap;

      // Measure bubble after width cap
      const meas = getTooltipMeasureEl();
      meas.style.maxInlineSize = `${usableWidth} px`;
      meas.textContent = text;
      const bubbleWidth = meas.offsetWidth;
      const bubbleHeight = meas.offsetHeight;

      // Expose final width cap to CSS so ::after matches measured width
      triggerEl.style.setProperty('--tooltip-max-fit', `${bubbleWidth} px`);

      // Base position (assume above trigger with ~8px gap; adjust if your CSS differs)
      const tRect = triggerEl.getBoundingClientRect();
      const bubbleLeft = tRect.left + tRect.width / 2 - bubbleWidth / 2;
      const bubbleRight = bubbleLeft + bubbleWidth;
      const bubbleTop = tRect.top - bubbleHeight - 8;
      const bubbleBottom = bubbleTop + bubbleHeight;

      // Initial horizontal nudge to fit container
      let offsetX = 0;
      if (bubbleLeft < usableLeft) offsetX += usableLeft - bubbleLeft;
      else if (bubbleRight > usableRight) offsetX -= bubbleRight - usableRight;

      // Vertical nudge to fit viewport
      let offsetY = 0;
      if (bubbleTop < vTop) offsetY += vTop - bubbleTop;
      if (bubbleBottom + offsetY > vBottom) offsetY -= bubbleBottom + offsetY - vBottom;

      // Cursor avoidance: If mouse is inside the (offset) bubble, push horizontally
      if (mouse && Number.isFinite(mouse.x) && Number.isFinite(mouse.y)) {
        const curLeft = bubbleLeft + offsetX;
        const curRight = bubbleRight + offsetX;
        const curTop = bubbleTop + offsetY;
        const curBottom = bubbleBottom + offsetY;

        const insideHoriz = mouse.x >= curLeft && mouse.x <= curRight;
        const insideVert = mouse.y >= curTop && mouse.y <= curBottom;
        if (insideHoriz && insideVert) {
          const spaceLeft = curLeft - usableLeft;
          const spaceRight = usableRight - curRight;

          // Choose the side with more horizontal space
          const moveLeft = spaceLeft >= spaceRight;

          // Compute delta to clear the mouse with a small margin
          let delta;
          if (moveLeft) {
            // Target right edge just to the left of the pointer
            const targetRight = mouse.x - avoidMouseMargin;
            delta = targetRight - curRight; // negative => move left
            // Clamp so we don't go past container left
            const minDelta = usableLeft - curLeft;
            if (delta < minDelta) delta = minDelta;
          } else {
            // Target left edge just to the right of the pointer
            const targetLeft = mouse.x + avoidMouseMargin;
            delta = targetLeft - curLeft; // positive => move right
            // Clamp so we don't go past container right
            const maxDelta = usableRight - curRight;
            if (delta > maxDelta) delta = maxDelta;
          }

          offsetX += delta;

          // Re-clamp horizontally after the mouse-avoid shift
          const newLeft = bubbleLeft + offsetX;
          const newRight = bubbleRight + offsetX;
          if (newLeft < usableLeft) offsetX += usableLeft - newLeft;
          else if (newRight > usableRight) offsetX -= newRight - usableRight;
        }
      }

      triggerEl.style.setProperty('--tooltip-offset-x', `${Math.round(offsetX)} px`);
      triggerEl.style.setProperty('--tooltip-offset-y', `${Math.round(offsetY)} px`);
    }

    /**
     * Hook up listeners to recompute on show / hide / resize / pointer move.
     * - Horizontal bounds: container with [data-tooltip-boundary] (fallback body)
     * - Vertical bounds: viewport (so tooltips never leave the visible window)
     * - Cursor avoidance: bubble never covers current mouse location
     */
    function setupTooltipBoundary() {
      const boundary = getTooltipBoundary();
      const doc = global.document;

      const items = Array.from(
        doc.querySelectorAll(
          '.info-icon-tooltip[data-tooltip], .mp-key.custom-tooltip[data-tooltip]',
        ),
      );

      const optsBase = { gap: 6 };

      // Track latest pointer position (rAF-throttled)
      const pointer = { x: NaN, y: NaN };
      let pmRAF = 0;

      function nudgeActiveWithPointer() {
        const active = items.filter((el) => el.matches(':hover, :focus'));
        for (const el of active) {
          nudgeTooltipIntoBounds(el, {
            ...optsBase,
            mouse: { x: pointer.x, y: pointer.y },
          });
        }
      }

      global.addEventListener(
        'pointermove',
        (e) => {
          pointer.x = e.clientX;
          pointer.y = e.clientY;
          if (pmRAF) global.cancelAnimationFrame(pmRAF);
          pmRAF = global.requestAnimationFrame(nudgeActiveWithPointer);
        },
        { passive: true },
      );

      function onShow(e) {
        const el = e.currentTarget;
        nudgeTooltipIntoBounds(el, {
          ...optsBase,
          mouse: { x: pointer.x, y: pointer.y },
        });
      }
      function onHide(e) {
        e.currentTarget.style.removeProperty('--tooltip-offset-x');
        e.currentTarget.style.removeProperty('--tooltip-offset-y');
        e.currentTarget.style.removeProperty('--tooltip-max-fit');
      }
      function onResizeOrScroll() {
        const active = items.filter((el) => el.matches(':hover, :focus'));
        for (const el of active) {
          nudgeTooltipIntoBounds(el, {
            ...optsBase,
            mouse: { x: pointer.x, y: pointer.y },
          });
        }
      }

      items.forEach((el) => {
        el.addEventListener('mouseenter', onShow);
        el.addEventListener('focus', onShow);
        el.addEventListener('mouseleave', onHide);
        el.addEventListener('blur', onHide);
      });

      let rid = 0;
      const raf = (fn) => {
        if (rid) global.cancelAnimationFrame(rid);
        rid = global.requestAnimationFrame(fn);
      };

      global.addEventListener('resize', () => raf(onResizeOrScroll), { passive: true });
      boundary.addEventListener('scroll', () => raf(onResizeOrScroll), { passive: true });
      global.addEventListener('scroll', () => raf(onResizeOrScroll), { passive: true });
    }

    // Convenience: do everything your popup currently does
    function init() {
      initTooltips();
      setupTooltipBoundary();
    }

    return {
      init,
      initTooltips,
      setupTooltipBoundary,
      localizeText,
      balanceTooltipLines,
      getTooltipMaxCh,
      getTooltipBoundary,
      getTooltipMeasureEl,
      nudgeTooltipIntoBounds,
    };
  })();

  // Expose on window for reuse in extension + other web apps
  global.TooltipModule = TooltipModule;

  // --- Back-compat shims so old code keeps working -----------------------
  // Old code called:
  //   initTooltips(opts?)
  //   setupTooltipBoundary(opts?)
  // We forward those calls into the new TooltipModule API.
  if (!global.initTooltips) {
    global.initTooltips = function initTooltipsCompat(options = {}) {
      // options are ignored; TooltipModule reads config from CSS / DOM
      TooltipModule.initTooltips();
    };
  }

  if (!global.setupTooltipBoundary) {
    let _installed = false;
    global.setupTooltipBoundary = function setupTooltipBoundaryCompat(options = {}) {
      // Match old behavior: safe to call multiple times, but only installs once.
      if (_installed) return;
      _installed = true;
      TooltipModule.setupTooltipBoundary();
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);