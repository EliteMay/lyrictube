(() => {
  "use strict";

  // A browser-restricted API key is entered by the user, never shipped in the
  // public repository or saved in their synced music library.
  const SESSION_KEY = "lyrictube.youtubeSearch.key.session";
  const SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
  const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
  const MAX_QUERY_LENGTH = 100;
  const $ = id => document.getElementById(id);

  function normalizedResults(payload) {
    return (Array.isArray(payload?.items) ? payload.items : [])
      .filter(item => item?.id?.kind === "youtube#video" && VIDEO_ID.test(item?.id?.videoId || ""))
      .map(item => ({
        videoId: item.id.videoId,
        title: String(item.snippet?.title || "タイトル未設定").slice(0, 180),
        channel: String(item.snippet?.channelTitle || "").slice(0, 120)
      }));
  }

  function buildSearchUrl(query, apiKey) {
    const q = String(query || "").trim().slice(0, MAX_QUERY_LENGTH);
    const key = String(apiKey || "").trim();
    if (!q || !key) throw new Error("検索キーワードとAPIキーが必要です。");
    const url = new URL(SEARCH_API);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("maxResults", "12");
    url.searchParams.set("q", q);
    url.searchParams.set("key", key);
    return url;
  }

  async function searchVideos(query, apiKey, {request = fetch, signal} = {}) {
    const url = buildSearchUrl(query, apiKey);
    // Referrer restrictions work against this site's origin, not a path or
    // an unrelated proxy. Do not send a referrer containing a search query.
    const response = await request(url.toString(), {signal, referrerPolicy: "origin"});
    if (!response.ok) {
      if (response.status === 400 || response.status === 403) {
        throw new Error("検索が拒否されました。YouTube Data APIの有効化、APIキーの制限、検索回数の上限を確認してください。");
      }
      if (response.status === 429) throw new Error("検索回数の制限に達しました。時間を置いてください。");
      throw new Error("YouTube検索に接続できませんでした。");
    }
    return normalizedResults(await response.json());
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {normalizedResults, buildSearchUrl, searchVideos};
  }

  if (typeof document === "undefined") return;

  const dialog = $("youtubeSearchDialog");
  if (!dialog) return;
  const queryInput = $("youtubeSearchQuery");
  const keyInput = $("youtubeSearchApiKey");
  const config = $("youtubeSearchConfig");
  const status = $("youtubeSearchStatus");
  const results = $("youtubeSearchResults");
  const searchButton = $("youtubeSearchSubmit");
  const saveKeyButton = $("youtubeSearchSaveKey");
  const externalButton = $("youtubeSearchExternal");
  let target = "song";
  let requestController = null;
  let searchGeneration = 0;

  function readKey() {
    try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
  }
  function saveKey(value) {
    try {
      const key = String(value || "").trim();
      if (key) sessionStorage.setItem(SESSION_KEY, key);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      status.textContent = "このブラウザでは一時保存できません。検索中にだけキーを使用します。";
    }
  }
  function setStatus(message) {
    status.textContent = message;
  }
  function clearResults() {
    results.replaceChildren();
  }
  function openSearch(mode) {
    target = mode === "version" ? "version" : "song";
    const song = window.LyricTubeCore?.getSong?.();
    const suggested = target === "song"
      ? [$("trackTitle")?.value, $("artistName")?.value].filter(Boolean).join(" ")
      : [song?.title, song?.artist].filter(Boolean).join(" ");
    queryInput.value = suggested || "";
    keyInput.value = readKey();
    config.open = !keyInput.value;
    clearResults();
    setStatus(keyInput.value ? "曲名やアーティスト名を入力して検索してください。" : "初回はYouTube Data APIキーを設定してください。");
    if (!dialog.open) dialog.showModal();
    queryInput.focus();
  }
  function closeSearch() {
    searchGeneration += 1;
    requestController?.abort();
    requestController = null;
    searchButton.disabled = false;
    searchButton.textContent = "検索";
    if (dialog.open) dialog.close();
  }

  function renderResults(items) {
    clearResults();
    if (!items.length) {
      setStatus("該当する動画が見つかりませんでした。検索語を変えてください。");
      return;
    }
    setStatus(items.length + "件の動画が見つかりました。選ぶと登録フォームへ反映します。");
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "youtube-search-result";
      const thumb = document.createElement("img");
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.src = "https://i.ytimg.com/vi/" + item.videoId + "/mqdefault.jpg";
      const body = document.createElement("div");
      body.className = "youtube-search-result-text";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const channel = document.createElement("span");
      channel.textContent = item.channel;
      const actions = document.createElement("div");
      actions.className = "youtube-search-result-actions";
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "primary-soft";
      choose.textContent = "この動画を選ぶ";
      choose.addEventListener("click", () => {
        const detail = {...item, target, accepted: false};
        document.dispatchEvent(new CustomEvent("lyrictube:youtube-search:select", {detail}));
        if (detail.accepted) closeSearch();
      });
      const link = document.createElement("a");
      link.href = "https://www.youtube.com/watch?v=" + item.videoId;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "YouTubeで確認";
      actions.append(choose, link);
      body.append(title, channel, actions);
      card.append(thumb, body);
      results.appendChild(card);
    }
  }

  async function onSearch(event) {
    event?.preventDefault?.();
    const query = queryInput.value.trim();
    const key = keyInput.value.trim() || readKey();
    if (!query) return setStatus("検索キーワードを入力してください。");
    if (!key) { config.open = true; keyInput.focus(); return setStatus("先にYouTube Data APIキーを入力してください。"); }
    saveKey(key);
    searchGeneration += 1;
    const generation = searchGeneration;
    requestController?.abort();
    requestController = new AbortController();
    searchButton.disabled = true;
    searchButton.textContent = "検索中…";
    clearResults();
    setStatus("YouTubeから検索結果を取得しています…");
    try {
      const items = await searchVideos(query, key, {signal: requestController.signal});
      if (generation === searchGeneration && dialog.open) renderResults(items);
    } catch (error) {
      if (generation === searchGeneration && dialog.open && error?.name !== "AbortError") {
        setStatus(error?.message || "検索に失敗しました。URLから追加する方法は引き続き使えます。");
      }
    } finally {
      if (generation === searchGeneration) {
        searchButton.disabled = false;
        searchButton.textContent = "検索";
        requestController = null;
      }
    }
  }

  $("searchYoutubeForSongBtn")?.addEventListener("click", () => openSearch("song"));
  $("searchYoutubeForVersionBtn")?.addEventListener("click", () => openSearch("version"));
  $("closeYoutubeSearchDialog")?.addEventListener("click", closeSearch);
  dialog.addEventListener("cancel", event => {event.preventDefault(); closeSearch();});
  $("youtubeSearchForm")?.addEventListener("submit", onSearch);
  saveKeyButton?.addEventListener("click", () => {
    saveKey(keyInput.value);
    config.open = !keyInput.value.trim();
    setStatus(keyInput.value.trim() ? "このタブでAPIキーを使用します。検索できます。" : "APIキーを入力してください。");
  });
  externalButton?.addEventListener("click", () => {
    const query = queryInput.value.trim();
    if (!query) return setStatus("YouTubeで探すキーワードを入力してください。");
    window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(query), "_blank", "noopener,noreferrer");
  });
})();
