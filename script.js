/* =============================================
   EXPERTISE.AI — TRIANGLE GRID ANIMATION
   ============================================= */

const TRIANGLE_PATH =
  "M0.00401291 9.11576V0.894725C0.00401291 0.405234 0.417032 0 0.902227 0H9.11044C9.89638 0 10.3014 0.950896 9.73599 1.52866L1.53178 9.74568C0.958366 10.2873 0 9.91018 0 9.11977L0.00401291 9.11576Z";

const TRANSFORMS = [
  // Row 1
  "scaleY(-1)", "none", "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)",
  "scaleY(-1)", "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)",
  "rotate(-90deg) scaleY(-1)", "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)",
  // Row 2
  "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)", "scaleY(-1)",
  "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)", "scaleY(-1)",
  "rotate(-90deg) scaleY(-1)", "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)", "scaleY(-1)",
  // Row 3
  "scaleY(-1) rotate(180deg)", "rotate(-90deg) scaleY(-1)", "scaleY(-1) rotate(180deg)",
  "scaleY(-1)", "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)",
  "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)", "scaleY(-1)", "scaleY(-1) rotate(180deg)",
  // Row 4
  "scaleY(-1) rotate(180deg)", "rotate(-90deg) scaleY(-1)", "scaleY(-1) rotate(180deg)",
  "scaleY(-1) rotate(180deg)", "scaleY(-1)", "scaleY(-1) rotate(180deg)",
  "scaleY(-1)", "scaleY(-1) rotate(180deg)", "scaleY(-1) rotate(180deg)", "rotate(-90deg) scaleY(-1)",
];

const ACTIVITIES = [
  "Engage new visitor",
  "Qualify sales lead",
  "Schedule a meeting",
  "Answer support query",
  "Follow up with prospect",
  "Route to sales team",
  "Capture contact info",
  "Send personalized offer",
  "Identify intent signals",
  "Nurture warm lead",
  "Detect buying signal",
  "Summarize call notes",
];

const COLS = 10, ROWS = 4;
const CELL = 10, GAP = 100, STEP = 110;
const GRID_W = COLS * STEP - GAP;   // 1000
const GRID_H = ROWS * STEP - GAP;   // 340
const PAD_X = 22, PAD_Y = 14;
const FONT_SIZE = 13;
const PANEL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const PANEL_DOT_SIZE = 8, PANEL_CONTENT_GAP = 16;

let cells = [];
let animationStarted = false;
let triangleGridInViewport = false;
let activityIdx = 0;
let sessionIdCounter = 0;
let effectiveCols = COLS;      // may be reduced to 6 on mobile
let effectiveGridW = GRID_W;   // recalculated when effectiveCols changes

const PANEL_COUNT = 2;
const panelPool = [];
const fadedBySessions = new Map();
const activeRects = new Map(); // sessionId → {px,py,pw,ph}

/* ───── helpers ───── */
const visibilityListeners = new Set();

function setTriangleGridVisibility(isVisible) {
  if (triangleGridInViewport === isVisible) return;
  triangleGridInViewport = isVisible;
  document.getElementById("triangle-grid")?.classList.toggle("is-paused", !isVisible);
  visibilityListeners.forEach(listener => listener(isVisible));
}

function waitUntilTriangleGridVisible() {
  if (triangleGridInViewport) return Promise.resolve();
  return new Promise(resolve => {
    const listener = isVisible => {
      if (!isVisible) return;
      visibilityListeners.delete(listener);
      resolve();
    };
    visibilityListeners.add(listener);
  });
}

// Pauses elapsed animation time while the section is out of view. This keeps
// both the loop and active card phases dormant instead of merely throttled.
function animationDelay(duration) {
  return new Promise(resolve => {
    let remaining = duration;
    let startedAt = 0;
    let timeoutId = null;

    const cleanUp = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      visibilityListeners.delete(onVisibilityChange);
    };
    const continueDelay = () => {
      if (!triangleGridInViewport || timeoutId !== null) return;
      startedAt = performance.now();
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        cleanUp();
        resolve();
      }, remaining);
    };
    const onVisibilityChange = isVisible => {
      if (isVisible) {
        continueDelay();
        return;
      }
      if (timeoutId === null) return;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    visibilityListeners.add(onVisibilityChange);
    continueDelay();
  });
}

const nextActivity = () => ACTIVITIES[activityIdx++ % ACTIVITIES.length];

