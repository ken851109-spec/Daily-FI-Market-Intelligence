(() => {
  const rootEl = document.querySelector(".page-shell");
  const bar = document.querySelector("[data-command-bar]");
  const input = document.querySelector("[data-search-input]");
  const clearButton = document.querySelector("[data-clear-search]");
  const resultsEl = document.querySelector("[data-search-results]");
  const dateSelect = document.querySelector("[data-date-select]");
  const toolsEl = document.querySelector(".task-nav");
  if (!rootEl || !bar || !input || !resultsEl || !dateSelect) return;

  const siteRoot = rootEl.dataset.siteRoot || "";
  const currentDate = rootEl.dataset.currentDate || dateSelect.dataset.currentDate || "";
  const manifestUrl = siteRoot + "tapes.json";
  const state = { manifest: [], notes: new Map(), index: [], query: "" };
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const normalize = (value) => String(value ?? "").toLocaleLowerCase();
  const slug = (value) => String(value || "section").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  const latestDate = () => state.manifest[0]?.date || "";
  const hrefForDate = (date) => {
    const item = state.manifest.find((entry) => entry.date === date);
    if (!item) return siteRoot || "./";
    return date === latestDate() ? (siteRoot || "./") : siteRoot + item.path;
  };
  const debounce = (fn, wait = 140) => {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const flatten = (value, fallbackSection, fallbackTitle, out = []) => {
    if (value == null) return out;
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) out.push({ section: fallbackSection, title: fallbackTitle, text });
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => flatten(item, fallbackSection, fallbackTitle, out));
      return out;
    }
    if (typeof value === "object") {
      const title = value.title || value.label || value.driver || value.id || fallbackTitle;
      const section = value.id ? sectionForId(value.id) : fallbackSection;
      Object.entries(value).forEach(([key, item]) => {
        if (["id", "title", "label", "date", "path", "dataPath"].includes(key)) return;
        flatten(item, section, title, out);
      });
    }
    return out;
  };

  const sectionForId = (id) => {
    const value = String(id || "");
    if (value.includes("rates") || value.includes("curve")) return "rates";
    if (value.includes("cross")) return "cross-asset";
    if (value.includes("event") || value.includes("risk") || value.includes("asia")) return "risk-monitor";
    if (value.includes("driver")) return "drivers";
    return "investment-read";
  };

  const buildIndex = () => {
    const rows = [];
    for (const item of state.manifest) {
      const note = state.notes.get(item.date);
      if (!note) continue;
      const headline = note.headline || {};
      flatten([headline.primary, headline.secondary, note.summary], "overview", "今日盤勢", rows);
      flatten(note.regime_strip, "overview", "Regime", rows);
      flatten(note.positioning, "overview", "配置重點", rows);
      flatten(note.driver_decomposition, "drivers", "市場驅動", rows);
      flatten(note.monitor_blocks, "risk-monitor", "風險監控", rows);
      flatten(note.market_tables, "rates", "參考數據", rows);
      for (const section of note.sections || []) {
        const sectionId = "analysis-" + slug(section.id || "section");
        flatten([section.title, section.takeaway, section.paragraphs], sectionId, section.title || "投資解讀", rows);
      }
      rows.filter((row) => !row.date).forEach((row) => {
        row.date = item.date;
        row.label = item.label;
        row.path = item.path;
        row.dataPath = item.dataPath;
      });
    }
    state.index = rows.map((row) => ({ ...row, haystack: normalize(`${row.date} ${row.title} ${row.text}`) }));
  };

  const excerpt = (text, query) => {
    const source = String(text || "").replace(/\s+/g, " ").trim();
    const idx = normalize(source).indexOf(normalize(query));
    if (idx < 0) return source.slice(0, 120);
    const start = Math.max(0, idx - 42);
    const end = Math.min(source.length, idx + query.length + 72);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < source.length ? "..." : "";
    return prefix + source.slice(start, end) + suffix;
  };

  const renderResults = (query) => {
    state.query = query.trim();
    if (!state.query) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
      clearHighlights();
      return;
    }
    const matches = state.index.filter((row) => row.haystack.includes(normalize(state.query))).slice(0, 24);
    resultsEl.hidden = false;
    if (!matches.length) {
      resultsEl.innerHTML = '<div class="search-empty">沒有找到符合的報告段落</div>';
      return;
    }
    resultsEl.innerHTML = [
      `<div class="search-count">${matches.length} 個相關段落</div>`,
      ...matches.map((row) => {
        const href = `${hrefForDate(row.date)}?q=${encodeURIComponent(state.query)}#${encodeURIComponent(row.section || "overview")}`;
        return `<a class="search-result" href="${escapeHtml(href)}">` +
          `<span>${escapeHtml(row.date)} / ${escapeHtml(row.title || "段落")}</span>` +
          `<strong>${escapeHtml(excerpt(row.text, state.query))}</strong>` +
          "</a>";
      })
    ].join("");
  };

  const clearHighlights = () => {
    document.querySelectorAll("mark.search-hit").forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent || ""));
    });
  };

  const highlightPage = (query) => {
    clearHighlights();
    if (!query) return;
    const needle = normalize(query);
    const targets = document.querySelectorAll(".task-section, .right-rail");
    for (const target of targets) {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest("script, style, mark, .command-bar")) return NodeFilter.FILTER_REJECT;
          return normalize(node.nodeValue).includes(needle) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text = node.nodeValue || "";
        const idx = normalize(text).indexOf(needle);
        if (idx < 0) continue;
        const mark = document.createElement("mark");
        mark.className = "search-hit";
        mark.textContent = text.slice(idx, idx + query.length);
        const frag = document.createDocumentFragment();
        frag.append(text.slice(0, idx), mark, text.slice(idx + query.length));
        node.replaceWith(frag);
        const details = mark.closest("details");
        if (details) details.open = true;
      }
    }
    const first = document.querySelector("mark.search-hit");
    if (first && !location.hash) first.scrollIntoView({ block: "center" });
  };

  const hydrateDateSelect = () => {
    dateSelect.innerHTML = state.manifest.map((item) => {
      const selected = item.date === currentDate ? " selected" : "";
      return `<option value="${escapeHtml(item.date)}"${selected}>${escapeHtml(item.label || item.date)}</option>`;
    }).join("");
    dateSelect.addEventListener("change", () => {
      if (dateSelect.value) location.href = hrefForDate(dateSelect.value);
    });
  };

  const syncQuery = (query) => {
    const params = new URLSearchParams(location.search);
    if (query) params.set("q", query); else params.delete("q");
    const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
    history.replaceState(null, "", next);
  };

  const runSearch = debounce((value) => {
    renderResults(value);
    highlightPage(value.trim());
    syncQuery(value.trim());
  });

  const setupMobileTools = () => {
    if (!toolsEl) return;
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    let lastY = window.scrollY;
    let ticking = false;
    const isUsingTools = () => {
      const active = document.activeElement;
      return bar.contains(active) || !resultsEl.hidden;
    };
    const showTools = () => toolsEl.classList.remove("is-hidden");
    const hideTools = () => {
      if (window.scrollY > 96 && !isUsingTools()) toolsEl.classList.add("is-hidden");
    };
    const sync = () => {
      if (!mobileQuery.matches) {
        showTools();
        lastY = window.scrollY;
        return;
      }
      const y = window.scrollY;
      const delta = y - lastY;
      if (y < 72) showTools();
      else if (delta > 14) hideTools();
      else if (delta < -18) showTools();
      lastY = y;
    };
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        sync();
        ticking = false;
      });
    }, { passive: true });
    window.addEventListener("resize", sync);
    bar.addEventListener("focusin", showTools);
    resultsEl.addEventListener("click", showTools);
    document.querySelectorAll(".section-nav a").forEach((link) => {
      link.addEventListener("click", () => {
        showTools();
        setTimeout(hideTools, 260);
      });
    });
    sync();
  };

  const init = async () => {
    try {
      const manifest = await fetch(manifestUrl).then((response) => response.json());
      state.manifest = Array.isArray(manifest) ? manifest : [];
      hydrateDateSelect();
      const notes = await Promise.all(state.manifest.map(async (item) => {
        try {
          const note = await fetch(siteRoot + item.dataPath).then((response) => response.json());
          return [item.date, note];
        } catch {
          return [item.date, null];
        }
      }));
      notes.forEach(([date, note]) => { if (note) state.notes.set(date, note); });
      buildIndex();
      const initialQuery = new URLSearchParams(location.search).get("q") || "";
      if (initialQuery) {
        input.value = initialQuery;
        renderResults(initialQuery);
        highlightPage(initialQuery);
      } else {
        resultsEl.hidden = true;
      }
    } catch {
      dateSelect.innerHTML = '<option value="">日期載入失敗</option>';
      resultsEl.hidden = false;
      resultsEl.innerHTML = '<div class="search-empty">搜尋資料載入失敗</div>';
    }
  };

  input.addEventListener("input", () => runSearch(input.value));
  clearButton.addEventListener("click", () => {
    input.value = "";
    renderResults("");
    syncQuery("");
    input.focus();
  });
  setupMobileTools();
  init();
})();
