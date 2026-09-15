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
const FONT_SIZE = 10;
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
    width:auto; height:${ph}px;
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

  function setActiveLink(previousLink, nextLink) {
    previousLink.classList.remove("is-active");
    nextLink.classList.add("is-active");
  }

  function showStory(link) {
    if (link === activeLink) return;

    const previousLink = activeLink;
    playPulse(previousLink);
    setActiveLink(previousLink, link);
    activeLink = link;
    window.clearTimeout(transitionTimer);
    window.clearTimeout(entranceTimer);
    stage.classList.remove("is-entering");
    stage.classList.add("is-fading-out");

    transitionTimer = window.setTimeout(() => {
      logo.src = link.dataset.storyLogoImage;
      logo.alt = link.dataset.storyLogo;
      delete logo.dataset.logoKind;
      category.textContent = link.dataset.storyCategory;
      title.textContent = link.dataset.storyTitle;
      stageLink.href = link.href;
      metrics.forEach(({ value, caption }, position) => {
        const metricNumber = position + 1;
        value.textContent = link.getAttribute(`data-story-metric-${metricNumber}-value`) || "";
        caption.textContent = link.getAttribute(`data-story-metric-${metricNumber}-caption`) || "";
      });
      const [x, y] = (link.dataset.storyPosition || "50% 50%").split(" ");
      stage.style.setProperty("--story-x", x);
      stage.style.setProperty("--story-y", y);
      if (link.dataset.storyBg) {
        stage.style.setProperty("--story-bg-image", `url('${link.dataset.storyBg}')`);
      }
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

/* Case study selector: one stable panel, with no automatic rotation. */
function initCaseStudiesShowcase() {
  const root = document.querySelector(".case-studies-alt-section");
  if (!root) return;
  const panel = root.querySelector(".case-studies-showcase");
  const buttons = [...root.querySelectorAll(".case-studies-picker")];
  if (!panel || !buttons.length) return;
  let active = buttons.find(button => button.classList.contains("is-active"));
  let entranceTimer;

  function playEntrance() {
    clearTimeout(entranceTimer);
    panel.classList.remove("is-entering");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void panel.offsetWidth;
      panel.classList.add("is-entering");
      entranceTimer = setTimeout(() => panel.classList.remove("is-entering"), 900);
    }
  }

  const entranceObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      playEntrance();
      entranceObserver.disconnect();
    }
  }, { threshold: 0.2 });
  entranceObserver.observe(panel);

  function select(button) {
    if (active === button) return;
    active = button;
    const data = button.dataset;
    buttons.forEach(item => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    panel.querySelector("[data-case-logo]").src = data.caseLogo;
    panel.querySelector("[data-case-logo]").alt = data.caseLogoAlt;
    panel.querySelector("[data-case-category]").textContent =
      (data.caseCategory || "").split(/\s*\/\s*/)[0].trim();
    panel.querySelector("[data-case-title]").textContent = data.caseTitle;
    panel.querySelector("[data-case-problem]").textContent = data.caseProblem;
    panel.querySelector("[data-case-solution]").textContent = data.caseSolution;
    panel.querySelector("[data-case-link]").href = data.caseHref;
    for (let number = 1; number <= 3; number += 1) {
      panel.querySelector('[data-case-metric-value="' + number + '"]').textContent =
        button.getAttribute("data-case-metric-" + number + "-value");
      panel.querySelector('[data-case-metric-caption="' + number + '"]').textContent =
        button.getAttribute("data-case-metric-" + number + "-caption");
    }
    panel.style.setProperty("--case-image", 'url("' + data.caseBg + '")');
    playEntrance();
  }

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => select(button));
    button.addEventListener("keydown", event => {
      const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!direction && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
        (index + direction + buttons.length) % buttons.length;
      buttons[next].focus();
      select(buttons[next]);
    });
    // Warm the local assets so switching has no empty-image frame.
    [button.dataset.caseBg, button.dataset.caseLogo].forEach(src => {
      const image = new Image();
      image.src = src;
    });
  });
}

function initTestimonialControls() {
  const track = document.querySelector(".testimonials-track");
  const viewport = document.querySelector(".testimonials-viewport");
  const previous = document.querySelector("[data-testimonials-previous]");
  const next = document.querySelector("[data-testimonials-next]");
  if (!track || !previous || !next) return;

  let isAnimating = false;
  let autoplayTimer;
  const AUTOPLAY_MS = 4500;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

  const stopAutoplay = () => {
    window.clearInterval(autoplayTimer);
    autoplayTimer = undefined;
  };

  const startAutoplay = () => {
    stopAutoplay();
    if (prefersReducedMotion.matches) return;
    autoplayTimer = window.setInterval(moveNext, AUTOPLAY_MS);
  };

  previous.addEventListener("click", () => {
    movePrevious();
    startAutoplay();
  });
  next.addEventListener("click", () => {
    moveNext();
    startAutoplay();
  });

  // Touch / pointer swipe
  let pointerId = null;
  let startX = 0;
  let deltaX = 0;
  let swiping = false;

  const onPointerDown = (event) => {
    if (isAnimating || event.button) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    deltaX = 0;
    swiping = true;
    stopAutoplay();
    track.setPointerCapture?.(pointerId);
    track.style.transition = "none";
  };

  const onPointerMove = (event) => {
    if (!swiping || event.pointerId !== pointerId) return;
    deltaX = event.clientX - startX;
    track.style.transform = `translateX(${deltaX}px)`;
  };

  const onPointerUp = (event) => {
    if (!swiping || event.pointerId !== pointerId) return;
    swiping = false;
    pointerId = null;
    const threshold = Math.min(80, slideAmount() * 0.22);
    const dx = deltaX;
    deltaX = 0;

    if (dx <= -threshold) {
      isAnimating = true;
      track.style.transition = "transform 450ms cubic-bezier(0.16, 1, 0.3, 1)";
      track.style.transform = `translateX(${-slideAmount()}px)`;
      onTransitionEnd(() => {
        track.append(track.firstElementChild);
        resetPosition();
        isAnimating = false;
        startAutoplay();
      });
      return;
    }

    if (dx >= threshold) {
      track.style.transition = "none";
      track.style.transform = "translateX(0)";
      void track.offsetWidth;
      movePrevious();
      startAutoplay();
      return;
    }

    track.style.transition = "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)";
    track.style.transform = "translateX(0)";
    onTransitionEnd(() => {
      resetPosition();
      startAutoplay();
    });
  };

  const swipeTarget = viewport || track;
  swipeTarget.style.touchAction = "pan-y";
  swipeTarget.addEventListener("pointerdown", onPointerDown);
  swipeTarget.addEventListener("pointermove", onPointerMove);
  swipeTarget.addEventListener("pointerup", onPointerUp);
  swipeTarget.addEventListener("pointercancel", onPointerUp);

  // Pause autoplay while hovering / focused (desktop)
  swipeTarget.addEventListener("mouseenter", stopAutoplay);
  swipeTarget.addEventListener("mouseleave", startAutoplay);
  swipeTarget.addEventListener("focusin", stopAutoplay);
  swipeTarget.addEventListener("focusout", startAutoplay);

  prefersReducedMotion.addEventListener("change", () => {
    if (prefersReducedMotion.matches) stopAutoplay();
    else startAutoplay();
  });

  startAutoplay();
}

function initClientBentoMarquee() {
  const track = document.querySelector(".client-bento-track");
  const source = track?.querySelector(".client-bento");
  const viewport = track?.closest(".client-bento-viewport");
  if (!track || !source || !viewport || track.children.length > 1) return;

  const duplicate = source.cloneNode(true);
  duplicate.setAttribute("aria-hidden", "true");
  duplicate.querySelectorAll("a").forEach(link => { link.tabIndex = -1; });
  duplicate.querySelectorAll("img").forEach(image => { image.alt = ""; });
  track.append(duplicate);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cycleWidth = 0;
  let distance = 0;
  let speed = 1;
  let previousTime = null;
  let frame = null;

  const measure = () => {
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    cycleWidth = source.getBoundingClientRect().width + gap;
    if (cycleWidth > 0) distance %= cycleWidth;
  };
  const paint = () => { track.style.transform = `translate3d(${-distance}px, 0, 0)`; };
  const animate = now => {
    frame = requestAnimationFrame(animate);
    if (document.hidden || reducedMotion.matches || cycleWidth <= 0) {
      previousTime = null;
      return;
    }
    if (previousTime === null) { previousTime = now; return; }
    const elapsed = Math.min(now - previousTime, 64);
    previousTime = now;
    const target = viewport.matches(":hover") || viewport.matches(":focus-within") ? 0 : 1;
    const easingTime = target === 0 ? 470 : 260;
    speed += (target - speed) * (1 - Math.exp(-elapsed / easingTime));
    distance = (distance + (cycleWidth / 90000) * elapsed * speed) % cycleWidth;
    paint();
  };
  const syncMotion = () => {
    if (reducedMotion.matches) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      distance = 0;
      speed = 0;
      previousTime = null;
      paint();
    } else if (frame === null) {
      speed = 1;
      previousTime = null;
      frame = requestAnimationFrame(animate);
    }
  };

  measure();
  paint();
  syncMotion();
  window.addEventListener("resize", measure);
  reducedMotion.addEventListener("change", syncMotion);
}

function initIndustryCardReveals() {
  const cards = [...document.querySelectorAll(".industry-card")];
  if (!cards.length) return;

  const scrollMq = window.matchMedia("(max-width: 900px)");
  let observer;
  let activeRow = -1;
  let intersecting = new Set();

  const getColumns = () => {
    const grid = cards[0]?.parentElement;
    if (!grid) return 2;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
    return Math.max(1, cols);
  };

  const updateHeights = () => {
    cards.forEach((card) => {
      const description = card.querySelector("p");
      const relatedStories = card.querySelector(".industry-related-stories");

      if (description) {
        card.style.setProperty("--industry-description-height", `${description.scrollHeight + 12}px`);
      }
      if (relatedStories) {
        card.style.setProperty("--industry-related-stories-height", `${relatedStories.scrollHeight + 12}px`);
      }
    });
  };

  const clearActive = () => {
    activeRow = -1;
    cards.forEach((card) => card.classList.remove("is-active"));
  };

  const setActiveRow = (rowIndex) => {
    if (rowIndex === activeRow) return;
    activeRow = rowIndex;
    const cols = getColumns();
    cards.forEach((card, i) => {
      card.classList.toggle("is-active", Math.floor(i / cols) === rowIndex);
    });
  };

  // Pick the single row closest to the focus band; never leave two rows open.
  const syncActiveRow = () => {
    if (!scrollMq.matches || !intersecting.size) {
      clearActive();
      return;
    }

    const cols = getColumns();
    // Offset focus line above center so the next row takes over before the previous stays open.
    const focusY = window.innerHeight * 0.36;
    let bestRow = -1;
    let bestDist = Infinity;

    intersecting.forEach((card) => {
      const index = cards.indexOf(card);
      if (index < 0) return;
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height * 0.5;
      const dist = Math.abs(mid - focusY);
      const row = Math.floor(index / cols);
      if (dist < bestDist) {
        bestDist = dist;
        bestRow = row;
      }
    });

    if (bestRow < 0) clearActive();
    else setActiveRow(bestRow);
  };

  const disconnectObserver = () => {
    if (!observer) return;
    observer.disconnect();
    observer = undefined;
  };

  // Mobile: same open/close animation as hover, one 2-card row at a time.
  const bindViewportTriggers = () => {
    disconnectObserver();
    intersecting = new Set();
    clearActive();
    if (!scrollMq.matches) return;

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) intersecting.add(entry.target);
        else intersecting.delete(entry.target);
      });
      syncActiveRow();
    }, {
      // Narrow band with vertical offset — typically only one row sits inside.
      threshold: [0, 0.2, 0.4, 0.6],
      rootMargin: "-16% 0px -46% 0px"
    });

    cards.forEach((card) => observer.observe(card));
  };

  updateHeights();
  bindViewportTriggers();

  window.addEventListener("resize", () => {
    updateHeights();
    if (scrollMq.matches) syncActiveRow();
  });
  scrollMq.addEventListener("change", () => {
    updateHeights();
    bindViewportTriggers();
  });
}