function measurePanelSize(text) {
  const probe = document.createElement("span");
  probe.style.cssText = `position:fixed;top:-9999px;left:-9999px;visibility:hidden;
    font-size:${FONT_SIZE}px;font-family:${PANEL_FONT_FAMILY};
    font-weight:600;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;`;
  probe.textContent = text;
  document.body.appendChild(probe);
  const tw = probe.offsetWidth, th = probe.offsetHeight;
  document.body.removeChild(probe);
  return { w: tw + PAD_X * 2 + PANEL_DOT_SIZE + PANEL_CONTENT_GAP, h: Math.max(48, th + PAD_Y * 2) };
}

// Returns only cells that are currently visible (not hidden on mobile)
const visibleCells = () => cells.filter(c => !c.hidden);

function panelGeometry(cell, pw, ph) {
  const openLeft = cell.x + pw > effectiveGridW;
  const openUp   = cell.y + ph > GRID_H;
  let x = openLeft ? cell.x + CELL - pw : cell.x;
  let y = openUp   ? cell.y + CELL - ph : cell.y;
  x = Math.max(0, Math.min(x, effectiveGridW - pw));
  y = Math.max(0, Math.min(y, GRID_H - ph));
  return { x, y, openLeft, openUp };
}

function getCoveredCells(px, py, pw, ph) {
  const m = GAP; // horizontal margin only — same row neighbours within 1 gap also fade
  return visibleCells().filter(c =>
    c.x < px + pw + m && c.x + CELL > px - m &&
    c.y < py + ph     && c.y + CELL > py        // strict vertical overlap, no margin
  );
}

/* ───── panel DOM ───── */
function createPanel() {
  const el = document.createElement("div");
  el.className = "triangle-activity-card";
  el.style.cssText = `display:none;position:absolute;overflow:hidden;
    pointer-events:none;z-index:10;align-items:center;`;
  const dotEl = document.createElement("span");
  dotEl.className = "triangle-activity-card__dot";
  dotEl.setAttribute("aria-hidden", "true");
  const textEl = document.createElement("span");
  textEl.className = "triangle-activity-card__label";
  textEl.style.cssText = "opacity:0;flex-shrink:0;";
  el.appendChild(dotEl);
  el.appendChild(textEl);
  return { el, textEl, busy: false };
}

const getFreePanel = () => panelPool.find(p => !p.busy) || null;

/* ───── cell fade management ───── */
function fadeCells(indices, sid) {
  fadedBySessions.set(sid, new Set(indices));
  indices.forEach(i => {
    if (!cells[i]) return;
    cells[i].el.style.transition = "opacity 0.14s cubic-bezier(0.4,0,1,1)";
    cells[i].el.style.opacity = "0";
  });
}

function restoreCells(sid) {
  const faded = fadedBySessions.get(sid);
  if (!faded) return;
  faded.forEach(i => {
    if (!cells[i]) return;
    const stillFaded = [...fadedBySessions.entries()]
      .some(([s, set]) => s !== sid && set.has(i));
    if (!stillFaded) {
      cells[i].el.style.transition = "opacity 0.22s cubic-bezier(0.16,1,0.3,1)";
      cells[i].el.style.opacity = "1";
    }
  });
  fadedBySessions.delete(sid);
}

/* ───── rect collision detection ───── */
function rectsCollide(a, b) {
  const m = GAP; // same horizontal margin as getCoveredCells
  return (
    a.px < b.px + b.pw + m && a.px + a.pw > b.px - m &&
    a.py < b.py + b.ph     && a.py + a.ph > b.py
  );
}

// Find a cell whose panel rect doesn't collide with any active panel.
// Returns {cellIdx, px, py, pw, ph} or null.
function findNonCollidingSlot(text) {
  const { w: pw, h: ph } = measurePanelSize(text);
  const current = [...activeRects.values()];
  const shuffled = visibleCells().sort(() => Math.random() - 0.5);
  for (const cell of shuffled) {
    const { x: px, y: py } = panelGeometry(cell, pw, ph);
    const candidate = { px, py, pw, ph };
    if (!current.some(r => rectsCollide(candidate, r))) {
      return { cellIdx: cell.idx, px, py, pw, ph };
    }
  }
  return null;
}

