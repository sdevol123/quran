'use strict';

const API_BASE = "https://api.quran.com/api/v4";
const AUDIO_CDN = "https://cdn.islamic.network/quran/audio/128/ar.muhammadayyoub";
const THEMES = {
  light: { label: "نهاري", scheme: "light" },
  dark: { label: "داكن", scheme: "dark" },
  midnight: { label: "ليلي", scheme: "dark" },
  desert: { label: "صحراوي", scheme: "light" },
};

      const state = {
        chapters: [],
        translationId: 20,
        currentChapter: null,
        currentVerses: [],
        currentVerseIndex: -1,
        autoAdvance: true,
        versePagination: { perPage: 20, currentPage: 1, hasMore: false },
        bookmarks: [],
        history: [],
        theme: "light",
        controllers: {
          verses: null,
          search: null,
          random: null,
        },
      };

      const safeListen = (id, event, handler) => {
        const node = el(id);
        if (node) node.addEventListener(event, handler);
        return node;
      };

      const el = (id) => document.getElementById(id);

      const statusMap = {
        chapters: el("statusChapters"),
        verses: el("statusVerses"),
        search: el("statusSearch"),
        random: el("statusRandom"),
      };

      async function apiRequest(path, { signal, params } = {}) {
        const url = new URL(`${API_BASE}${path}`);
        if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(url, { signal });
            if (!response.ok) {
              if ([409, 429, 500].includes(response.status) && attempt < 2) {
                await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
                continue;
              }
              throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
          } catch (error) {
            if (error.name === "AbortError") throw error;
            if (attempt === 2) throw error;
            await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
          }
        }
      }

      function updateStatus(key, ok = true, text = ok ? "جاهز" : "خطأ") {
        const target = statusMap[key];
        if (!target) return;
        target.classList.toggle("status-ok", ok);
        target.classList.toggle("status-bad", !ok);
        target.textContent = text;
      }

      function persistState() {
        const fontSize = getComputedStyle(document.documentElement)
          .getPropertyValue("--verse-font-size")
          .trim();
        localStorage.setItem(
          "quranSettings",
          JSON.stringify({
            translationId: state.translationId,
            theme: state.theme,
            bookmarks: state.bookmarks,
            history: state.history,
            fontSize,
            autoAdvance: state.autoAdvance,
          })
        );
      }

function restoreState() {
  const saved = JSON.parse(localStorage.getItem("quranSettings") || "{}");
  if (saved.translationId) state.translationId = saved.translationId;
  if (saved.theme && THEMES[saved.theme]) state.theme = saved.theme;
  if (saved.bookmarks) state.bookmarks = saved.bookmarks;
  if (saved.history) state.history = saved.history;
  if (typeof saved.autoAdvance === "boolean") state.autoAdvance = saved.autoAdvance;
  if (saved.fontSize) {
    document.documentElement.style.setProperty("--verse-font-size", saved.fontSize);
    el("fontSizeRange").value = parseFloat(saved.fontSize);
  }
  renderBookmarks();
  renderHistory();
  setTheme(state.theme, false);
}

function setTheme(mode, persist = true) {
  if (!THEMES[mode]) mode = "light";
  state.theme = mode;
  document.body.setAttribute("data-theme", mode);
  document.documentElement.style.setProperty("color-scheme", THEMES[mode].scheme);
  const themeSelect = el("themeSelect");
  if (themeSelect) themeSelect.value = mode;
  if (persist) persistState();
}

