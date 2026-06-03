const state = {
  manifest: [],
  note: null,
  activeDate: null,
  activeTable: null,
  activeDriver: null,
  search: "",
};

const el = {
  tapeSelect: document.getElementById("tapeSelect"),
  searchInput: document.getElementById("searchInput"),
  archiveList: document.getElementById("archiveList"),
  sectionNav: document.getElementById("sectionNav"),
  statusPanel: document.getElementById("statusPanel"),
  heroPanel: document.getElementById("heroPanel"),
  dashboardPanel: document.getElementById("dashboardPanel"),
  driversPanel: document.getElementById("driversPanel"),
  monitorPanel: document.getElementById("monitorPanel"),
  tablesPanel: document.getElementById("tablesPanel"),
  longformPanel: document.getElementById("longformPanel"),
  reportDate: document.getElementById("reportDate"),
  reportTitle: document.getElementById("reportTitle"),
  headlinePrimary: document.getElementById("headlinePrimary"),
  headlineSecondary: document.getElementById("headlineSecondary"),
  metaRow: document.getElementById("metaRow"),
  summaryGrid: document.getElementById("summaryGrid"),
  regimeStrip: document.getElementById("regimeStrip"),
  positioningGrid: document.getElementById("positioningGrid"),
  driverTable: document.getElementById("driverTable"),
  monitorGrid: document.getElementById("monitorGrid"),
  tableTabs: document.getElementById("tableTabs"),
  tableContent: document.getElementById("tableContent"),
  sectionsContainer: document.getElementById("sectionsContainer"),
};

function text(value) {
  return value == null ? "" : String(value);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return text(value).toLowerCase();
}

