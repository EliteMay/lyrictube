(() => {
  "use strict";

  const SYNCLRC_API = "https://api.synclrc.dev";
  const LYRICS_OVH_API = "https://api.lyrics.ovh";
  const REQUEST_TIMEOUT = 9000;
  const MAX_SYNCLRC_RESULTS = 10;
  let providerMetaPending = null;
  let searchGeneration = 0;
  let activeSearch = null;

  const $ = id => document.getElementById(id);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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

  function currentSongId() {
    try { return String(typeof getSong === "function" ? getSong()?.id || "" : ""); }
    catch { return ""; }
  }

  function currentTarget() {
    return {
      title: $("trackTitle")?.value.trim() || "",
      artist: $("artistName")?.value.trim() || "",
      editingSongId: $("editingSongId")?.value || "",
      selectedSongId: currentSongId(),
    };
  }

  function sameTarget(context) {
    const now = currentTarget();
    return now.title === context.title &&
      now.artist === context.artist &&
      now.editingSongId === context.editingSongId &&
      now.selectedSongId === context.selectedSongId;
  }

  function ownsSearchUi(context) {
    return Boolean(context && activeSearch === context && context.generation === searchGeneration);
  }

  function isSearchCurrent(context) {
    if (!ownsSearchUi(context) || context.dismissed || !sameTarget(context)) return false;
    if (context.originSongDialog && !context.resultsOpened && !$("songDialog")?.open) return false;
    return true;
  }

  function resetSearchButton(context) {
    if (!ownsSearchUi(context)) return;
    const button = $("searchLyricsBtn");
    if (!button) return;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "自動歌詞検索";
  }

  function invalidateActiveSearch(reason = "stale") {
    if (!activeSearch) return;
    activeSearch.dismissed = true;
    activeSearch.reason = reason;
    try { activeSearch.controller?.abort(); } catch {}
    resetSearchButton(activeSearch);
    activeSearch = null;
    searchGeneration += 1;
  }

  function beginSearch() {
    if (activeSearch) {
      activeSearch.dismissed = true;
      try { activeSearch.controller?.abort(); } catch {}
    }
    const target = currentTarget();
    const context = {
      ...target,
      generation: ++searchGeneration,
      controller: new AbortController(),
      originSongDialog: Boolean($("songDialog")?.open),
      resultsOpened: false,
      dismissed: false,
      reason: "",
    };
    activeSearch = context;
    return context;
  }

  async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT, externalSignal = null) {
    const controller = new AbortController();
    const abortFromExternal = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener?.("abort", abortFromExternal, { once: true });
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
      externalSignal?.removeEventListener?.("abort", abortFromExternal);
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

  async function searchSyncLrc(title, artist, signal) {
    const q = [title, artist].filter(Boolean).join(" ").trim();
    if (!q) return [];
    const url = `${SYNCLRC_API}/search?q=${encodeURIComponent(q)}&limit=${MAX_SYNCLRC_RESULTS}&offset=0`;
    const body = await fetchJson(url, REQUEST_TIMEOUT, signal);
    return (Array.isArray(body?.results) ? body.results : [])
      .map(mapSyncLrcResult)
      .filter(item => item.trackName && (item.plainLyrics || item.syncedLyrics));
  }

  async function searchLyricsOvh(title, artist, signal) {
    if (!title || !artist) return [];
    const url = `${LYRICS_OVH_API}/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const body = await fetchJson(url, REQUEST_TIMEOUT, signal);
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

  function addUniqueResults(target, keys, items, source) {
    for (const item of items || []) {
      const key = String(item?.id ?? (typeof lyricsResultKey === "function" ? lyricsResultKey(item) : lyricFingerprint(item)));
      if (keys.has(key)) continue;
      keys.add(key);
      target.push({ ...item, _provider: item?._provider || "lrclib", _matchSource: source || item?._matchSource || "LRCLIB" });
    }
  }

  function initialLrclibAttempts(context) {
    const attempts = [];
    const seen = new Set();
    const currentType = $("initialVideoSection")?.hidden
      ? (typeof getVersion === "function" ? getVersion()?.type || "original" : "original")
      : ($("initialVersionType")?.value || $("youtubeUrl")?.dataset?.detectedType || "original");
    const performer = $("initialVideoSection")?.hidden
      ? String((typeof getVersion === "function" ? getVersion()?.performer || getVersion()?.rawYoutubeAuthor : "") || "").trim()
      : String($("initialPerformer")?.value || $("youtubeUrl")?.dataset?.performer || "").trim();
    const badCoverArtist = ["cover", "other"].includes(currentType) && context.artist && performer &&
      typeof artistLooksSame === "function" && artistLooksSame(context.artist, performer);
    const rankArtist = badCoverArtist ? "" : context.artist;

    const add = (label, params) => {
      const clean = Object.fromEntries(Object.entries(params || {})
        .map(([key, value]) => [key, String(value || "").trim()])
        .filter(([, value]) => value));
      if (!clean.track_name && !clean.q) return;
      const key = JSON.stringify(clean).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      attempts.push({ label, params: clean });
    };

    if (rankArtist) add("曲名＋原曲アーティスト", { track_name: context.title, artist_name: rankArtist });
    add("曲名のみ", { track_name: context.title });
    if (rankArtist) add("自由検索", { q: `${context.title} ${rankArtist}` });
    add("曲名の自由検索", { q: context.title });

    if (typeof buildCoverFallbackQueries === "function") {
      for (const query of buildCoverFallbackQueries(context.title, rankArtist)) add("表記ゆれ候補", query);
    }
    if (typeof getV1RawLyricsQuery === "function") {
      const raw = getV1RawLyricsQuery();
      if (raw?.track_name) {
        add("YouTube生タイトル", raw);
        add("YouTube生タイトル自由検索", { q: [raw.track_name, raw.artist_name].filter(Boolean).join(" ") });
      }
    }
    return { attempts, rankArtist };
  }

  async function searchLrclibGuarded(context) {
    const diagnostics = [];
    const merged = [];
    const keys = new Set();
    let rateLimited = null;

    const savedId = $("lyricsInput")?.dataset?.lrclibId || (typeof getSong === "function" ? getSong()?.lrclibId : "") || "";
    if (savedId && typeof requestLyricsById === "function") {
      try {
        const item = await requestLyricsById(savedId);
        if (!isSearchCurrent(context)) return { stale: true };
        diagnostics.push({ label: "保存済みLRCLIB ID", ok: Boolean(item), count: item ? 1 : 0 });
        if (item) addUniqueResults(merged, keys, [item], "保存済みLRCLIB ID");
      } catch (error) {
        if (!isSearchCurrent(context)) return { stale: true };
        diagnostics.push({ label: "保存済みLRCLIB ID", ok: false, count: 0, error: error?.message || "取得失敗" });
        if (error?.code === "RATE_LIMIT") rateLimited = error;
      }
    }

    const { attempts, rankArtist } = initialLrclibAttempts(context);
    for (let index = 0; index < attempts.length && !rateLimited && merged.length < 8; index += 1) {
      if (index > 0) {
        if (typeof lrclibDelay === "function") await lrclibDelay(350);
        else await delay(350);
        if (!isSearchCurrent(context)) return { stale: true };
      }
      try {
        const items = await requestLyricsSearch(attempts[index].params);
        if (!isSearchCurrent(context)) return { stale: true };
        diagnostics.push({ label: attempts[index].label, ok: true, count: items.length });
        addUniqueResults(merged, keys, items, attempts[index].label);
      } catch (error) {
        if (!isSearchCurrent(context)) return { stale: true };
        diagnostics.push({ label: attempts[index].label, ok: false, count: 0, error: error?.message || "接続失敗" });
        if (error?.code === "RATE_LIMIT") rateLimited = error;
      }
    }

    return { stale: false, results: merged, diagnostics, rateLimited, rankArtist };
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

    if (provider === "lrclib") lyricsInput.dataset.lrclibId = String(item.id || "");
    else delete lyricsInput.dataset.lrclibId;

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
        return { provider: input.dataset.lyricsProvider, providerId: input.dataset.lyricsProviderId || "" };
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

  function progressDetail(lrclib, syncLabel, ovhLabel, total) {
    const lrclibDetail = (lrclib.diagnostics || []).map(item =>
      item.ok ? `${item.label}: ${item.count}件` : `${item.label}: ${item.error || "失敗"}`
    ).join(" → ");
    const rate = lrclib.rateLimited
      ? `LRCLIBレート制限${Number(lrclib.rateLimited.retryAfter) ? `（約${Number(lrclib.rateLimited.retryAfter)}秒）` : ""}`
      : "";
    return [lrclibDetail, rate, syncLabel, ovhLabel, `重複除去後: ${total}候補`].filter(Boolean).join(" → ");
  }

  async function enhancedLyricsSearch() {
    const title = $("trackTitle")?.value.trim() || "";
    if (!title) {
      if (typeof showToast === "function") showToast("先に曲名を入力してください。");
      return;
    }

    const context = beginSearch();
    const button = $("searchLyricsBtn");
    const progress = $("lyricsSearchProgress");
    if (button) {
      button.disabled = false;
      button.setAttribute("aria-busy", "true");
      button.textContent = "検索中…（再検索可）";
    }
    if (progress) progress.textContent = "LRCLIB・SyncLRC・lyrics.ovhを検索しています…";

    try {
      const lrclib = await searchLrclibGuarded(context);
      if (lrclib.stale || !isSearchCurrent(context)) return;

      const syncPromise = searchSyncLrc(context.title, context.artist, context.controller.signal);
      const ovhPromise = context.artist
        ? searchLyricsOvh(context.title, context.artist, context.controller.signal)
        : Promise.resolve([]);
      const [syncSettled, ovhSettled] = await Promise.allSettled([syncPromise, ovhPromise]);
      if (!isSearchCurrent(context)) return;

      const syncResults = syncSettled.status === "fulfilled" ? syncSettled.value : [];
      const ovhResults = ovhSettled.status === "fulfilled" ? ovhSettled.value : [];
      const syncLabel = syncSettled.status === "fulfilled"
        ? `SyncLRC: ${syncResults.length}件`
        : `SyncLRC: ${syncSettled.reason?.name === "AbortError" ? "中止" : "接続失敗"}`;
      const ovhLabel = !context.artist
        ? "lyrics.ovh: アーティスト未入力のため省略"
        : ovhSettled.status === "fulfilled"
          ? `lyrics.ovh: ${ovhResults.length}件`
          : `lyrics.ovh: ${ovhSettled.reason?.status === 404 ? "0件" : "接続失敗"}`;

      if (syncSettled.status === "rejected" && syncSettled.reason?.name !== "AbortError") {
        console.warn("[LyricTube Providers] SyncLRC search failed", syncSettled.reason);
      }
      if (ovhSettled.status === "rejected" && ovhSettled.reason?.name !== "AbortError" && ovhSettled.reason?.status !== 404) {
        console.warn("[LyricTube Providers] lyrics.ovh search failed", ovhSettled.reason);
      }

      const lrclibResults = (lrclib.results || []).map(item => ({ ...item, _provider: item?._provider || "lrclib" }));
      const merged = mergeProviderResults(lrclibResults, [...syncResults, ...ovhResults]);
      if (!isSearchCurrent(context)) return;

      pendingLyricsResults = typeof rankLyricsResults === "function"
        ? rankLyricsResults(merged, context.title, lrclib.rankArtist || "")
        : merged;

      if (!isSearchCurrent(context)) return;
      if (progress) progress.textContent = progressDetail(lrclib, syncLabel, ovhLabel, pendingLyricsResults.length);
      if (typeof renderLyricsSearchResults === "function") renderLyricsSearchResults();
      decorateProviderBadges();
      if (!isSearchCurrent(context)) return;

      context.resultsOpened = true;
      if (typeof openLyricsResultsFront === "function") openLyricsResultsFront();

      if (!pendingLyricsResults.length && isSearchCurrent(context) && typeof showToast === "function") {
        if (lrclib.rateLimited) {
          const wait = Number(lrclib.rateLimited.retryAfter) || 0;
          showToast(wait
            ? `LRCLIBの制限中です。約${wait}秒待って再検索してください。`
            : "LRCLIBのレート制限中です。少し待って再検索してください。");
        } else {
          showToast("LRCLIB・SyncLRC・lyrics.ovhのすべてで歌詞が見つかりませんでした。");
        }
      }
    } catch (error) {
      if (!isSearchCurrent(context)) return;
      console.warn("[LyricTube Providers] enhanced search failed", error);
      if (progress) progress.textContent = `検索エラー: ${error?.message || "接続失敗"}`;
      if (typeof showToast === "function") showToast("歌詞検索に失敗しました。Google歌詞検索も使えます。");
    } finally {
      resetSearchButton(context);
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

  function wireSearchInvalidation() {
    for (const id of ["trackTitle", "artistName"]) {
      $(id)?.addEventListener("input", () => {
        if (activeSearch && !sameTarget(activeSearch)) invalidateActiveSearch("target-changed");
      });
    }

    const resultsDialog = $("lyricsSearchDialog");
    resultsDialog?.addEventListener("close", () => {
      if (activeSearch?.resultsOpened) invalidateActiveSearch("results-closed");
    });
    resultsDialog?.addEventListener("cancel", () => {
      if (activeSearch) activeSearch.dismissed = true;
    }, true);

    const songDialog = $("songDialog");
    songDialog?.addEventListener("cancel", () => invalidateActiveSearch("origin-closed"), true);
    for (const id of ["closeSongDialog", "cancelSongBtn"]) {
      $(id)?.addEventListener("click", () => invalidateActiveSearch("origin-closed"), true);
    }
  }

  function init() {
    interceptSearchButton();
    interceptResultChoice();
    persistProviderMetaAfterSongSave();
    wireSearchInvalidation();
    console.info("[LyricTube] lyrics providers enabled: LRCLIB + SyncLRC + lyrics.ovh with stale-result guards");
  }

  init();
})();