const HERO_GRID_PHOTOS = [
  "../assets/industry-insurance.png",
  "../assets/industry-finance.png",
  "../assets/industry-manufacturing.png",
  "../assets/industry-retail.png",
  "../assets/industry-logistics.png",
  "../assets/industry-airlines.png",
  "../assets/industry-telecom.png",
  "../assets/industry-utilities.png"
];

const HERO_GRID_BEAT = 1900;
const HERO_GRID_TILES = 3;
const HERO_GRID_LIT_PER_BEAT = 4;
// Minimum empty cells between tile edges (no side/corner contact).
const HERO_GRID_TILE_GAP = 1;
// 3×3 appears once for every five 2×2 tiles (≈1/6 of placements).
const HERO_GRID_LARGE_RATIO = 1 / 6;
// Keep the left portion of the hero clear of photo tiles.
const HERO_GRID_LEFT_EXCLUSION = 0.2;

function initHeroGrid() {
  const grid = document.getElementById("hero-grid");
  if (!grid) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cells = [];
  let tiles = [];
  let cols = 0;
  let rows = 0;
  let fullRows = 0;
  let cellSize = 42;
  let beatTimer;
  let beat = 0;
  let tileCursor = 0;
  let photoIndex = 0;
  let inViewport = true;

  function readCellSize() {
    const declared = parseFloat(getComputedStyle(grid).getPropertyValue("--hero-cell"));
    return Number.isFinite(declared) && declared > 0 ? declared : 42;
  }

  function leftExclusion() {
    return window.matchMedia("(max-width: 900px)").matches ? 0.06 : HERO_GRID_LEFT_EXCLUSION;
  }

  function isStackedHeroGrid() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  // Fit hero + logo carousel to one viewport, and snap hero height to an
  // exact multiple of the grid cell so no cells are clipped at the edge.
  function snapContentHeight() {
    const content = grid.closest(".hero-content");
    const hero = grid.closest(".hero");
    const marquee = document.querySelector(".client-marquee-section");
    const marqueeContent = document.querySelector(".client-marquee-content");
    const nav = document.querySelector(".navbar");
    if (!content) return;

    cellSize = readCellSize();
    content.style.minHeight = "";
    content.style.height = "";
    if (marqueeContent) {
      marqueeContent.style.paddingTop = "";
      marqueeContent.style.paddingBottom = "";
    }

    const navH = nav ? nav.getBoundingClientRect().height : 0;
    const viewport = window.innerHeight;

    function absorbLeftover(leftover) {
      if (!marqueeContent || leftover <= 0) return;
      const styles = getComputedStyle(marqueeContent);
      const basePt = parseFloat(styles.paddingTop) || 0;
      const basePb = parseFloat(styles.paddingBottom) || 0;
      const topExtra = Math.floor(leftover / 2);
      const bottomExtra = leftover - topExtra;
      marqueeContent.style.paddingTop = `${basePt + topExtra}px`;
      marqueeContent.style.paddingBottom = `${basePb + bottomExtra}px`;
    }

    if (isStackedHeroGrid()) {
      if (!marquee || !marqueeContent) return;
      const heroH = (hero || content).getBoundingClientRect().height;
      const marqueeH = marquee.getBoundingClientRect().height;
      absorbLeftover(viewport - navH - heroH - marqueeH);
      return;
    }

    const marqueeH = marquee ? marquee.getBoundingClientRect().height : 0;
    const available = Math.max(cellSize, viewport - navH - marqueeH);
    const natural = content.getBoundingClientRect().height;
    const minHero = Math.max(cellSize, Math.ceil(natural / cellSize) * cellSize);
    let heroH = Math.floor(available / cellSize) * cellSize;
    if (heroH < minHero) heroH = minHero;

    content.style.height = `${heroH}px`;
    content.style.minHeight = `${heroH}px`;

    if (heroH <= available) absorbLeftover(available - heroH);
  }

  function build() {
    snapContentHeight();

    const { width, height } = grid.getBoundingClientRect();
    if (!width || !height) return;

    cellSize = readCellSize();
    cols = Math.ceil(width / cellSize) + 1;
    rows = Math.max(1, Math.round(height / cellSize));
    // Prefer exact row count from the snapped content height to avoid a clipped final row.
    const content = grid.closest(".hero-content");
    if (content && !isStackedHeroGrid()) {
      const snappedRows = Math.round(content.getBoundingClientRect().height / cellSize);
      if (snappedRows > 0) rows = snappedRows;
    }
    fullRows = rows;

    grid.textContent = "";
    grid.style.setProperty("--hero-grid-cols", cols);

    const cellsLayer = document.createElement("div");
    cellsLayer.className = "hero-grid-cells";

    const fragment = document.createDocumentFragment();
    cells = [];
    for (let index = 0; index < cols * rows; index += 1) {
      const cell = document.createElement("span");
      cell.className = "hero-grid-cell";
      cells.push(cell);
      fragment.append(cell);
    }
    cellsLayer.append(fragment);
    grid.append(cellsLayer);

    tiles = [];
    for (let index = 0; index < HERO_GRID_TILES; index += 1) {
      const tile = document.createElement("div");
      tile.className = "hero-grid-tile";
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      tile.append(image);
      tiles.push(tile);
      grid.append(tile);
    }

    tiles.forEach(tile => placeTile(tile));
  }

  // A tile's right edge sits on `col`; size 2 covers col-1..col / row..row+1,
  // size 3 covers col-2..col / row..row+2.
  function tileBox(col, row, size = 2) {
    const span = size - 1;
    return { left: col - span, right: col, top: row, bottom: row + span };
  }

  function tileSize(tile) {
    return Number(tile.dataset.size) || 2;
  }

  // True when boxes are separated by ≥1 empty cell on at least one axis (no edge/corner touch).
  function hasRoom(box, tile) {
    return tiles.every(other => {
      if (other === tile || other.dataset.col === undefined) return true;
      const rival = tileBox(Number(other.dataset.col), Number(other.dataset.row), tileSize(other));
      const colGap = Math.max(box.left - rival.right, rival.left - box.right) - 1;
      const rowGap = Math.max(box.top - rival.bottom, rival.top - box.bottom) - 1;
      return colGap >= HERO_GRID_TILE_GAP || rowGap >= HERO_GRID_TILE_GAP;
    });
  }

  function pickSize() {
    return Math.random() < HERO_GRID_LARGE_RATIO ? 3 : 2;
  }

  function findSpot(tile, size) {
    const leftReserve = Math.ceil(cols * leftExclusion());
    const minCol = leftReserve + size - 1;
    const maxCol = Math.max(cols - 1, minCol);
    const minRow = 0;
    const maxRow = Math.max(fullRows - size, 0);

    if (minCol > cols - 1) return null;

    for (let attempt = 0; attempt < 48; attempt += 1) {
      const col = minCol + Math.floor(Math.random() * (maxCol - minCol + 1));
      const row = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
      if (hasRoom(tileBox(col, row, size), tile)) return { col, row };
    }

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        if (hasRoom(tileBox(col, row, size), tile)) return { col, row };
      }
    }

    return null;
  }

  // Photos stay out of the left 20%; only spacing against placed tiles matters.
  // Occasionally uses a 3×3 tile (1:5 vs 2×2); falls back to 2×2 if no room.
  function placeTile(tile) {
    let size = pickSize();
    let spot = findSpot(tile, size);
    if (!spot && size === 3) {
      size = 2;
      spot = findSpot(tile, size);
    }

    const leftReserve = Math.ceil(cols * leftExclusion());
    const col = spot ? spot.col : leftReserve + size - 1;
    const row = spot ? spot.row : 0;

    tile.dataset.size = size;
    tile.dataset.col = col;
    tile.dataset.row = row;
    tile.style.right = `${(cols - 1 - col) * cellSize}px`;
    tile.style.top = `${row * cellSize}px`;
  }

  function nextPhoto(tile) {
    const image = tile.querySelector("img");
    image.src = HERO_GRID_PHOTOS[photoIndex % HERO_GRID_PHOTOS.length];
    photoIndex += 1;
  }

  // One cell per horizontal band each beat, so the lit cells stay spread over the grid.
  function lightCells() {
    if (!cells.length) return;

    const band = Math.max(Math.ceil(rows / HERO_GRID_LIT_PER_BEAT), 1);
    for (let slot = 0; slot < HERO_GRID_LIT_PER_BEAT; slot += 1) {
      const row = Math.min(slot * band + Math.floor(Math.random() * band), rows - 1);
      const col = Math.floor(Math.random() * cols);
      const cell = cells[row * cols + col];
      if (!cell || cell.classList.contains("is-lit")) continue;
      cell.classList.add("is-lit");
      window.setTimeout(() => cell.classList.remove("is-lit"), HERO_GRID_BEAT * 2);
    }
  }

  // Walks the tiles in lane order, so reveals travel top-right → bottom-left.
  // Exit waits for shrink-then-fade (~1.06s) before the next photo enters.
  const HERO_TILE_EXIT_MS = 1100;

  function swapTile() {
    const tile = tiles[tileCursor % tiles.length];
    tileCursor += 1;
    if (!tile) return;

    if (!tile.classList.contains("is-open")) {
      tile.classList.remove("is-closing");
      nextPhoto(tile);
      tile.classList.add("is-open");
      return;
    }

    tile.classList.remove("is-open");
    tile.classList.add("is-closing");
    window.setTimeout(() => {
      tile.classList.remove("is-closing");
      placeTile(tile);
      nextPhoto(tile);
      tile.classList.add("is-open");
    }, HERO_TILE_EXIT_MS);
  }

  function tick() {
    lightCells();
    if (beat % 2 === 0) swapTile();
    beat += 1;
  }

  function start() {
    if (beatTimer || reducedMotion.matches || !cells.length) return;
    tick();
    beatTimer = window.setInterval(tick, HERO_GRID_BEAT);
  }

  function stop() {
    window.clearInterval(beatTimer);
    beatTimer = undefined;
  }

  function showStatic() {
    tiles.forEach(tile => {
      tile.classList.remove("is-closing");
      nextPhoto(tile);
      tile.classList.add("is-open");
    });
  }

  // On mobile the grid stacks above the copy (full width); desktop overlays the right half.
  build();

  if (reducedMotion.matches) showStatic();
  else start();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      stop();
      beat = 0;
      tileCursor = 0;
      build();
      if (reducedMotion.matches) showStatic();
      else if (inViewport) start();
    });
  }

  // The observer only pauses the beat once the hero scrolls away.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      inViewport = entry.isIntersecting;
      if (inViewport) start();
      else stop();
    });
  }, { threshold: 0 });
  observer.observe(grid);

  reducedMotion.addEventListener("change", event => {
    if (event.matches) {
      stop();
      showStatic();
      return;
    }
    if (inViewport) start();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      stop();
      beat = 0;
      tileCursor = 0;
      build();
      if (reducedMotion.matches) showStatic();
      else if (inViewport) start();
    }, 220);
  });
}

