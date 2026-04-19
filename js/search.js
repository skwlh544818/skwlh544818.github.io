/**
 * Letters Theme — Client-side Search
 *
 * Reads from window.__SEARCH_DATA__ (injected by the blog engine).
 * Each entry: { title: string, url: string, content: string, tags: string[], date: string }
 *
 * Features:
 *  - Fuzzy matching against title, content, and tags
 *  - Chinese character support (no word-boundary assumptions)
 *  - Keyboard shortcuts: Ctrl+K / Cmd+K to open, Escape to close
 *  - Debounced input (300 ms)
 *  - Highlighted matching terms in results
 *  - Maximum 20 results
 */

(function () {
  "use strict";

  /* ---------- DOM references ---------- */
  const overlay = document.querySelector(".search-overlay");
  const input = document.querySelector(".search-input");
  const resultsContainer = document.querySelector(".search-results");
  const openButtons = document.querySelectorAll("[data-search-open]");
  const closeButton = document.querySelector(".search-close");

  if (!overlay || !input || !resultsContainer) return;

  /* ---------- State ---------- */
  const MAX_RESULTS = 20;
  const DEBOUNCE_MS = 300;
  const SNIPPET_RADIUS = 60; // chars around the first match in content
  let debounceTimer = null;
  let searchData = [];
  let isOpen = false;

  /* ---------- Initialise data ---------- */
  function init() {
    if (Array.isArray(window.__SEARCH_DATA__)) {
      searchData = window.__SEARCH_DATA__.map(function (item) {
        return {
          title: item.title || "",
          url: item.url || "",
          content: item.content || "",
          tags: Array.isArray(item.tags) ? item.tags : [],
          date: item.date || "",
          // Pre-compute lower-case versions for faster matching
          _title: (item.title || "").toLowerCase(),
          _content: (item.content || "").toLowerCase(),
          _tags: (Array.isArray(item.tags) ? item.tags : [])
            .join(" ")
            .toLowerCase(),
        };
      });
    }
  }

  /* ---------- Open / Close ---------- */
  function open() {
    if (isOpen) return;
    isOpen = true;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    // Small delay so the CSS transition finishes before we focus
    requestAnimationFrame(function () {
      input.focus();
    });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    input.value = "";
    resultsContainer.innerHTML = "";
  }

  /* ---------- Fuzzy search ---------- */
  function search(query) {
    if (!query || query.trim().length === 0) {
      resultsContainer.innerHTML = "";
      return;
    }

    var terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(function (t) {
        return t.length > 0;
      });

    if (terms.length === 0) {
      resultsContainer.innerHTML = "";
      return;
    }

    // Score each item. Higher is better.
    var scored = [];
    for (var i = 0; i < searchData.length; i++) {
      var item = searchData[i];
      var score = 0;

      for (var j = 0; j < terms.length; j++) {
        var term = terms[j];
        // Title match (highest weight)
        if (item._title.indexOf(term) !== -1) {
          score += 10;
        }
        // Tag match
        if (item._tags.indexOf(term) !== -1) {
          score += 5;
        }
        // Content match
        if (item._content.indexOf(term) !== -1) {
          score += 1;
        }
      }

      if (score > 0) {
        scored.push({ item: item, score: score });
      }
    }

    // Sort descending by score, then by date descending
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.item.date > a.item.date ? 1 : -1;
    });

    var results = scored.slice(0, MAX_RESULTS);
    renderResults(results, terms);
  }

  /* ---------- Highlight helper ---------- */
  function escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightTerms(text, terms) {
    var escaped = escapeHTML(text);
    for (var i = 0; i < terms.length; i++) {
      var safeterm = escapeHTML(escapeRegExp(terms[i]));
      // Use 'gi' flag — works with CJK characters since we aren't using \b
      var re = new RegExp("(" + safeterm + ")", "gi");
      escaped = escaped.replace(re, "<mark>$1</mark>");
    }
    return escaped;
  }

  /* ---------- Build snippet around first match in content ---------- */
  function buildSnippet(content, terms) {
    var lower = content.toLowerCase();
    var firstIndex = -1;

    for (var i = 0; i < terms.length; i++) {
      var idx = lower.indexOf(terms[i]);
      if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
        firstIndex = idx;
      }
    }

    if (firstIndex === -1) {
      // Fallback: return beginning
      return content.substring(0, SNIPPET_RADIUS * 2);
    }

    var start = Math.max(0, firstIndex - SNIPPET_RADIUS);
    var end = Math.min(content.length, firstIndex + SNIPPET_RADIUS);
    var snippet = "";
    if (start > 0) snippet += "...";
    snippet += content.substring(start, end);
    if (end < content.length) snippet += "...";
    return snippet;
  }

  /* ---------- Render ---------- */
  function renderResults(results, terms) {
    if (results.length === 0) {
      resultsContainer.innerHTML =
        '<div class="search-empty">' +
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>' +
        "</svg>" +
        "<p>No results found</p>" +
        "</div>";
      return;
    }

    var html = "";
    for (var i = 0; i < results.length; i++) {
      var r = results[i].item;
      var snippet = buildSnippet(r.content, terms);

      html +=
        '<a class="search-result-item" href="' +
        escapeHTML(r.url) +
        '">' +
        '<div class="search-result-title">' +
        highlightTerms(r.title, terms) +
        "</div>" +
        '<div class="search-result-snippet">' +
        highlightTerms(snippet, terms) +
        "</div>" +
        (r.date
          ? '<div class="search-result-date">' + escapeHTML(r.date) + "</div>"
          : "") +
        "</a>";
    }

    resultsContainer.innerHTML = html;
  }

  /* ---------- Debounced input handler ---------- */
  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      search(input.value);
    }, DEBOUNCE_MS);
  }

  /* ---------- Event listeners ---------- */

  // Open buttons (any element with data-search-open)
  openButtons.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      open();
    });
  });

  // Close button
  if (closeButton) {
    closeButton.addEventListener("click", close);
  }

  // Click on overlay background closes modal
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      close();
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    // Ctrl+K / Cmd+K — toggle search
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      if (isOpen) {
        close();
      } else {
        open();
      }
      return;
    }

    // Escape — close search
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      close();
    }
  });

  // Input
  input.addEventListener("input", onInput);

  // Prevent form submission if wrapped in a form
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Navigate to first result if available
      var firstResult = resultsContainer.querySelector(".search-result-item");
      if (firstResult) {
        window.location.href = firstResult.getAttribute("href");
      }
    }
  });

  /* ---------- Bootstrap ---------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