/* ───── core expand animation ───── */
// slot = {cellIdx, px, py, pw, ph} — pre-computed by findNonCollidingSlot
async function runExpansion(slot, text, panel) {
  panel.busy = true;
  const sid = ++sessionIdCounter;
  const { cellIdx, px, py, pw, ph } = slot;
  const cell = cells[cellIdx];

  activeRects.set(sid, { px, py, pw, ph });

  const { openLeft, openUp } = panelGeometry(cell, pw, ph);
  const squareScale = Math.min(1, ph / pw);
  const transformOrigin = `${openLeft ? "right" : "left"} ${openUp ? "bottom" : "top"}`;

  // Covered neighbours to fade
  const covered = getCoveredCells(px, py, pw, ph)
    .map(c => c.idx).filter(i => i !== cellIdx);

  // — Setup panel at point (invisible) —
  panel.textEl.textContent = text;
  panel.textEl.style.transition = "none";
  panel.textEl.style.opacity = "0";
  panel.el.style.cssText = `
    position:absolute; display:flex; align-items:center;
    justify-content:${openLeft ? "flex-end" : "flex-start"};
    padding:0 ${PAD_X}px;
    left:${px}px; top:${py}px;
    width:${pw}px; height:${ph}px;
    overflow:hidden;
    pointer-events:none; z-index:10;
    transform-origin:${transformOrigin};
    transform:scale(0.001);
    transition:none;
  `;
  panel.el.getBoundingClientRect(); // force layout

  // — Pre-fade covered cells; wait for full fade before panel moves —
  if (covered.length) {
    fadeCells(covered, sid);
    await animationDelay(160);
  }

  // — Phase 1: point → compact square — transform stays on the compositor —
  panel.el.style.transition = "transform 0.2s cubic-bezier(0.22,1,0.36,1)";
  panel.el.style.transform = `scale(${squareScale}, 1)`;
  await animationDelay(210);

  // — Phase 2: compact square → full width —
  panel.el.style.transition = "transform 0.2s cubic-bezier(0.22,1,0.36,1)";
  panel.el.style.transform = "scale(1)";
  await animationDelay(210);

  // — Reveal text — ease-out: decelerates into visibility —
  panel.textEl.style.transition = "opacity 0.18s cubic-bezier(0.25,1,0.5,1)";
  panel.textEl.style.opacity = "1";

  // — Hold —
  await animationDelay(1000 + Math.random() * 400);

  // — Fade text out — ease-in: accelerates out decisively —
  panel.textEl.style.transition = "opacity 0.12s cubic-bezier(0.55,0,1,0.45)";
  panel.textEl.style.opacity = "0";
  await animationDelay(130);

  // — Collapse: full → compact square —
  panel.el.style.transition = "transform 0.18s cubic-bezier(0.5,0,0.75,0)";
  panel.el.style.transform = `scale(${squareScale}, 1)`;
  await animationDelay(190);

  // — Collapse: compact square → point —
  panel.el.style.transition = "transform 0.16s cubic-bezier(0.55,0,1,0.45)";
  panel.el.style.transform = "scale(0.001)";
  await animationDelay(170);

  panel.el.style.display = "none";
  panel.busy = false;
  activeRects.delete(sid);

  // — Restore triangles only after panel is fully gone —
  restoreCells(sid);
}

function blinkCell(cell) {
  cell.el.style.transition = "none";
  cell.el.style.opacity = "0.1";
  animationDelay(70).then(() => {
    cell.el.style.transition = "opacity 0.2s cubic-bezier(0.25,1,0.5,1)";
    cell.el.style.opacity = "1";
  });
}

/* ───── expansion loop ─────
   Fires on an independent timer — does NOT await runExpansion.
   Multiple panels can be active simultaneously as long as their
   rects don't collide. Natural overlaps happen organically.
───── */
async function expansionLoop() {
  while (true) {
    // Variable interval — creates unpredictable, natural cadence
    await animationDelay(500 + Math.random() * 900);

    // The viewport can change during the interval; never start a new card
    // until this grid is visible again.
    await waitUntilTriangleGridVisible();

    const fp = getFreePanel();
    if (!fp) continue; // both panel slots busy, try next tick

    const text = nextActivity();
    const slot = findNonCollidingSlot(text);
    if (!slot) continue; // no non-colliding position found, skip

    if (cells[slot.cellIdx]) blinkCell(cells[slot.cellIdx]);
    await animationDelay(80);

    // Fire WITHOUT awaiting — panel runs independently
    runExpansion(slot, text, fp);
  }
}