function initAgentsCaseSwitchers() {
  document.querySelectorAll(".agents-case-block").forEach(block => {
    const card = block.querySelector(".agents-case");
    const stories = [...block.querySelectorAll(".agents-case-stories [data-case-href]")];
    const prev = block.querySelector("[data-agents-case-prev]");
    const next = block.querySelector("[data-agents-case-next]");
    if (!card) return;

    if (stories.length < 2) {
      const controls = block.querySelector(".testimonials-controls");
      if (controls) controls.hidden = true;
      return;
    }

    const logoEl = card.querySelector("[data-agents-case-logo]");
    const categoryEl = card.querySelector("[data-agents-case-category]");
    const titleEl = card.querySelector("[data-agents-case-title]");
    const quoteEl = card.querySelector(".agents-case-quote");
    const quoteText = card.querySelector("[data-agents-case-quote]");
    const citeText = card.querySelector("[data-agents-case-cite]");
    const avatarEl = card.querySelector("[data-agents-case-avatar]");
    const authorEl = card.querySelector("[data-agents-case-author]");
    const roleEl = card.querySelector("[data-agents-case-role]");
    let index = 0;

    function applyAvatar(source) {
      if (!avatarEl) return;
      const avatar = source.getAttribute("data-case-avatar") || "";
      avatarEl.hidden = !avatar;
      if (avatar) {
        avatarEl.src = avatar;
        avatarEl.alt = "";
      }
    }

    function applyCase(source) {
      const href = source.getAttribute("data-case-href");
      const bg = source.getAttribute("data-case-bg");
      const quote = source.getAttribute("data-case-quote") || "";
      const cite = source.getAttribute("data-case-cite") || "";

      if (href) card.href = href;
      if (bg) card.style.setProperty("--case-image", "url('" + bg + "')");
      if (logoEl) {
        logoEl.src = source.getAttribute("data-case-logo") || "";
        logoEl.alt = source.getAttribute("data-case-logo-alt") || "";
      }
      if (categoryEl) {
        const category = source.getAttribute("data-case-category") || "";
        categoryEl.textContent = category.split(/\s*\/\s*/)[0].trim();
      }
      if (titleEl) titleEl.textContent = source.getAttribute("data-case-title") || "";

      [1, 2, 3].forEach(number => {
        const valueEl = card.querySelector('[data-agents-metric-value="' + number + '"]');
        const captionEl = card.querySelector('[data-agents-metric-caption="' + number + '"]');
        if (valueEl) valueEl.textContent = source.getAttribute("data-case-metric-" + number + "-value") || "";
        if (captionEl) captionEl.textContent = source.getAttribute("data-case-metric-" + number + "-caption") || "";
      });

      if (quoteEl) {
        if (quote) {
          quoteEl.hidden = false;
          if (quoteText) quoteText.textContent = quote;
          if (citeText) citeText.textContent = cite;
          const comma = cite.indexOf(",");
          if (authorEl) authorEl.textContent = comma < 0 ? cite : cite.slice(0, comma).trim();
          if (roleEl) roleEl.textContent = comma < 0 ? "" : cite.slice(comma + 1).trim();
        } else {
          quoteEl.hidden = true;
        }
      }
      applyAvatar(source);
    }

    function show(nextIndex, direction) {
      index = (nextIndex + stories.length) % stories.length;
      applyCase(stories[index]);

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      card.classList.remove("is-switching", "is-switching-from-left", "is-switching-from-right");
      void card.offsetWidth;
      card.classList.add(
        "is-switching",
        direction === "next" ? "is-switching-from-right" : "is-switching-from-left"
      );
    }

    if (prev) prev.addEventListener("click", () => show(index - 1, "prev"));
    if (next) next.addEventListener("click", () => show(index + 1, "next"));
  });
}

let agentsVoiceDemo;
let agentsSkillsDemo;
let agentsChatDemo;

function initAgentsVoiceDemo() {
  const card = document.querySelector("[data-voice-card]");
  if (!card) return null;

  const caption = card.querySelector("[data-voice-caption]");
  const leadEl = caption && caption.querySelector("[data-voice-lead-el]");
  const inviteEl = caption && caption.querySelector("[data-voice-invite-el]");
  const startButton = card.querySelector("[data-voice-start]");
  const phoneInput = card.querySelector("[data-voice-phone]");
  const form = card.querySelector("[data-voice-panel='form']");
  const successPhone = card.querySelector("[data-voice-success-phone]");
  const successLanguage = card.querySelector("[data-voice-success-language]");
  const panels = [...card.querySelectorAll("[data-voice-panel]")];
  const select = card.querySelector("[data-voice-select]");
  const selectTrigger = select && select.querySelector("[data-voice-select-trigger]");
  const selectMenu = select && select.querySelector("[data-voice-select-menu]");
  const selectFlag = select && select.querySelector("[data-voice-select-flag]");
  const selectLabel = select && select.querySelector("[data-voice-select-label]");
  const selectInput = select && select.querySelector("input[name='language']");
  const leadText = caption ? caption.getAttribute("data-voice-lead") || "" : "";
  const inviteText = caption ? caption.getAttribute("data-voice-invite") || "" : "";
  let typeTimer;
  let startTimer;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function showPanel(name) {
    panels.forEach(panel => {
      const on = panel.dataset.voicePanel === name;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });
  }

  function stopTyping() {
    window.clearTimeout(typeTimer);
    window.clearTimeout(startTimer);
    if (leadEl) leadEl.classList.remove("is-typing");
    if (inviteEl) inviteEl.classList.remove("is-typing");
  }

  function typeInto(el, text, done) {
    if (!el) {
      done();
      return;
    }

    el.textContent = "";
    el.classList.add("is-typing");
    let index = 0;

    function tick() {
      index += 1;
      el.textContent = text.slice(0, index);
      if (index < text.length) {
        typeTimer = window.setTimeout(tick, 46);
      } else {
        el.classList.remove("is-typing");
        done();
      }
    }

    tick();
  }

  function playCaption() {
    if (!caption || !leadEl || !inviteEl) return;
    stopTyping();
    leadEl.textContent = "";
    inviteEl.textContent = "";

    if (prefersReducedMotion()) {
      leadEl.textContent = leadText;
      inviteEl.textContent = inviteText;
      return;
    }

    startTimer = window.setTimeout(() => {
      typeInto(leadEl, leadText, () => {
        startTimer = window.setTimeout(() => {
          typeInto(inviteEl, inviteText, () => {});
        }, 560);
      });
    }, 420);
  }

  function closeSelect() {
    if (!select || !selectTrigger || !selectMenu) return;
    select.classList.remove("is-open");
    selectTrigger.setAttribute("aria-expanded", "false");
    selectMenu.hidden = true;
  }

  function setLanguage(option) {
    if (!option || !selectInput || !selectFlag || !selectLabel || !selectMenu) return;
    const value = option.dataset.value || "en";
    selectInput.value = value;
    selectFlag.textContent = option.dataset.flag || "";
    selectLabel.textContent = option.dataset.label || "";
    selectMenu.querySelectorAll("[role='option']").forEach(item => {
      item.setAttribute("aria-selected", item === option ? "true" : "false");
    });
    closeSelect();
  }

  function resetSelect() {
    if (!selectMenu) return;
    const english = selectMenu.querySelector("[data-value='en']");
    setLanguage(english);
  }

  function reset() {
    stopTyping();
    closeSelect();
    if (form) form.reset();
    /* The number lives in the intro panel, outside the form, so clear it here. */
    if (phoneInput) phoneInput.value = "";
    resetSelect();
    showPanel("intro");
    if (leadEl) leadEl.textContent = "";
    if (inviteEl) inviteEl.textContent = "";
  }

  function startIntro() {
    reset();
    playCaption();
  }

  if (startButton) {
    startButton.addEventListener("click", () => {
      stopTyping();
      showPanel("form");
      const nameInput = form && form.querySelector("input[name='name']");
      if (nameInput) nameInput.focus();
    });
  }

  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      closeSelect();

      if (successPhone && phoneInput) {
        successPhone.textContent = phoneInput.value.trim() || phoneInput.placeholder;
      }

      if (successLanguage && selectLabel) {
        const flag = selectFlag ? `${selectFlag.textContent} ` : "";
        successLanguage.textContent = `${flag}${selectLabel.textContent}`;
      }

      showPanel("success");
    });
  }

  if (select && selectTrigger && selectMenu) {
    selectTrigger.addEventListener("click", event => {
      event.preventDefault();
      const open = select.classList.contains("is-open");
      if (open) {
        closeSelect();
        return;
      }
      select.classList.add("is-open");
      selectTrigger.setAttribute("aria-expanded", "true");
      selectMenu.hidden = false;
    });

    selectMenu.addEventListener("click", event => {
      const option = event.target.closest("[role='option']");
      if (option) setLanguage(option);
    });

    document.addEventListener("click", event => {
      if (!select.contains(event.target)) closeSelect();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeSelect();
    });
  }

  return { startIntro, reset };
}

