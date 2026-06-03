const state = {
  manifest: [],
  note: null,
  activeDate: null,
  search: "",
};

const el = {
  tapeSelect: document.getElementById("tapeSelect"),
  searchInput: document.getElementById("searchInput"),
  activeTapeLabel: document.getElementById("activeTapeLabel"),
  openArchiveLink: document.getElementById("openArchiveLink"),
  archiveList: document.getElementById("archiveList"),
  sectionNav: document.getElementById("sectionNav"),
  statusPanel: document.getElementById("statusPanel"),
  reportFrame: document.getElementById("reportFrame"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function activeManifestItem() {
  return state.manifest.find((item) => item.date === state.activeDate) || state.manifest[0];
}

function updateUrl(sectionId) {
  const params = new URLSearchParams(window.location.search);
  if (state.activeDate) params.set("tape", state.activeDate);
  if (sectionId) params.set("section", sectionId);
  else params.delete("section");
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function setStatus(message) {
  el.statusPanel.classList.remove("hidden");
  el.statusPanel.innerHTML = `<h2>${escapeHtml(message)}</h2>`;
}

function renderControls() {
  el.tapeSelect.innerHTML = state.manifest
    .map((item) => `<option value="${escapeHtml(item.date)}">${escapeHtml(item.label)}</option>`)
    .join("");
  el.tapeSelect.value = state.activeDate;
  const item = activeManifestItem();
  el.activeTapeLabel.textContent = item?.label || "Daily FI Market Tape";
  el.openArchiveLink.href = item?.path || "#";

  el.archiveList.innerHTML = state.manifest
    .map(
      (entry) => `
        <button class="archive-button ${entry.date === state.activeDate ? "active" : ""}" data-date="${escapeHtml(entry.date)}">
          <strong>${escapeHtml(entry.label)}</strong>
        </button>
      `
    )
    .join("");

  const sections = state.note?.sections || [];
  el.sectionNav.innerHTML = sections
    .map((section, index) => {
      const label = section.title || `Section ${index + 1}`;
      return `<button class="section-button" data-section-title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function resizeFrame() {
  const doc = el.reportFrame.contentDocument;
  if (!doc) return;
  const height = Math.max(
    doc.body?.scrollHeight || 0,
    doc.documentElement?.scrollHeight || 0,
    window.innerHeight - 92
  );
  el.reportFrame.style.height = `${height}px`;
  el.reportFrame.classList.add("ready");
}

function injectViewerStyles() {
  const doc = el.reportFrame.contentDocument;
  if (!doc?.head || doc.getElementById("daily-fi-viewer-style")) return;
  const style = doc.createElement("style");
  style.id = "daily-fi-viewer-style";
  style.textContent = `
    @media only screen and (max-width: 640px) {
      html, body { overflow-x: hidden !important; }
      body > table > tbody > tr > td[align="center"] {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      table.daily-fi-shell {
        width: 100% !important;
        max-width: 100% !important;
      }
      .daily-fi-pad {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      h1 {
        font-size: 27px !important;
      }
    }
  `;
  doc.head.appendChild(style);
}

function clearSearchMarks() {
  const doc = el.reportFrame.contentDocument;
  if (!doc) return;
  doc.querySelectorAll("mark.daily-fi-search-hit").forEach((mark) => {
    const textNode = doc.createTextNode(mark.textContent || "");
    mark.replaceWith(textNode);
  });
}

function markSearchHits(query) {
  clearSearchMarks();
  const trimmed = query.trim();
  if (!trimmed) return 0;

  const doc = el.reportFrame.contentDocument;
  if (!doc?.body) return 0;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const testPattern = new RegExp(escaped, "i");
  const pattern = new RegExp(escaped, "gi");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "MARK"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return testPattern.test(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let hits = 0;
  nodes.forEach((node) => {
    const fragment = doc.createDocumentFragment();
    const text = node.nodeValue || "";
    let lastIndex = 0;
    text.replace(pattern, (match, offset) => {
      if (offset > lastIndex) fragment.appendChild(doc.createTextNode(text.slice(lastIndex, offset)));
      const mark = doc.createElement("mark");
      mark.className = "daily-fi-search-hit";
      mark.textContent = match;
      fragment.appendChild(mark);
      hits += 1;
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
    node.replaceWith(fragment);
  });

  const styleId = "daily-fi-search-style";
  if (!doc.getElementById(styleId)) {
    const style = doc.createElement("style");
    style.id = styleId;
    style.textContent = ".daily-fi-search-hit{background:#fff1b8;color:#8a5a00;font-weight:700;}";
    doc.head.appendChild(style);
  }
  doc.querySelector("mark.daily-fi-search-hit")?.scrollIntoView({ block: "center" });
  resizeFrame();
  return hits;
}

function findElementByText(doc, label) {
  const candidates = [...doc.querySelectorAll("h1,h2,h3,h4,td,p,div,span,strong")];
  return candidates.find((node) => (node.textContent || "").trim().includes(label));
}

function scrollToSection(title) {
  const doc = el.reportFrame.contentDocument;
  if (!doc) return;
  const target = findElementByText(doc, title);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    updateUrl(title);
  }
}

async function loadTape(date) {
  const item = state.manifest.find((entry) => entry.date === date) || state.manifest[0];
  if (!item) return;
  state.activeDate = item.date;
  setStatus("載入報告中");
  state.note = await fetchJson(item.dataPath);
  renderControls();

  await new Promise((resolve) => {
    el.reportFrame.onload = resolve;
    el.reportFrame.src = item.path;
  });
  el.statusPanel.classList.add("hidden");
  injectViewerStyles();
  resizeFrame();
  if (state.search) markSearchHits(state.search);
  updateUrl();
}

function bindEvents() {
  el.tapeSelect.addEventListener("change", (event) => loadTape(event.target.value).catch(showError));
  el.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    markSearchHits(state.search);
  });
  window.addEventListener("resize", resizeFrame);
  document.addEventListener("click", (event) => {
    const archiveButton = event.target.closest("[data-date]");
    if (archiveButton) {
      loadTape(archiveButton.dataset.date).catch(showError);
      return;
    }
    const sectionButton = event.target.closest("[data-section-title]");
    if (sectionButton) {
      scrollToSection(sectionButton.dataset.sectionTitle);
    }
  });
}

function showError(error) {
  setStatus(error.message || "報告載入失敗");
}

async function boot() {
  bindEvents();
  state.manifest = await fetchJson("tapes.json");
  const params = new URLSearchParams(window.location.search);
  await loadTape(params.get("tape") || state.manifest[0]?.date);
  const section = params.get("section");
  if (section) setTimeout(() => scrollToSection(section), 200);
}

boot().catch(showError);