/* ───── triangle entrance ───── */
async function appearTriangles() {
  const shuffled = visibleCells().sort(() => Math.random() - 0.5);
  shuffled.forEach((cell, i) => {
    setTimeout(() => {
      cell.el.style.opacity = "0.12";
      setTimeout(() => {
        cell.el.style.transition = "opacity 0.22s cubic-bezier(0.25,1,0.5,1)";
        cell.el.style.opacity = "1";
      }, 55);
    }, i * 18 + Math.random() * 15);
  });
  await animationDelay(shuffled.length * 18 + 400);
  expansionLoop();
}

/* ───── build grid ───── */
function buildGrid() {
  const grid = document.getElementById("triangle-grid");
  if (!grid) return;
  grid.style.position = "relative";
  grid.style.overflow = "hidden";

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;
      const x = col * STEP, y = row * STEP;
      const tf = TRANSFORMS[idx] || "none";
      const cell = document.createElement("div");
      cell.style.cssText = `position:absolute;left:${x}px;top:${y}px;
        width:${CELL}px;height:${CELL}px;opacity:0;`;
      cell.innerHTML = `<svg viewBox="0 0 10 10" width="10" height="10" fill="none"
        style="display:block;transform:${tf};transform-origin:center;">
        <path d="${TRIANGLE_PATH}" fill="white"/></svg>`;
      grid.appendChild(cell);
      cells.push({ el: cell, x, y, idx, row, col, hidden: false });
    }
  }

  for (let i = 0; i < PANEL_COUNT; i++) {
    const p = createPanel();
    grid.appendChild(p.el);
    panelPool.push(p);
  }
}

/* ───── viewport lifecycle ───── */
function initScrollTrigger() {
  const section = document.getElementById("abstract-section");
  if (!section) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const isVisible = e.isIntersecting && e.intersectionRatio >= 0.1;
      setTriangleGridVisibility(isVisible);

      if (isVisible && !animationStarted) {
        animationStarted = true;
        appearTriangles();
      }
    });
  }, { threshold: [0, 0.1] });
  observer.observe(section);
}

/* ───── triangle grid scaling ───── */
function updateGridScale() {
  const wrapper = document.getElementById("triangle-grid-wrapper");
  const grid = document.getElementById("triangle-grid");
  if (!wrapper || !grid) return;

  const available = wrapper.offsetWidth;

  // On narrow screens use 6 columns so grid stays legible
  const newCols = available < 700 ? 6 : COLS;
  const newGridW = newCols * STEP - GAP; // 560 or 1000

  if (newCols !== effectiveCols) {
    effectiveCols = newCols;
    effectiveGridW = newGridW;
    // Show/hide cells based on visible column count
    cells.forEach(c => {
      c.hidden = c.col >= effectiveCols;
      c.el.style.display = c.hidden ? "none" : "";
    });
  }

  // The abstract animation is allowed to grow with its shared section
  // container, so it fills wide editorial layouts instead of stopping at
  // its original 1000px drawing width.
  const scale = available / effectiveGridW;
  grid.style.setProperty("--grid-scale", scale);
  wrapper.style.height = Math.round(GRID_H * scale) + "px";
}

/* ───── mobile nav toggle ───── */
function initMobileNav() {
  const btn = document.getElementById("nav-hamburger");
  const drawer = document.getElementById("nav-mobile-drawer");
  if (!btn || !drawer) return;

  btn.addEventListener("click", () => {
    const open = btn.classList.toggle("open");
    drawer.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.style.overflow = open ? "hidden" : "";
  });

  drawer.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      btn.classList.remove("open");
      drawer.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    });
  });
}

/* ───── logo grid reveal on scroll ───── */
function initLogoReveal() {
  const logoGrid = document.querySelector(".logo-grid");
  if (!logoGrid) return;

  const logoCells = [...logoGrid.querySelectorAll(".logo-cell")];
  logoGrid.classList.add("animate-ready");

  // Compute how many grid columns are active at the current breakpoint
  function getGridCols() {
    return getComputedStyle(logoGrid).gridTemplateColumns.trim().split(/\s+/).length;
  }

  const seen = new WeakSet();

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting || seen.has(e.target)) return;
      seen.add(e.target);
      observer.unobserve(e.target);
      const col = logoCells.indexOf(e.target) % getGridCols();
      // stagger by column so same-row cells appear left → right
      setTimeout(() => e.target.classList.add("revealed"), col * 55);
    });
  }, { threshold: 0.25, rootMargin: "0px 0px -12px 0px" });

  logoCells.forEach(cell => observer.observe(cell));
}