function initAgentsSkillsDemo() {
  const root = document.querySelector("[data-skills-demo]");
  if (!root) return null;

  const caption = root.querySelector("[data-skills-caption]");
  const views = [...root.querySelectorAll("[data-work-view]")];
  const composer = root.querySelector("[data-work-composer]");
  const typedEl = root.querySelector("[data-work-typed]");
  const sendButton = root.querySelector("[data-work-send]");
  const scroll = root.querySelector("[data-work-scroll]");
  const status = root.querySelector("[data-work-status]");
  const timerEl = root.querySelector("[data-work-timer]");
  const reply = root.querySelector("[data-work-reply]");
  const tools = [...root.querySelectorAll("[data-work-tool]")];
  const report = root.querySelector("[data-work-report]");
  const sharedBadge = root.querySelector("[data-work-shared]");
  const saveButton = root.querySelector("[data-work-save]");
  const overlay = root.querySelector("[data-work-overlay]");
  const modal = root.querySelector("[data-work-modal]");
  const modalPanels = [...root.querySelectorAll("[data-work-panel]")];
  const promptEl = root.querySelector("[data-work-sent]");
  const nameField = root.querySelector("[data-work-name-field]");
  const nameEl = root.querySelector("[data-work-agent-name]");
  const confirmSave = root.querySelector("[data-work-confirm-save]");
  const openShareButton = root.querySelector("[data-work-open-share]");
  const shareField = root.querySelector("[data-work-share-field]");
  const shareTyped = root.querySelector("[data-work-share-typed]");
  const shareChip = root.querySelector("[data-work-share-chip]");
  const shareSubmit = root.querySelector("[data-work-share-submit]");
  const toast = root.querySelector("[data-work-toast]");
  const scenes = [...root.querySelectorAll("[data-skills-scene]")];

  const order = ["describe", "run", "save", "share"];
  const captions = {
    describe: "Open the workspace and describe the job",
    run: "Watch it work, then save it as an agent",
    save: "Save the finished run as a company agent",
    share: "Everyone in the company runs the same workflow"
  };
  const holds = { describe: 9200, run: 13800, save: 11200, share: 10000 };
  const fills = {};
  order.forEach(key => {
    fills[key] = root.querySelector(`[data-skills-progress="${key}"]`);
  });

  const promptText = promptEl ? promptEl.textContent.trim() : "";
  const agentName = "Pipeline Hygiene Sweep";
  const teamName = "Sales team";
  const workedLabel = "Worked for 58s";
  let timeouts = [];
  let timerInterval = 0;
  let elapsed = 0;
  let running = false;
  let phase = "describe";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function later(fn, ms) {
    const id = window.setTimeout(fn, ms);
    timeouts.push(id);
    return id;
  }

  function clearTimers() {
    timeouts.forEach(id => window.clearTimeout(id));
    timeouts = [];
    stopTimer();
  }

  function setFill(key, mode, duration) {
    const fill = fills[key];
    if (!fill) return;
    fill.style.transition = "none";
    if (mode === "reset") {
      fill.style.transform = "scaleX(0)";
      return;
    }
    if (mode === "full") {
      fill.style.transform = "scaleX(1)";
      return;
    }
    fill.style.transform = "scaleX(0)";
    void fill.offsetWidth;
    if (prefersReducedMotion()) {
      fill.style.transform = "scaleX(1)";
      return;
    }
    fill.style.transition = `transform ${duration}ms linear`;
    fill.style.transform = "scaleX(1)";
  }

  function setPhase(key) {
    phase = key;
    if (caption) caption.textContent = captions[key];
    scenes.forEach(scene => {
      const on = scene.dataset.skillsScene === key;
      scene.classList.toggle("is-active", on);
      scene.setAttribute("aria-current", on ? "true" : "false");
    });
    const active = order.indexOf(key);
    order.forEach((step, index) => {
      if (index < active) setFill(step, "full");
      else if (index === active) setFill(step, "play", prefersReducedMotion() ? 700 : holds[step]);
      else setFill(step, "reset");
    });
  }

  function showView(key) {
    views.forEach(view => {
      const on = view.dataset.workView === key;
      view.hidden = !on;
      view.classList.toggle("is-active", on);
    });
  }

  function revealEl(el) {
    if (!el) return;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add("is-in");
  }

  /* A visible press state so the viewer registers that a button was clicked. */
  function tap(el, done) {
    if (!el) {
      if (done) done();
      return;
    }
    el.classList.remove("is-glowing");
    if (prefersReducedMotion()) {
      if (done) done();
      return;
    }
    el.classList.add("is-tapped");
    later(() => {
      el.classList.remove("is-tapped");
      if (done) done();
    }, 460);
  }

  function scrollRun() {
    if (!scroll) return;
    scroll.scrollTo({
      top: scroll.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
  }

  function typeText(el, text, speed, done) {
    if (!el) {
      if (done) done();
      return;
    }
    const host = el.parentElement;
    el.textContent = "";
    if (host) host.classList.add("is-typing");
    if (prefersReducedMotion()) {
      el.textContent = text;
      if (host) host.classList.remove("is-typing");
      if (done) done();
      return;
    }
    let index = 0;
    function tick() {
      index += 1;
      el.textContent = text.slice(0, index);
      if (index < text.length) {
        later(tick, speed);
        return;
      }
      if (host) host.classList.remove("is-typing");
      if (done) done();
    }
    tick();
  }

  function startTimer() {
    stopTimer();
    elapsed = 0;
    if (timerEl) timerEl.textContent = "Working for 0s";
    if (prefersReducedMotion()) return;
    timerInterval = window.setInterval(() => {
      elapsed += 1;
      if (timerEl) timerEl.textContent = `Working for ${elapsed}s`;
    }, 1000);
  }

  function stopTimer() {
    if (!timerInterval) return;
    window.clearInterval(timerInterval);
    timerInterval = 0;
  }

  function markToolDone(tool) {
    tool.classList.add("is-done");
    const state = tool.querySelector("[data-work-tool-state]");
    if (state) state.textContent = "Done";
  }

  function setModalPanel(key, morph) {
    if (!modal) return;
    const from = morph ? modal.getBoundingClientRect().height : 0;
    modalPanels.forEach(item => {
      const on = item.dataset.workPanel === key;
      item.classList.remove("is-active");
      item.hidden = !on;
      if (on) {
        void item.offsetWidth;
        item.classList.add("is-active");
      }
    });
    if (!morph || prefersReducedMotion()) {
      modal.style.height = "";
      return;
    }
    /* Morph the shell between panels instead of snapping to the new height. */
    const to = modal.getBoundingClientRect().height;
    if (!from || Math.abs(to - from) < 2) return;
    modal.style.height = `${from}px`;
    void modal.offsetHeight;
    modal.style.height = `${to}px`;
    later(() => {
      modal.style.height = "";
    }, 540);
  }

  function openOverlay(key) {
    if (!overlay) return;
    setModalPanel(key, false);
    overlay.hidden = false;
    void overlay.offsetWidth;
    overlay.classList.add("is-in");
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove("is-in");
    later(() => {
      overlay.hidden = true;
    }, 380);
  }

  function resetHome() {
    if (typedEl) typedEl.textContent = "";
    if (composer) composer.classList.remove("is-glowing");
    const composerText = root.querySelector(".agents-work-composer-text");
    if (composerText) composerText.classList.remove("is-typing");
    if (sendButton) sendButton.classList.remove("is-ready", "is-tapped");
  }

  function resetRun() {
    stopTimer();
    elapsed = 0;
    if (timerEl) timerEl.textContent = "Working for 0s";
    if (status) status.classList.remove("is-done");
    if (reply) {
      reply.hidden = true;
      reply.classList.remove("is-in");
    }
    tools.forEach(tool => {
      tool.hidden = true;
      tool.classList.remove("is-in", "is-done");
      const state = tool.querySelector("[data-work-tool-state]");
      if (state) state.textContent = "Running";
    });
    if (report) {
      report.hidden = true;
      report.classList.remove("is-in");
    }
    if (sharedBadge) sharedBadge.hidden = true;
    if (saveButton) saveButton.classList.remove("is-glowing", "is-tapped");
    if (scroll) scroll.scrollTop = 0;
  }

  function resetModals() {
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove("is-in");
    }
    if (modal) modal.style.height = "";
    setModalPanel("save", false);
    if (nameEl) nameEl.textContent = "";
    if (nameField) nameField.classList.remove("is-typing", "is-filled");
    if (confirmSave) confirmSave.classList.remove("is-glowing", "is-tapped");
    if (openShareButton) openShareButton.classList.remove("is-glowing", "is-tapped");
    if (shareTyped) shareTyped.textContent = "";
    if (shareChip) shareChip.hidden = true;
    if (shareField) shareField.classList.remove("is-typing", "is-filled");
    if (shareSubmit) shareSubmit.classList.remove("is-glowing", "is-tapped");
    if (toast) {
      toast.hidden = true;
      toast.classList.remove("is-in");
    }
  }

  function reset() {
    running = false;
    clearTimers();
    resetHome();
    resetRun();
    resetModals();
    showView("home");
    setPhase("describe");
    order.forEach(step => setFill(step, "reset"));
  }

  /* Everything the run view shows once the agent has finished working. */
  function fillRun() {
    stopTimer();
    showView("run");
    if (status) status.classList.add("is-done");
    if (timerEl) timerEl.textContent = workedLabel;
    revealEl(reply);
    tools.forEach(tool => {
      revealEl(tool);
      markToolDone(tool);
    });
    revealEl(report);
    if (saveButton) saveButton.classList.remove("is-glowing");
    later(scrollRun, 40);
  }

  /* Step 1 — Jane types the job into the workspace composer and sends it. */
  function playDescribe() {
    clearTimers();
    resetHome();
    resetRun();
    resetModals();
    showView("home");
    setPhase("describe");

    if (prefersReducedMotion()) {
      if (typedEl) typedEl.textContent = promptText;
      if (sendButton) sendButton.classList.add("is-ready");
      later(goRun, 1200);
      return;
    }

    if (composer) composer.classList.add("is-glowing");
    later(() => {
      if (composer) composer.classList.remove("is-glowing");
      typeText(typedEl, promptText, 17, () => {
        if (sendButton) sendButton.classList.add("is-ready");
      });
    }, 1600);
    later(() => tap(sendButton, goRun), holds.describe - 900);
  }

  function goRun() {
    if (!running) return;
    setFill("describe", "full");
    playRun();
  }

  /* Step 2 — the agent works through the connected tools and reports back. */
  function playRun() {
    clearTimers();
    resetRun();
    resetModals();
    showView("run");
    setPhase("run");

    if (prefersReducedMotion()) {
      fillRun();
      later(goSave, 1600);
      return;
    }

    startTimer();
    later(() => revealEl(reply), 520);

    const toolStart = 1250;
    const toolGap = 1250;
    tools.forEach((tool, index) => {
      later(() => {
        revealEl(tool);
        scrollRun();
      }, toolStart + index * toolGap);
      later(() => markToolDone(tool), toolStart + index * toolGap + 880);
    });

    const finishAt = toolStart + tools.length * toolGap + 320;
    later(() => {
      stopTimer();
      if (status) status.classList.add("is-done");
      if (timerEl) timerEl.textContent = workedLabel;
      revealEl(report);
      later(scrollRun, 120);
    }, finishAt);
    later(() => {
      if (saveButton) saveButton.classList.add("is-glowing");
    }, finishAt + 620);
    later(() => tap(saveButton, goSave), holds.run - 1000);
  }

  /* Step 3 — the run is saved as an agent the whole company can reuse. */
  function goSave() {
    if (!running) return;
    setFill("run", "full");
    playSave();
  }

  function playSave() {
    clearTimers();
    fillRun();
    resetModals();
    setPhase("save");
    openOverlay("save");

    if (prefersReducedMotion()) {
      if (nameEl) nameEl.textContent = agentName;
      setModalPanel("saved", false);
      later(goShare, 1600);
      return;
    }

    later(() => {
      typeText(nameEl, agentName, 34, () => {
        if (nameField) nameField.classList.add("is-filled");
        later(() => {
          if (confirmSave) confirmSave.classList.add("is-glowing");
        }, 320);
      });
    }, 640);

    later(() => tap(confirmSave, () => setModalPanel("saved", true)), 4300);
    later(() => {
      if (openShareButton) openShareButton.classList.add("is-glowing");
    }, 5600);
    later(() => tap(openShareButton, goShare), holds.save - 1100);
  }

  /* Step 4 — the agent is shared with a team and everyone gets it at once. */
  function goShare() {
    if (!running) return;
    setFill("save", "full");
    playShare();
  }

  function playShare() {
    clearTimers();
    fillRun();
    setPhase("share");
    if (toast) {
      toast.hidden = true;
      toast.classList.remove("is-in");
    }
    if (sharedBadge) sharedBadge.hidden = true;
    if (shareTyped) shareTyped.textContent = "";
    if (shareChip) shareChip.hidden = true;
    if (shareField) shareField.classList.remove("is-filled");
    if (shareSubmit) shareSubmit.classList.remove("is-glowing", "is-tapped");

    if (overlay && overlay.hidden) openOverlay("share");
    else setModalPanel("share", true);

    if (prefersReducedMotion()) {
      if (shareChip) shareChip.hidden = false;
      if (sharedBadge) sharedBadge.hidden = false;
      revealEl(toast);
      later(playDescribe, 2200);
      return;
    }

    later(() => {
      typeText(shareTyped, teamName, 58, () => {
        later(() => {
          if (shareTyped) shareTyped.textContent = "";
          if (shareChip) shareChip.hidden = false;
          if (shareField) shareField.classList.add("is-filled");
          if (shareSubmit) shareSubmit.classList.add("is-glowing");
        }, 420);
      });
    }, 900);

    later(() => {
      tap(shareSubmit, () => {
        closeOverlay();
        later(() => {
          if (sharedBadge) sharedBadge.hidden = false;
          revealEl(toast);
          scrollRun();
        }, 420);
      });
    }, 4600);

    later(playDescribe, holds.share);
  }

  function start() {
    reset();
    running = true;
    root.dataset.phase = "app";
    playDescribe();
  }

  function jumpTo(key) {
    running = true;
    clearTimers();
    if (key === "describe") {
      playDescribe();
      return;
    }
    if (key === "run") {
      playRun();
      return;
    }
    if (key === "save") {
      playSave();
      return;
    }
    playShare();
  }

  if (sendButton) {
    sendButton.addEventListener("click", () => {
      if (!running) {
        running = true;
        playDescribe();
        return;
      }
      if (phase !== "describe") return;
      clearTimers();
      tap(sendButton, goRun);
    });
  }

  if (saveButton) {
    saveButton.addEventListener("click", () => {
      if (phase === "save" || phase === "share") return;
      running = true;
      clearTimers();
      tap(saveButton, goSave);
    });
  }

  if (confirmSave) {
    confirmSave.addEventListener("click", () => {
      if (phase !== "save") return;
      clearTimers();
      tap(confirmSave, () => setModalPanel("saved", true));
      later(() => {
        if (openShareButton) openShareButton.classList.add("is-glowing");
      }, 900);
    });
  }

  if (openShareButton) {
    openShareButton.addEventListener("click", () => {
      if (phase !== "save") return;
      clearTimers();
      tap(openShareButton, goShare);
    });
  }

  if (shareSubmit) {
    shareSubmit.addEventListener("click", () => {
      if (phase !== "share") return;
      clearTimers();
      tap(shareSubmit, () => {
        closeOverlay();
        later(() => {
          if (sharedBadge) sharedBadge.hidden = false;
          revealEl(toast);
        }, 420);
      });
      later(playDescribe, 4200);
    });
  }

  scenes.forEach(scene => {
    scene.addEventListener("click", () => {
      const key = scene.dataset.skillsScene;
      if (!key || key === phase) return;
      jumpTo(key);
    });
  });

  return { start, reset };
}

function initAgentsChatDemo() {
  const root = document.querySelector("[data-chat-demo]");
  if (!root) return null;

  const caption = root.querySelector("[data-chat-caption]");
  const promptStage = root.querySelector('[data-chat-stage="prompt"]');
  const conversationStage = root.querySelector('[data-chat-stage="conversation"]');
  const welcomeShell = root.querySelector("[data-chat-welcome]");
  const composer = root.querySelector("[data-chat-composer]");
  const send = root.querySelector("[data-chat-send]");
  const panel = root.querySelector("[data-chat-panel]");
  const thread = root.querySelector("[data-chat-thread]");
  const site = root.querySelector("[data-chat-site]");
  const lines = [...root.querySelectorAll("[data-chat-line]")];
  const chipGroups = [...root.querySelectorAll("[data-chat-chips]")];
  const sitePanels = [...root.querySelectorAll("[data-site-panel]")];
  const nameInput = root.querySelector('[data-site-input="name"]');
  const emailInput = root.querySelector('[data-site-input="email"]');
  const submitButton = root.querySelector("[data-site-submit]");
  const scenes = [...root.querySelectorAll("[data-chat-scene]")];

  const order = ["prompt", "chat", "microsite", "booking", "confirmed"];
  const captions = {
    prompt: "Meet buyers the moment they show intent",
    chat: "Qualify intent with a guided conversation",
    microsite: "Generate a personalized page for every buyer",
    booking: "Turn the right plan into a booked demo",
    confirmed: "Hand sales a confirmed, qualified meeting"
  };
  const holds = { prompt: 5000, chat: 12600, microsite: 5600, booking: 4600, confirmed: 7000 };
  const fills = {};
  order.forEach(key => {
    fills[key] = root.querySelector(`[data-chat-progress="${key}"]`);
  });

  const visitorName = "Daniel Reyes";
  const visitorEmail = "daniel@northwindfreight.com";
  const stageExit = 620;
  let timeouts = [];
  let running = false;
  let userPaused = false;
  let phase = "prompt";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function later(fn, ms) {
    const id = window.setTimeout(fn, ms);
    timeouts.push(id);
    return id;
  }

  function clearTimers() {
    timeouts.forEach(id => window.clearTimeout(id));
    timeouts = [];
  }

  function setFill(key, mode, duration) {
    const fill = fills[key];
    if (!fill) return;
    fill.style.transition = "none";
    if (mode === "reset") {
      fill.style.transform = "scaleX(0)";
      return;
    }
    if (mode === "full") {
      fill.style.transform = "scaleX(1)";
      return;
    }
    fill.style.transform = "scaleX(0)";
    void fill.offsetWidth;
    if (prefersReducedMotion()) {
      fill.style.transform = "scaleX(1)";
      return;
    }
    fill.style.transition = `transform ${duration}ms linear`;
    fill.style.transform = "scaleX(1)";
  }

  function setPhase(key) {
    phase = key;
    if (caption) caption.textContent = captions[key];
    scenes.forEach(scene => {
      const on = scene.dataset.chatScene === key;
      scene.classList.toggle("is-active", on);
      scene.setAttribute("aria-current", on ? "true" : "false");
    });
    const active = order.indexOf(key);
    order.forEach((step, index) => {
      if (index < active) setFill(step, "full");
      else if (index === active) setFill(step, "play", prefersReducedMotion() ? 700 : holds[step]);
      else setFill(step, "reset");
    });
  }

  function showStage(key) {
    if (promptStage) {
      promptStage.hidden = key !== "prompt";
      promptStage.classList.toggle("is-active", key === "prompt");
      promptStage.classList.remove("is-exiting");
    }
    if (conversationStage) {
      conversationStage.hidden = key === "prompt";
      conversationStage.classList.toggle("is-active", key !== "prompt");
      conversationStage.classList.remove("is-exiting");
    }
  }

  function revealEl(el) {
    if (!el) return;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add("is-in");
  }

  function groupOf(name) {
    return chipGroups.find(group => group.dataset.chatChips === name) || null;
  }

  function chipOf(name) {
    return root.querySelector(`[data-chat-chip="${name}"]`);
  }

  /* A visible press state so the viewer registers that a button was clicked. */
  function tap(el, done) {
    if (!el) {
      if (done) done();
      return;
    }
    if (prefersReducedMotion()) {
      el.classList.add("is-chosen");
      if (done) done();
      return;
    }
    el.classList.add("is-tapped");
    later(() => {
      el.classList.remove("is-tapped");
      el.classList.add("is-chosen");
      if (done) done();
    }, 520);
  }

  function scrollThread() {
    if (!thread) return;
    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
  }

  function revealLine(id) {
    const line = lines.find(item => item.dataset.chatLine === id);
    if (!line) return;
    line.hidden = false;
    void line.offsetWidth;
    line.classList.add("is-in");
    scrollThread();
  }

  function setSitePanel(key) {
    sitePanels.forEach(item => {
      const on = item.dataset.sitePanel === key;
      item.hidden = !on;
      item.classList.remove("is-active");
      if (on) {
        void item.offsetWidth;
        item.classList.add("is-active");
      }
    });
  }

  function openSite(panelKey) {
    if (panel) panel.classList.add("is-split");
    if (site) {
      site.hidden = false;
      void site.offsetWidth;
      site.classList.add("is-in");
    }
    setSitePanel(panelKey);
  }

  function typeValue(el, text, speed, done) {
    if (!el) {
      if (done) done();
      return;
    }
    el.value = "";
    el.classList.add("is-typing");
    if (prefersReducedMotion()) {
      el.value = text;
      el.classList.remove("is-typing");
      if (done) done();
      return;
    }
    let index = 0;
    function tick() {
      index += 1;
      el.value = text.slice(0, index);
      if (index < text.length) {
        later(tick, speed);
        return;
      }
      el.classList.remove("is-typing");
      if (done) done();
    }
    tick();
  }

  function resetPrompt() {
    if (welcomeShell) {
      welcomeShell.hidden = true;
      welcomeShell.classList.remove("is-in");
    }
    if (composer) {
      composer.hidden = true;
      composer.classList.remove("is-in");
    }
    if (send) send.classList.remove("is-pressed");
  }

  function resetThread() {
    lines.forEach(line => {
      line.classList.remove("is-in");
      line.hidden = true;
    });
    chipGroups.forEach(group => {
      group.hidden = true;
      group.classList.remove("is-in", "is-used");
      [...group.children].forEach(chip => chip.classList.remove("is-tapped", "is-chosen"));
    });
    if (thread) thread.scrollTop = 0;
  }

  function resetSite() {
    if (panel) panel.classList.remove("is-split");
    if (site) {
      site.hidden = true;
      site.classList.remove("is-in");
    }
    sitePanels.forEach(item => {
      item.hidden = item.dataset.sitePanel !== "pricing";
      item.classList.toggle("is-active", item.dataset.sitePanel === "pricing");
    });
    if (nameInput) {
      nameInput.value = "";
      nameInput.classList.remove("is-typing");
    }
    if (emailInput) {
      emailInput.value = "";
      emailInput.classList.remove("is-typing");
    }
    if (submitButton) submitButton.classList.remove("is-tapped", "is-chosen");
  }

  function reset() {
    running = false;
    userPaused = false;
    clearTimers();
    resetPrompt();
    resetThread();
    resetSite();
    showStage("prompt");
    setPhase("prompt");
    order.forEach(step => setFill(step, "reset"));
  }

  /* Step 1 — the composer arrives first, then Kate opens with a suggestion. */
  function playPrompt() {
    clearTimers();
    resetPrompt();
    resetThread();
    resetSite();
    showStage("prompt");
    setPhase("prompt");

    if (prefersReducedMotion()) {
      revealEl(composer);
      revealEl(welcomeShell);
      revealEl(groupOf("welcome"));
      later(goChat, 900);
      return;
    }

    later(() => revealEl(composer), 260);
    later(() => revealEl(welcomeShell), 1250);
    later(() => revealEl(groupOf("welcome")), 2350);
    later(() => {
      tap(chipOf("show-me"), goChat);
    }, holds.prompt - 600);
  }

  function goChat() {
    if (!running) return;
    setFill("prompt", "full");
    if (prefersReducedMotion() || !promptStage) {
      playChat();
      return;
    }
    promptStage.classList.add("is-exiting");
    later(() => {
      if (!running) return;
      playChat();
    }, stageExit);
  }

  /* Step 2 — the chat window opens and the guided qualification plays out. */
  function playChat() {
    resetThread();
    resetSite();
    showStage("conversation");
    setPhase("chat");

    if (prefersReducedMotion()) {
      fillThread();
      later(goMicrosite, 1400);
      return;
    }

    later(() => revealLine("u1"), 420);
    later(() => revealLine("k1"), 1750);
    later(() => {
      revealEl(groupOf("seats"));
      scrollThread();
    }, 3250);
    later(() => {
      tap(chipOf("seats-4"), () => {
        const seats = groupOf("seats");
        if (seats) {
          seats.classList.add("is-used");
          later(() => {
            seats.hidden = true;
          }, 420);
        }
        later(() => revealLine("u2"), 380);
      });
    }, 4900);
    later(() => revealLine("k2"), 7100);
    later(() => revealLine("k3"), 8900);
    later(() => {
      revealEl(groupOf("cta"));
      scrollThread();
    }, 10300);
    later(goMicrosite, holds.chat);
  }

  function fillThread() {
    lines.forEach(line => {
      line.hidden = false;
      line.classList.add("is-in");
    });
    const seats = groupOf("seats");
    if (seats) seats.hidden = true;
    const cta = groupOf("cta");
    if (cta) {
      cta.hidden = false;
      cta.classList.add("is-in");
    }
    scrollThread();
  }

  /* Step 3 — the panel splits and a microsite is generated beside the chat. */
  function goMicrosite() {
    if (!running || phase === "microsite") return;
    playMicrosite();
  }

  function playMicrosite() {
    showStage("conversation");
    fillThread();
    setPhase("microsite");
    openSite("pricing");
    /* The window resizes while the split opens, so settle the scroll after it. */
    later(scrollThread, 820);
    later(goBooking, holds.microsite);
  }

  /* Step 4 — tapping "Book a demo" swaps the microsite for a booking page. */
  function goBooking() {
    if (!running) return;
    playBooking();
  }

  function playBooking() {
    showStage("conversation");
    fillThread();
    setPhase("booking");
    if (panel) panel.classList.add("is-split");
    if (site) {
      site.hidden = false;
      site.classList.add("is-in");
    }
    later(scrollThread, 60);
    later(() => tap(chipOf("book"), () => setSitePanel("booking")), 420);
    later(goConfirmed, holds.booking);
  }

  /* Step 5 — the form fills itself, submits, and the booking is confirmed. */
  function goConfirmed() {
    if (!running) return;
    playConfirmed();
  }

  function playConfirmed() {
    showStage("conversation");
    fillThread();
    setPhase("confirmed");
    if (panel) panel.classList.add("is-split");
    if (site) {
      site.hidden = false;
      site.classList.add("is-in");
    }
    const bookChip = chipOf("book");
    if (bookChip) bookChip.classList.add("is-chosen");
    setSitePanel("booking");
    later(scrollThread, 60);

    if (prefersReducedMotion()) {
      if (nameInput) nameInput.value = visitorName;
      if (emailInput) emailInput.value = visitorEmail;
      setSitePanel("confirmed");
      later(playPrompt, 1600);
      return;
    }

    later(() => {
      typeValue(nameInput, visitorName, 46, () => {
        later(() => {
          typeValue(emailInput, visitorEmail, 32, () => {
            later(() => tap(submitButton, () => setSitePanel("confirmed")), 420);
          });
        }, 260);
      });
    }, 500);

    later(playPrompt, holds.confirmed);
  }

  function start() {
    reset();
    running = true;
    playPrompt();
  }

  function jumpTo(key) {
    userPaused = false;
    running = true;
    clearTimers();
    if (key === "prompt") {
      playPrompt();
      return;
    }
    if (key === "chat") {
      playChat();
      return;
    }
    resetSite();
    if (key === "microsite") {
      playMicrosite();
      return;
    }
    if (key === "booking") {
      playBooking();
      return;
    }
    playConfirmed();
  }

  if (send) {
    send.addEventListener("click", () => {
      if (!running) {
        running = true;
        playPrompt();
        return;
      }
      if (phase === "prompt") {
        clearTimers();
        tap(chipOf("show-me"), goChat);
      }
    });
  }

  const welcomeChips = [...root.querySelectorAll('[data-chat-chips="welcome"] [data-chat-chip]')];
  welcomeChips.forEach(chip => {
    chip.addEventListener("click", () => {
      if (phase !== "prompt") return;
      clearTimers();
      tap(chip, goChat);
    });
  });

  scenes.forEach(scene => {
    scene.addEventListener("click", () => {
      const key = scene.dataset.chatScene;
      if (!key || key === phase) return;
      jumpTo(key);
    });
  });

  return { start, reset };
}

function initAgentsTabs() {
  const section = document.querySelector(".agents-section");
  if (!section) return;

  const tabs = [...section.querySelectorAll("[data-agent-tab]")];
  const panes = [...section.querySelectorAll("[data-agent-pane]")];
  const visualFrames = [...section.querySelectorAll("[data-agent-visual]")];
  if (!tabs.length || !panes.length) return;

  let activeTab = tabs.find(tab => tab.getAttribute("aria-selected") === "true") || tabs[0];
  let transitionTimer;
  let entranceTimer;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function visualKeyFor(tabKey) {
    if (tabKey === "support") return "voice";
    if (tabKey === "workspace") return "skills";
    return "chat";
  }

  function currentVisualFrame() {
    return visualFrames.find(frame => !frame.hidden) || visualFrames[0];
  }

  function frameFor(key) {
    return visualFrames.find(frame => frame.dataset.agentVisual === key);
  }

  function setActiveTab(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.tabIndex = selected ? 0 : -1;
    });
    activeTab = tab;
  }

  function clearVisualFrameMotion() {
    visualFrames.forEach(frame => frame.classList.remove("is-fading-out", "is-entering"));
  }

  function setActiveVisual(key, animate) {
    const nextFrame = frameFor(key);
    if (!nextFrame) return;

    visualFrames.forEach(frame => {
      const on = frame === nextFrame;
      frame.hidden = !on;
      frame.classList.toggle("is-active", on);
      frame.classList.remove("is-fading-out");
    });

    if (key === "voice") agentsVoiceDemo && agentsVoiceDemo.startIntro();
    else if (agentsVoiceDemo) agentsVoiceDemo.reset();

    if (key === "skills") agentsSkillsDemo && agentsSkillsDemo.start();
    else if (agentsSkillsDemo) agentsSkillsDemo.reset();

    if (key === "chat") agentsChatDemo && agentsChatDemo.start();
    else if (agentsChatDemo) agentsChatDemo.reset();

    if (!animate || prefersReducedMotion()) {
      clearVisualFrameMotion();
      return;
    }

    nextFrame.classList.remove("is-entering");
    void nextFrame.offsetWidth;
    nextFrame.classList.add("is-entering");
  }

  function activatePane(pane, animate) {
    panes.forEach(item => {
      const on = item === pane;
      item.classList.toggle("is-active", on);
      item.classList.remove("is-fading-out");
      item.toggleAttribute("inert", !on);
      item.setAttribute("aria-hidden", on ? "false" : "true");
    });

    const visualKey = visualKeyFor(pane.dataset.agentPane);
    setActiveVisual(visualKey, animate);

    if (!animate || prefersReducedMotion()) {
      pane.classList.remove("is-entering");
      return;
    }

    pane.classList.remove("is-entering");
    void pane.offsetWidth;
    pane.classList.add("is-entering");
    window.clearTimeout(entranceTimer);
    entranceTimer = window.setTimeout(() => {
      pane.classList.remove("is-entering");
      clearVisualFrameMotion();
    }, 620);
  }

  function showTab(tab) {
    if (tab === activeTab) return;

    const nextPane = panes.find(pane => pane.dataset.agentPane === tab.dataset.agentTab);
    const currentPane = panes.find(pane => pane.classList.contains("is-active"));
    if (!nextPane) return;

    setActiveTab(tab);
    window.clearTimeout(transitionTimer);
    window.clearTimeout(entranceTimer);

    if (!currentPane || prefersReducedMotion()) {
      if (currentPane) currentPane.classList.remove("is-fading-out", "is-entering");
      clearVisualFrameMotion();
      activatePane(nextPane, false);
      return;
    }

    const currentFrame = currentVisualFrame();
    currentPane.classList.remove("is-entering");
    currentPane.classList.add("is-fading-out");
    if (currentFrame) {
      currentFrame.classList.remove("is-entering");
      currentFrame.classList.add("is-fading-out");
    }

    transitionTimer = window.setTimeout(() => {
      currentPane.classList.remove("is-fading-out");
      if (currentFrame) currentFrame.classList.remove("is-fading-out");
      activatePane(nextPane, true);
    }, 160);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showTab(tab));
    tab.addEventListener("keydown", event => {
      const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";
      const isPrev = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!isNext && !isPrev && event.key !== "Home" && event.key !== "End") return;

      event.preventDefault();
      let nextIndex = index;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else if (isNext) nextIndex = (index + 1) % tabs.length;
      else nextIndex = (index - 1 + tabs.length) % tabs.length;

      tabs[nextIndex].focus();
      showTab(tabs[nextIndex]);
    });
  });
}

