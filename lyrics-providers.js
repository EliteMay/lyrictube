(() => {
  "use strict";

  const SYNCLRC_API = "https://api.synclrc.dev";
  const LYRICS_OVH_API = "https://api.lyrics.ovh";
  const REQUEST_TIMEOUT = 9000;
  const MAX_SYNCLRC_RESULTS = 10;
  let providerMetaPending = null;
  let searchRunning = false;

  const $ = id => document.getElementById(id);

  function normalize(value = "") {
    return String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function lyricFingerprint(item) {
    const lyric = String(item?.syncedLyrics || item?.plainLyrics || "")
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\s+/g, "")
      .slice(0, 320);
    return [
      normalize(item?.trackName || ""),
      normalize(item?.artistName || ""),
      lyric
    ].join("|");
  }

  function providerName(item) {
    if (item?._provider === "synclrc") return "SyncLRC";
    if (item?._provider === "lyrics.ovh") return "lyrics.ovh";
    return "LRCLIB";
  }

  function providerId(item) {
    if (item?._provider === "synclrc") return String(item?._providerId || item?.id || "");
    if (item?._provider === "lyrics.ovh") return String(item?._providerId || "");
    return String(item?.id || "");
  }

  async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function mapSyncLrcResult(item) {
    const lyrics = item?.lyrics || {};
    const synced = String(lyrics.synced || "").trim();
    const plain = String(lyrics.plain || "").trim() || (synced && typeof plainFromLrc === "function" ? plainFromLrc(synced) : "");
    return {
      id: `synclrc:${String(item?.id || "")}`,
      trackName: String(item?.track || "").trim(),
      artistName: String(item?.artist || "").trim(),
      albumName: String(item?.album || "").trim(),
      duration: Number(item?.duration) || 0,
      instrumental: Boolean(item?.instrumental),
      plainLyrics: plain,
      syncedLyrics: synced,
      _provider: "synclrc",
      _providerId: String(item?.id || ""),
      _matchSource: "SyncLRC"
    };
  }

  async function searchSyncLrc(title, artist) {
    const q = [title, artist].filter(Boolean).join(" ").trim();
    if (!q) return [];
    const url = `${SYNCLRC_API}/search?q=${encodeURIComponent(q)}&limit=${MAX_SYNCLRC_RESULTS}&offset=0`;
    const body = await fetchJson(url);
    return (Array.isArray(body?.results) ? body.results : [])
      .map(mapSyncLrcResult)
      .filter(item => item.trackName && (item.plainLyrics || item.syncedLyrics));
  }

  async function searchLyricsOvh(title, artist) {
    if (!title || !artist) return [];
    const url = `${LYRICS_OVH_API}/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const body = await fetchJson(url);
    const plain = String(body?.lyrics || "").trim();
    if (!plain) return [];
    return [{
      id: `lyricsovh:${normalize(artist)}:${normalize(title)}`,
      trackName: title,
      artistName: artist,
      albumName: "",
      duration: 0,
      instrumental: false,
      plainLyrics: plain,
      syncedLyrics: "",
      _provider: "lyrics.ovh",
      _providerId: `${artist}|${title}`,
      _matchSource: "lyrics.ovh"
    }];
  }

  function mergeProviderResults(base, extra) {
    const merged = [];
    const fingerprints = new Set();
    const ids = new Set();

    const push = raw => {
      if (!raw) return;
      const item = { ...raw };
      if (!item._provider) item._provider = "lrclib";
      const idKey = `${item._provider}:${providerId(item)}`;
      const fp = lyricFingerprint(item);
      if ((providerId(item) && ids.has(idKey)) || (fp && fingerprints.has(fp))) return;
      if (providerId(item)) ids.add(idKey);
      if (fp) fingerprints.add(fp);
      merged.push(item);
    };

    (base || []).forEach(push);
    (extra || []).forEach(push);
    return merged;
  }

  function decorateProviderBadges() {
    const cards = [...document.querySelectorAll("#lyricsSearchResults .result-item")];
    cards.forEach((card, index) => {
      const item = pendingLyricsResults?.[index];
      if (!item) return;
      const badges = card.querySelector(".result-badges");
      if (!badges || badges.querySelector("[data-provider-badge]")) return;
      const badge = document.createElement("span");
      badge.className = "mini-badge";
      badge.dataset.providerBadge = "true";
      badge.textContent = `SOURCE: ${providerName(item)}`;
      badges.prepend(badge);
    });
  }

  function chooseProviderLyrics(index) {
    const item = pendingLyricsResults?.[index];
    if (!item) return;
    const lyricsInput = $("lyricsInput");
    if (!lyricsInput) return;

    lyricsInput.value = item.syncedLyrics || item.plainLyrics || "";
    const provider = item._provider || "lrclib";
    const pId = providerId(item);

    if (provider === "lrclib") {
      lyricsInput.dataset.lrclibId = String(item.id || "");
    } else {
      delete lyricsInput.dataset.lrclibId;
    }

    lyricsInput.dataset.lyricsSource = `${providerName(item)}: ${item.trackName || ""} / ${item.artistName || ""}`;
    lyricsInput.dataset.lyricsProvider = provider;
    lyricsInput.dataset.lyricsProviderId = pId;
    providerMetaPending = { provider, providerId: pId };

    if (typeof closeLyricsResultsAndReturn === "function") closeLyricsResultsAndReturn();
    setTimeout(() => {
      if (typeof showToast === "function") {
        showToast(item.syncedLyrics
          ? `${providerName(item)}の時間付き歌詞を選択しました。`
          : `${providerName(item)}の通常歌詞を選択しました。`);
      }
    }, 80);
  }

  function persistProviderMetaAfterSongSave() {
    const form = $("songForm");
    if (!form) return;
    form.addEventListener("submit", () => {
      const meta = providerMetaPending || (() => {
        const input = $("lyricsInput");
        if (!input?.dataset.lyricsProvider) return null;
        return {
          provider: input.dataset.lyricsProvider,
          providerId: input.dataset.lyricsProviderId || ""
        };
      })();
      if (!meta) return;

      setTimeout(() => {
        try {
          const song = typeof getSong === "function" ? getSong() : null;
          if (!song) return;
          song.lyricsProvider = meta.provider;
          song.lyricsProviderId = meta.providerId;
          if (typeof persistLibrary === "function") persistLibrary();
          providerMetaPending = null;
        } catch (error) {
          console.warn("[LyricTube Providers] provider metadata save failed", error);
        }
      }, 0);
    });
  }

  function interceptResultChoice() {
    const container = $("lyricsSearchResults");
    if (!container) return;
    container.addEventListener("click", event => {
      const button = event.target.closest(".use-lyrics-btn");
      if (!button) return;
      const cards = [...container.querySelectorAll(".result-item")];
      const card = button.closest(".result-item");
      const index = cards.indexOf(card);
      if (index < 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      chooseProviderLyrics(index);
    }, true);
  }

  async function enhancedLyricsSearch() {
    if (searchRunning) return;
    const title = $("trackTitle")?.value.trim() || "";
    const artist = $("artistName")?.value.trim() || "";
    if (!title) {
      if (typeof showToast === "function") showToast("先に曲名を入力してください。");
      return;
    }

    searchRunning = true;
    const button = $("searchLyricsBtn");
    const progress = $("lyricsSearchProgress");

    try {
      // Keep the mature LRCLIB logic exactly as-is, then extend its result set.
      await searchLyrics();
      const lrclibResults = Array.isArray(pendingLyricsResults)
        ? pendingLyricsResults.map(item => ({ ...item, _provider: item?._provider || "lrclib" }))
        : [];

      if (button) {
        button.disabled = true;
        button.textContent = "追加ソース検索中…";
      }
      if (progress) progress.textContent = `${progress.textContent || "LRCLIB検索完了"} → SyncLRC検索中…`;

      const diagnostics = [];
      let syncResults = [];
      let ovhResults = [];

      try {
        syncResults = await searchSyncLrc(title, artist);
        diagnostics.push(`SyncLRC: ${syncResults.length}件`);
      } catch (error) {
        console.warn("[LyricTube Providers] SyncLRC search failed", error);
        diagnostics.push(`SyncLRC: ${error?.name === "AbortError" ? "タイムアウト" : "接続失敗"}`);
      }

      // Plain-text fallback. It is useful when neither synced provider has the song.
      // Exact artist/title only to avoid unrelated lyrics.
      if (artist) {
        try {
          ovhResults = await searchLyricsOvh(title, artist);
          diagnostics.push(`lyrics.ovh: ${ovhResults.length}件`);
        } catch (error) {
          if (error?.status !== 404) console.warn("[LyricTube Providers] lyrics.ovh search failed", error);
          diagnostics.push(`lyrics.ovh: ${error?.status === 404 ? "0件" : "接続失敗"}`);
        }
      } else {
        diagnostics.push("lyrics.ovh: アーティスト未入力のため省略");
      }

      const merged = mergeProviderResults(lrclibResults, [...syncResults, ...ovhResults]);
      pendingLyricsResults = typeof rankLyricsResults === "function"
        ? rankLyricsResults(merged, title, artist)
        : merged;

      if (typeof renderLyricsSearchResults === "function") renderLyricsSearchResults();
      decorateProviderBadges();
      if (typeof openLyricsResultsFront === "function") openLyricsResultsFront();

      if (progress) {
        const lrclibCount = lrclibResults.length;
        progress.textContent = `LRCLIB: ${lrclibCount}候補 → ${diagnostics.join(" → ")} → 重複除去後: ${pendingLyricsResults.length}候補`;
      }

      if (!pendingLyricsResults.length && typeof showToast === "function") {
        showToast("LRCLIB・SyncLRC・lyrics.ovhのすべてで歌詞が見つかりませんでした。");
      }
    } catch (error) {
      console.warn("[LyricTube Providers] enhanced search failed", error);
      if (typeof showToast === "function") showToast("追加歌詞ソースの検索に失敗しました。LRCLIB検索はそのまま利用できます。");
    } finally {
      searchRunning = false;
      if (button) {
        button.disabled = false;
        button.textContent = "自動歌詞検索";
      }
    }
  }

  function interceptSearchButton() {
    const button = $("searchLyricsBtn");
    if (!button) return;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      enhancedLyricsSearch();
    }, true);
  }

  function init() {
    interceptSearchButton();
    interceptResultChoice();
    persistProviderMetaAfterSongSave();
    console.info("[LyricTube] lyrics providers enabled: LRCLIB + SyncLRC + lyrics.ovh");
  }

  init();
})();