(() => {
  const rootEl = document.querySelector(".page-shell");
  const bar = document.querySelector("[data-command-bar]");
  const input = document.querySelector("[data-search-input]");
  const clearButton = document.querySelector("[data-clear-search]");
  const resultsEl = document.querySelector("[data-search-results]");
  const dateSelects = Array.from(document.querySelectorAll("[data-date-select]"));
  const dateSelect = dateSelects[0];
  const dateGridHosts = Array.from(document.querySelectorAll("[data-date-grid]"));
  const dateCurrentLabels = Array.from(document.querySelectorAll("[data-date-current-label]"));
  const dateMenus = Array.from(document.querySelectorAll("[data-date-menu], [data-mobile-date-menu]"));
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
	  const state = { manifest: [], notes: new Map(), index: [], query: "", language: initialLang === "en" ? "en" : "zh", searchExpanded: false, resultsCollapsed: false };
	  const MIN_SEARCH_CHARS = 2;
  const updateToolMetrics = () => {
    const root = document.documentElement;
    if (!toolsEl) {
      root.style.setProperty("--task-nav-bottom", "0px");
      root.style.setProperty("--sticky-offset", window.innerWidth >= 1400 ? "88px" : "18px");
      return;
    }
    const rect = toolsEl.getBoundingClientRect();
    const visibleBottom = Math.max(0, Math.ceil(rect.bottom));
    const compact = window.innerWidth < 1200;
    const baseOffset =
      window.innerWidth >= 1400
        ? 88
        : window.innerWidth >= 1200
          ? 24
          : Math.max(18, visibleBottom + (window.innerWidth < 768 ? 10 : 14));
    root.style.setProperty("--task-nav-bottom", `${visibleBottom}px`);
    root.style.setProperty("--sticky-offset", `${baseOffset}px`);
    if (!compact) toolsEl.classList.remove("is-hidden");
  };
  const revealTools = () => {
    if (!toolsEl) return;
    toolsEl.classList.remove("is-hidden");
    toolsEl.removeAttribute("data-tools-hidden");
    updateToolMetrics();
  };
	  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const normalize = (value) => String(value ?? "").toLocaleLowerCase();
  const slug = (value) => String(value || "section").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  const parseSignedMove = (value) => {
    const raw = String(value ?? "").trim();
    const match = raw.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0].replace(/,/g, ""));
    if (!Number.isFinite(parsed)) return null;
    if (raw.startsWith("-")) return -Math.abs(parsed);
    if (raw.startsWith("+")) return Math.abs(parsed);
    return parsed;
  };
  const displayMove = (value) => {
    const raw = String(value ?? "").trim();
    const match = raw.match(/[-+]?\d[\d,]*(?:\.\d+)?\s*(?:bp|%)/i);
    return match ? match[0].replace(/\s+/g, "") : raw;
  };
  const tableRows = (note, id) => {
    const table = (note.market_tables || []).find((item) => item && item.id === id);
    return Array.isArray(table?.rows) ? table.rows : [];
  };
  const rowByLabel = (note, tableId, label) => {
    const target = normalize(label);
    return tableRows(note, tableId).find((row) => normalize(row?.label) === target);
  };
  const fxNavPositionView = (note, lang) => {
    let label = "DXY";
    let row = rowByLabel(note, "cross_asset", label);
    let move = parseSignedMove(row?.change);
    if (move == null) {
      label = "USD/TWD";
      row = rowByLabel(note, "cross_asset", label);
      move = parseSignedMove(row?.change);
    }
    if (move == null) return lang === "en" ? "FX / NAV split" : "FX / NAV 拆分";
    const marker = `${label} ${displayMove(row?.change)}`.trim();
    if (move >= 0.1) return lang === "en" ? `${marker} supports NAV FX` : `${marker} 支撐 NAV FX`;
    if (move <= -0.1) return lang === "en" ? `${marker} trims NAV FX` : `${marker} 削弱 NAV FX`;
    return lang === "en" ? `${marker} leaves FX neutral` : `${marker} 使 FX 中性`;
  };
  const normalizedPositioningForSearch = (note, lang) => (note.positioning || []).map((row) => {
    const label = normalize(row?.label);
    if (!["fx / nav", "fx/nav", "fx"].includes(label)) return row;
    return { ...row, view: fxNavPositionView(note, lang) };
  });
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
  const reportLabelForDate = (date) => {
    const item = state.manifest.find((entry) => entry.date === date);
    return item?.label || (date ? `${date} close` : "");
  };
  const monthLabel = (monthKey) => {
    const [year, month] = monthKey.split("-").map((part) => Number(part));
    const date = new Date(year, month - 1, 1);
    if (state.language === "en") {
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
    return `${year}-${String(month).padStart(2, "0")}`;
  };
  const dateDayTitle = (item) => {
    if (!item) return "";
    const headline = state.language === "en" ? item.headlinePrimaryEn || item.headlinePrimary : item.headlinePrimary;
    return [item.label || item.date, headline].filter(Boolean).join(" - ");
  };
  const buildDateGridHtml = () => {
    const byDate = new Map(state.manifest.map((item) => [item.date, item]));
    const months = Array.from(new Set(state.manifest.map((item) => item.date.slice(0, 7)))).sort().reverse();
    const weekdays = state.language === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["一", "二", "三", "四", "五", "六", "日"];
    return months.map((monthKey) => {
      const [year, month] = monthKey.split("-").map((part) => Number(part));
      const first = new Date(year, month - 1, 1);
      const leading = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month, 0).getDate();
      const blanks = Array.from({ length: leading }, () => '<span class="date-day is-pad" aria-hidden="true"></span>');
      const days = Array.from({ length: daysInMonth }, (_unused, index) => {
        const day = index + 1;
        const date = `${monthKey}-${String(day).padStart(2, "0")}`;
        const item = byDate.get(date);
        if (!item) return `<span class="date-day is-disabled" aria-disabled="true">${day}</span>`;
        const current = date === currentDate ? " is-current" : "";
        return `<a class="date-day${current}" href="${escapeHtml(hrefForDate(date, state.language))}" data-report-date="${escapeHtml(date)}" title="${escapeHtml(dateDayTitle(item))}">${day}</a>`;
      });
      return `<section class="date-month"><h3 class="date-month-title">${escapeHtml(monthLabel(monthKey))}</h3>` +
        `<div class="date-weekdays">${weekdays.map((day) => `<span>${escapeHtml(day)}</span>`).join("")}</div>` +
        `<div class="date-days">${blanks.concat(days).join("")}</div></section>`;
    }).join("");
  };
  const cssEscape = (value) => {
    const raw = String(value || "");
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(raw);
    return raw.replace(/["\\]/g, "\\$&");
  };
  const hashElementExists = (id) => Boolean(
    document.getElementById(id) ||
    document.querySelector(`[data-search-section="${cssEscape(id)}"], [data-search-parent="${cssEscape(id)}"]`)
  );
  const normalizedHashForLanguage = (hash, lang = state.language) => {
    const clean = String(hash || "").replace(/^#/, "");
    if (!clean) return "";
    if (lang === "en") {
      if (clean.startsWith("en-")) return clean;
      const candidate = `en-${clean}`;
      return hashElementExists(candidate) ? candidate : clean;
    }
    if (clean.startsWith("en-")) {
      const candidate = clean.replace(/^en-/, "");
      return hashElementExists(candidate) ? candidate : clean;
    }
    return clean;
  };
  const normalizeLocationHashForLanguage = () => {
    const clean = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    const normalized = normalizedHashForLanguage(clean, state.language);
    if (clean && normalized && normalized !== clean) {
      history.replaceState(null, "", `${location.pathname}${location.search}#${encodeURIComponent(normalized)}`);
    }
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
        if (key === "driver" && String(item || "").trim() === String(title || "").trim()) return;
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
  const contextTokens = (text) => {
    const source = String(text || "").toLowerCase();
    const matches = source.match(/[a-z][a-z0-9/&.-]*|\\d+(?:\\.\\d+)?%?|[\\u4e00-\\u9fff]{2,}/g) || [];
    return Array.from(new Set(matches.filter((token) => token.length >= 2)));
  };
  const paragraphScore = (tokens, paragraph) => {
    const text = String(paragraph || "").toLowerCase();
    if (!text || !tokens.length) return 0;
    return tokens.reduce((score, token) => {
      if (!text.includes(token)) return score;
      return score + (/\d|usd\/twd|2s10s|5s30s|10s30s|wti|dxy|boj|fomc|jolts|hyg|非農|初領/i.test(token) ? 3 : 1);
    }, 0);
  };
  const contextualAnalysisTarget = (note, contextText, fallbackSection) => {
    const tokens = contextTokens(contextText);
    let bestSection = "";
    let bestIndex = 0;
    let bestScore = 0;
    for (const section of note.sections || []) {
      const sectionId = `${String(fallbackSection || "").startsWith("en-") ? "en-" : ""}analysis-${slug(section.id || "section")}`;
      (section.paragraphs || []).forEach((paragraph, index) => {
        const score = paragraphScore(tokens, paragraph);
        if (score > bestScore) {
          bestSection = sectionId;
          bestIndex = index + 1;
          bestScore = score;
        }
      });
    }
    return bestScore >= 3 && bestSection ? `${bestSection}-p${bestIndex}` : fallbackSection;
  };
  const flattenSummarySignals = (values, note, fallbackSection, fallbackTitle, rows) => {
    const items = Array.isArray(values) ? values.flat(Infinity) : [values];
    items.forEach((value) => {
      if (typeof value !== "string" && typeof value !== "number") {
        flatten(value, fallbackSection, fallbackTitle, rows);
        return;
      }
      const text = String(value || "").trim();
      if (!text) return;
      const target = contextualAnalysisTarget(note, text, fallbackSection);
      rows.push({ section: target, title: fallbackTitle, text });
    });
  };

  const addNoteRows = (rows, item, note, lang) => {
    const before = rows.length;
    const prefix = lang === "en" ? "en-" : "";
    const headline = note.headline || {};
    flattenSummarySignals(
      [headline.primary, headline.secondary, note.summary],
      note,
      prefix + "overview",
      lang === "en" ? "Overview" : "今日盤勢",
      rows
    );
    flatten(note.regime_strip, prefix + "overview", "Regime", rows);
    flatten(normalizedPositioningForSearch(note, lang), prefix + "overview", lang === "en" ? "Positioning" : "配置重點", rows);
    flatten(note.driver_decomposition, prefix + "drivers", lang === "en" ? "Market Drivers" : "市場驅動", rows);
    flatten(note.monitor_blocks, prefix + "risk-monitor", lang === "en" ? "Risk Monitor" : "風險監控", rows);
    flatten(note.market_tables, prefix + "appendix", lang === "en" ? "Reference Data" : "參考數據", rows);
    for (const section of note.sections || []) {
      const sectionId = prefix + "analysis-" + slug(section.id || "section");
      const sectionTitle = section.title || (lang === "en" ? "Investment Read" : "投資解讀");
      flatten([section.title, section.takeaway], sectionId, sectionTitle, rows);
      (section.paragraphs || []).forEach((paragraph, index) => {
        flatten(
          paragraph,
          `${sectionId}-p${index + 1}`,
          `${sectionTitle} #${index + 1}`,
          rows
        );
      });
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
  const sectionFamilyLabel = (section, lang) => {
    const clean = navBaseFromId(String(section || ""));
    const zh = {
      overview: "總覽",
      positioning: "配置",
      rates: "利率",
      drivers: "驅動",
      "risk-monitor": "風險",
      "cross-asset": "跨資產",
      "investment-read": "正文",
      appendix: "附錄",
    };
    const en = {
      overview: "Overview",
      positioning: "Positioning",
      rates: "Rates",
      drivers: "Drivers",
      "risk-monitor": "Risk",
      "cross-asset": "Cross Asset",
      "investment-read": "Read",
      appendix: "Appendix",
    };
    return (lang === "en" ? en : zh)[clean] || (lang === "en" ? "Report" : "報告");
  };
	  const effectiveSearchQuery = (value) => {
	    const query = String(value || "").trim();
	    return query.length >= MIN_SEARCH_CHARS ? query : "";
	  };
	  const updateSearchUiState = (value) => {
	    const rawQuery = String(value || "").trim();
	    const effectiveQuery = effectiveSearchQuery(rawQuery);
	    if (rawQuery) revealTools();
	    bar.dataset.searchActive = rawQuery ? "true" : "false";
	    bar.dataset.searchResultsActive = effectiveQuery ? "true" : "false";
	    if (clearButton) clearButton.hidden = !rawQuery;
	  };

	  const renderResults = (query) => {
	    state.query = query.trim();
	    resultsEl.classList.remove("is-collapsed");
	    if (!effectiveSearchQuery(state.query)) {
	      resultsEl.hidden = true;
	      resultsEl.innerHTML = "";
	      clearHighlights();
      return;
    }
    const sameLanguageFirst = (row) => row.lang === state.language ? 0 : 1;
    const matches = state.index
      .filter((row) => row.lang === state.language && row.haystack.includes(normalize(state.query)))
      .sort((a, b) => sameLanguageFirst(a) - sameLanguageFirst(b));
    resultsEl.hidden = false;
    if (!matches.length) {
      resultsEl.innerHTML = `<div class="search-empty">${state.language === "en" ? "No matching report passages" : "沒有找到符合的報告段落"}</div>`;
      return;
    }
    if (state.resultsCollapsed) {
      resultsEl.classList.add("is-collapsed");
      const label = state.language === "en"
        ? `${matches.length} matches for ${state.query}`
        : `${matches.length} 個「${state.query}」相關段落`;
      const action = state.language === "en" ? "Show" : "顯示";
      resultsEl.innerHTML = `<div class="search-count">${escapeHtml(label)}<button type="button" data-expand-search-results>${escapeHtml(action)}</button></div>`;
      return;
    }
    const compactLimit = window.innerWidth < 768 ? 2 : window.innerWidth < 1200 ? 3 : 6;
    const expandedLimit = window.innerWidth < 768 ? 4 : window.innerWidth < 1200 ? 5 : 10;
    const limit = state.searchExpanded ? expandedLimit : compactLimit;
    const visibleMatches = matches.slice(0, limit);
    const countLabel = state.language === "en"
      ? `${matches.length} matching passages${visibleMatches.length < matches.length ? `, showing ${visibleMatches.length}` : ""}`
      : `${matches.length} 個相關段落${visibleMatches.length < matches.length ? `，顯示前 ${visibleMatches.length} 筆` : ""}`;
    const moreLabel = state.language === "en" ? "Show more" : "顯示更多";
    const canShowMore = visibleMatches.length < matches.length && !state.searchExpanded;
    resultsEl.innerHTML = [
      `<div class="search-count"><span>${escapeHtml(countLabel)}</span>${canShowMore ? `<button type="button" data-show-all-results>${escapeHtml(moreLabel)}</button>` : ""}</div>`,
      ...visibleMatches.map((row) => {
        const baseHref = hrefForDate(row.date, row.lang || "zh");
        const joiner = baseHref.includes("?") ? "&" : "?";
        const langParam = baseHref.includes("lang=") ? "" : `&lang=${encodeURIComponent(row.lang || "zh")}`;
        const href = `${baseHref}${joiner}q=${encodeURIComponent(state.query)}${langParam}#${encodeURIComponent(row.section || "overview")}`;
        const langLabel = row.lang === "en" ? "EN" : "中文";
        const titleLabel = row.title || (state.language === "en" ? "Passage" : "段落");
        const familyLabel = sectionFamilyLabel(row.section, row.lang || "zh");
        return `<a class="search-result" href="${escapeHtml(href)}">` +
          `<span class="search-result-meta"><span class="search-date">${escapeHtml(row.date)}</span><span class="search-section">${escapeHtml(familyLabel)} / ${escapeHtml(titleLabel)}</span><span class="search-lang">${escapeHtml(langLabel)}</span></span>\n` +
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

  const isVisibleElement = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };

  const clearJumpHighlight = () => {
    document.querySelectorAll(".jump-highlight").forEach((el) => {
      el.classList.remove("jump-highlight");
      delete el.dataset.currentMatchLabel;
      if (el.dataset.jumpTabindex === "temporary") {
        el.removeAttribute("tabindex");
        delete el.dataset.jumpTabindex;
      }
    });
  };

  const highlightHashTarget = (target) => {
    clearJumpHighlight();
    if (!target) return;
    const isParagraphTarget = target.classList.contains("analysis-paragraph") || /-p\d+(?:-mobile)?$/.test(target.id || target.dataset.searchSection || "");
    const highlightTarget =
      isParagraphTarget
        ? target
        : (
          target.closest(".analysis-card") ||
          target.closest("details") ||
          target.closest(".reference-table") ||
          target
        );
    const hasSearchQuery = Boolean(effectiveSearchQuery(state.query || input.value.trim()));
    if (hasSearchQuery) {
      highlightTarget.dataset.currentMatchLabel = state.language === "en" ? "Current match" : "目前命中段落";
    } else {
      delete highlightTarget.dataset.currentMatchLabel;
    }
    highlightTarget.classList.add("jump-highlight");
    if (!highlightTarget.hasAttribute("tabindex")) {
      highlightTarget.setAttribute("tabindex", "-1");
      highlightTarget.dataset.jumpTabindex = "temporary";
    }
    try {
      highlightTarget.focus({ preventScroll: true });
    } catch {}
  };

  const stickyOffset = () => {
    updateToolMetrics();
    const cssOffset = Number(getComputedStyle(document.documentElement).getPropertyValue("--sticky-offset").replace("px", "").trim());
    if (Number.isFinite(cssOffset) && cssOffset > 0) return cssOffset;
    if (window.innerWidth >= 1400) return 88;
    if (!toolsEl) return window.innerWidth < 768 ? 156 : 132;
    const rect = toolsEl.getBoundingClientRect();
    const hidden = toolsEl.classList.contains("is-hidden") || rect.bottom <= 0;
    if (window.innerWidth < 768) return hidden ? 18 : Math.ceil(rect.height + 12);
    if (window.innerWidth < 1200) return Math.ceil(rect.height + 18);
    return 24;
  };

  const scrollToHashTarget = () => {
    normalizeLocationHashForLanguage();
    const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (!hash) return;
    const activePanel = document.querySelector(`[data-lang-panel="${state.language}"]`);
    const scope = activePanel || document;
    const candidates = [];
    const byId = document.getElementById(hash);
    if (byId) candidates.push(byId);
    const byMobileId = document.getElementById(`${hash}-mobile`);
    if (byMobileId) candidates.push(byMobileId);
    scope.querySelectorAll("[data-search-section], [data-search-parent]").forEach((el) => {
      if (el.tagName === "A") return;
      if (el.dataset.searchSection === hash || el.dataset.searchParent === hash) candidates.push(el);
    });
    let target = candidates.find(isVisibleElement);
    if (!target) {
      const hiddenInDetails = candidates.find((el) => el.closest("details"));
      const details = hiddenInDetails?.closest("details");
      if (details) {
        details.open = true;
        target = candidates.find(isVisibleElement) || hiddenInDetails;
      }
    }
    if (!target) return;
    const details = target.closest("details");
    if (details) details.open = true;
    const y = target.getBoundingClientRect().top + window.scrollY - stickyOffset();
    window.scrollTo(0, Math.max(0, y));
    highlightHashTarget(target);
  };

  const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactMatchRanges = (text, query) => {
    const ranges = [];
    const regex = new RegExp(escapeRegExp(query), "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      ranges.push([match.index, match.index + match[0].length]);
      if (match[0].length === 0) regex.lastIndex += 1;
    }
    return ranges;
  };
  const normalizedFallbackRange = (text, query) => {
    const idx = normalize(text).indexOf(normalize(query));
    return idx >= 0 ? [[idx, Math.min(text.length, idx + query.length)]] : [];
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
        const exactRanges = exactMatchRanges(text, query);
        const ranges = exactRanges.length ? exactRanges : normalizedFallbackRange(text, query);
        if (!ranges.length) continue;
        const frag = document.createDocumentFragment();
        let cursor = 0;
        for (const [start, end] of ranges) {
          if (start < cursor) continue;
          frag.append(text.slice(cursor, start));
          const mark = document.createElement("mark");
          mark.className = "search-hit";
          mark.textContent = text.slice(start, end);
          frag.append(mark);
          cursor = end;
        }
        frag.append(text.slice(cursor));
        node.replaceWith(frag);
      }
    }
    const first = document.querySelector("mark.search-hit");
    if (first && !location.hash) first.scrollIntoView({ block: "center" });
    if (location.hash) scrollToHashTarget();
  };

  const hydrateDateSelect = () => {
    const options = state.manifest.map((item) => {
      const selected = item.date === currentDate ? " selected" : "";
      return `<option value="${escapeHtml(item.date)}"${selected}>${escapeHtml(item.label || item.date)}</option>`;
    }).join("");
    dateSelects.forEach((select) => {
      select.innerHTML = options;
      select.onchange = () => {
        if (select.value) location.href = hrefForDate(select.value, state.language);
      };
    });
    dateCurrentLabels.forEach((label) => {
      label.textContent = reportLabelForDate(currentDate) || (state.language === "en" ? "Choose date" : "選擇日期");
    });
    const gridHtml = buildDateGridHtml();
    dateGridHosts.forEach((host) => { host.innerHTML = gridHtml; });
  };

  const syncQuery = (query) => {
    const params = new URLSearchParams(location.search);
    if (query) params.set("q", query); else params.delete("q");
    if (state.language === "en") params.set("lang", "en"); else params.delete("lang");
    const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
    history.replaceState(null, "", next);
  };

  const navTargetForBase = (base, lang) => {
    const clean = base || "overview";
    if (clean === "risk-monitor" && window.matchMedia("(min-width: 1400px)").matches) {
      return lang === "en" ? "en-risk-monitor-rail" : "risk-monitor-rail";
    }
    return lang === "en" ? `en-${clean}` : clean;
  };

  const syncNavForLanguage = () => {
    const lang = state.language;
    navLinks.forEach((link) => {
      const base = link.dataset.sectionBase || "overview";
      const section = navTargetForBase(base, lang);
      link.setAttribute("href", `#${section}`);
      const strong = link.querySelector("strong");
      const span = link.querySelector("span");
      if (strong) strong.textContent = link.dataset[`label${lang === "en" ? "En" : "Zh"}`] || strong.textContent;
      if (span) span.textContent = link.dataset[`caption${lang === "en" ? "En" : "Zh"}`] || span.textContent;
    });
  };

  const navBaseFromId = (id) => {
    const clean = String(id || "").replace(/^en-/, "");
    if (!clean) return "";
    if (clean.startsWith("analysis-")) return "investment-read";
    if (clean === "risk-monitor-rail") return "risk-monitor";
    if (["overview", "positioning", "rates", "drivers", "risk-monitor", "cross-asset", "investment-read", "appendix"].includes(clean)) return clean;
    return "";
  };

  const centerActiveNavChip = (active) => {
    if (!active || window.innerWidth >= 1200) return;
    const nav = active.closest(".section-nav");
    if (!nav) return;
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const nextLeft = nav.scrollLeft + (activeRect.left - navRect.left) - ((nav.clientWidth - activeRect.width) / 2);
    nav.scrollTo({ left: Math.max(0, nextLeft), behavior: "auto" });
  };

  const setActiveNav = (base, { centerChip = false } = {}) => {
    if (!base) return;
    navLinks.forEach((link) => {
      link.classList.toggle("is-current", link.dataset.sectionBase === base);
    });
    const active = navLinks.find((link) => link.dataset.sectionBase === base);
    if (centerChip) centerActiveNavChip(active);
  };

  const syncActiveNavFromHash = () => {
    const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    setActiveNav(navBaseFromId(hash), { centerChip: true });
  };

  const syncActiveNavFromScroll = () => {
    const activePanel = document.querySelector(`[data-lang-panel="${state.language}"]`);
    if (!activePanel) return;
    const offset = window.innerWidth < 768 ? 168 : window.innerWidth < 1200 ? 142 : 92;
    const sections = Array.from(activePanel.querySelectorAll(".task-section"))
      .filter((section) => section.getBoundingClientRect().height > 20);
    let current = "";
    for (const section of sections) {
      if (section.getBoundingClientRect().top - offset <= 0) {
        current = section.dataset.sectionBase || navBaseFromId(section.id);
      }
    }
    setActiveNav(current || navBaseFromId(sections[0]?.id));
  };

  const syncStaticTextForLanguage = () => {
    const lang = state.language;
    const titleKey = lang === "en" ? "titleEn" : "titleZh";
    if (rootEl.dataset[titleKey]) document.title = rootEl.dataset[titleKey];
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
    langPanels.forEach((panel) => {
      const active = panel.dataset.langPanel === state.language;
      panel.hidden = !active;
      panel.toggleAttribute("inert", !active);
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
    langButtons.forEach((button) => {
      const active = button.dataset.langButton === state.language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
	    input.placeholder = state.language === "en" ? input.dataset.placeholderEn : input.dataset.placeholderZh;
    localStorage.setItem("daily-fi-language", state.language);
    syncNavForLanguage();
    syncStaticTextForLanguage();
    if (state.manifest.length) hydrateDateSelect();
	    updateSearchUiState(state.query || input.value.trim());
	    if (state.query || input.value.trim()) renderResults(state.query || input.value.trim());
	    if (updateUrl) syncQuery(effectiveSearchQuery(state.query || input.value.trim()));
	    normalizeLocationHashForLanguage();
	    highlightPage(effectiveSearchQuery(state.query || input.value.trim()));
    syncActiveNavFromHash();
    syncActiveNavFromScroll();
  };

	  const runSearch = debounce((value) => {
	    state.searchExpanded = false;
	    state.resultsCollapsed = false;
	    updateSearchUiState(value);
	    renderResults(value);
	    highlightPage(effectiveSearchQuery(value));
	    syncQuery(effectiveSearchQuery(value));
	  });

	  const setupMobileTools = () => {
	    if (!toolsEl) return;
	    const compactToolsQuery = window.matchMedia("(max-width: 1199px)");
	    let lastY = window.scrollY;
	    let ticking = false;
	    const isDateMenuOpen = () => dateMenus.some((menu) => menu.open);
	    const isSearchOpen = () => Boolean(effectiveSearchQuery(input.value) && !resultsEl.hidden);
	    const activeField = () => {
	      const active = document.activeElement;
	      if (!active || !bar.contains(active)) return null;
	      return active.matches("input, textarea, select") || active.isContentEditable ? active : null;
	    };
	    const isUsingTools = () => {
	      return Boolean(activeField()) || isDateMenuOpen() || isSearchOpen();
	    };
	    const showTools = () => {
	      revealTools();
	    };
	    const hideTools = () => {
	      if (window.scrollY > 96 && !isUsingTools()) {
	        toolsEl.classList.add("is-hidden");
	        toolsEl.setAttribute("data-tools-hidden", "true");
	        updateToolMetrics();
	      }
	    };
	    const sync = () => {
	      if (!compactToolsQuery.matches) {
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
	    window.addEventListener("resize", () => {
	      syncNavForLanguage();
	      updateToolMetrics();
	      sync();
	    });
	    bar.addEventListener("focusin", showTools);
	    if ("ResizeObserver" in window) {
	      const observer = new ResizeObserver(updateToolMetrics);
	      observer.observe(toolsEl);
	      observer.observe(bar);
	    }
	    resultsEl.addEventListener("click", showTools);
	    document.querySelectorAll(".section-nav a").forEach((link) => {
	      link.addEventListener("click", () => {
	        showTools();
	        setTimeout(hideTools, 260);
	      });
	    });
	    sync();
	    updateToolMetrics();
	  };

  const setupContextLinks = () => {
    const activateCard = (card) => {
      if (!card) return;
      card.classList.add("is-card-active");
      window.setTimeout(() => card.classList.remove("is-card-active"), 1600);
    };
    const navigateHash = (href) => {
      if (!href || !href.startsWith("#")) return;
      const activeBase = navBaseFromId(decodeURIComponent(href.replace(/^#/, "")));
      history.pushState(null, "", href);
      syncActiveNavFromHash();
      scrollToHashTarget();
      if (activeBase) window.setTimeout(() => setActiveNav(activeBase, { centerChip: true }), 80);
    };
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"][data-search-section], a[href^="#"][data-nav-link]');
      if (link) {
        const href = link.getAttribute("href") || "";
        if (!href.startsWith("#")) return;
        event.preventDefault();
        navigateHash(href);
        return;
      }
      if (event.target.closest(".card-detail, summary")) return;
      const card = event.target.closest("[data-card-href]");
      if (!card) return;
      event.preventDefault();
      activateCard(card);
      navigateHash(card.dataset.cardHref || "");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-card-href]");
      if (!card || event.target.closest("input, select, textarea, button, a, summary, .card-detail")) return;
      event.preventDefault();
      activateCard(card);
      navigateHash(card.dataset.cardHref || "");
    });
  };

  const setupScrollReveal = () => {
    const cards = Array.from(document.querySelectorAll("[data-animate-card]"));
    if (!cards.length) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      cards.forEach((card) => card.classList.add("is-revealed"));
      return;
    }
    document.documentElement.classList.add("has-scroll-reveal");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    cards.forEach((card, index) => {
      card.style.transitionDelay = `${Math.min(index % 6, 5) * 24}ms`;
      observer.observe(card);
    });
  };

  const setupActiveNav = () => {
    let ticking = false;
    const sync = () => syncActiveNavFromScroll();
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        sync();
        ticking = false;
      });
    }, { passive: true });
    window.addEventListener("resize", () => {
      syncNavForLanguage();
      sync();
    });
    window.addEventListener("hashchange", () => {
      syncActiveNavFromHash();
      scrollToHashTarget();
    });
    if (location.hash) syncActiveNavFromHash();
    else sync();
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
	        state.resultsCollapsed = Boolean(location.hash && sessionStorage.getItem("daily-fi-collapse-search") === "1");
	        sessionStorage.removeItem("daily-fi-collapse-search");
	        input.value = initialQuery;
	        updateSearchUiState(initialQuery);
	        renderResults(initialQuery);
	        highlightPage(effectiveSearchQuery(initialQuery));
	      } else {
	        updateSearchUiState("");
	        resultsEl.hidden = true;
	      }
      setupActiveNav();
      if (!initialQuery && location.hash) window.setTimeout(scrollToHashTarget, 0);
    } catch {
      dateSelect.innerHTML = '<option value="">日期載入失敗</option>';
      resultsEl.hidden = false;
      resultsEl.innerHTML = '<div class="search-empty">搜尋資料載入失敗</div>';
    }
  };

	  input.addEventListener("input", () => {
	    updateSearchUiState(input.value);
	    runSearch(input.value);
	  });
  resultsEl.addEventListener("click", (event) => {
    const expand = event.target.closest("[data-show-all-results], [data-expand-search-results]");
    if (expand) {
      event.preventDefault();
      state.searchExpanded = true;
      state.resultsCollapsed = false;
      renderResults(state.query || input.value.trim());
      return;
    }
    const resultLink = event.target.closest(".search-result");
    if (resultLink) {
      state.resultsCollapsed = true;
      sessionStorage.setItem("daily-fi-collapse-search", "1");
    }
  });
	  clearButton.addEventListener("click", () => {
	    input.value = "";
	    state.searchExpanded = false;
	    state.resultsCollapsed = false;
	    updateSearchUiState("");
	    renderResults("");
	    syncQuery("");
    input.focus();
  });
  langButtons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.langButton || "zh"));
  });
  document.addEventListener("click", (event) => {
    dateMenus.forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  setLanguage(state.language, { updateUrl: false });
  setupMobileTools();
  setupContextLinks();
  setupScrollReveal();
  init();
})();
