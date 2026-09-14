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
    panel.querySelector("[data-case-category]").textContent = data.caseCategory;
    panel.querySelector("[data-case-title]").textContent = data.caseTitle;
    panel.querySelector("[data-case-problem]").textContent = data.caseProblem;
    panel.querySelector("[data-case-solution]").textContent = data.caseSolution;
    panel.querySelector("[data-case-company]").textContent = data.caseLogoAlt;
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
  if (!track || !source || track.children.length > 1) return;

  const duplicate = source.cloneNode(true);
  duplicate.setAttribute("aria-hidden", "true");
  duplicate.querySelectorAll("a").forEach(link => { link.tabIndex = -1; });
  duplicate.querySelectorAll("img").forEach(image => { image.alt = ""; });
  track.append(duplicate);
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
  "assets/industry-insurance.png",
  "assets/industry-finance.png",
  "assets/industry-manufacturing.png",
  "assets/industry-retail.png",
  "assets/industry-logistics.png",
  "assets/industry-airlines.png",
  "assets/industry-telecom.png",
  "assets/industry-utilities.png"
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

  // Snap hero-content height to an exact multiple of the cell size so the
  // bottom edge of the grid lands on a full row (no clipped cells).
  // On mobile the grid is a fixed-height band above the copy, so skip.
  function snapContentHeight() {
    const content = grid.closest(".hero-content");
    if (!content) return;

    cellSize = readCellSize();
    content.style.minHeight = "";
    content.style.height = "";

    if (isStackedHeroGrid()) return;

    const natural = content.getBoundingClientRect().height;
    if (!natural) return;

    const snapped = Math.max(cellSize, Math.ceil(natural / cellSize) * cellSize);
    content.style.minHeight = `${snapped}px`;
  }

  function build() {
    snapContentHeight();

    const { width, height } = grid.getBoundingClientRect();
    if (!width || !height) return;

    cellSize = readCellSize();
    cols = Math.ceil(width / cellSize) + 1;
    rows = Math.max(1, Math.round(height / cellSize));
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
    let index = 0;

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
      if (categoryEl) categoryEl.textContent = source.getAttribute("data-case-category") || "";
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
        } else {
          quoteEl.hidden = true;
        }
      }
    }

    function show(nextIndex) {
      index = (nextIndex + stories.length) % stories.length;
      applyCase(stories[index]);

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      card.classList.remove("is-switching");
      void card.offsetWidth;
      card.classList.add("is-switching");
    }

    if (prev) prev.addEventListener("click", () => show(index - 1));
    if (next) next.addEventListener("click", () => show(index + 1));
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
  const form = card.querySelector("[data-voice-panel='form']");
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
  const stackStage = root.querySelector('[data-skills-stage="stack"]');
  const runStage = root.querySelector('[data-skills-stage="run"]');
  const demoButton = root.querySelector("[data-skills-demo-btn]");
  const scenes = [...root.querySelectorAll("[data-skills-scene]")];
  const fills = {
    stack: root.querySelector('[data-skills-progress="stack"]'),
    run: root.querySelector('[data-skills-progress="run"]')
  };
  const steps = [...root.querySelectorAll("[data-skills-step]")];
  const output = root.querySelector("[data-skills-output]");
  const timerEl = root.querySelector("[data-skills-timer]");
  const tools = [...root.querySelectorAll(".agents-skills-run-tools [data-skills-tool]")];
  const captions = {
    stack: "Convert your best employee’s workflow into skills",
    run: "Everyone runs the same workflow"
  };
  const stepGap = 920;
  const spinHold = 420;
  const tickHold = 320;
  const stackHold = 5000;
  const pressHold = 480;
  const stageExit = 720;
  let timeouts = [];
  let timerInterval = 0;
  let elapsed = 0;
  let running = false;
  let userPaused = false;
  let phase = "stack";

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
    if (timerInterval) {
      window.clearInterval(timerInterval);
      timerInterval = 0;
    }
  }

  function setCaption(key) {
    if (caption) caption.textContent = captions[key];
  }

  function runDuration() {
    if (prefersReducedMotion()) return 2800;
    return 620 + steps.length * stepGap + 280 + 4200;
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

  function startProgress(key) {
    if (key === "stack") {
      setFill("stack", "play", prefersReducedMotion() ? 900 : stackHold);
      setFill("run", "reset");
    } else {
      setFill("stack", "full");
      setFill("run", "play", runDuration());
    }
  }

  function syncScenes(key) {
    scenes.forEach(scene => {
      const on = scene.dataset.skillsScene === key;
      scene.classList.toggle("is-active", on);
      scene.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  function showStage(key) {
    phase = key;
    if (stackStage) {
      stackStage.hidden = key !== "stack";
      stackStage.classList.toggle("is-active", key === "stack");
      stackStage.classList.remove("is-exiting");
    }
    if (runStage) {
      runStage.hidden = key !== "run";
      runStage.classList.toggle("is-active", key === "run");
      runStage.classList.remove("is-exiting");
    }
    syncScenes(key);
  }

  function setStepState(step, state) {
    step.classList.toggle("is-on", Boolean(state));
    step.classList.toggle("is-busy", state === "busy");
    step.classList.toggle("is-checked", state === "checked");
    step.classList.toggle("is-done", state === "done");
  }

  function resetRun() {
    elapsed = 0;
    if (timerEl) timerEl.textContent = "Worked for 0s";
    steps.forEach(step => {
      setStepState(step, "");
      const label = step.querySelector("[data-skills-label]");
      if (label && step.dataset.skillsDone) label.textContent = step.dataset.skillsDone;
    });
    tools.forEach(tool => tool.classList.remove("is-live"));
    if (output) output.classList.remove("is-on");
    if (demoButton) demoButton.classList.remove("is-pressed", "is-clicking");
  }

  function reset() {
    running = false;
    userPaused = false;
    clearTimers();
    resetRun();
    setFill("stack", "reset");
    setFill("run", "reset");
    root.removeAttribute("data-phase");
    showStage("stack");
    setCaption("stack");
  }

  function playStack() {
    resetRun();
    showStage("stack");
    setCaption("stack");
    root.removeAttribute("data-phase");
    void root.offsetWidth;
    root.dataset.phase = "stack";
    startProgress("stack");
  }

  function revealStep(step) {
    const label = step.querySelector("[data-skills-label]");
    const pending = step.dataset.skillsPending;
    const done = step.dataset.skillsDone;
    const toolKey = step.dataset.skillsTool;
    const tool = toolKey && root.querySelector(`.agents-skills-run-tools [data-skills-tool="${toolKey}"]`);

    if (prefersReducedMotion()) {
      if (done && label) label.textContent = done;
      setStepState(step, "done");
      if (tool) tool.classList.add("is-live");
      return;
    }

    if (pending && label) label.textContent = pending;
    setStepState(step, "busy");

    later(() => {
      if (done && label) label.textContent = done;
      setStepState(step, "checked");
    }, spinHold);

    later(() => {
      setStepState(step, "done");
      if (tool) tool.classList.add("is-live");
    }, spinHold + tickHold);
  }

  function queueLoop(delay) {
    later(() => {
      if (!running || userPaused) return;
      playStack();
      later(pressInstall, prefersReducedMotion() ? 1400 : stackHold);
    }, delay);
  }

  function playRun() {
    resetRun();
    showStage("run");
    setCaption("run");
    root.dataset.phase = "run";
    startProgress("run");

    if (prefersReducedMotion()) {
      steps.forEach(step => revealStep(step));
      if (output) output.classList.add("is-on");
      if (timerEl) timerEl.textContent = "Worked for 10s";
      queueLoop(2800);
      return;
    }

    later(() => {
      timerInterval = window.setInterval(() => {
        elapsed += 1;
        if (timerEl) timerEl.textContent = `Worked for ${elapsed}s`;
      }, 1000);
    }, 280);

    steps.forEach((step, index) => {
      later(() => revealStep(step), 620 + index * stepGap);
    });

    const outputAt = 620 + steps.length * stepGap + 280;
    later(() => {
      if (timerInterval) {
        window.clearInterval(timerInterval);
        timerInterval = 0;
      }
      if (output) output.classList.add("is-on");
    }, outputAt);

    queueLoop(outputAt + 4200);
  }

  function transitionToRun() {
    if (prefersReducedMotion() || !stackStage) {
      playRun();
      return;
    }

    stackStage.classList.add("is-exiting");
    later(() => {
      if (!running) return;
      playRun();
    }, stageExit);
  }

  function pressInstall() {
    if (phase !== "stack" || !running) return;
    setFill("stack", "full");
    if (demoButton) {
      demoButton.classList.remove("is-pressed", "is-clicking");
      void demoButton.offsetWidth;
      demoButton.classList.add("is-pressed");
      if (!prefersReducedMotion()) demoButton.classList.add("is-clicking");
    }
    later(() => {
      if (demoButton) demoButton.classList.remove("is-pressed");
    }, prefersReducedMotion() ? 0 : pressHold);
    later(() => {
      if (demoButton) demoButton.classList.remove("is-clicking");
    }, prefersReducedMotion() ? 0 : 780);
    later(() => {
      if (!running || phase !== "stack") return;
      transitionToRun();
    }, prefersReducedMotion() ? 0 : pressHold);
  }

  function start() {
    reset();
    running = true;
    playStack();
    later(pressInstall, prefersReducedMotion() ? 900 : stackHold);
  }

  if (demoButton) {
    demoButton.addEventListener("click", () => {
      userPaused = false;
      running = true;
      clearTimers();
      if (phase !== "stack") {
        playStack();
        later(pressInstall, prefersReducedMotion() ? 200 : 900);
        return;
      }
      pressInstall();
    });
  }

  scenes.forEach(scene => {
    scene.addEventListener("click", () => {
      const key = scene.dataset.skillsScene;
      if (!key || key === phase) return;
      userPaused = false;
      running = true;
      clearTimers();
      if (key === "run") {
        if (phase === "stack") pressInstall();
        else playRun();
        return;
      }
      playStack();
      later(pressInstall, prefersReducedMotion() ? 900 : stackHold);
    });
  });

  return { start, reset };
}

function initAgentsChatDemo() {
  const root = document.querySelector("[data-chat-demo]");
  if (!root) return null;

  const caption = root.querySelector("[data-chat-caption]");
  const welcomeStage = root.querySelector('[data-chat-stage="welcome"]');
  const dialogStage = root.querySelector('[data-chat-stage="dialog"]');
  const welcomeShell = root.querySelector("[data-chat-welcome]");
  const composer = root.querySelector("[data-chat-composer]");
  const typed = root.querySelector("[data-chat-typed]");
  const send = root.querySelector("[data-chat-send]");
  const suggestions = root.querySelector("[data-chat-suggestions]");
  const lines = [...root.querySelectorAll("[data-chat-line]")];
  const scenes = [...root.querySelectorAll("[data-chat-scene]")];
  const fills = {
    welcome: root.querySelector('[data-chat-progress="welcome"]'),
    dialog: root.querySelector('[data-chat-progress="dialog"]')
  };
  const captions = {
    welcome: "Meet buyers the moment they show intent",
    dialog: "Qualify the deal, then book the next step"
  };
  const lineOrder = ["u1", "k1", "u2", "k2"];
  const visitorLine = "We need to finance six refrigerated trailers, roughly $250K. What rates could we expect?";
  const placeholder = "Ask our AI Assistant ...";
  const welcomeHold = 7200;
  const dialogHold = 11200;
  const stageExit = 640;
  let timeouts = [];
  let running = false;
  let userPaused = false;
  let phase = "welcome";

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

  function setCaption(key) {
    if (caption) caption.textContent = captions[key];
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

  function startProgress(key) {
    if (key === "welcome") {
      setFill("welcome", "play", prefersReducedMotion() ? 900 : welcomeHold);
      setFill("dialog", "reset");
    } else {
      setFill("welcome", "full");
      setFill("dialog", "play", prefersReducedMotion() ? 1600 : dialogHold);
    }
  }

  function syncScenes(key) {
    scenes.forEach(scene => {
      const on = scene.dataset.chatScene === key;
      scene.classList.toggle("is-active", on);
      scene.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  function showStage(key) {
    phase = key;
    if (welcomeStage) {
      welcomeStage.hidden = key !== "welcome";
      welcomeStage.classList.toggle("is-active", key === "welcome");
      welcomeStage.classList.remove("is-exiting");
    }
    if (dialogStage) {
      dialogStage.hidden = key !== "dialog";
      dialogStage.classList.toggle("is-active", key === "dialog");
      dialogStage.classList.remove("is-exiting");
    }
    syncScenes(key);
  }

  function typeInto(el, text, speed, done) {
    if (!el) {
      if (done) done();
      return;
    }
    el.textContent = "";
    if (prefersReducedMotion()) {
      el.textContent = text;
      if (done) done();
      return;
    }
    let index = 0;
    function tick() {
      index += 1;
      el.textContent = text.slice(0, index);
      if (index < text.length) later(tick, speed);
      else if (done) done();
    }
    tick();
  }

  function revealEl(el) {
    if (!el) return;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add("is-in");
  }

  function resetWelcome() {
    if (welcomeShell) {
      welcomeShell.hidden = true;
      welcomeShell.classList.remove("is-in");
    }
    if (composer) {
      composer.hidden = true;
      composer.classList.remove("is-live", "is-in");
    }
    if (typed) typed.textContent = placeholder;
    if (send) send.classList.remove("is-ready", "is-pressed");
  }

  function resetDialog() {
    lines.forEach(line => {
      line.classList.remove("is-in");
      line.hidden = true;
    });
    if (suggestions) {
      suggestions.hidden = true;
      suggestions.classList.remove("is-in");
    }
  }

  function reset() {
    running = false;
    userPaused = false;
    clearTimers();
    resetWelcome();
    resetDialog();
    setFill("welcome", "reset");
    setFill("dialog", "reset");
    showStage("welcome");
    setCaption("welcome");
  }

  function revealLine(id) {
    const line = lines.find(item => item.dataset.chatLine === id);
    if (!line) return;
    line.hidden = false;
    void line.offsetWidth;
    line.classList.add("is-in");
  }

  function playWelcome() {
    resetWelcome();
    resetDialog();
    showStage("welcome");
    setCaption("welcome");
    startProgress("welcome");

    if (prefersReducedMotion()) {
      revealEl(welcomeShell);
      revealEl(composer);
      if (composer) composer.classList.add("is-live");
      if (typed) typed.textContent = visitorLine;
      if (send) send.classList.add("is-ready");
      later(transitionToDialog, 1200);
      return;
    }

    later(() => {
      revealEl(welcomeShell);
      later(() => {
        revealEl(composer);
        later(() => {
          if (composer) composer.classList.add("is-live");
          typeInto(typed, visitorLine, 16, () => {
            if (send) send.classList.add("is-ready");
            later(pressSend, 480);
          });
        }, 2800);
      }, 900);
    }, 280);
  }

  function pressSend() {
    if (phase !== "welcome" || !running) return;
    setFill("welcome", "full");
    if (send) send.classList.add("is-pressed");
    later(() => {
      if (send) send.classList.remove("is-pressed");
      if (!running || phase !== "welcome") return;
      transitionToDialog();
    }, prefersReducedMotion() ? 0 : 360);
  }

  function transitionToDialog() {
    if (prefersReducedMotion() || !welcomeStage) {
      playDialog();
      return;
    }
    welcomeStage.classList.add("is-exiting");
    later(() => {
      if (!running) return;
      playDialog();
    }, stageExit);
  }

  function playDialog() {
    resetDialog();
    showStage("dialog");
    setCaption("dialog");
    startProgress("dialog");

    if (prefersReducedMotion()) {
      lineOrder.forEach(id => revealLine(id));
      if (suggestions) {
        suggestions.hidden = false;
        suggestions.classList.add("is-in");
      }
      queueLoop(1600);
      return;
    }

    const beats = [
      { id: "u1", at: 320 },
      { id: "k1", at: 1860 },
      { id: "u2", at: 3960 },
      { id: "k2", at: 5660 }
    ];
    beats.forEach(beat => {
      later(() => revealLine(beat.id), beat.at);
    });

    later(() => {
      if (suggestions) {
        suggestions.hidden = false;
        suggestions.classList.add("is-in");
      }
    }, 6860);

    queueLoop(dialogHold);
  }

  function queueLoop(delay) {
    later(() => {
      if (!running || userPaused) return;
      playWelcome();
    }, delay);
  }

  function start() {
    reset();
    running = true;
    playWelcome();
  }

  if (send) {
    send.addEventListener("click", () => {
      if (!running) {
        running = true;
        playWelcome();
        return;
      }
      if (phase === "welcome") pressSend();
    });
  }

  scenes.forEach(scene => {
    scene.addEventListener("click", () => {
      const key = scene.dataset.chatScene;
      if (!key || key === phase) return;
      userPaused = false;
      running = true;
      clearTimers();
      if (key === "dialog") {
        playDialog();
        return;
      }
      playWelcome();
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
    const items = [...root.querySelectorAll(".platform-item")];
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
  if (agentsChatDemo) agentsChatDemo.start();
  initAgentsCaseSwitchers();
  initHeroGrid();
  initPlatformAccordion();
});
