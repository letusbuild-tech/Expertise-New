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

  updateHeights();
  window.addEventListener("resize", updateHeights);
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

  function build() {
    const { width, height } = grid.getBoundingClientRect();
    if (!width || !height) return;

    cellSize = readCellSize();
    cols = Math.ceil(width / cellSize) + 1;
    rows = Math.ceil(height / cellSize) + 1;
    fullRows = Math.floor(height / cellSize);

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
    const leftReserve = Math.ceil(cols * HERO_GRID_LEFT_EXCLUSION);
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

    const leftReserve = Math.ceil(cols * HERO_GRID_LEFT_EXCLUSION);
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
  function swapTile() {
    const tile = tiles[tileCursor % tiles.length];
    tileCursor += 1;
    if (!tile) return;

    if (!tile.classList.contains("is-open")) {
      nextPhoto(tile);
      tile.classList.add("is-open");
      return;
    }

    tile.classList.remove("is-open");
    window.setTimeout(() => {
      placeTile(tile);
      nextPhoto(tile);
      tile.classList.add("is-open");
    }, 900);
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
      nextPhoto(tile);
      tile.classList.add("is-open");
    });
  }

  // Below 900px the grid is hidden, so build() no-ops until a resize brings it back.
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

function initAgentsTabs() {
  const section = document.querySelector(".agents-section");
  if (!section) return;

  const tabs = [...section.querySelectorAll("[data-agent-tab]")];
  const panes = [...section.querySelectorAll("[data-agent-pane]")];
  const visualFrame = section.querySelector(".agents-visual-frame");
  if (!tabs.length || !panes.length) return;

  let activeTab = tabs.find(tab => tab.getAttribute("aria-selected") === "true") || tabs[0];
  let transitionTimer;
  let entranceTimer;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    if (!visualFrame) return;
    visualFrame.classList.remove("is-fading-out", "is-entering");
  }

  function playVisualFrameEntrance() {
    if (!visualFrame || prefersReducedMotion()) {
      clearVisualFrameMotion();
      return;
    }

    visualFrame.classList.remove("is-fading-out", "is-entering");
    void visualFrame.offsetWidth;
    visualFrame.classList.add("is-entering");
  }

  function activatePane(pane, animate) {
    panes.forEach(item => {
      const on = item === pane;
      item.classList.toggle("is-active", on);
      item.classList.remove("is-fading-out");
      item.toggleAttribute("inert", !on);
      item.setAttribute("aria-hidden", on ? "false" : "true");
    });

    if (!animate || prefersReducedMotion()) {
      pane.classList.remove("is-entering");
      clearVisualFrameMotion();
      return;
    }

    pane.classList.remove("is-entering");
    void pane.offsetWidth;
    pane.classList.add("is-entering");
    playVisualFrameEntrance();
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

    currentPane.classList.remove("is-entering");
    currentPane.classList.add("is-fading-out");
    if (visualFrame) {
      visualFrame.classList.remove("is-entering");
      visualFrame.classList.add("is-fading-out");
    }

    transitionTimer = window.setTimeout(() => {
      currentPane.classList.remove("is-fading-out");
      if (visualFrame) visualFrame.classList.remove("is-fading-out");
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

function initPlatformAccordion() {
  const root = document.querySelector("[data-platform-accordion]");
  if (!root) return;

  const items = [...root.querySelectorAll(".platform-item")];
  const images = [...document.querySelectorAll(".platform-visual-img")];
  if (!items.length) return;

  const activate = (item) => {
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
    });
  };

  items.forEach((item) => {
    const trigger = item.querySelector(".platform-item-trigger");
    if (trigger) {
      trigger.addEventListener("click", () => activate(item));
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
  initTestimonialControls();
  initClientBentoMarquee();
  initIndustryCardReveals();
  initAgentsTabs();
  initHeroGrid();
  initPlatformAccordion();
});