/* ───── alternative logo-section spotlight ───── */
function initStoryIndex() {
  const links = [...document.querySelectorAll(".story-logo-link")];
  const stage = document.querySelector(".story-stage");
  if (!links.length || !stage) return;

  const logo = stage.querySelector("[data-story-logo]");
  const category = stage.querySelector("[data-story-category]");
  const title = stage.querySelector("[data-story-title]");
  const stageLink = stage.querySelector("[data-story-link]");
  const pulse = stage.querySelector(".story-stage-pulse");
  const metrics = [1, 2, 3].map(number => ({
    value: stage.querySelector(`[data-story-metric-value="${number}"]`),
    caption: stage.querySelector(`[data-story-metric-caption="${number}"]`)
  }));
  let activeLink = links.find(link => link.classList.contains("is-active")) || links[0];
  let rotationTimer;
  let transitionTimer;
  let entranceTimer;
  let storyInViewport = false;
  let hasEnteredViewport = false;

  function playStageEntrance() {
    stage.classList.remove("is-entering");
    void stage.offsetWidth;
    stage.classList.add("is-entering");
    window.clearTimeout(entranceTimer);
    entranceTimer = window.setTimeout(() => {
      stage.classList.remove("is-entering");
    }, 620);
  }

  function playPulse(sourceLink) {
    if (!pulse || !sourceLink) return;

    const source = sourceLink.getBoundingClientRect();
    const target = stage.getBoundingClientRect();
    const x = ((source.left + source.width / 2 - target.left) / target.width) * 100;
    const y = ((source.top + source.height / 2 - target.top) / target.height) * 100;

    stage.style.setProperty("--pulse-x", `${x}%`);
    stage.style.setProperty("--pulse-y", `${y}%`);
    pulse.classList.remove("is-running");
    void pulse.offsetWidth;
    pulse.classList.add("is-running");
  }

  function moveActiveBackground(previousLink, nextLink) {
    const previous = previousLink.getBoundingClientRect();
    const next = nextLink.getBoundingClientRect();
    const deltaX = (next.left + next.width / 2) - (previous.left + previous.width / 2);
    const deltaY = (next.top + next.height / 2) - (previous.top + previous.height / 2);
    let previousExit;
    let nextEntry;

    const isDiagonal = Math.abs(deltaX) > 1 && Math.abs(deltaY) > 1;

    if (isDiagonal) {
      const horizontal = deltaX > 0 ? 102 : -102;
      const vertical = deltaY > 0 ? 102 : -102;
      previousExit = `translate(${horizontal}%, ${vertical}%)`;
      nextEntry = `translate(${-horizontal}%, ${-vertical}%)`;
    } else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      previousExit = deltaX > 0 ? "translateX(102%)" : "translateX(-102%)";
      nextEntry = deltaX > 0 ? "translateX(-102%)" : "translateX(102%)";
    } else {
      previousExit = deltaY > 0 ? "translateY(102%)" : "translateY(-102%)";
      nextEntry = deltaY > 0 ? "translateY(-102%)" : "translateY(102%)";
    }

    // Prime the target in its exact entry position without a transition.
    // This cancels any unfinished reveal from a rapid hover/timer change.
    nextLink.classList.remove("is-active");
    nextLink.classList.add("is-reveal-primed");
    nextLink.style.setProperty("--reveal-from", nextEntry);
    void nextLink.offsetWidth;
    nextLink.classList.remove("is-reveal-primed");

    // The active green fill exits toward the next card, then the target
    // enters from the opposite side. The same vector is used for diagonals.
    previousLink.classList.remove("is-reveal-primed");
    previousLink.style.setProperty("--reveal-from", previousExit);
    previousLink.classList.remove("is-active");
    void nextLink.offsetWidth;
    nextLink.classList.add("is-active");
  }

  function showStory(link) {
    if (link === activeLink) return;

    const previousLink = activeLink;
    playPulse(previousLink);
    moveActiveBackground(previousLink, link);
    activeLink = link;
    window.clearTimeout(transitionTimer);
    window.clearTimeout(entranceTimer);
    stage.classList.remove("is-entering");
    stage.classList.add("is-fading-out");

    transitionTimer = window.setTimeout(() => {
      logo.src = link.dataset.storyLogoImage;
      logo.alt = link.dataset.storyLogo;
      if (link.dataset.storyLogoKind) {
        logo.dataset.logoKind = link.dataset.storyLogoKind;
      } else {
        delete logo.dataset.logoKind;
      }
      category.textContent = link.dataset.storyCategory;
      title.textContent = link.dataset.storyTitle;
      stageLink.href = link.href;
      metrics.forEach(({ value, caption }, position) => {
        const metricNumber = position + 1;
        value.textContent = link.getAttribute(`data-story-metric-${metricNumber}-value`) || "";
        caption.textContent = link.getAttribute(`data-story-metric-${metricNumber}-caption`) || "";
      });
      const [x, y] = link.dataset.storyPosition.split(" ");
      stage.style.setProperty("--story-x", x);
      stage.style.setProperty("--story-y", y);
      stage.classList.remove("is-fading-out");
      playStageEntrance();
    }, 160);
  }

  function restartRotation() {
    window.clearInterval(rotationTimer);
    if (!storyInViewport) return;
    rotationTimer = window.setInterval(() => {
      const currentIndex = links.indexOf(activeLink);
      showStory(links[(currentIndex + 1) % links.length]);
    }, 7200);
  }

  links.forEach(link => {
    link.addEventListener("mouseenter", () => {
      showStory(link);
      restartRotation();
    });
    link.addEventListener("focus", () => {
      showStory(link);
      restartRotation();
    });
  });

  const storyLayout = stage.closest(".story-layout") || stage;
  const storyObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      storyInViewport = entry.isIntersecting && entry.intersectionRatio >= 0.1;

      if (storyInViewport) {
        if (!hasEnteredViewport) {
          hasEnteredViewport = true;
          playStageEntrance();
        }
        restartRotation();
        return;
      }

      window.clearInterval(rotationTimer);
      window.clearTimeout(transitionTimer);
      window.clearTimeout(entranceTimer);
      stage.classList.remove("is-fading-out", "is-entering");
    });
  }, { threshold: [0, 0.1] });

  storyObserver.observe(storyLayout);
}