function initDeploymentProcess(root) {
  if (!root) return () => {};
  const teams = [...root.querySelectorAll("[data-deployment-team]")];
  const status = root.querySelector("[data-deployment-status]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Both lanes share one clock: tasks have different lengths, but finish together.
  const deploymentDuration = 22400;
  const holdDuration = 5000;
  const lanes = teams.map(team => ({
    team,
    rows: [...team.querySelectorAll("[data-deployment-step]")],
    completed: -1
  }));
  const rings = [...teams.map(team => team.querySelector(".deployment-ring")), root.querySelector("[data-deployment-total]")]
    .map(ring => ({ ring, label: ring.querySelector("span") }));
  const expertiseTeam = root.querySelector('[data-deployment-step="map"]').closest("[data-deployment-team]");
  const yourTeam = root.querySelector('[data-deployment-step="rules"]').closest("[data-deployment-team]");
  let elapsed = reducedMotion.matches ? deploymentDuration : 0;
  let inView = false;
  let frame = null;
  let previousTime = null;
  let lastPaint = -Infinity;
  let frontTeam = null;

  const render = () => {
    const progress = Math.min(elapsed / deploymentDuration, 1);
    lanes.forEach(lane => {
      const units = progress * lane.rows.length;
      const done = Math.floor(units);
      if (done !== lane.completed) {
        lane.rows.forEach((row, index) => {
          row.classList.toggle("is-done", index < done);
          row.classList.toggle("is-working", index === done);
        });
        lane.completed = done;
      }
      // Each lane advances even when its card is behind the other one.
      if (done < lane.rows.length) {
        lane.rows[done].style.setProperty("--task-progress", (units - done).toFixed(3));
      }
    });
    rings.forEach(({ ring, label }) => {
      ring.style.setProperty("--progress", (progress * 100).toFixed(2) + "%");
      const text = Math.floor(progress * 100) + "%";
      if (label.textContent !== text) label.textContent = text;
    });
    // Presentation is independent of work: only two swaps during the whole run.
    const nextTeam = progress >= 1 / 3 && progress < 2 / 3 ? yourTeam : expertiseTeam;
    if (nextTeam !== frontTeam) {
      teams.forEach(team => {
        team.classList.toggle("is-front", team === nextTeam);
        team.classList.toggle("is-arriving", frontTeam !== null && team === nextTeam);
        team.classList.toggle("is-retreating", frontTeam !== null && team !== nextTeam);
      });
      frontTeam = nextTeam;
    }
    const complete = progress === 1;
    const text = complete ? "IN PRODUCTION" : "Deployment in progress";
    if (status.textContent !== text) status.textContent = text;
    root.classList.toggle("is-complete", complete);
  };
  const animate = (now) => {
    frame = null;
    if (previousTime !== null) elapsed += now - previousTime;
    previousTime = now;
    if (elapsed >= deploymentDuration + holdDuration) elapsed = 0;
    if (now - lastPaint >= 32) {
      // Three small rings at ~30fps; no layout reads or per-frame DOM queries.
      render();
      lastPaint = now;
    }
    frame = requestAnimationFrame(animate);
  };
  const sync = () => {
    const running = root.classList.contains("is-active") && inView && !document.hidden && !reducedMotion.matches;
    root.classList.toggle("is-running", running);
    if (!running) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
    } else if (frame === null) {
      previousTime = null;
      frame = requestAnimationFrame(animate);
    }
  };
  render();
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { threshold: 0.1 });
    observer.observe(root.parentElement);
  } else {
    inView = true;
  }
  document.addEventListener("visibilitychange", sync);
  reducedMotion.addEventListener("change", () => {
    elapsed = reducedMotion.matches ? deploymentDuration : 0;
    previousTime = null;
    render();
    sync();
  });
  return sync;
}