function slug(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function highlight(value) {
  const safe = escapeHtml(value);
  if (!state.search) return safe;
  const escapedSearch = state.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${escapedSearch})`, "gi"), '<mark class="highlight">$1</mark>');
}

function showAppPanels() {
  [
    el.heroPanel,
    el.dashboardPanel,
    el.driversPanel,
    el.monitorPanel,
    el.tablesPanel,
    el.longformPanel,
  ].forEach((panel) => panel.classList.remove("hidden"));
  el.statusPanel.classList.add("hidden");
}

function setStatus(title, body) {
  el.statusPanel.classList.remove("hidden");
  el.statusPanel.innerHTML = `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p>`;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function currentManifestItem() {
  return state.manifest.find((item) => item.date === state.activeDate) || state.manifest[0];
}

function updateUrl(sectionId) {
  const params = new URLSearchParams(window.location.search);
  if (state.activeDate) params.set("tape", state.activeDate);
  if (sectionId) params.set("section", sectionId);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function renderArchive() {
  el.tapeSelect.innerHTML = state.manifest
    .map((item) => `<option value="${escapeHtml(item.date)}">${escapeHtml(item.label)}</option>`)
    .join("");
  el.tapeSelect.value = state.activeDate;
  el.archiveList.innerHTML = state.manifest
    .map(
      (item) => `
        <button class="archive-button ${item.date === state.activeDate ? "active" : ""}" data-date="${escapeHtml(item.date)}">
          <strong>${escapeHtml(item.label)}</strong><br>
          <span>${escapeHtml(item.coverageLabel || item.title)}</span>
        </button>
      `
    )
    .join("");
}

function renderHero(note) {
  el.reportDate.textContent = note.label || `${note.date} close`;
  el.reportTitle.textContent = note.title || "Daily FI Market Tape";
  el.headlinePrimary.textContent = note.headline?.primary || "";
  el.headlineSecondary.textContent = note.headline?.secondary || "";

  const meta = [
    note.coverage?.range_label ? `Coverage ${note.coverage.range_label}` : "",
    note.generated_at ? `Generated ${note.generated_at}` : "",
    note.timezone || "",
  ].filter(Boolean);
  el.metaRow.innerHTML = meta.map((item) => `<span class="meta-chip">${escapeHtml(item)}</span>`).join("");
  el.summaryGrid.innerHTML = (note.summary || [])
    .map((item) => `<div class="summary-card">${highlight(item)}</div>`)
    .join("");
}

function renderRegimeAndPositioning(note) {
  el.regimeStrip.innerHTML = (note.regime_strip || [])
    .map(
      (item) => `
        <button class="driver-button regime-chip" data-driver="${escapeHtml(item.label || "")}">
          <strong>${escapeHtml(item.label || "")}</strong> ${highlight(item.value || "")}
        </button>
      `
    )
    .join("");

  el.positioningGrid.innerHTML = (note.positioning || [])
    .map(
      (item) => `
        <div class="positioning-card" data-driver-text="${escapeHtml(JSON.stringify(item))}">
          <h3>${escapeHtml(item.label || "")} <span class="meta-chip">${escapeHtml(item.view || item.stance || "")}</span></h3>
          <p>${highlight(item.best_expression || "")}</p>
          <p><strong>Risk:</strong> ${highlight(item.risk_trigger || "")}</p>
        </div>
      `
    )
    .join("");
}

function renderDrivers(note) {
  const rows = note.driver_decomposition || [];
  if (!rows.length) {
    el.driverTable.innerHTML = "";
    return;
  }
  el.driverTable.innerHTML = `
    <table class="driver-grid">
      <thead><tr><th>Driver</th><th>Signal</th><th>FI Impact</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr data-driver-text="${escapeHtml(JSON.stringify(row))}">
                <td><button class="driver-button" data-driver="${escapeHtml(row.driver || "")}">${escapeHtml(row.driver || "")}</button></td>
                <td>${highlight(row.signal || "")}</td>
                <td>${highlight(row.fi_impact || row.impact || "")}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderMonitor(note) {
  const blocks = note.monitor_blocks || {};
  const labels = {
    key_levels: "Key Levels",
    event_risks: "Event Risk",
    asia_update: "Asia Update",
  };
  el.monitorGrid.innerHTML = Object.entries(labels)
    .map(([key, title]) => {
      const rows = blocks[key] || [];
      return `
        <div class="monitor-card">
          <h3>${title}</h3>
          ${rows
            .map(
              (row) => `
                <p><strong>${escapeHtml(row.label || "")}</strong> ${highlight(row.value || "")}</p>
                <p>${highlight(row.detail || row.change || "")}</p>
              `
            )
            .join("")}
        </div>
      `;
    })
    .join("");
}

function rowChangeClass(value) {
  const raw = text(value).trim();
  if (raw.startsWith("+")) return "pos";
  if (raw.startsWith("-")) return "neg";
  return "";
}

function renderTables(note) {
  const tables = note.market_tables || [];
  if (!state.activeTable && tables.length) state.activeTable = tables[0].id || tables[0].title;
  el.tableTabs.innerHTML = tables
    .map((table) => {
      const id = table.id || table.title;
      return `<button class="tab-button ${id === state.activeTable ? "active" : ""}" data-table="${escapeHtml(id)}">${escapeHtml(table.title || id)}</button>`;
    })
    .join("");

  const table = tables.find((item) => (item.id || item.title) === state.activeTable) || tables[0];
  if (!table) {
    el.tableContent.innerHTML = "";
    return;
  }
  const columns = table.columns || [];
  const rows = table.rows || [];
  el.tableContent.innerHTML = `
    <table class="market-table">
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map((row) => {
            const values = [
              row.label,
              row.value ?? row.status,
              row.change ?? row.result,
              row.week_change ?? row.expected ?? row.note,
              row.month_change ?? row.implication ?? row.detail,
            ].slice(0, columns.length);
            return `<tr data-driver-text="${escapeHtml(JSON.stringify(row))}">${values
              .map((value, index) => `<td class="${index >= 2 ? rowChangeClass(value) : ""}">${highlight(value || "")}</td>`)
              .join("")}</tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSections(note) {
  const sections = note.sections || [];
  el.sectionNav.innerHTML = sections
    .map((section, index) => {
      const id = section.id || slug(section.title || `section-${index + 1}`);
      return `<button class="section-link" data-section="${escapeHtml(id)}">${escapeHtml(section.title || `Section ${index + 1}`)}</button>`;
    })
    .join("");
  el.sectionsContainer.innerHTML = sections
    .map((section, index) => {
      const id = section.id || slug(section.title || `section-${index + 1}`);
      const paragraphs = section.paragraphs || [];
      return `
        <section class="section-block" id="${escapeHtml(id)}" data-driver-text="${escapeHtml(JSON.stringify(section))}">
          <h3>${escapeHtml(section.title || `Section ${index + 1}`)}</h3>
          ${section.takeaway ? `<p><strong>${highlight(section.takeaway)}</strong></p>` : ""}
          ${paragraphs.map((paragraph) => `<p>${highlight(paragraph)}</p>`).join("")}
        </section>
      `;
    })
    .join("");
}

function applyFilters() {
  const query = normalize(state.search);
  const driver = normalize(state.activeDriver);
  document.querySelectorAll("[data-driver-text]").forEach((node) => {
    const haystack = normalize(node.getAttribute("data-driver-text"));
    const queryMatch = !query || haystack.includes(query);
    const driverMatch = !driver || haystack.includes(driver);
    node.classList.toggle("filtered-out", !(queryMatch && driverMatch));
  });
  document.querySelectorAll(".driver-button").forEach((button) => {
    button.classList.toggle("active", state.activeDriver && normalize(button.dataset.driver) === normalize(state.activeDriver));
  });
}

function renderNote() {
  const note = state.note;
  renderArchive();
  renderHero(note);
  renderRegimeAndPositioning(note);
  renderDrivers(note);
  renderMonitor(note);
  renderTables(note);
  renderSections(note);
  applyFilters();
  showAppPanels();
}

async function loadTape(date) {
  const item = state.manifest.find((entry) => entry.date === date) || state.manifest[0];
  if (!item) return;
  state.activeDate = item.date;
  state.activeTable = null;
  setStatus("Loading Daily FI Tape", `Fetching ${item.label}.`);
  state.note = await fetchJson(item.dataPath);
  renderNote();
  updateUrl();
}

function bindEvents() {
  el.tapeSelect.addEventListener("change", (event) => loadTape(event.target.value).catch(showError));
  el.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderNote();
  });
  document.addEventListener("click", (event) => {
    const archiveButton = event.target.closest("[data-date]");
    if (archiveButton) {
      loadTape(archiveButton.dataset.date).catch(showError);
      return;
    }
    const tableButton = event.target.closest("[data-table]");
    if (tableButton) {
      state.activeTable = tableButton.dataset.table;
      renderTables(state.note);
      applyFilters();
      return;
    }
    const driverButton = event.target.closest("[data-driver]");
    if (driverButton) {
      const driver = driverButton.dataset.driver;
      state.activeDriver = state.activeDriver === driver ? null : driver;
      applyFilters();
      return;
    }
    const sectionButton = event.target.closest("[data-section]");
    if (sectionButton) {
      const target = document.getElementById(sectionButton.dataset.section);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        updateUrl(sectionButton.dataset.section);
      }
    }
  });
}

function showError(error) {
  setStatus("Unable to load report", error.message || "The report archive could not be loaded.");
}

async function boot() {
  bindEvents();
  const params = new URLSearchParams(window.location.search);
  state.manifest = await fetchJson("tapes.json");
  const requestedTape = params.get("tape");
  await loadTape(requestedTape || state.manifest[0]?.date);
  const section = params.get("section");
  if (section) {
    setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: "start" }), 100);
  }
}

boot().catch(showError);
