(() => {
  "use strict";

  const BASE = "https://www.googleapis.com/youtube/v3/";
  const KEY = "lyrictube.youtubeSearch.key.session";
  const VIDEO = /^[A-Za-z0-9_-]{11}$/;
  const CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
  const $ = id => document.getElementById(id);

  function videoIdsFromLibrary(lib) {
    const ids = new Set();
    for (const song of Array.isArray(lib?.songs) ? lib.songs : []) {
      for (const version of Array.isArray(song.versions) ? song.versions : []) {
        const id = String(version.videoId || "");
        if (VIDEO.test(id) && version.source !== "localmedia") ids.add(id);
      }
    }
    return [...ids];
  }

  function chunks(items, size = 50) {
    if (!Number.isInteger(size) || size < 1 || size > 50) throw Error("Invalid page size");
    const pages = [];
    for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
    return pages;
  }

  function apiUrl(resource, params, key) {
    if (!["videos", "channels", "playlistItems"].includes(resource)) {
      throw Error("Invalid endpoint");
    }
    const url = new URL(resource, BASE);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    url.searchParams.set("key", String(key));
    return url.toString();
  }

  function normalizeChannels(videos, channels) {
    const counts = new Map();
    for (const video of videos) {
      const id = String(video?.snippet?.channelId || "");
      if (CHANNEL.test(id)) counts.set(id, (counts.get(id) || 0) + 1);
    }

    return channels
      .filter(channel => counts.has(channel?.id))
      .map(channel => ({
        id: channel.id,
        title: String(channel.snippet?.title || "チャンネル").slice(0, 150),
        icon: String(
          channel.snippet?.thumbnails?.high?.url
          || channel.snippet?.thumbnails?.medium?.url
          || channel.snippet?.thumbnails?.default?.url
          || ""
        ),
        uploadsId: String(channel.contentDetails?.relatedPlaylists?.uploads || ""),
        registeredCount: counts.get(channel.id)
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }

  function normalizeUploads(payload, registered) {
    const items = [];
    const seen = new Set();
    for (const video of Array.isArray(payload?.items) ? payload.items : []) {
      const id = String(video?.snippet?.resourceId?.videoId || "");
      if (!VIDEO.test(id) || seen.has(id)) continue;
      seen.add(id);
      const title = String(video.snippet?.title || "動画").slice(0, 180);
      if (title === "Private video" || title === "Deleted video") continue;
      items.push({ videoId: id, title, registered: registered.has(id) });
    }
    return { items, nextPageToken: String(payload?.nextPageToken || "") };
  }

  function likelyShort(video) {
    const iso = String(video?.contentDetails?.duration || "");
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)$/.exec(iso);
    if (!match || !match.slice(1).some(Boolean)) return false;

    const seconds = Number(match[1] || 0) * 86400
      + Number(match[2] || 0) * 3600
      + Number(match[3] || 0) * 60
      + Number(match[4] || 0);
    if (seconds <= 0 || seconds > 180) return false;
    if (seconds <= 60) return true;

    const snippet = video?.snippet || {};
    const details = [
      snippet.title || "",
      snippet.description || "",
      ...(Array.isArray(snippet.tags) ? snippet.tags : [])
    ].join(" ");
    return /(?:#|＃)\s*(?:shorts?|ytshorts)(?![A-Za-z0-9_])|(?:#|＃)\s*ショート(?:動画)?|(?:^|[\s　【\[（(])shorts(?=$|[\s　】\]）)!！])/i.test(details);
  }

  function onlyRegularVideos(uploads, metadata) {
    const byId = new Map(
      (Array.isArray(metadata) ? metadata : [])
        .filter(video => VIDEO.test(String(video?.id || "")))
        .map(video => [video.id, video])
    );
    return uploads.filter(item => {
      const video = byId.get(item.videoId);
      return video?.snippet?.liveBroadcastContent === "none"
        && !video.liveStreamingDetails
        && !likelyShort(video);
    });
  }

  function safeIconUrl(raw) {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol === "https:"
        && (
          host === "yt3.ggpht.com"
          || host === "yt3.googleusercontent.com"
          || host.endsWith(".ggpht.com")
          || host.endsWith(".googleusercontent.com")
        )
      ) return url.href;
    } catch {}
    return "";
  }

  // Keep data helpers usable by Node tests without initializing browser UI.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      videoIdsFromLibrary,
      chunks,
      apiUrl,
      normalizeChannels,
      normalizeUploads,
      onlyRegularVideos,
      likelyShort,
      safeIconUrl
    };
  }
  if (typeof document === "undefined") return;

  const dialog = $("youtubeChannelsDialog");
  if (!dialog || !window.LyricTubeCore) return;

  const keyInput = $("channelApiKey");
  const help = $("channelKeyHelp");
  const list = $("channelList");
  const panel = $("channelPanel");
  const videoPanel = $("channelVideosPanel");
  const status = $("channelStatus");
  const vstatus = $("channelVideoStatus");
  const videos = $("channelVideos");
  const refresh = $("channelRefreshBtn");
  const more = $("channelLoadMore");
  const filter = $("channelFilter");
  let aborter = null;
  let seq = 0;
  let cache = null;
  let cacheSignature = "";
  let selected = null;
  let nextToken = "";

  function key() {
    try {
      return sessionStorage.getItem(KEY) || keyInput.value.trim();
    } catch {
      return keyInput.value.trim();
    }
  }

  function cancel() {
    seq++;
    aborter?.abort();
    aborter = null;
  }

  function begin() {
    cancel();
    aborter = new AbortController();
    return { seq, signal: aborter.signal };
  }

  function live(ctx) {
    return dialog.open && ctx.seq === seq && !ctx.signal.aborted;
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function avatar(channel) {
    const wrapper = node("span", "channel-avatar", channel.title.slice(0, 1) || "♪");
    const url = safeIconUrl(channel.icon);
    if (url) {
      const img = node("img");
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.style.opacity = "0";
      img.addEventListener("load", () => { img.style.opacity = "1"; }, { once: true });
      img.addEventListener("error", () => img.remove(), { once: true });
      wrapper.append(img);
      img.src = url;
    }
    return wrapper;
  }

  function errorMessage(code) {
    if (code === 400 || code === 403) {
      return "YouTube APIキー、利用権限、利用上限を確認してください。";
    }
    return code === 429
      ? "YouTubeの利用制限に達しました。"
      : "YouTubeへ接続できませんでした。";
  }

  async function request(endpoint, params, ctx) {
    const response = await fetch(apiUrl(endpoint, params, key()), {
      signal: ctx.signal,
      referrerPolicy: "origin"
    });
    if (!response.ok) throw Error(errorMessage(response.status));
    return response.json();
  }

  function showChannels() {
    list.replaceChildren();
    if (!cache?.length) {
      list.append(node("p", "channel-empty", "チャンネルが見つかりません。"));
      return;
    }

    const query = filter.value.trim().toLowerCase();
    const matches = cache.filter(channel => channel.title.toLowerCase().includes(query));
    if (!matches.length) {
      list.append(node("p", "channel-empty", "一致するチャンネルがありません。"));
    }

    for (const channel of matches) {
      const button = node("button", "channel-card");
      button.type = "button";
      const meta = node("span", "channel-card-meta");
      meta.append(
        node("strong", "", channel.title),
        node("small", "", channel.registeredCount + "件の登録動画")
      );
      button.append(avatar(channel), meta, node("span", "channel-card-arrow", "›"));
      button.addEventListener("click", () => openChannel(channel));
      list.append(button);
    }
  }

  async function scan(force = false) {
    cancel();
    const ids = videoIdsFromLibrary(window.LyricTubeCore.getLibrary());
    const signature = ids.slice().sort().join(",");
    refresh.disabled = false;

    if (!ids.length) {
      cache = [];
      cacheSignature = signature;
      status.textContent = "動画が未登録です。先に曲を追加してください。";
      showChannels();
      return;
    }
    if (!key()) {
      help.hidden = false;
      list.replaceChildren();
      status.textContent = "YouTube Data APIキーを設定してください。";
      return;
    }
    if (!force && cache && signature === cacheSignature) {
      status.textContent = cache.length + "件のチャンネル";
      showChannels();
      return;
    }

    const ctx = begin();
    const found = [];
    const owners = [];
    refresh.disabled = true;
    help.hidden = true;
    list.replaceChildren();
    status.textContent = ids.length + "件の登録動画を調べています…";

    try {
      for (const batch of chunks(ids)) {
        const data = await request("videos", { part: "snippet", id: batch.join(",") }, ctx);
        if (!live(ctx)) return;
        found.push(...(Array.isArray(data.items) ? data.items : []));
      }

      const ownerIds = [
        ...new Set(
          found.map(item => item?.snippet?.channelId)
            .filter(id => CHANNEL.test(String(id || "")))
        )
      ];
      for (const batch of chunks(ownerIds)) {
        const data = await request("channels", {
          part: "snippet,contentDetails",
          id: batch.join(",")
        }, ctx);
        if (!live(ctx)) return;
        owners.push(...(Array.isArray(data.items) ? data.items : []));
      }

      if (!live(ctx)) return;
      cache = normalizeChannels(found, owners);
      cacheSignature = signature;
      status.textContent = cache.length + "件のチャンネルを取得しました。";
      showChannels();
    } catch (error) {
      if (live(ctx)) status.textContent = error.message || "取得に失敗しました。";
    } finally {
      if (live(ctx)) refresh.disabled = false;
    }
  }

  function listView() {
    cancel();
    selected = null;
    nextToken = "";
    panel.hidden = false;
    videoPanel.hidden = true;
    more.hidden = true;
  }

  function openChannel(channel) {
    selected = channel;
    nextToken = "";
    panel.hidden = true;
    videoPanel.hidden = false;
    $("channelCurrentIcon").replaceChildren(avatar(channel));
    $("channelCurrentName").textContent = channel.title;
    videos.replaceChildren();
    loadVideos(false);
  }

  function registered() {
    return new Set(videoIdsFromLibrary(window.LyricTubeCore.getLibrary()));
  }

  function showVideos(items, channel) {
    for (const item of items) {
      const card = node("article", "channel-video-card");
      const img = node("img", "channel-video-cover");
      const body = node("div", "channel-video-meta");
      const actions = node("div", "channel-video-actions");
      img.src = "https://i.ytimg.com/vi/" + item.videoId + "/mqdefault.jpg";
      img.alt = "";
      img.loading = "lazy";
      body.append(node("strong", "", item.title));

      const choose = node("button", "primary-soft", item.registered ? "登録済み" : "この動画を追加");
      choose.type = "button";
      choose.disabled = item.registered;
      choose.addEventListener("click", () => {
        close();
        $("addSongBtn")?.click();
        const detail = {
          videoId: item.videoId,
          title: item.title,
          channel: channel.title,
          target: "song",
          accepted: false
        };
        document.dispatchEvent(new CustomEvent("lyrictube:youtube-search:select", { detail }));
        if (!detail.accepted) {
          window.LyricTubeCore.toast("動画を選択できませんでした。重複登録などを確認してください。");
        }
      });

      const link = node("a", "", "YouTubeで確認 ↗");
      link.href = "https://www.youtube.com/watch?v=" + item.videoId;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(choose, link);
      body.append(actions);
      card.append(img, body);
      videos.append(card);
    }
  }

  async function loadVideos(append) {
    if (!selected) return;
    const channel = selected;
    const token = append ? nextToken : "";
    if (append && !token) return;
    if (!channel.uploadsId) {
      vstatus.textContent = "投稿動画一覧を取得できません。";
      return;
    }

    const ctx = begin();
    more.hidden = true;
    vstatus.textContent = "投稿動画を取得しています…";

    try {
      const params = { part: "snippet", playlistId: channel.uploadsId, maxResults: 50 };
      if (token) params.pageToken = token;
      const data = await request("playlistItems", params, ctx);
      if (!live(ctx) || selected?.id !== channel.id) return;

      const result = normalizeUploads(data, registered());
      let regular = [];
      if (result.items.length) {
        const details = await request("videos", {
          part: "snippet,contentDetails,liveStreamingDetails",
          id: result.items.map(item => item.videoId).join(",")
        }, ctx);
        if (!live(ctx) || selected?.id !== channel.id) return;
        regular = onlyRegularVideos(result.items, details.items);
      }

      if (!append) videos.replaceChildren();
      showVideos(regular, channel);
      nextToken = result.nextPageToken;
      more.hidden = !nextToken;
      vstatus.textContent = videos.childElementCount
        ? "動画を表示中（配信・Shorts候補を除外）"
        : nextToken
          ? "この50件はすべて除外対象でした。次の50件を確認できます。"
          : "表示できる通常動画が見つかりませんでした。";
    } catch (error) {
      if (live(ctx)) {
        vstatus.textContent = error.message || "取得できませんでした。";
        if (append) more.hidden = false;
      }
    }
  }

  function close() {
    cancel();
    selected = null;
    if (dialog.open) dialog.close();
  }

  function open() {
    listView();
    keyInput.value = "";
    help.hidden = Boolean(key());
    if (!dialog.open) dialog.showModal();
    scan();
  }

  $("browseChannelsBtn")?.addEventListener("click", open);
  $("closeYoutubeChannelsDialog")?.addEventListener("click", close);
  $("channelBackBtn")?.addEventListener("click", listView);
  more.addEventListener("click", () => loadVideos(true));
  refresh.addEventListener("click", () => scan(true));
  filter.addEventListener("input", showChannels);
  $("channelKeySave")?.addEventListener("click", () => {
    const value = keyInput.value.trim();
    if (!value) {
      status.textContent = "APIキーを入力してください。";
      return;
    }
    try {
      sessionStorage.setItem(KEY, value);
    } catch {
      status.textContent = "このブラウザではキーを保存できません。";
      return;
    }
    keyInput.value = "";
    help.hidden = true;
    scan(true);
  });
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", cancel);
})();