function initUsageProcess(root) {
  if (!root) return () => {};
  const count = root.querySelector("[data-usage-count]");
  const history = root.querySelector("[data-usage-history]");
  const historyCount = root.querySelector("[data-usage-history-count]");
  const historyRows = [...history.children];
  const timestamps = new Map(historyRows.map((row, i) => [row, -[0, 5, 12, 18, 24][i] * 60000]));
  const timeLabels = new Map(historyRows.map(row => [row, row.querySelector("time")]));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const examples = [
    ["Product questions", "Sales · Answered"],
    ["Order status", "Support · Resolved"],
    ["Demo request", "Sales · Meeting booked"],
    ["Account access", "Support · Resolved"],
    ["Plan comparison", "Sales · Answered"],
    ["Delivery update", "Support · Resolved"]
  ];
  const formatter = new Intl.NumberFormat("en-US");
  let elapsed = 0;
  let previousTime = null;
  let lastPaint = -Infinity;
  let nextEntry = 2000;
  let entryIndex = 0;
  let frame = null;
  let inView = false;
  const paint = () => {
    const seconds = elapsed / 1000;
    const value = 284650 + seconds * 24;
    const tokenText = formatter.format(Math.floor(value));
    if (count.textContent !== tokenText) count.textContent = tokenText;
    historyRows.forEach(row => {
      const age = Math.max(0, Math.floor((elapsed - timestamps.get(row)) / 1000));
      const minutes = Math.floor(age / 60);
      const hours = Math.floor(minutes / 60);
      const text = hours > 0 ? hours + (hours === 1 ? " hr ago" : " hrs ago")
        : minutes > 0 ? minutes + (minutes === 1 ? " min ago" : " mins ago")
        : "Just now";
      const label = timeLabels.get(row);
      if (label.textContent !== text) label.textContent = text;
    });
  };
  const addEntry = () => {
    // Recycle a fixed pool; the illustrated feed never grows the DOM.
    const row = history.lastElementChild;
    const [title, detail] = examples[entryIndex++ % examples.length];
    row.querySelector("strong").textContent = title;
    row.querySelector(".usage-history-detail").textContent = detail;
    timestamps.set(row, elapsed);
    timeLabels.get(row).textContent = "Just now";
    historyCount.textContent = formatter.format(1284 + entryIndex);
    history.prepend(row);
    // Compressed illustrative history: irregular minute gaps, newest stays live.
    let minutesAgo = 0;
    [...history.children].forEach((entry, index) => {
      if (index > 0) minutesAgo += 2 + Math.floor(Math.random() * 7);
      timestamps.set(entry, elapsed - minutesAgo * 60000);
    });
    paint();
    history.classList.add("is-updating");
  };
  history.addEventListener("animationend", () => history.classList.remove("is-updating"));
  const animate = (now) => {
    frame = null;
    if (previousTime !== null) elapsed += now - previousTime;
    previousTime = now;
    if (now - lastPaint >= 32) {
      paint();
      lastPaint = now;
    }
    if (elapsed >= nextEntry) {
      addEntry();
      nextEntry = elapsed + 2000;
    }
    frame = requestAnimationFrame(animate);
  };
  const sync = () => {
    const running = root.classList.contains("is-active") && inView && !document.hidden && !reducedMotion.matches;
    root.classList.toggle("is-running", running);
    if (!running) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
    } else if (frame === null) {
      previousTime = null;
      frame = requestAnimationFrame(animate);
    }
  };
  paint();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { threshold: .1 }).observe(root.parentElement);
  } else {
    inView = true;
  }
  document.addEventListener("visibilitychange", sync);
  reducedMotion.addEventListener("change", () => { paint(); sync(); });
  return sync;
}