function initTestimonialControls() {
  const track = document.querySelector(".testimonials-track");
  const previous = document.querySelector("[data-testimonials-previous]");
  const next = document.querySelector("[data-testimonials-next]");
  if (!track || !previous || !next) return;

  let isAnimating = false;
  const slideAmount = () => {
    const card = track.querySelector(".testimonial-card");
    const styles = getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 16;
    return (card?.getBoundingClientRect().width || 320) + gap;
  };

  const resetPosition = () => {
    track.style.transition = "none";
    track.style.transform = "translateX(0)";
    void track.offsetWidth;
    track.style.transition = "";
  };

  const onTransitionEnd = (callback) => {
    track.addEventListener("transitionend", function complete(event) {
      if (event.propertyName !== "transform") return;
      track.removeEventListener("transitionend", complete);
      callback();
    });
  };

  const moveNext = () => {
    if (isAnimating) return;
    isAnimating = true;
    track.style.transition = "transform 450ms cubic-bezier(0.16, 1, 0.3, 1)";
    track.style.transform = `translateX(${-slideAmount()}px)`;
    onTransitionEnd(() => {
      track.append(track.firstElementChild);
      resetPosition();
      isAnimating = false;
    });
  };

  const movePrevious = () => {
    if (isAnimating) return;
    isAnimating = true;
    track.prepend(track.lastElementChild);
    track.style.transition = "none";
    track.style.transform = `translateX(${-slideAmount()}px)`;
    void track.offsetWidth;
    track.style.transition = "transform 450ms cubic-bezier(0.16, 1, 0.3, 1)";
    requestAnimationFrame(() => { track.style.transform = "translateX(0)"; });
    onTransitionEnd(() => {
      resetPosition();
      isAnimating = false;
    });
  };

  previous.addEventListener("click", movePrevious);
  next.addEventListener("click", moveNext);
}

document.addEventListener("DOMContentLoaded", () => {
  buildGrid();
  updateGridScale();
  window.addEventListener("resize", updateGridScale);
  initScrollTrigger();
  initMobileNav();
  initLogoReveal();
  initStoryIndex();
  initTestimonialControls();
});