function populateThemes() {
  const select = el("themeSelect");
  if (!select) return;
  select.innerHTML = "";
  Object.entries(THEMES).forEach(([value, meta]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = meta.label;
    select.appendChild(option);
  });
}

      function renderChapters(list = state.chapters) {
        const container = el("chaptersContainer");
        container.innerHTML = "";
        if (!list.length) {
          container.innerHTML = '<div class="text-center text-muted">لا توجد نتائج.</div>';
          return;
        }
        list.forEach((chapter) => {
          const card = document.createElement("div");
          card.className = "col-sm-6 col-xl-4";
          card.innerHTML = `
            <div class="surah-card p-3 h-100 ${
              state.currentChapter?.id === chapter.id ? "active" : ""
            }" data-id="${chapter.id}">
              <div class="d-flex justify-content-between mb-2">
                <strong>${chapter.name_arabic}</strong>
                <span class="badge bg-primary">${chapter.verses_count}</span>
              </div>
              <div class="text-muted small">${chapter.name_simple}</div>
              <div class="text-muted small">${
                chapter.revelation_place === "Meccan" ? "مكية" : "مدنية"
              }</div>
            </div>`;
          card.querySelector(".surah-card").addEventListener("click", () => loadSurah(chapter.id));
          container.appendChild(card);
        });
      }

      function renderVerses(verses, append = false) {
        const container = el("versesContainer");
        if (!append) {
          container.innerHTML = "";
          state.currentVerses = [];
          state.currentVerseIndex = -1;
        }
        verses.forEach((verse) => {
          const card = document.createElement("div");
          card.className = "verse-card";
          card.dataset.verseKey = verse.verse_key;
          card.dataset.verseId = verse.id;
          card.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span class="badge bg-light text-dark">${state.currentChapter?.name_arabic} • ${
            verse.verse_key
          }</span>
              </div>
              <div class="btn-group btn-group-sm" role="group">
                <button class="btn btn-outline-primary" data-action="play">
                  <i class="bi bi-play-fill"></i>
                </button>
                <button class="btn btn-outline-secondary" data-action="copy">
                  <i class="bi bi-clipboard"></i>
                </button>
                <button class="btn btn-outline-warning" data-action="bookmark">
                  <i class="bi bi-bookmark"></i>
                </button>
                <button class="btn btn-outline-success" data-action="download" title="تحميل التلاوة">
                  <i class="bi bi-download"></i>
                </button>
              </div>
            </div>
            <p class="verse-text mb-2">${verse.text_uthmani}</p>
            <p class="text-muted small mb-0">${verse.translations?.[0]?.text || ""}</p>`;
          card.querySelectorAll("button").forEach((btn) =>
            btn.addEventListener("click", (event) => handleVerseAction(event, verse))
          );
          container.appendChild(card);
        });
        state.currentVerses = append
          ? [...state.currentVerses, ...verses]
          : [...verses];
        updatePlayingVerseStyles();
        updatePlayerControls();
      }

      function renderBookmarks() {
        const container = el("bookmarksContainer");
        container.innerHTML = "";
        if (!state.bookmarks.length) {
          container.innerHTML = '<p class="text-muted mb-0">لا توجد إشارات بعد.</p>';
          return;
        }
        state.bookmarks.forEach((item, index) => {
          const div = document.createElement("div");
          div.className = "bookmark-pill d-flex justify-content-between align-items-center";
          div.innerHTML = `
            <span>${item.label}</span>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary" data-index="${index}" data-action="open">
                فتح
              </button>
              <button class="btn btn-sm btn-outline-danger" data-index="${index}" data-action="remove">
                حذف
              </button>
            </div>`;
          div.querySelectorAll("button").forEach((btn) =>
            btn.addEventListener("click", (e) => handleBookmarkAction(e, item))
          );
          container.appendChild(div);
        });
      }

      function renderHistory() {
        const container = el("historyContainer");
        container.innerHTML = "";
        if (!state.history.length) {
          container.innerHTML = '<span class="text-muted small">لا يوجد سجل.</span>';
          return;
        }
        state.history.slice(-8).forEach((item) => {
          const pill = document.createElement("button");
          pill.className = "btn btn-sm btn-outline-primary history-pill";
          pill.textContent = item.name;
          pill.addEventListener("click", () => loadSurah(item.id));
          container.appendChild(pill);
        });
      }

      async function loadChapters() {
        try {
          updateStatus("chapters", true, "... جارِ التحميل");
          const data = await apiRequest("/chapters", { params: { language: "ar" } });
          state.chapters = data.chapters;
          renderChapters();
          updateStatus("chapters", true, "متصل");
        } catch (error) {
          updateStatus("chapters", false, "تعذر التحميل");
        }
      }

      async function loadTranslations() {
        try {
          const data = await apiRequest("/resources/translations");
          const select = el("translationSelect");
          select.innerHTML = "";
          const preferredLanguages = ["Arabic", "English", "Urdu"];
          const preferredTranslations = data.translations.filter((t) =>
            preferredLanguages.includes(t.language_name)
          );
          preferredTranslations.slice(0, 20).forEach((translation) => {
            const option = document.createElement("option");
            option.value = translation.id;
            option.textContent = `${translation.language_name} - ${translation.author_name}`;
            if (translation.id === state.translationId) option.selected = true;
            select.appendChild(option);
          });
          const hasCurrent = [...select.options].some(
            (option) => Number(option.value) === Number(state.translationId)
          );
          if (!hasCurrent) {
            const fallback = data.translations.find(
              (translation) => translation.id === state.translationId
            );
            if (fallback) {
              const option = document.createElement("option");
              option.value = fallback.id;
              option.textContent = `${fallback.language_name} - ${fallback.author_name}`;
              option.selected = true;
              select.appendChild(option);
            }
          }
        } catch (error) {
          console.error(error);
        }
      }

      function resetVerseSearch() {
        const searchInput = el("verseSearch");
        if (searchInput) {
          searchInput.value = "";
          searchInput.dispatchEvent(new Event("input"));
        }
      }

      async function loadSurah(id, append = false) {
        if (state.controllers.verses) state.controllers.verses.abort();
        const controller = new AbortController();
        state.controllers.verses = controller;
        const fallback = state.currentChapter && state.currentChapter.id === id
          ? state.currentChapter
          : {
              id,
              name_arabic: `سورة رقم ${id}`,
              name_simple: `Surah ${id}`,
              revelation_place: "Meccan",
            };
        state.currentChapter = state.chapters.find((c) => c.id === id) || fallback;
        if (!append) {
          state.versePagination.currentPage = 1;
          state.currentVerses = [];
          state.currentVerseIndex = -1;
          updatePlayerControls();
          resetVerseSearch();
        }
        updateStatus("verses", true, "... جارِ التحميل");
        try {
          const data = await apiRequest(`/verses/by_chapter/${id}`, {
            signal: controller.signal,
            params: {
              language: "ar",
              translations: state.translationId,
              fields: "chapter_id,verse_key,verse_number",
              page: state.versePagination.currentPage,
              per_page: state.versePagination.perPage,
            },
          });
          el("currentSurahTitle").textContent = state.currentChapter?.name_arabic || "سورة";
          el("currentSurahInfo").textContent = `${state.currentChapter?.name_simple} • ${
            state.currentChapter?.revelation_place === "Meccan" ? "مكية" : "مدنية"
          }`;
          const pagination = data.pagination || {};
          state.versePagination.hasMore =
            (pagination.total_pages || 0) > (pagination.current_page || 0);
          el("loadMoreContainer").hidden = !state.versePagination.hasMore;
          renderVerses(data.verses, append);
          updateStatus("verses", true, "متصل");
          if (!append) {
            state.history = [
              ...state.history.filter((item) => item.id !== id),
              { id, name: state.currentChapter?.name_arabic },
            ].slice(-12);
            renderHistory();
            filterChapters();
          }
          persistState();
        } catch (error) {
          if (error.name !== "AbortError") {
            updateStatus("verses", false, "تعذر التحميل");
          }
        }
      }

      async function loadMoreVerses() {
        if (!state.currentChapter || !state.versePagination.hasMore) return;
        state.versePagination.currentPage += 1;
        return loadSurah(state.currentChapter.id, true);
      }

      async function loadRandomAyah() {
        if (state.controllers.random) state.controllers.random.abort();
        const controller = new AbortController();
        state.controllers.random = controller;
        updateStatus("random", true, "... جارِ التحميل");
        try {
          const data = await apiRequest("/verses/random", {
            signal: controller.signal,
            params: {
              language: "ar",
              translations: state.translationId,
              fields: "verse_key",
            },
          });
          el("dailyAyahArabic").textContent = data.verse.text_uthmani;
          el("dailyAyahTranslation").textContent = data.verse.translations?.[0]?.text || "";
          el("dailyAyahArabic").dataset.verseKey = data.verse.verse_key;
          updateStatus("random", true, "متصل");
        } catch (error) {
          if (error.name !== "AbortError") updateStatus("random", false, "خطأ");
        }
      }

      async function runGlobalSearch() {
        const query = prompt("اكتب كلمة أو جملة للبحث في المصحف الكامل:");
        if (!query) return;
        if (state.controllers.search) state.controllers.search.abort();
        const controller = new AbortController();
        state.controllers.search = controller;
        updateStatus("search", true, "... جارِ البحث");
        try {
          const data = await apiRequest("/search", {
            signal: controller.signal,
            params: { language: "ar", size: 20, query },
          });
          const container = el("searchResults");
          container.innerHTML = "";
          data.search.results.forEach((result) => {
            const card = document.createElement("div");
            card.className = "search-result";
            card.innerHTML = `
              <strong>${result.verse_key}</strong>
              <p class="mb-1">${result.text}</p>
              <button class="btn btn-sm btn-outline-primary" data-key="${result.verse_key}">فتح الآية</button>`;
            card
              .querySelector("button")
              .addEventListener("click", () => openVerseFromKey(result.verse_key));
            container.appendChild(card);
          });
          el("searchPanel").hidden = false;
          updateStatus("search", true, "متصل");
        } catch (error) {
          if (error.name !== "AbortError") updateStatus("search", false, "تعذر");
        }
      }

      function openVerseFromKey(key) {
        const [chapterId] = key.split(":");
        loadSurah(parseInt(chapterId, 10)).then(() => {
          setTimeout(() => {
            const element = document.querySelector(`[data-verse-key="${key}"]`);
            if (element) {
              element.scrollIntoView({ behavior: "smooth", block: "center" });
              element.classList.add("highlight");
              setTimeout(() => element.classList.remove("highlight"), 3000);
            }
          }, 800);
        });
      }

      function handleVerseAction(event, verse) {
        const action = event.currentTarget.dataset.action;
        if (action === "play") {
          playVerse(verse);
        } else if (action === "copy") {
          navigator.clipboard.writeText(`${verse.text_uthmani} ( ${verse.verse_key} )`);
          showPlayerStatus("تم النسخ.");
        } else if (action === "bookmark") {
          const label = `${state.currentChapter?.name_arabic} - ${verse.verse_key}`;
          if (!state.bookmarks.some((item) => item.key === verse.verse_key)) {
            state.bookmarks.push({ key: verse.verse_key, label });
            renderBookmarks();
            persistState();
          }
        } else if (action === "download") {
          downloadVerseAudio(verse);
        }
      }

      function handleBookmarkAction(event, item) {
        const action = event.currentTarget.dataset.action;
        if (action === "open") {
          openVerseFromKey(item.key);
        } else if (action === "remove") {
          state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.key !== item.key);
          renderBookmarks();
          persistState();
        }
      }

      function playVerse(verse) {
        if (!verse) return;
        const audio = el("globalAudio");
        const playerStatus = el("playerStatus");
        audio.src = `${AUDIO_CDN}/${verse.id}.mp3`;
        audio
          .play()
          .then(() => {
            updatePlayButtonIcon();
          })
          .catch(() => {
            showPlayerStatus("اضغط على زر التشغيل في مشغل الصوت للسماح بالتشغيل.");
          });
        playerStatus.textContent = `${state.currentChapter?.name_arabic} • ${verse.verse_key}`;
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `سورة ${state.currentChapter?.name_arabic}`,
            artist: "الشيخ محمد أيوب",
            album: "المصحف المرتل",
          });
        }
        setCurrentVerseIndex(verse.verse_key);
        updatePlayingVerseStyles();
      }

      function showPlayerStatus(text) {
        el("playerStatus").textContent = text;
        setTimeout(() => (el("playerStatus").textContent = ""), 3000);
      }

      function downloadVerseAudio(verse) {
        const link = document.createElement("a");
        link.href = `${AUDIO_CDN}/${verse.id}.mp3`;
        link.download = `verse-${verse.verse_key}.mp3`;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showPlayerStatus("تم تجهيز التحميل.");
      }

      function setCurrentVerseIndex(key) {
        state.currentVerseIndex = state.currentVerses.findIndex(
          (verse) => verse.verse_key === key
        );
        updatePlayerControls();
      }

      function updatePlayingVerseStyles() {
        document.querySelectorAll(".verse-card.playing").forEach((card) =>
          card.classList.remove("playing")
        );
        const currentKey = state.currentVerses[state.currentVerseIndex]?.verse_key;
        if (currentKey) {
          const node = document.querySelector(`[data-verse-key="${currentKey}"]`);
          if (node) node.classList.add("playing");
        }
      }

      async function playNextVerse(autoTriggered = false) {
        if (!state.currentVerses.length) return;
        if (state.currentVerseIndex === -1) {
          playVerse(state.currentVerses[0]);
          return;
        }
        const targetIndex = state.currentVerseIndex + 1;
        if (targetIndex < state.currentVerses.length) {
          playVerse(state.currentVerses[targetIndex]);
          return;
        }
        if (state.versePagination.hasMore) {
          await loadMoreVerses();
          if (state.currentVerseIndex + 1 < state.currentVerses.length) {
            playVerse(state.currentVerses[state.currentVerseIndex + 1]);
            return;
          }
        }
        if (autoTriggered) {
          showPlayerStatus("انتهت آيات السورة الحالية.");
        }
      }

      function playPreviousVerse() {
        if (!state.currentVerses.length) return;
        const targetIndex = state.currentVerseIndex - 1;
        if (targetIndex >= 0) {
          playVerse(state.currentVerses[targetIndex]);
        }
      }

      function updatePlayerControls() {
        const prevBtn = el("prevVerseBtn");
        const nextBtn = el("nextVerseBtn");
        const hasVerses = state.currentVerses.length > 0;
        if (prevBtn) {
          prevBtn.disabled = !hasVerses || state.currentVerseIndex <= 0;
        }
        if (nextBtn) {
          nextBtn.disabled =
            !hasVerses ||
            (!state.versePagination.hasMore &&
              state.currentVerseIndex >= state.currentVerses.length - 1);
        }
      }

      function toggleAutoAdvance() {
        state.autoAdvance = !state.autoAdvance;
        updateAutoAdvanceButton();
        persistState();
      }

      function updateAutoAdvanceButton() {
        const btn = el("autoAdvanceToggle");
        if (!btn) return;
        btn.textContent = `التشغيل المتتالي: ${state.autoAdvance ? "مفعل" : "متوقف"}`;
        btn.classList.toggle("btn-outline-success", state.autoAdvance);
        btn.classList.toggle("btn-outline-secondary", !state.autoAdvance);
      }

      function updatePlayButtonIcon() {
        const btn = el("playCurrentVerse");
        const audio = el("globalAudio");
        if (!btn || !audio) return;
        btn.innerHTML = audio.paused
          ? '<i class="bi bi-play-fill"></i>'
          : '<i class="bi bi-pause-fill"></i>';
      }

      function exportBookmarks() {
        if (!state.bookmarks.length) return alert("لا توجد إشارات للتصدير.");
        const blob = new Blob([JSON.stringify(state.bookmarks, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "bookmarks.json";
        link.click();
        URL.revokeObjectURL(url);
      }

      function filterChapters() {
        const text = el("chapterSearch").value || "";
        const quickText = el("chapterQuickSearch").value || "";
        const place = el("revelationFilter").value;
        const rawQuery = (text + " " + quickText).trim();
        const query = rawQuery.toLowerCase();
        const filtered = state.chapters.filter((chapter) => {
          const translatedName = chapter.translated_name?.name || "";
          const matchesText =
            (rawQuery && chapter.name_arabic.includes(rawQuery)) ||
            chapter.name_simple.toLowerCase().includes(query) ||
            translatedName.toLowerCase().includes(query);
          const matchesPlace = place === "all" || chapter.revelation_place === place;
          return matchesText && matchesPlace;
        });
        renderChapters(filtered);
      }

document.addEventListener("DOMContentLoaded", () => {
  populateThemes();
  restoreState();
  loadChapters();
  loadTranslations();
  loadRandomAyah();
  updateAutoAdvanceButton();
  updatePlayerControls();
  const audio = el("globalAudio");
  audio.addEventListener("ended", () => {
    updatePlayButtonIcon();
    if (state.autoAdvance) {
      playNextVerse(true);
    }
  });
  audio.addEventListener("play", updatePlayButtonIcon);
  audio.addEventListener("pause", updatePlayButtonIcon);
  updatePlayButtonIcon();
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("nexttrack", () => playNextVerse());
      navigator.mediaSession.setActionHandler("previoustrack", playPreviousVerse);
      navigator.mediaSession.setActionHandler("play", () => audio.play());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    } catch (error) {
      console.warn("MediaSession handlers unavailable", error);
    }
  }
});

safeListen("themeSelect", "change", (event) => {
  setTheme(event.target.value);
});
safeListen("translationSelect", "change", (event) => {
  state.translationId = Number(event.target.value);
  if (state.currentChapter) loadSurah(state.currentChapter.id);
  loadRandomAyah();
  persistState();
});
safeListen("fontSizeRange", "input", (event) => {
  const value = `${event.target.value}rem`;
  document.documentElement.style.setProperty("--verse-font-size", value);
  persistState();
});
safeListen("globalSearchBtn", "click", runGlobalSearch);
safeListen("closeSearch", "click", () => {
  el("searchPanel").hidden = true;
});
safeListen("loadMoreVerses", "click", loadMoreVerses);
safeListen("refreshDaily", "click", loadRandomAyah);
safeListen("dailyAyahArabic", "click", () => {
  const key = el("dailyAyahArabic").dataset.verseKey;
  if (key) openVerseFromKey(key);
});
safeListen("clearBookmarks", "click", () => {
  if (confirm("مسح جميع الإشارات؟")) {
    state.bookmarks = [];
    renderBookmarks();
    persistState();
  }
});
safeListen("exportBookmarks", "click", exportBookmarks);
safeListen("clearHistory", "click", () => {
  state.history = [];
  renderHistory();
  persistState();
});
safeListen("chapterSearch", "input", filterChapters);
safeListen("chapterQuickSearch", "input", filterChapters);
safeListen("revelationFilter", "change", filterChapters);
safeListen("verseSearch", "input", (event) => {
  const value = event.target.value.trim().toLowerCase();
  document.querySelectorAll(".verse-card").forEach((card) => {
    const text = card.innerText.toLowerCase();
    card.hidden = value && !text.includes(value);
  });
});
safeListen("playCurrentVerse", "click", () => {
  if (state.currentVerseIndex >= 0) {
    playVerse(state.currentVerses[state.currentVerseIndex]);
  } else if (state.currentVerses.length) {
    playVerse(state.currentVerses[0]);
  }
});
safeListen("nextVerseBtn", "click", () => playNextVerse());
safeListen("prevVerseBtn", "click", playPreviousVerse);
safeListen("autoAdvanceToggle", "click", toggleAutoAdvance);