function initDeploymentAltUsage() {
  const card = document.querySelector(".deployment-alt-card--usage");
  const count = card?.querySelector("[data-alt-usage-count]");
  if (!card || !count) return;
  const initial = 284650;
  const formatter = new Intl.NumberFormat("en-US");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = null;
  let startedAt = null;

  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    startedAt = null;
    count.textContent = formatter.format(initial);
  };
  const tick = now => {
    if (document.hidden || reducedMotion.matches || !card.matches(":hover")) {
      stop();
      return;
    }
    if (startedAt === null) startedAt = now;
    count.textContent = formatter.format(initial + Math.floor((now - startedAt) * .09));
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    if (frame === null && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(tick);
  };
  card.addEventListener("mouseenter", start);
  card.addEventListener("mouseleave", stop);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) stop(); });
}

function initDeploymentAltDropdowns() {
  const dropdowns = [...document.querySelectorAll(".deployment-alt-card--private [data-alt-dropdown]")];
  if (!dropdowns.length) return;

  const close = (dropdown, returnFocus = false) => {
    const trigger = dropdown.querySelector("[data-alt-dropdown-trigger]");
    const menu = dropdown.querySelector("[data-alt-dropdown-menu]");
    dropdown.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    if (returnFocus) trigger.focus();
  };
  const open = dropdown => {
    dropdowns.forEach(other => { if (other !== dropdown) close(other); });
    const trigger = dropdown.querySelector("[data-alt-dropdown-trigger]");
    const menu = dropdown.querySelector("[data-alt-dropdown-menu]");
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    dropdown.classList.add("is-open");
  };

  dropdowns.forEach(dropdown => {
    const trigger = dropdown.querySelector("[data-alt-dropdown-trigger]");
    const menu = dropdown.querySelector("[data-alt-dropdown-menu]");
    const value = dropdown.querySelector("[data-alt-dropdown-value]");
    const options = [...dropdown.querySelectorAll("[data-alt-dropdown-option]")];

    trigger.addEventListener("click", () => {
      if (dropdown.classList.contains("is-open")) close(dropdown);
      else open(dropdown);
    });
    trigger.addEventListener("keydown", event => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      open(dropdown);
      options[0]?.focus();
    });
    menu.addEventListener("keydown", event => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = options.indexOf(document.activeElement);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      options[(index + direction + options.length) % options.length]?.focus();
    });
    options.forEach(option => option.addEventListener("click", () => {
      value.textContent = option.textContent.trim();
      options.forEach(item => item.setAttribute("aria-pressed", item === option ? "true" : "false"));
      close(dropdown, true);
    }));
  });

  document.addEventListener("pointerdown", event => {
    if (dropdowns.some(dropdown => dropdown.contains(event.target))) return;
    dropdowns.forEach(dropdown => { if (dropdown.classList.contains("is-open")) close(dropdown); });
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const active = dropdowns.find(dropdown => dropdown.classList.contains("is-open"));
    if (active) close(active, true);
  });
}

