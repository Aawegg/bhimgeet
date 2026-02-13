// ========================================
// BhimGeet - Application Logic (v5)
// Features: Dark mode, Song of the Day, Recently Played, Shuffle,
// Playlists, Copy Lyrics, Auto-Scroll, Categories, Notifications,
// Splash, Auto-play Next, Error Recovery, Share App, Feedback
// ========================================

(function () {
  "use strict";

  // --- Security: HTML escaping ---
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Security: Safe localStorage read ---
  function safeJsonParse(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : parsed;
    } catch (e) {
      return fallback;
    }
  }

  // --- State ---
  let currentPage = "home";
  let currentSong = null;
  let favorites = safeJsonParse("bhimgeet_favorites", []);
  let fontSize = parseInt(localStorage.getItem("bhimgeet_fontsize") || "16", 10);
  let theme = localStorage.getItem("bhimgeet_theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  let recentlyPlayed = safeJsonParse("bhimgeet_recent", []);
  let playlists = safeJsonParse("bhimgeet_playlists", []);
  let searchOpen = false;
  let searchQuery = "";
  let currentCategory = "all";
  let currentPlayerSongId = null;
  let autoScrollActive = false;
  let autoScrollSpeed = 1; // 0=slow, 1=medium, 2=fast
  let autoScrollRAF = null;
  let autoScrollPaused = false;
  let currentPlaylistView = null;
  let autoPlayNext = localStorage.getItem("bhimgeet_autoplay") === "true";

  // --- Categories (keyword-based) ---
  const CATEGORIES = [
    { id: "all", name: "सर्व", nameEn: "All" },
    { id: "buddha", name: "बुद्ध", nameEn: "Buddha" },
    { id: "ramai", name: "रमाई", nameEn: "Ramabai" },
    { id: "jayanti", name: "जयंती", nameEn: "Jayanti" },
    { id: "bhimgeet", name: "भीम गीत", nameEn: "Bhim Geet" },
    { id: "vidrohi", name: "विद्रोही", nameEn: "Vidrohi" },
  ];

  const CATEGORY_KEYWORDS = {
    buddha: ["बुद्ध", "धम्म", "शरणं", "तथागत", "गौतम", "विहार", "पंचशील", "बोधि"],
    ramai: ["रमा", "रमाई", "रमाबाई", "रमान"],
    jayanti: ["जयंती", "जन्म", "एप्रिल", "१४", "14 april", "जन्मदिन", "जन्मदिवस"],
    bhimgeet: ["भीम", "बाबासाहेब", "अंबेडकर", "आंबेडकर", "संविधान", "भिम"],
    vidrohi: ["संघर्ष", "लढा", "अन्याय", "क्रांती", "विजय", "लढ", "बंड"],
  };

  function getSongCategory(song) {
    const text = (song.title + " " + song.lyrics).toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) return cat;
      }
    }
    return "bhimgeet";
  }

  // Pre-compute categories
  let songCategories = {};
  function buildCategoryMap() {
    SONGS.forEach(s => { songCategories[s.id] = getSongCategory(s); });
  }

  // --- DOM ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const pages = {};
  let backBtn, headerTitle, searchToggleBtn, searchBar, searchInput, searchClear, bottomNav, navItems, toast;

  // --- Splash ---
  function dismissSplash() {
    const splash = document.getElementById("splash");
    if (!splash) return;
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 600);
  }

  // --- Init ---
  function init() {
    // Dismiss splash after a quick beat
    setTimeout(dismissSplash, 1200);

    // Cache DOM
    pages.home = $("#page-home");
    pages.browse = $("#page-browse");
    pages.playlists = $("#page-playlists");
    pages.favorites = $("#page-favorites");
    pages.song = $("#page-song");
    backBtn = $("#back-btn");
    headerTitle = $("#header-title");
    searchToggleBtn = $("#search-toggle-btn");
    searchBar = $("#search-bar");
    searchInput = $("#search-input");
    searchClear = $("#search-clear");
    bottomNav = $("#bottom-nav");
    navItems = $$(".nav-item");
    toast = $("#toast");

    buildCategoryMap();
    applyTheme(theme);
    renderSongOfTheDay();
    renderRecentlyPlayed();
    renderFeaturedSongs();
    renderCategoryChips();
    renderBrowseSongs();
    renderFavorites();
    renderPlaylists();
    bindEvents();
    updateStats();
    showDailyNotification();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  // ========================================
  // 1. DARK MODE
  // ========================================

  function applyTheme(t) {
    theme = t;
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("bhimgeet_theme", t);
    const iconLight = $("#theme-icon-light");
    const iconDark = $("#theme-icon-dark");
    if (iconLight && iconDark) {
      iconLight.classList.toggle("hidden", t === "dark");
      iconDark.classList.toggle("hidden", t !== "dark");
    }
  }

  function toggleTheme() {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

  // ========================================
  // 2. SONG OF THE DAY
  // ========================================

  function getSongOfTheDay() {
    const dateStr = new Date().toDateString();
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
      hash |= 0;
    }
    return SONGS[Math.abs(hash) % SONGS.length];
  }

  function renderSongOfTheDay() {
    const song = getSongOfTheDay();
    const container = $("#sotd-container");
    if (!container) return;
    container.innerHTML = `
      <div class="sotd-card" data-song-id="${song.id}">
        <img class="sotd-thumb" src="https://img.youtube.com/vi/${song.youtubeId}/mqdefault.jpg" alt="" onerror="this.style.background='var(--primary)'">
        <div class="sotd-info">
          <div class="sotd-badge">आजचे गीत / Song of the Day</div>
          <div class="sotd-title">${song.title}</div>
        </div>
        <div class="sotd-play">▶</div>
      </div>
    `;
  }

  // ========================================
  // 3. RECENTLY PLAYED
  // ========================================

  function addToRecentlyPlayed(songId) {
    recentlyPlayed = recentlyPlayed.filter(id => id !== songId);
    recentlyPlayed.unshift(songId);
    if (recentlyPlayed.length > 20) recentlyPlayed = recentlyPlayed.slice(0, 20);
    localStorage.setItem("bhimgeet_recent", JSON.stringify(recentlyPlayed));
  }

  function renderRecentlyPlayed() {
    const section = $("#recent-section");
    const container = $("#recent-songs");
    if (!section || !container) return;

    if (recentlyPlayed.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    const songs = recentlyPlayed.slice(0, 5).map(id => SONGS.find(s => s.id === id)).filter(Boolean);
    container.innerHTML = songs.map(s => renderSongCard(s)).join("");
  }

  // ========================================
  // 4. SHUFFLE
  // ========================================

  function playRandomSong() {
    const song = SONGS[Math.floor(Math.random() * SONGS.length)];
    currentSong = song;
    renderSongDetail(song);
    navigateTo("song");
    setTimeout(() => loadYoutubeEmbed(song), 300);
  }

  // ========================================
  // 5. PLAYLISTS
  // ========================================

  function savePlaylists() {
    localStorage.setItem("bhimgeet_playlists", JSON.stringify(playlists));
  }

  function renderPlaylists() {
    const list = $("#playlists-list");
    const empty = $("#playlists-empty");
    const detail = $("#playlist-detail");
    if (!list) return;

    if (detail) detail.classList.add("hidden");

    if (playlists.length === 0) {
      list.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
    } else {
      if (empty) empty.classList.add("hidden");
      list.innerHTML = playlists.map(pl => `
        <div class="playlist-card" data-playlist-id="${pl.id}">
          <div class="playlist-icon">🎵</div>
          <div class="playlist-info">
            <div class="playlist-name">${escapeHtml(pl.name)}</div>
            <div class="playlist-count">${pl.songIds.length} गीत / songs</div>
          </div>
          <button class="playlist-del" data-del-id="${pl.id}" aria-label="Delete">🗑️</button>
        </div>
      `).join("");
    }
  }

  function showCreatePlaylistModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>नवीन प्लेलिस्ट / New Playlist</h3>
        <input class="modal-input" id="new-playlist-name" placeholder="Playlist name..." autofocus>
        <div class="modal-actions">
          <button class="modal-btn cancel" id="modal-cancel">Cancel</button>
          <button class="modal-btn confirm" id="modal-confirm">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#new-playlist-name");
    const confirm = () => {
      const name = input.value.trim().substring(0, 100);
      if (name) {
        playlists.push({ id: Date.now(), name, songIds: [] });
        savePlaylists();
        renderPlaylists();
        showToast("प्लेलिस्ट तयार झाली! / Playlist created!");
      }
      overlay.remove();
    };

    overlay.querySelector("#modal-confirm").addEventListener("click", confirm);
    overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());
    input.addEventListener("keydown", e => { if (e.key === "Enter") confirm(); });
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  }

  function showAddToPlaylistModal(songId) {
    if (playlists.length === 0) {
      showToast("प्रथम प्लेलिस्ट तयार करा / Create a playlist first");
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>प्लेलिस्ट निवडा / Add to Playlist</h3>
        <div class="playlist-picker-list">
          ${playlists.map(pl => `
            <button class="playlist-pick-item" data-pick-id="${pl.id}">
              <span class="pick-icon">🎵</span>
              <span>${escapeHtml(pl.name)} (${pl.songIds.length})</span>
            </button>
          `).join("")}
        </div>
        <div class="modal-actions" style="margin-top:12px">
          <button class="modal-btn cancel" id="modal-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".playlist-pick-item").forEach(item => {
      item.addEventListener("click", () => {
        const plId = parseInt(item.dataset.pickId, 10);
        const pl = playlists.find(p => p.id === plId);
        if (pl) {
          if (pl.songIds.includes(songId)) {
            showToast("गीत आधीच आहे / Already in playlist");
          } else {
            pl.songIds.push(songId);
            savePlaylists();
            showToast(`"${escapeHtml(pl.name)}" मध्ये जोडले! / Added!`);
          }
        }
        overlay.remove();
      });
    });

    overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  }

  function showPlaylistDetail(plId) {
    const pl = playlists.find(p => p.id === plId);
    if (!pl) return;

    currentPlaylistView = plId;
    const listEl = $("#playlists-list");
    const emptyEl = $("#playlists-empty");
    const createBtn = $("#create-playlist-btn");
    const detail = $("#playlist-detail");

    if (listEl) listEl.style.display = "none";
    if (emptyEl) emptyEl.classList.add("hidden");
    if (createBtn) createBtn.style.display = "none";
    if (detail) detail.classList.remove("hidden");

    $("#playlist-detail-name").textContent = pl.name;

    const songs = pl.songIds.map(id => SONGS.find(s => s.id === id)).filter(Boolean);
    const songsEl = $("#playlist-detail-songs");
    const detailEmpty = $("#playlist-detail-empty");

    if (songs.length === 0) {
      songsEl.innerHTML = "";
      detailEmpty.classList.remove("hidden");
    } else {
      detailEmpty.classList.add("hidden");
      songsEl.innerHTML = songs.map(s => {
        return renderSongCard(s) .replace("</div>\n    ", `<button class="playlist-del" data-remove-song="${s.id}" data-from-pl="${plId}" style="margin-left:4px">✕</button></div>\n    `);
      }).join("");
    }
  }

  function hidePlaylistDetail() {
    currentPlaylistView = null;
    const listEl = $("#playlists-list");
    const createBtn = $("#create-playlist-btn");
    const detail = $("#playlist-detail");

    if (listEl) listEl.style.display = "";
    if (createBtn) createBtn.style.display = "";
    if (detail) detail.classList.add("hidden");
    renderPlaylists();
  }

  // ========================================
  // 6. CATEGORIES
  // ========================================

  function renderCategoryChips() {
    const container = $("#category-chips");
    if (!container) return;
    container.innerHTML = CATEGORIES.map(cat =>
      `<button class="chip ${cat.id === currentCategory ? 'active' : ''}" data-category="${cat.id}">${cat.name} / ${cat.nameEn}</button>`
    ).join("");
  }

  // ========================================
  // 7. AUTO-SCROLL LYRICS
  // ========================================

  function startAutoScroll() {
    const lyricsBody = $(".lyrics-body");
    if (!lyricsBody) return;

    lyricsBody.classList.add("scrollable");
    autoScrollActive = true;
    autoScrollPaused = false;

    // Add scroll bar indicator
    if (!lyricsBody.querySelector(".auto-scroll-bar")) {
      const bar = document.createElement("div");
      bar.className = "auto-scroll-bar";
      lyricsBody.prepend(bar);
    }

    const speeds = [0.3, 0.7, 1.5];
    let lastTime = 0;

    function scroll(timestamp) {
      if (!autoScrollActive) return;
      if (!autoScrollPaused) {
        if (timestamp - lastTime > 16) {
          lyricsBody.scrollTop += speeds[autoScrollSpeed];
          lastTime = timestamp;
        }
      }
      autoScrollRAF = requestAnimationFrame(scroll);
    }

    autoScrollRAF = requestAnimationFrame(scroll);

    // Pause on user touch
    let pauseTimer;
    const pauseHandler = () => {
      autoScrollPaused = true;
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { autoScrollPaused = false; }, 3000);
    };

    lyricsBody.addEventListener("touchstart", pauseHandler, { passive: true });
    lyricsBody.addEventListener("wheel", pauseHandler, { passive: true });
    lyricsBody._pauseHandler = pauseHandler;
  }

  function stopAutoScroll() {
    autoScrollActive = false;
    if (autoScrollRAF) cancelAnimationFrame(autoScrollRAF);
    const lyricsBody = $(".lyrics-body");
    if (lyricsBody) {
      lyricsBody.classList.remove("scrollable");
      const bar = lyricsBody.querySelector(".auto-scroll-bar");
      if (bar) bar.remove();
    }
  }

  // ========================================
  // 9. DAILY NOTIFICATION
  // ========================================

  function showDailyNotification() {
    const today = new Date().toDateString();
    const lastNotif = localStorage.getItem("bhimgeet_notif_date");
    if (lastNotif === today) return;

    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      sendNotification();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(perm => {
        if (perm === "granted") sendNotification();
      });
    }

    function sendNotification() {
      const song = getSongOfTheDay();
      localStorage.setItem("bhimgeet_notif_date", today);
      try {
        new Notification("BhimGeet - Song of the Day", {
          body: song.title,
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☸️</text></svg>",
          tag: "bhimgeet-sotd"
        });
      } catch(e) {}
    }
  }

  // ========================================
  // NAVIGATION
  // ========================================

  function navigateTo(page) {
    const prevPage = currentPage;
    currentPage = page;

    Object.values(pages).forEach(p => p && p.classList.remove("active"));
    if (pages[page]) pages[page].classList.add("active");

    navItems.forEach(item => item.classList.toggle("active", item.dataset.page === page));

    if (page === "song") {
      backBtn.classList.remove("hidden");
      headerTitle.innerHTML = '<span class="header-icon">🎵</span> Song';
      bottomNav.style.display = "none";
      searchToggleBtn.classList.add("hidden");
      $("#theme-toggle-btn").classList.add("hidden");
    } else {
      backBtn.classList.add("hidden");
      headerTitle.innerHTML = '<span class="header-icon">☸️</span> भीमगीत';
      bottomNav.style.display = "flex";
      searchToggleBtn.classList.remove("hidden");
      $("#theme-toggle-btn").classList.remove("hidden");
    }

    if (searchOpen && page !== "browse") toggleSearch(false);
    window.scrollTo({ top: 0, behavior: "instant" });

    if (page === "favorites") renderFavorites();
    if (page === "playlists") { renderPlaylists(); hidePlaylistDetail(); }
    if (page === "home") { renderRecentlyPlayed(); renderSongOfTheDay(); }

    pages[page]._prevPage = prevPage !== "song" ? prevPage : "home";
  }

  function goBack() {
    stopAutoScroll();
    const ytContainer = $("#youtube-container");
    if (ytContainer) ytContainer.innerHTML = "";
    currentPlayerSongId = null;
    const prev = pages[currentPage]._prevPage || "home";
    navigateTo(prev);
  }

  // ========================================
  // RENDERING
  // ========================================

  function renderFeaturedSongs() {
    const container = $("#featured-songs");
    if (!container) return;
    container.innerHTML = SONGS.slice(0, 8).map(s => renderSongCard(s)).join("");
  }

  function renderBrowseSongs(query = "") {
    const container = $("#browse-songs");
    const empty = $("#browse-empty");
    if (!container) return;

    let songs = [...SONGS];

    // Category filter
    if (currentCategory !== "all") {
      songs = songs.filter(s => songCategories[s.id] === currentCategory);
    }

    // Search filter
    if (query) {
      const q = query.toLowerCase();
      songs = songs.filter(s => s.title.toLowerCase().includes(q) || s.lyrics.toLowerCase().includes(q));
    }

    if (songs.length === 0) {
      container.innerHTML = "";
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      container.innerHTML = songs.map(s => renderSongCard(s)).join("");
    }

    const countEl = $("#browse-count");
    if (countEl) countEl.textContent = songs.length === SONGS.length ? `${songs.length} songs` : `${songs.length} / ${SONGS.length} songs`;
  }

  function renderFavorites() {
    const container = $("#favorites-songs");
    const empty = $("#favorites-empty");
    if (!container) return;

    const favSongs = SONGS.filter(s => favorites.includes(s.id));
    if (favSongs.length === 0) {
      container.innerHTML = "";
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      container.innerHTML = favSongs.map(s => renderSongCard(s)).join("");
    }
  }

  function renderSongCard(song) {
    const isFav = favorites.includes(song.id);
    const notes = ["🎵", "🎶", "🎼", "♪"];
    const note = notes[song.id % notes.length];

    return `
      <div class="song-card" data-song-id="${song.id}">
        <div class="song-art" style="background: ${song.gradient}">
          <span class="note">${note}</span>
        </div>
        <div class="song-info">
          <div class="song-title">${song.title}</div>
          <div class="song-meta"><span class="song-number">Song #${song.id}</span></div>
        </div>
        <div class="song-actions">
          <button class="fav-btn ${isFav ? "active" : ""}" data-fav-id="${song.id}">${isFav ? "❤️" : "🤍"}</button>
        </div>
      </div>
    `;
  }

  function renderSongDetail(song) {
    const container = $("#song-detail");
    if (!container) return;
    const isFav = favorites.includes(song.id);

    container.innerHTML = `
      <div class="song-detail-hero" style="background: ${song.gradient}">
        <div class="song-detail-art" style="background:rgba(255,255,255,0.15);backdrop-filter:blur(10px)">🎵</div>
        <div class="song-detail-title">${song.title}</div>
        <div class="song-detail-artist">Song #${song.id}</div>
        <div class="song-detail-actions">
          <button class="detail-btn primary" id="play-btn"><span class="btn-icon">▶</span> Play</button>
          <button class="detail-btn secondary" id="detail-fav-btn" data-song-id="${song.id}"><span class="btn-icon">${isFav ? "❤️" : "🤍"}</span> ${isFav ? "Saved" : "Save"}</button>
          <button class="detail-btn secondary" id="add-to-playlist-btn"><span class="btn-icon">+</span> Playlist</button>
          <button class="detail-btn secondary" id="detail-share-btn"><span class="btn-icon">↗</span> Share</button>
        </div>
      </div>

      <div class="player-section">
        <div class="youtube-container" id="youtube-container">
          <div class="youtube-placeholder" id="youtube-placeholder">
            <img class="yt-thumb" src="https://img.youtube.com/vi/${song.youtubeId}/mqdefault.jpg" alt="${song.title}" onerror="this.style.display='none'">
            <div class="yt-overlay">
              <div class="play-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
              <span>▶ YouTube वर ऐका / Listen on YouTube</span>
            </div>
          </div>
        </div>
      </div>

      <div class="autoplay-row">
        <span class="autoplay-label">Auto-play next song</span>
        <button class="toggle-switch ${autoPlayNext ? 'active' : ''}" id="autoplay-toggle" aria-label="Toggle auto-play"></button>
      </div>

      <div class="song-nav-buttons">
        <button class="song-nav-btn" id="prev-song-btn" ${song.id <= 1 ? 'disabled' : ''}>◀ Prev</button>
        <button class="song-nav-btn shuffle-btn" id="shuffle-detail-btn">🔀</button>
        <span class="song-nav-info">${song.id} / ${SONGS.length}</span>
        <button class="song-nav-btn" id="next-song-btn" ${song.id >= SONGS.length ? 'disabled' : ''}>Next ▶</button>
      </div>

      <div class="lyrics-section">
        <div class="lyrics-header">
          <div class="lyrics-label">📜 बोल <span class="en">/ Lyrics</span></div>
          <div class="lyrics-controls">
            <button class="scroll-btn" id="auto-scroll-btn" title="Auto Scroll">⏬</button>
            <div class="scroll-speed ${autoScrollActive ? '' : 'hidden'}" id="speed-controls">
              <button class="speed-btn ${autoScrollSpeed===0?'active':''}" data-speed="0">Slow</button>
              <button class="speed-btn ${autoScrollSpeed===1?'active':''}" data-speed="1">Med</button>
              <button class="speed-btn ${autoScrollSpeed===2?'active':''}" data-speed="2">Fast</button>
            </div>
            <button class="font-btn" id="font-decrease">A-</button>
            <button class="font-btn" id="font-increase">A+</button>
          </div>
        </div>
        <div class="lyrics-body">
          <div class="lyrics-text" id="lyrics-text" style="font-size:${fontSize}px">${song.lyrics}</div>
        </div>
      </div>

      <div class="copy-lyrics-wrap">
        <button class="copy-lyrics-btn" id="copy-lyrics-btn">📋 बोल कॉपी करा / Copy Lyrics</button>
      </div>
    `;

    bindDetailEvents(song);
  }

  // ========================================
  // EVENTS
  // ========================================

  function bindEvents() {
    // Nav
    navItems.forEach(item => item.addEventListener("click", () => navigateTo(item.dataset.page)));
    backBtn.addEventListener("click", goBack);

    // Theme toggle
    $("#theme-toggle-btn").addEventListener("click", toggleTheme);

    // Shuffle buttons
    const shuffleHome = $("#shuffle-home-btn");
    const shuffleBrowse = $("#shuffle-browse-btn");
    if (shuffleHome) shuffleHome.addEventListener("click", playRandomSong);
    if (shuffleBrowse) shuffleBrowse.addEventListener("click", playRandomSong);

    // See All
    const seeAllBtn = $("#see-all-btn");
    if (seeAllBtn) seeAllBtn.addEventListener("click", () => navigateTo("browse"));

    // Song clicks (delegated)
    document.addEventListener("click", (e) => {
      // Fav button
      const favBtn = e.target.closest(".fav-btn");
      if (favBtn) { e.stopPropagation(); toggleFavorite(parseInt(favBtn.dataset.favId, 10)); return; }

      // Playlist delete
      const delBtn = e.target.closest(".playlist-del[data-del-id]");
      if (delBtn) { e.stopPropagation(); playlists = playlists.filter(p => p.id !== parseInt(delBtn.dataset.delId, 10)); savePlaylists(); renderPlaylists(); showToast("प्लेलिस्ट हटवली / Playlist deleted"); return; }

      // Remove song from playlist
      const removeBtn = e.target.closest("[data-remove-song]");
      if (removeBtn) {
        e.stopPropagation();
        const sId = parseInt(removeBtn.dataset.removeSong, 10);
        const plId = parseInt(removeBtn.dataset.fromPl, 10);
        const pl = playlists.find(p => p.id === plId);
        if (pl) { pl.songIds = pl.songIds.filter(id => id !== sId); savePlaylists(); showPlaylistDetail(plId); showToast("गीत काढले / Song removed"); }
        return;
      }

      // Playlist card click
      const plCard = e.target.closest(".playlist-card");
      if (plCard) { showPlaylistDetail(parseInt(plCard.dataset.playlistId, 10)); return; }

      // Song card click (SOTD card too)
      const card = e.target.closest(".song-card") || e.target.closest(".sotd-card");
      if (card) {
        const song = SONGS.find(s => s.id === parseInt(card.dataset.songId, 10));
        if (song) { currentSong = song; renderSongDetail(song); navigateTo("song"); }
      }
    });

    // Create playlist
    const createPlBtn = $("#create-playlist-btn");
    if (createPlBtn) createPlBtn.addEventListener("click", showCreatePlaylistModal);

    // Playlist back
    const plBackBtn = $("#playlist-back-btn");
    if (plBackBtn) plBackBtn.addEventListener("click", hidePlaylistDetail);

    // Category chips
    const chipsContainer = $("#category-chips");
    if (chipsContainer) {
      chipsContainer.addEventListener("click", e => {
        const chip = e.target.closest(".chip");
        if (chip) {
          currentCategory = chip.dataset.category;
          $$(".chip").forEach(c => c.classList.toggle("active", c.dataset.category === currentCategory));
          renderBrowseSongs(searchQuery);
        }
      });
    }

    // Search
    searchToggleBtn.addEventListener("click", () => toggleSearch(!searchOpen));
    searchInput.addEventListener("input", e => {
      searchQuery = e.target.value;
      searchClear.classList.toggle("hidden", !searchQuery);
      if (currentPage !== "browse") navigateTo("browse");
      renderBrowseSongs(searchQuery);
    });
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchQuery = "";
      searchClear.classList.add("hidden");
      renderBrowseSongs();
      searchInput.focus();
    });

    // Share App
    const shareAppBtn = $("#share-app-btn");
    if (shareAppBtn) shareAppBtn.addEventListener("click", shareApp);

    // Feedback
    const feedbackBtn = $("#feedback-btn");
    if (feedbackBtn) feedbackBtn.addEventListener("click", showFeedbackModal);

    // Keyboard
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (currentPage === "song") goBack();
        else if (searchOpen) toggleSearch(false);
      }
    });
  }

  function bindDetailEvents(song) {
    // Play
    const playBtn = $("#play-btn");
    const placeholder = $("#youtube-placeholder");
    const playFn = () => { loadYoutubeEmbed(song); addToRecentlyPlayed(song.id); };
    if (playBtn) playBtn.addEventListener("click", playFn);
    if (placeholder) placeholder.addEventListener("click", playFn);

    // Favorite
    const favBtn = $("#detail-fav-btn");
    if (favBtn) {
      favBtn.addEventListener("click", () => {
        toggleFavorite(song.id);
        const isFav = favorites.includes(song.id);
        favBtn.innerHTML = `<span class="btn-icon">${isFav ? "❤️" : "🤍"}</span> ${isFav ? "Saved" : "Save"}`;
      });
    }

    // Add to playlist
    const addPlBtn = $("#add-to-playlist-btn");
    if (addPlBtn) addPlBtn.addEventListener("click", () => showAddToPlaylistModal(song.id));

    // Share
    const shareBtn = $("#detail-share-btn");
    if (shareBtn) shareBtn.addEventListener("click", () => shareSong(song));

    // Font controls
    const lyricsText = $("#lyrics-text");
    const fontInc = $("#font-increase");
    const fontDec = $("#font-decrease");
    if (fontInc) fontInc.addEventListener("click", () => { if (fontSize < 28) { fontSize += 2; lyricsText.style.fontSize = fontSize + "px"; localStorage.setItem("bhimgeet_fontsize", fontSize); }});
    if (fontDec) fontDec.addEventListener("click", () => { if (fontSize > 12) { fontSize -= 2; lyricsText.style.fontSize = fontSize + "px"; localStorage.setItem("bhimgeet_fontsize", fontSize); }});

    // Auto-scroll
    const scrollBtn = $("#auto-scroll-btn");
    const speedControls = $("#speed-controls");
    if (scrollBtn) {
      scrollBtn.addEventListener("click", () => {
        if (autoScrollActive) {
          stopAutoScroll();
          scrollBtn.classList.remove("active");
          scrollBtn.textContent = "⏬";
          if (speedControls) speedControls.classList.add("hidden");
        } else {
          startAutoScroll();
          scrollBtn.classList.add("active");
          scrollBtn.textContent = "⏸";
          if (speedControls) speedControls.classList.remove("hidden");
        }
      });
    }

    // Speed buttons
    $$(".speed-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        autoScrollSpeed = parseInt(btn.dataset.speed, 10);
        $$(".speed-btn").forEach(b => b.classList.toggle("active", b.dataset.speed == autoScrollSpeed));
      });
    });

    // Copy lyrics
    const copyBtn = $("#copy-lyrics-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = `🎵 ${song.title}\n\n${song.lyrics}\n\n- BhimGeet ☸️ जय भीम`;
        navigator.clipboard.writeText(text).then(() => {
          showToast("बोल कॉपी झाले / Lyrics copied! 📋");
          copyBtn.textContent = "✅ Copied!";
          setTimeout(() => { copyBtn.textContent = "📋 बोल कॉपी करा / Copy Lyrics"; }, 2000);
        }).catch(() => showToast("कॉपी करता आले नाही / Could not copy"));
      });
    }

    // Auto-play toggle
    const apToggle = $("#autoplay-toggle");
    if (apToggle) {
      apToggle.addEventListener("click", () => {
        autoPlayNext = !autoPlayNext;
        localStorage.setItem("bhimgeet_autoplay", autoPlayNext);
        apToggle.classList.toggle("active", autoPlayNext);
        showToast(autoPlayNext ? "Auto-play on" : "Auto-play off");
      });
    }

    // Prev/Next/Shuffle
    const prevBtn = $("#prev-song-btn");
    const nextBtn = $("#next-song-btn");
    const shuffleBtn = $("#shuffle-detail-btn");

    const switchSong = (newSong) => {
      currentSong = newSong;
      stopAutoScroll();
      const ytContainer = $("#youtube-container");
      if (ytContainer) ytContainer.innerHTML = "";
      currentPlayerSongId = null;
      renderSongDetail(newSong);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (prevBtn) prevBtn.addEventListener("click", () => { const s = SONGS.find(s => s.id === song.id - 1); if (s) switchSong(s); });
    if (nextBtn) nextBtn.addEventListener("click", () => { const s = SONGS.find(s => s.id === song.id + 1); if (s) switchSong(s); });
    if (shuffleBtn) shuffleBtn.addEventListener("click", () => { const s = SONGS[Math.floor(Math.random() * SONGS.length)]; switchSong(s); });
  }

  // ========================================
  // YOUTUBE EMBED + AUTO-PLAY + ERROR RECOVERY
  // ========================================

  function loadYoutubeEmbed(song) {
    const container = $("#youtube-container");
    if (!container) return;
    currentPlayerSongId = song.id;
    addToRecentlyPlayed(song.id);

    // Use YouTube iframe API with enablejsapi for end detection
    container.innerHTML = `
      <iframe id="yt-iframe" src="https://www.youtube.com/embed/${song.youtubeId}?autoplay=1&rel=0&enablejsapi=1&origin=${location.origin}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen loading="lazy" title="${song.title}"></iframe>
    `;

    const playBtn = $("#play-btn");
    if (playBtn) playBtn.innerHTML = '<span class="btn-icon">⏸</span> Playing';

    // Listen for YouTube iframe messages (state changes)
    setupYouTubeListener(song);
  }

  function setupYouTubeListener(song) {
    // Remove old listener if any
    if (window._ytMessageHandler) {
      window.removeEventListener("message", window._ytMessageHandler);
    }

    window._ytMessageHandler = function (e) {
      if (!e.data || typeof e.data !== "string") return;
      try {
        const data = JSON.parse(e.data);
        // YouTube sends state 0 = ended, 101/150 = error
        if (data.event === "onStateChange") {
          const state = data.info;
          if (state === 0 && autoPlayNext) {
            // Video ended -- play next
            const next = SONGS.find(s => s.id === song.id + 1);
            if (next) {
              currentSong = next;
              stopAutoScroll();
              renderSongDetail(next);
              setTimeout(() => loadYoutubeEmbed(next), 400);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }
        }
        if (data.event === "onError") {
          // YouTube error -- try next song
          showToast("Video unavailable, skipping...");
          const next = SONGS.find(s => s.id === song.id + 1);
          if (next) {
            currentSong = next;
            stopAutoScroll();
            renderSongDetail(next);
            setTimeout(() => loadYoutubeEmbed(next), 800);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
      } catch (err) { /* not JSON, ignore */ }
    };

    window.addEventListener("message", window._ytMessageHandler);

    // Also tell the iframe to send us state changes
    setTimeout(() => {
      const iframe = document.getElementById("yt-iframe");
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"listening","id":"yt-iframe","channel":"widget"}', "*");
      }
    }, 1500);
  }

  // ========================================
  // FAVORITES
  // ========================================

  function toggleFavorite(songId) {
    const idx = favorites.indexOf(songId);
    if (idx > -1) { favorites.splice(idx, 1); showToast("पसंदीदा काढले / Removed from favorites"); }
    else { favorites.push(songId); showToast("❤️ पसंदीदा जोडले / Added to favorites"); }
    localStorage.setItem("bhimgeet_favorites", JSON.stringify(favorites));

    document.querySelectorAll(`.fav-btn[data-fav-id="${songId}"]`).forEach(btn => {
      const isFav = favorites.includes(songId);
      btn.classList.toggle("active", isFav);
      btn.innerHTML = isFav ? "❤️" : "🤍";
    });

    if (currentPage === "favorites") renderFavorites();
  }

  // ========================================
  // SEARCH
  // ========================================

  function toggleSearch(open) {
    searchOpen = open;
    searchBar.classList.toggle("hidden", !open);
    if (open) searchInput.focus();
    else { searchInput.value = ""; searchQuery = ""; searchClear.classList.add("hidden"); renderBrowseSongs(); }
  }

  // ========================================
  // SHARE
  // ========================================

  function shareSong(song) {
    const lyricsPreview = song.lyrics.substring(0, 300);
    const shareText = `🎵 ${song.title}\n\n${lyricsPreview}...\n\n▶ https://youtube.com/watch?v=${song.youtubeId}\n\n- BhimGeet ☸️ जय भीम`;

    if (navigator.share) {
      navigator.share({ title: `${song.title} - BhimGeet`, text: shareText }).catch(() => {});
    } else {
      showShareModal(song, shareText);
    }
  }

  function showShareModal(song, text) {
    const fullLyricsText = `🎵 ${song.title}\n\n${song.lyrics}\n\n▶ https://youtube.com/watch?v=${song.youtubeId}\n\n- BhimGeet ☸️ जय भीम`;
    const overlay = document.createElement("div");
    overlay.className = "share-modal-overlay";
    overlay.innerHTML = `
      <div class="share-modal">
        <h3>शेयर करा / Share</h3>
        <div class="share-options">
          <button class="share-option" data-action="whatsapp"><div class="share-icon" style="background:#25D366">📱</div><span>WhatsApp</span></button>
          <button class="share-option" data-action="copy"><div class="share-icon" style="background:var(--primary)">📋</div><span>Copy</span></button>
          <button class="share-option" data-action="copy-lyrics"><div class="share-icon" style="background:#7B1FA2">📜</div><span>Full Lyrics</span></button>
          <button class="share-option" data-action="youtube"><div class="share-icon" style="background:#FF0000">▶</div><span>YouTube</span></button>
        </div>
        <button class="share-cancel">Cancel / रद्द करा</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const handleShare = (action) => {
      switch (action) {
        case "whatsapp": window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); break;
        case "copy": navigator.clipboard.writeText(text).then(() => showToast("कॉपी झाले / Copied! 📋")); break;
        case "copy-lyrics": navigator.clipboard.writeText(fullLyricsText).then(() => showToast("पूर्ण बोल कॉपी / Full lyrics copied! 📋")); break;
        case "youtube": window.open(`https://youtube.com/watch?v=${song.youtubeId}`, "_blank", "noopener,noreferrer"); break;
      }
      overlay.remove();
    };

    overlay.querySelectorAll(".share-option").forEach(opt => opt.addEventListener("click", () => handleShare(opt.dataset.action)));
    overlay.querySelector(".share-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  }

  // ========================================
  // SHARE APP
  // ========================================

  function shareApp() {
    const text = "Check out BhimGeet -- 172 Bhimrao Ambedkar songs with lyrics and videos! ☸️ जय भीम\n\n" + location.href;
    if (navigator.share) {
      navigator.share({ title: "BhimGeet - भीमगीत", text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => showToast("Link copied! 📋"));
    }
  }

  // ========================================
  // FEEDBACK
  // ========================================

  function showFeedbackModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>Feedback / सूचना</h3>
        <textarea class="modal-input" id="feedback-text" placeholder="Suggest a song, report a bug, or share feedback..." rows="4" style="resize:vertical;min-height:80px"></textarea>
        <div class="modal-actions">
          <button class="modal-btn cancel" id="fb-cancel">Cancel</button>
          <button class="modal-btn confirm" id="fb-send">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector("#feedback-text");
    textarea.focus();

    overlay.querySelector("#fb-send").addEventListener("click", () => {
      const msg = textarea.value.trim();
      if (msg) {
        // Open mailto as simple feedback mechanism (no server needed)
        const subject = encodeURIComponent("BhimGeet Feedback");
        const body = encodeURIComponent(msg + "\n\n---\nSent from BhimGeet PWA");
        window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
        showToast("Thank you! / धन्यवाद!");
      }
      overlay.remove();
    });

    overlay.querySelector("#fb-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  }

  // ========================================
  // TOAST
  // ========================================

  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.offsetHeight;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.classList.add("hidden"), 300); }, 2000);
  }

  // ========================================
  // UTILS
  // ========================================

  function updateStats() {
    const el = $("#total-songs");
    if (el) el.textContent = `${SONGS.length} गीत / Songs`;
  }

  // --- Start ---
  document.addEventListener("DOMContentLoaded", init);
})();
