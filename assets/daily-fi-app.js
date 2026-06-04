(() => {
  const rootEl = document.querySelector(".page-shell");
  const bar = document.querySelector("[data-command-bar]");
  const input = document.querySelector("[data-search-input]");
  const clearButton = document.querySelector("[data-clear-search]");
  const resultsEl = document.querySelector("[data-search-results]");
  const dateSelects = Array.from(document.querySelectorAll("[data-date-select]"));
  const dateSelect = dateSelects[0];
  const mobileDateMenu = document.querySelector("[data-mobile-date-menu]");
  const toolsEl = document.querySelector(".task-nav");
  const langButtons = Array.from(document.querySelectorAll("[data-lang-button]"));
  const langPanels = Array.from(document.querySelectorAll("[data-lang-panel]"));
  const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
  if (!rootEl || !bar || !input || !resultsEl || !dateSelect) return;

  const siteRoot = rootEl.dataset.siteRoot || "";
  const currentDate = rootEl.dataset.currentDate || dateSelect.dataset.currentDate || "";
  const manifestUrl = siteRoot + "tapes.json";
  const paramsAtLoad = new URLSearchParams(location.search);
  const initialLang = paramsAtLoad.get("lang") || (location.hash.startsWith("#en-") ? "en" : "") || localStorage.getItem("daily-fi-language") || "zh";
  const state = { manifest: [], notes: new Map(), index: [], query: "", language: initialLang === "en" ? "en" : "zh" };
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const normalize = (value) => String(value ?? "").toLocaleLowerCase();
  const slug = (value) => String(value || "section").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  const latestDate = () => state.manifest[0]?.date || "";
  const localizedHref = (href, lang = state.language) => {
    const base = String(href || "./");
    if (lang !== "en") return base.replace(/[?&]lang=en\b/, "").replace(/\?$/, "");
    if (base.includes("lang=en")) return base;
    return `${base}${base.includes("?") ? "&" : "?"}lang=en`;
  };
  const hrefForDate = (date, lang = state.language) => {
    const item = state.manifest.find((entry) => entry.date === date);
    if (!item) return siteRoot || "./";
    const base = date === latestDate() ? (siteRoot || "./") : siteRoot + item.path;
    return localizedHref(base, lang);
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
      const section = value.id ? sectionForId(value.id, fallbackSection) : fallbackSection;
      Object.entries(value).forEach(([key, item]) => {
        if (["id", "title", "label", "date", "path", "dataPath"].includes(key)) return;
        flatten(item, section, title, out);
      });
    }
    return out;
  };

  const sectionForId = (id, fallbackSection = "investment-read") => {
    const value = String(id || "");
    const prefix = String(fallbackSection || "").startsWith("en-") ? "en-" : "";
    if (value.includes("rates") || value.includes("curve")) return prefix + "rates";
    if (value.includes("cross")) return prefix + "cross-asset";
    if (value.includes("event") || value.includes("risk") || value.includes("asia")) return prefix + "risk-monitor";
    if (value.includes("driver")) return prefix + "drivers";
    return fallbackSection || prefix + "investment-read";
  };

  const addNoteRows = (rows, item, note, lang) => {
    const before = rows.length;
    const prefix = lang === "en" ? "en-" : "";
    const headline = note.headline || {};
    flatten([headline.primary, headline.secondary, note.summary], prefix + "overview", lang === "en" ? "Overview" : "今日盤勢", rows);
    flatten(note.regime_strip, prefix + "overview", "Regime", rows);
    flatten(note.positioning, prefix + "overview", lang === "en" ? "Positioning" : "配置重點", rows);
    flatten(note.driver_decomposition, prefix + "drivers", lang === "en" ? "Market Drivers" : "市場驅動", rows);
    flatten(note.monitor_blocks, prefix + "risk-monitor", lang === "en" ? "Risk Monitor" : "風險監控", rows);
    flatten(note.market_tables, prefix + "rates", lang === "en" ? "Reference Data" : "參考數據", rows);
    for (const section of note.sections || []) {
      const sectionId = prefix + "analysis-" + slug(section.id || "section");
      flatten([section.title, section.takeaway, section.paragraphs], sectionId, section.title || (lang === "en" ? "Investment Read" : "投資解讀"), rows);
    }
    rows.slice(before).forEach((row) => {
      row.date = item.date;
      row.label = item.label;
      row.path = item.path;
      row.dataPath = item.dataPath;
      row.lang = lang;
    });
  };

  const buildIndex = () => {
    const rows = [];
    for (const item of state.manifest) {
      const note = state.notes.get(item.date);
      if (!note) continue;
      addNoteRows(rows, item, note, "zh");
      if (note.translations && note.translations.en) addNoteRows(rows, item, note.translations.en, "en");
    }
    state.index = rows.map((row) => ({ ...row, haystack: normalize(`${row.date} ${row.lang} ${row.title} ${row.text}`) }));
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
      resultsEl.innerHTML = `<div class="search-empty">${state.language === "en" ? "No matching report passages" : "沒有找到符合的報告段落"}</div>`;
      return;
    }
    resultsEl.innerHTML = [
      `<div class="search-count">${state.language === "en" ? `${matches.length} matching passages` : `${matches.length} 個相關段落`}</div>`,
      ...matches.map((row) => {
        const baseHref = hrefForDate(row.date, row.lang || "zh");
        const joiner = baseHref.includes("?") ? "&" : "?";
        const langParam = baseHref.includes("lang=") ? "" : `&lang=${encodeURIComponent(row.lang || "zh")}`;
        const href = `${baseHref}${joiner}q=${encodeURIComponent(state.query)}${langParam}#${encodeURIComponent(row.section || "overview")}`;
        const langLabel = row.lang === "en" ? "EN" : "中文";
        return `<a class="search-result" href="${escapeHtml(href)}">` +
          `<span>${escapeHtml(row.date)} / ${escapeHtml(langLabel)} / ${escapeHtml(row.title || "段落")}</span>` +
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
    const activePanel = document.querySelector(`[data-lang-panel="${state.language}"]`);
    const targets = activePanel ? activePanel.querySelectorAll(".task-section, .right-rail") : document.querySelectorAll(".task-section, .right-rail");
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
    const options = state.manifest.map((item) => {
      const selected = item.date === currentDate ? " selected" : "";
      return `<option value="${escapeHtml(item.date)}"${selected}>${escapeHtml(item.label || item.date)}</option>`;
    }).join("");
    dateSelects.forEach((select) => {
      select.innerHTML = options;
      select.addEventListener("change", () => {
        if (select.value) location.href = hrefForDate(select.value, state.language);
      });
    });
  };

  const syncQuery = (query) => {
    const params = new URLSearchParams(location.search);
    if (query) params.set("q", query); else params.delete("q");
    if (state.language === "en") params.set("lang", "en"); else params.delete("lang");
    const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
    history.replaceState(null, "", next);
  };

  const syncNavForLanguage = () => {
    const lang = state.language;
    navLinks.forEach((link) => {
      const base = link.dataset.sectionBase || "overview";
      const section = lang === "en" ? `en-${base}` : base;
      link.setAttribute("href", `#${section}`);
      const strong = link.querySelector("strong");
      const span = link.querySelector("span");
      if (strong) strong.textContent = link.dataset[`label${lang === "en" ? "En" : "Zh"}`] || strong.textContent;
      if (span) span.textContent = link.dataset[`caption${lang === "en" ? "En" : "Zh"}`] || span.textContent;
    });
  };

  const syncStaticTextForLanguage = () => {
    const lang = state.language;
    document.querySelectorAll("[data-text-zh][data-text-en]").forEach((el) => {
      el.textContent = el.dataset[lang === "en" ? "textEn" : "textZh"] || el.textContent;
    });
    document.querySelectorAll("[data-language-href]").forEach((el) => {
      el.setAttribute("href", localizedHref(el.dataset.languageHref || el.getAttribute("href") || "./", lang));
    });
    document.querySelectorAll("[data-report-date]").forEach((el) => {
      const href = hrefForDate(el.dataset.reportDate || "", lang);
      if (href) el.setAttribute("href", href);
    });
  };

  const setLanguage = (lang, { updateUrl = true } = {}) => {
    state.language = lang === "en" ? "en" : "zh";
    rootEl.dataset.language = state.language;
    document.documentElement.lang = state.language === "en" ? "en" : "zh-Hant";
    langPanels.forEach((panel) => { panel.hidden = panel.dataset.langPanel !== state.language; });
    langButtons.forEach((button) => {
      const active = button.dataset.langButton === state.language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    input.placeholder = state.language === "en" ? "Search JOLTS, WTI, 2s10s, AI..." : "搜尋 JOLTS、WTI、2s10s、AI...";
    localStorage.setItem("daily-fi-language", state.language);
    syncNavForLanguage();
    syncStaticTextForLanguage();
    if (state.query || input.value.trim()) renderResults(state.query || input.value.trim());
    if (updateUrl) syncQuery(state.query || input.value.trim());
    highlightPage(state.query || input.value.trim());
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
      syncStaticTextForLanguage();
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
  langButtons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.langButton || "zh"));
  });
  document.addEventListener("click", (event) => {
    if (mobileDateMenu && !mobileDateMenu.contains(event.target)) mobileDateMenu.open = false;
  });
  setLanguage(state.language, { updateUrl: false });
  setupMobileTools();
  init();
})();