function initPlatformRotation(section, items, activate) {
  const controls = section.querySelector(".platform-rotation");
  if (!controls) return () => {};
  const tracks = [...controls.querySelectorAll("[data-rotation-step]")];
  const configurator = section.querySelector(".private-process");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const durations = { usage: 10000, forward: 26000, private: 10000 };
  let paused = motion.matches;
  let inView = false;
  let interacting = false;
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let lastPaint = -Infinity;
  const activeIndex = () => Math.max(0, items.findIndex(item => item.classList.contains("is-open")));
  const paint = () => {
    const index = activeIndex();
    const key = items[index].getAttribute("data-platform-item");
    tracks.forEach((track, i) => {
      track.style.setProperty("--rotation-progress",
        i < index ? "1" : i === index ? String(Math.min(elapsed / durations[key], 1)) : "0");
      track.setAttribute("aria-selected", i === index ? "true" : "false");
      track.tabIndex = i === index ? 0 : -1;
    });
  };
  const animate = now => {
    frame = null;
    if (previousTime !== null) elapsed += now - previousTime;
    previousTime = now;
    const index = activeIndex();
    const duration = durations[items[index].getAttribute("data-platform-item")];
    if (elapsed >= duration) activate(items[(index + 1) % items.length]);
    if (now - lastPaint >= 32) { paint(); lastPaint = now; }
    frame = requestAnimationFrame(animate);
  };
  const sync = () => {
    const focused = configurator && configurator.contains(document.activeElement);
    const running = inView && !paused && !interacting && !focused && !document.hidden;
    if (!running) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
    } else if (frame === null) {
      previousTime = null;
      frame = requestAnimationFrame(animate);
    }
  };
  const reset = () => { elapsed = 0; previousTime = null; paint(); };

  tracks.forEach((track) => {
    track.addEventListener("click", () => {
      const key = track.getAttribute("data-rotation-step");
      const item = items.find((entry) => entry.getAttribute("data-platform-item") === key);
      if (item) activate(item);
    });
    track.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const index = activeIndex();
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % items.length;
      if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      activate(items[next]);
      const nextTrack = tracks.find((entry) => entry.getAttribute("data-rotation-step") === items[next].getAttribute("data-platform-item"));
      if (nextTrack) nextTrack.focus();
    });
  });

  if (configurator) {
    configurator.addEventListener("pointerenter", () => { interacting = true; sync(); });
    configurator.addEventListener("pointerleave", () => { interacting = false; sync(); });
    configurator.addEventListener("focusin", sync);
    configurator.addEventListener("focusout", () => queueMicrotask(sync));
    configurator.addEventListener("change", reset);
  }
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", () => { paused = motion.matches; sync(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { threshold: .25 }).observe(section.querySelector(".platform-visual"));
  } else { inView = true; }
  paint();
  sync();
  return reset;
}

function initPlatformAccordion() {
  const roots = [...document.querySelectorAll("[data-platform-accordion]")];

  roots.forEach((root) => {
    const section = root.closest(".platform-section") || root;
    const items = [...root.querySelectorAll(".platform-item, .platform-card")];
    const images = [...section.querySelectorAll("[data-platform-image]")];
    const processes = images.filter((node) =>
      node.matches(".usage-process, .deployment-process, .private-process")
    );
    const syncDeployment = initDeploymentProcess(section.querySelector(".deployment-process"));
    const syncUsage = initUsageProcess(section.querySelector(".usage-process"));
    if (!items.length) return;
    let resetRotation = () => {};
    let entranceTimer;

    const playProcessEntrance = (process) => {
      if (!process || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      window.clearTimeout(entranceTimer);
      processes.forEach((node) => node.classList.remove("is-entering"));
      void process.offsetWidth;
      process.classList.add("is-entering");
      entranceTimer = window.setTimeout(() => {
        process.classList.remove("is-entering");
      }, 1100);
    };

    const activate = (item) => {
      resetRotation();
      if (!item || item.classList.contains("is-open")) return;
      const key = item.getAttribute("data-platform-item");

      items.forEach((entry) => {
        const open = entry === item;
        entry.classList.toggle("is-open", open);
        if (entry.matches(".platform-card")) {
          entry.setAttribute("aria-pressed", open ? "true" : "false");
        }
        const trigger = entry.querySelector(".platform-item-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");
      });

      images.forEach((img) => {
        img.classList.toggle("is-active", img.getAttribute("data-platform-image") === key);
        if (img.classList.contains("private-process")) {
          img.toggleAttribute("inert", key !== "private");
          img.setAttribute("aria-hidden", key === "private" ? "false" : "true");
        }
      });
      syncDeployment();
      syncUsage();
      playProcessEntrance(processes.find((node) => node.getAttribute("data-platform-image") === key));
      resetRotation();
    };

    items.forEach((item) => {
      if (item.matches(".platform-card")) {
        item.addEventListener("click", () => activate(item));
        return;
      }
      const trigger = item.querySelector(".platform-item-trigger");
      if (trigger) {
        trigger.addEventListener("click", () => activate(item));
      }
    });
    syncDeployment();
    syncUsage();
    resetRotation = initPlatformRotation(section, items, activate);

    const visual = section.querySelector(".platform-visual");
    if (visual && processes.length && "IntersectionObserver" in window) {
      const entranceObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const current = processes.find((node) => node.classList.contains("is-active"));
        playProcessEntrance(current);
        entranceObserver.disconnect();
      }, { threshold: 0.25 });
      entranceObserver.observe(visual);
    }
  });
}

function initAgentsV2Tabs() {
  const section = document.querySelector(".agents-section--v2");
  if (!section) return;

  const tabs = [...section.querySelectorAll("[data-agent-v2-tab]")];
  const panes = [...section.querySelectorAll("[data-agent-v2-pane]")];
  const visualFrames = [...section.querySelectorAll("[data-agent-v2-visual]")];
  if (!tabs.length || !panes.length) return;

  let activeTab = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];
  let entranceTimer;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function visualKeyFor(tabKey) {
    if (tabKey === "support") return "voice";
    if (tabKey === "workspace") return "skills";
    return "chat";
  }

  function setActiveVisual(key, animate) {
    const nextFrame = visualFrames.find((frame) => frame.dataset.agentV2Visual === key);
    if (!nextFrame) return;

    visualFrames.forEach((frame) => {
      const active = frame === nextFrame;
      frame.hidden = !active;
      frame.classList.toggle("is-active", active);
      frame.classList.remove("is-entering");
    });

    if (key === "voice") agentsVoiceDemo && agentsVoiceDemo.startIntro();
    else if (agentsVoiceDemo) agentsVoiceDemo.reset();
    if (key === "skills") agentsSkillsDemo && agentsSkillsDemo.start();
    else if (agentsSkillsDemo) agentsSkillsDemo.reset();
    if (key === "chat") agentsChatDemo && agentsChatDemo.start();
    else if (agentsChatDemo) agentsChatDemo.reset();

    if (animate && !prefersReducedMotion()) {
      void nextFrame.offsetWidth;
      nextFrame.classList.add("is-entering");
    }
  }

  function activatePane(pane, animate) {
    panes.forEach((item) => {
      const on = item === pane;
      item.classList.toggle("is-active", on);
      item.toggleAttribute("inert", !on);
      item.setAttribute("aria-hidden", on ? "false" : "true");
      item.classList.remove("is-entering");
    });

    if (!animate || prefersReducedMotion()) return;
    void pane.offsetWidth;
    pane.classList.add("is-entering");
    window.clearTimeout(entranceTimer);
    entranceTimer = window.setTimeout(() => pane.classList.remove("is-entering"), 500);
  }

  function showTab(tab) {
    if (tab === activeTab) return;
    const nextPane = panes.find((pane) => pane.dataset.agentV2Pane === tab.dataset.agentV2Tab);
    if (!nextPane) return;

    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.tabIndex = selected ? 0 : -1;
    });
    activeTab = tab;
    activatePane(nextPane, true);
    setActiveVisual(visualKeyFor(tab.dataset.agentV2Tab), true);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const index = tabs.indexOf(activeTab);
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      showTab(tabs[next]);
      tabs[next].focus();
    });
  });

  // Mobile: opaque rail background only while the tabs are stuck under the navbar.
  const rail = section.querySelector(".agents-v2-tabs-rail");
  const stage = section.querySelector(".agents-v2-stage");
  if (rail && stage) {
    const stickyMq = window.matchMedia("(max-width: 600px)");
    let sentinel = stage.querySelector(".agents-v2-tabs-sentinel");
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.className = "agents-v2-tabs-sentinel";
      sentinel.setAttribute("aria-hidden", "true");
      stage.insertBefore(sentinel, rail);
    }

    let stickyObserver;
    function navOffset() {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--nav-h");
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 56;
    }

    function syncStickyObserver() {
      if (stickyObserver) {
        stickyObserver.disconnect();
        stickyObserver = undefined;
      }
      rail.classList.remove("is-stuck");
      if (!stickyMq.matches) return;

      stickyObserver = new IntersectionObserver(
        ([entry]) => {
          rail.classList.toggle("is-stuck", stickyMq.matches && !entry.isIntersecting);
        },
        { rootMargin: `-${navOffset()}px 0px 0px 0px`, threshold: 0 }
      );
      stickyObserver.observe(sentinel);
    }

    syncStickyObserver();
    stickyMq.addEventListener("change", syncStickyObserver);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const triangleGrid = document.getElementById("triangle-grid");
  const triangleGridVisible = triangleGrid && getComputedStyle(triangleGrid).display !== "none";
  if (triangleGridVisible) {
    buildGrid();
    updateGridScale();
    window.addEventListener("resize", updateGridScale);
    initScrollTrigger();
  }
  initMobileNav();
  initLogoReveal();
  initStoryIndex();
  initCaseStudiesShowcase();
  initTestimonialControls();
  initClientBentoMarquee();
  initIndustryCardReveals();
  agentsVoiceDemo = initAgentsVoiceDemo();
  agentsSkillsDemo = initAgentsSkillsDemo();
  agentsChatDemo = initAgentsChatDemo();
  initAgentsTabs();
  initAgentsV2Tabs();
  if (agentsChatDemo) agentsChatDemo.start();
  initAgentsCaseSwitchers();
  initHeroGrid();
  initPlatformAccordion();
  initDeploymentAltUsage();
  initDeploymentAltDropdowns();
});
