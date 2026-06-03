(() => {
  const root = document.body;
  if (!root) return;

  const searchInput = document.querySelector("[data-search-status]") ? document.getElementById("report-search") : null;
  const searchStatus = document.querySelector("[data-search-status]");
  const clearButton = document.querySelector('[data-action="clear-search"]');
  const filterItems = Array.from(document.querySelectorAll("[data-filter-item]"));
  const focusButtons = Array.from(document.querySelectorAll("[data-focus-button]"));
  const densityButtons = Array.from(document.querySelectorAll("[data-density-button]"));
  const reportSections = Array.from(document.querySelectorAll("[data-report-section]"));
  const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
  const backToTop = document.querySelector("[data-back-to-top]");
  const referenceTabs = Array.from(document.querySelectorAll("[data-reference-tab]"));
  const focusState = { topic: "all", query: "" };

  const normalize = (value) => (value || "").toLowerCase().trim();

  const updateStatus = (matches) => {
    if (!searchStatus) return;
    if (focusState.query) {
      searchStatus.textContent = `找到 ${matches} 個相關區塊。`;
      return;
    }
    if (focusState.topic !== "all") {
      const active = focusButtons.find((button) => button.dataset.focusButton === focusState.topic);
      searchStatus.textContent = `目前聚焦：${active ? active.textContent : focusState.topic}`;
      return;
    }
    searchStatus.textContent = "可搜尋標題、解讀、關鍵價位與事件。";
  };

  if (navLinks.length) {
    navLinks.forEach((link, index) => link.classList.toggle("is-active", index === 0));
  }

  const applyFilters = () => {
    const query = normalize(focusState.query);
    let matches = 0;

    filterItems.forEach((item) => {
      const text = normalize(item.textContent);
      const topics = (item.dataset.focus || "").split(/\s+/).filter(Boolean);
      const topicMatch = focusState.topic === "all" || topics.includes(focusState.topic);
      const queryMatch = !query || text.includes(query);
      const visible = topicMatch && queryMatch;
      item.classList.toggle("is-hidden", !visible);
      item.classList.toggle("has-match", visible && !!query);
      if (visible) matches += 1;
    });

    reportSections.forEach((section) => {
      const visibleChildren = section.querySelector("[data-filter-item]:not(.is-hidden)");
      section.classList.toggle("is-hidden", !visibleChildren && section.id !== "overview");
    });

    focusButtons.forEach((button) => {
      const active = button.dataset.focusButton === focusState.topic;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    updateStatus(matches);
  };

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      focusState.query = searchInput.value;
      applyFilters();
    });
  }

  if (clearButton && searchInput) {
    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      focusState.query = "";
      applyFilters();
      searchInput.focus();
    });
  }

  focusButtons.forEach((button) => {
    button.addEventListener("click", () => {
      focusState.topic = button.dataset.focusButton || "all";
      applyFilters();
    });
  });

  densityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const density = button.dataset.densityButton || "comfortable";
      root.dataset.density = density;
      densityButtons.forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      try {
        localStorage.setItem("daily-fi-density", density);
      } catch (_error) {}
    });
  });

  try {
    const savedDensity = localStorage.getItem("daily-fi-density");
    if (savedDensity === "compact") {
      root.dataset.density = "compact";
      densityButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.densityButton === "compact"));
      });
    } else {
      root.dataset.density = "comfortable";
    }
  } catch (_error) {
    root.dataset.density = "comfortable";
  }

  referenceTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const panelId = tab.dataset.referenceTab;
      referenceTabs.forEach((candidate) => {
        const active = candidate === tab;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".reference-table[role='tabpanel']").forEach((panel) => {
        panel.hidden = panel.id !== panelId;
        panel.classList.toggle("is-active", panel.id === panelId);
      });
    });
  });

  if ("IntersectionObserver" in window && navLinks.length) {
    const navMap = new Map(navLinks.map((link) => [link.dataset.navLink, link]));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.navLink === visible.target.id));
    }, { rootMargin: "-15% 0px -60% 0px", threshold: [0.2, 0.45, 0.7] });
    reportSections.forEach((section) => {
      if (navMap.has(section.id)) observer.observe(section);
    });
  }

  if (backToTop) {
    const syncBackToTop = () => {
      backToTop.classList.toggle("is-visible", window.scrollY > 520);
    };
    backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", syncBackToTop, { passive: true });
    syncBackToTop();
  }

  applyFilters();
})();
