(() => {
  "use strict";

  const TAG_VERSION = window.LyricTubeVersion?.version || "v0.13.2";
  const COLOR_PRESETS = [
    { id: "violet", label: "紫" },
    { id: "blue", label: "青" },
    { id: "cyan", label: "水色" },
    { id: "green", label: "緑" },
    { id: "lime", label: "黄緑" },
    { id: "yellow", label: "黄" },
    { id: "orange", label: "橙" },
    { id: "red", label: "赤" },
    { id: "pink", label: "ピンク" },
    { id: "slate", label: "グレー" }
  ];
  const COLOR_IDS = new Set(COLOR_PRESETS.map(item => item.id));
  const activeTagIds = new Set();

  let ready = false;
  let tagPageOpen = false;
  let managerSelectedTagId = "";
  let managerSongQuery = "";
  let editingTagId = "";
  let editorColor = "violet";
  let songTagTargetId = "";
  let songTagDraft = new Set();
  let songFormTagDraft = new Set();

  const $ = id => document.getElementById(id);

  function safeShowToast(message) {
    try {
      if (typeof showToast === "function") showToast(message);
      else console.info(`[LyricTube Tags] ${message}`);
    } catch {
      console.info(`[LyricTube Tags] ${message}`);
    }
  }

  function tags() {
    if (!library?.settings) return [];
    if (!Array.isArray(library.settings.tags)) library.settings.tags = [];
    return library.settings.tags;
  }

  function tagById(id) {
    return tags().find(tag => tag.id === id) || null;
  }

  function songTagIds(song) {
    return Array.isArray(song?.tagIds) ? song.tagIds : [];
  }

  function normalizeTagData() {
    let changed = false;
    if (!library.settings || typeof library.settings !== "object") {
      library.settings = {};
      changed = true;
    }
    if (!Array.isArray(library.settings.tags)) {
      library.settings.tags = [];
      changed = true;
    }

    const seen = new Set();
    const normalized = [];
    for (const raw of library.settings.tags) {
      if (!raw || typeof raw !== "object") { changed = true; continue; }
      const name = String(raw.name || "").trim().slice(0, 24);
      if (!name) { changed = true; continue; }
      let id = String(raw.id || "").trim();
      if (!id || seen.has(id)) { id = uid(); changed = true; }
      seen.add(id);
      const color = COLOR_IDS.has(raw.color) ? raw.color : "violet";
      if (color !== raw.color || name !== raw.name || id !== raw.id) changed = true;
      normalized.push({ id, name, color });
    }
    if (JSON.stringify(normalized) !== JSON.stringify(library.settings.tags)) {
      library.settings.tags = normalized;
      changed = true;
    }

    const validIds = new Set(normalized.map(tag => tag.id));
    for (const song of library.songs || []) {
      const next = [...new Set(songTagIds(song).map(String).filter(id => validIds.has(id)))];
      if (!Array.isArray(song.tagIds) || JSON.stringify(next) !== JSON.stringify(song.tagIds)) {
        song.tagIds = next;
        changed = true;
      }
    }
    return changed;
  }

  function tagUsageCount(tagId) {
    return (library.songs || []).reduce((count, song) => count + (songTagIds(song).includes(tagId) ? 1 : 0), 0);
  }

  function tagClass(tag) {
    return `tag-color-${COLOR_IDS.has(tag?.color) ? tag.color : "violet"}`;
  }

  function makeTagPill(tag, options = {}) {
    const el = document.createElement(options.button ? "button" : "span");
    if (options.button) el.type = "button";
    el.className = `tag-pill ${tagClass(tag)}${options.compact ? " compact" : ""}`;
    el.textContent = tag.name;
    if (options.title) el.title = options.title;
    return el;
  }

  function ensureUi() {
    createTagPage();
    createTagEditorDialog();
    createSongTagDialog();
    createSongFormTagSection();
    ensurePageButton();
    ensureTopTagButton();
    ensureSidebarTags();
    ensureBrowseTagFilter();
  }

  function ensurePageButton() {
    if ($("tagsPageBtn")) return;
    const browseBtn = $("browsePageBtn");
    if (!browseBtn?.parentElement) return;
    browseBtn.parentElement.classList.add("has-tags-page");
    const btn = document.createElement("button");
    btn.id = "tagsPageBtn";
    btn.className = "page-switch-btn";
    btn.type = "button";
    btn.innerHTML = "<span>#</span><span>タグ</span>";
    btn.addEventListener("click", () => openTagManager());
    browseBtn.insertAdjacentElement("afterend", btn);

    $("playerPageBtn")?.addEventListener("click", () => { tagPageOpen = false; }, true);
    $("browsePageBtn")?.addEventListener("click", () => { tagPageOpen = false; }, true);
  }

  function ensureTopTagButton() {
    if ($("songTagsBtn")) return;
    const editSongBtn = $("editSongBtn");
    if (!editSongBtn?.parentElement) return;
    const btn = document.createElement("button");
    btn.id = "songTagsBtn";
    btn.className = "ghost-btn song-tags-top-btn";
    btn.type = "button";
    btn.textContent = "タグ";
    btn.disabled = true;
    btn.addEventListener("click", () => {
      const song = typeof getSong === "function" ? getSong() : null;
      if (song) openSongTagDialog(song.id);
    });
    editSongBtn.insertAdjacentElement("beforebegin", btn);
  }

  function ensureSidebarTags() {
    if ($("tagSidebarNav")) return;
    const playlistHead = document.querySelector(".playlist-head");
    if (!playlistHead?.parentElement) return;

    const head = document.createElement("div");
    head.className = "tag-sidebar-head";
    head.innerHTML = '<span>タグ</span><button id="tagSidebarManageBtn" class="mini-icon" type="button" title="タグ管理">＋</button>';

    const nav = document.createElement("div");
    nav.id = "tagSidebarNav";
    nav.className = "tag-sidebar-nav";

    playlistHead.before(head, nav);
    $("tagSidebarManageBtn")?.addEventListener("click", openTagManager);
  }

  function ensureBrowseTagFilter() {
    if ($("tagFilterWrap")) return;
    const chips = document.querySelector(".browse-chips");
    if (!chips) return;

    const wrap = document.createElement("div");
    wrap.id = "tagFilterWrap";
    wrap.className = "tag-filter-wrap";
    wrap.innerHTML = `
      <button id="tagFilterBtn" class="browse-chip tag-filter-btn" type="button" aria-expanded="false">
        <span>タグ</span><span id="tagFilterCount" class="tag-filter-count"></span><span class="tag-filter-caret">▾</span>
      </button>
      <div id="tagFilterPopover" class="tag-filter-popover" hidden>
        <div class="tag-filter-head"><strong>タグで絞り込み</strong><span>選択したタグをすべて含む曲</span></div>
        <div id="tagFilterList" class="tag-filter-list"></div>
        <div class="tag-filter-actions">
          <button id="clearTagFilterBtn" class="ghost-btn" type="button">選択解除</button>
          <button id="openTagManagerFromFilter" class="primary-soft" type="button">タグ管理</button>
        </div>
      </div>`;
    chips.appendChild(wrap);

    const btn = $("tagFilterBtn");
    const pop = $("tagFilterPopover");
    btn.addEventListener("click", event => {
      event.stopPropagation();
      const next = pop.hidden;
      pop.hidden = !next;
      btn.setAttribute("aria-expanded", String(next));
      if (next) renderTagFilter();
    });
    pop.addEventListener("click", event => event.stopPropagation());
    $("clearTagFilterBtn").addEventListener("click", () => {
      activeTagIds.clear();
      renderAll();
    });
    $("openTagManagerFromFilter").addEventListener("click", () => {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      openTagManager();
    });
    document.addEventListener("click", () => {
      if (!pop.hidden) {
        pop.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  function createTagPage() {
    if ($("tagsPage")) return;
    const browsePage = $("browsePage");
    if (!browsePage?.parentElement) return;
    const page = document.createElement("section");
    page.id = "tagsPage";
    page.className = "tags-page page-hidden";
    page.innerHTML = `
      <div class="tags-hero">
        <div>
          <p class="eyebrow">ORGANIZE</p>
          <h2>タグ管理</h2>
          <p class="muted">自分用のタグを作成して、複数の曲へまとめて付けられます。</p>
        </div>
        <button id="createTagBtn" class="primary-btn" type="button">＋ タグを作成</button>
      </div>
      <div class="tags-summary" id="tagsSummary"></div>
      <div class="tag-manager-layout">
        <section class="tag-manager-panel tag-list-panel">
          <div class="tag-manager-head"><div><p class="eyebrow">TAGS</p><h3>タグ一覧</h3></div></div>
          <div id="tagManagerList" class="tag-manager-list"></div>
        </section>
        <section class="tag-manager-panel tag-song-panel">
          <div id="tagSongManagerEmpty" class="tag-manager-empty">
            <strong>タグを選択してください</strong>
            <span>左のタグを選ぶと、そのタグを付ける曲をまとめて編集できます。</span>
          </div>
          <div id="tagSongManager" hidden>
            <div class="tag-song-manager-head">
              <div><p class="eyebrow">ASSIGN</p><h3 id="tagSongManagerTitle">曲へタグを付ける</h3></div>
              <span id="tagSongManagerCount" class="tag-manager-count"></span>
            </div>
            <div class="tag-song-toolbar">
              <label class="tag-song-search"><span>⌕</span><input id="tagSongSearch" type="search" placeholder="曲名・アーティストを検索"></label>
              <button id="tagSelectVisibleBtn" class="ghost-btn" type="button">表示中をすべて付ける</button>
              <button id="tagClearVisibleBtn" class="ghost-btn" type="button">表示中をすべて外す</button>
            </div>
            <div id="tagSongList" class="tag-song-list"></div>
          </div>
        </section>
      </div>`;
    browsePage.insertAdjacentElement("afterend", page);

    $("createTagBtn")?.addEventListener("click", () => openTagEditor());
    $("tagSongSearch")?.addEventListener("input", event => {
      managerSongQuery = String(event.target.value || "");
      renderManagerSongList();
    });
    $("tagSelectVisibleBtn")?.addEventListener("click", () => applyTagToVisibleSongs(true));
    $("tagClearVisibleBtn")?.addEventListener("click", () => applyTagToVisibleSongs(false));
  }

  function createTagEditorDialog() {
    if ($("tagEditorDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "tagEditorDialog";
    dialog.className = "dialog tag-editor-dialog";
    dialog.innerHTML = `
      <div class="dialog-head">
        <div><p class="eyebrow">TAG</p><h3 id="tagEditorTitle">タグを作成</h3></div>
        <button id="closeTagEditor" class="icon-btn subtle" type="button">×</button>
      </div>
      <div class="tag-editor-body">
        <label class="tag-editor-field"><span>タグ名</span><input id="tagNameInput" type="text" maxlength="24" placeholder="例：ボカロ"></label>
        <div class="tag-editor-field"><span>色</span><div id="tagColorPresets" class="tag-color-presets"></div></div>
        <div class="tag-editor-preview"><span class="muted small">プレビュー</span><span id="tagEditorPreview"></span></div>
      </div>
      <div class="dialog-actions"><button id="cancelTagEditor" class="ghost-btn" type="button">キャンセル</button><button id="saveTagEditor" class="primary-btn" type="button">保存</button></div>`;
    document.body.appendChild(dialog);

    $("closeTagEditor", dialog).addEventListener("click", () => dialog.close());
    $("cancelTagEditor", dialog).addEventListener("click", () => dialog.close());
    $("tagNameInput", dialog).addEventListener("input", renderTagEditorPreview);
    $("saveTagEditor", dialog).addEventListener("click", saveTagEditor);
  }

  function createSongTagDialog() {
    if ($("songTagDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "songTagDialog";
    dialog.className = "dialog song-tag-dialog";
    dialog.innerHTML = `
      <div class="dialog-head">
        <div><p class="eyebrow">TAGS</p><h3 id="songTagDialogTitle">曲のタグ</h3></div>
        <button id="closeSongTagDialog" class="icon-btn subtle" type="button">×</button>
      </div>
      <div class="song-tag-body">
        <div id="songTagList" class="song-tag-check-list"></div>
        <div class="song-tag-create">
          <input id="quickTagName" type="text" maxlength="24" placeholder="新しいタグ名">
          <select id="quickTagColor" aria-label="タグの色"></select>
          <button id="quickCreateTagBtn" class="primary-soft" type="button">作成して選択</button>
        </div>
      </div>
      <div class="dialog-actions"><button id="cancelSongTagDialog" class="ghost-btn" type="button">キャンセル</button><button id="saveSongTagsBtn" class="primary-btn" type="button">この曲に保存</button></div>`;
    document.body.appendChild(dialog);

    const select = $("quickTagColor", dialog);
    for (const preset of COLOR_PRESETS) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.appendChild(option);
    }
    $("closeSongTagDialog", dialog).addEventListener("click", () => dialog.close());
    $("cancelSongTagDialog", dialog).addEventListener("click", () => dialog.close());
    $("saveSongTagsBtn", dialog).addEventListener("click", saveSongTags);
    $("quickCreateTagBtn", dialog).addEventListener("click", quickCreateTag);
  }


  function createSongFormTagSection() {
    if ($("songFormTagSection")) return;
    const lyricsBox = document.querySelector("#songForm .lyrics-source-box");
    if (!lyricsBox?.parentElement) return;

    const section = document.createElement("section");
    section.id = "songFormTagSection";
    section.className = "song-form-tag-section";
    section.innerHTML = `
      <div class="song-form-tag-head">
        <div><strong>タグ</strong><span>曲を追加・編集するときに、そのまま分類できます。</span></div>
        <span id="songFormTagCount" class="song-form-tag-count"></span>
      </div>
      <div id="songFormTagList" class="song-form-tag-list"></div>
      <div class="song-form-tag-create">
        <input id="songFormQuickTagName" type="text" maxlength="24" placeholder="新しいタグ名">
        <select id="songFormQuickTagColor" aria-label="新しいタグの色"></select>
        <button id="songFormQuickCreateTagBtn" class="primary-soft" type="button">作成して選択</button>
      </div>`;
    lyricsBox.before(section);

    const select = $("songFormQuickTagColor");
    for (const preset of COLOR_PRESETS) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.appendChild(option);
    }
    $("songFormQuickCreateTagBtn")?.addEventListener("click", quickCreateSongFormTag);
  }

  function renderSongFormTagList() {
    const list = $("songFormTagList");
    if (!list) return;
    list.innerHTML = "";

    if (!tags().length) {
      const empty = document.createElement("span");
      empty.className = "song-form-tag-empty";
      empty.textContent = "タグはまだありません。下から作ると、この曲へそのまま付けられます。";
      list.appendChild(empty);
    } else {
      for (const tag of tags()) {
        const label = document.createElement("label");
        label.className = "song-form-tag-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = songFormTagDraft.has(tag.id);
        input.addEventListener("change", () => {
          if (input.checked) songFormTagDraft.add(tag.id);
          else songFormTagDraft.delete(tag.id);
          renderSongFormTagCount();
        });
        label.append(input, makeTagPill(tag));
        list.appendChild(label);
      }
    }
    renderSongFormTagCount();
  }

  function renderSongFormTagCount() {
    const count = $("songFormTagCount");
    if (!count) return;
    const selected = [...songFormTagDraft].filter(id => tagById(id)).length;
    count.textContent = selected ? `${selected}個選択` : "未選択";
  }

  function resetSongFormTags(song = null) {
    songFormTagDraft = new Set(songTagIds(song));
    if ($("songFormQuickTagName")) $("songFormQuickTagName").value = "";
    if ($("songFormQuickTagColor")) $("songFormQuickTagColor").value = "violet";
    renderSongFormTagList();
  }

  function quickCreateSongFormTag() {
    const name = String($("songFormQuickTagName")?.value || "").trim().slice(0, 24);
    const colorValue = $("songFormQuickTagColor")?.value;
    const color = COLOR_IDS.has(colorValue) ? colorValue : "violet";
    if (!name) return safeShowToast("新しいタグ名を入力してください。");

    const duplicate = tags().find(tag =>
      tag.name.normalize("NFKC").toLowerCase() === name.normalize("NFKC").toLowerCase()
    );
    if (duplicate) {
      songFormTagDraft.add(duplicate.id);
      renderSongFormTagList();
      safeShowToast("既存のタグを選択しました。");
      return;
    }

    const tag = { id: uid(), name, color };
    tags().push(tag);
    songFormTagDraft.add(tag.id);
    persistLibrary();
    $("songFormQuickTagName").value = "";
    renderSongFormTagList();
    renderTagSidebar();
    renderTagFilter();
    renderTagManagerPage();
    safeShowToast("タグを作成して選択しました。");
  }

  function openStandardPage(mode) {
    tagPageOpen = false;
    setMainPage(mode);
  }

  function openTagManager() {
    tagPageOpen = true;
    ensureUi();
    renderMainPage();
    renderTagManagerPage();
    document.body.classList.remove("mobile-sidebar-open");
    $("mobileMenuBtn")?.setAttribute("aria-expanded", "false");
  }

  function renderTagSidebar() {
    const nav = $("tagSidebarNav");
    if (!nav) return;
    nav.innerHTML = "";
    const defs = [...tags()].sort((a, b) => tagUsageCount(b.id) - tagUsageCount(a.id) || a.name.localeCompare(b.name, "ja"));
    if (!defs.length) {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "tag-sidebar-empty";
      empty.textContent = "＋ 最初のタグを作る";
      empty.addEventListener("click", openTagEditor);
      nav.appendChild(empty);
      return;
    }

    for (const tag of defs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tag-sidebar-item${activeTagIds.has(tag.id) ? " active" : ""}`;
      const left = document.createElement("span");
      left.className = "tag-sidebar-name";
      const dot = document.createElement("i");
      dot.className = `tag-dot ${tagClass(tag)}`;
      const text = document.createElement("span");
      text.textContent = tag.name;
      left.append(dot, text);
      const count = document.createElement("span");
      count.className = "nav-count";
      count.textContent = String(tagUsageCount(tag.id));
      button.append(left, count);
      button.addEventListener("click", () => {
        activeTagIds.clear();
        activeTagIds.add(tag.id);
        openStandardPage("browse");
        renderAll();
      });
      nav.appendChild(button);
    }
  }

  function renderTagFilter() {
    const list = $("tagFilterList");
    const countEl = $("tagFilterCount");
    const filterBtn = $("tagFilterBtn");
    if (!list || !countEl || !filterBtn) return;

    countEl.textContent = activeTagIds.size ? String(activeTagIds.size) : "";
    filterBtn.classList.toggle("active", activeTagIds.size > 0);
    list.innerHTML = "";

    if (!tags().length) {
      const empty = document.createElement("p");
      empty.className = "tag-filter-empty";
      empty.textContent = "タグがまだありません。";
      list.appendChild(empty);
      return;
    }

    for (const tag of tags()) {
      const label = document.createElement("label");
      label.className = "tag-filter-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = activeTagIds.has(tag.id);
      input.addEventListener("change", () => {
        if (input.checked) activeTagIds.add(tag.id);
        else activeTagIds.delete(tag.id);
        renderAll();
        renderTagFilter();
      });
      const pill = makeTagPill(tag, { compact: true });
      const count = document.createElement("span");
      count.className = "tag-filter-row-count";
      count.textContent = `${tagUsageCount(tag.id)}曲`;
      label.append(input, pill, count);
      list.appendChild(label);
    }
  }

  function augmentBrowseCards() {
    const cards = [...document.querySelectorAll("#browseGrid .browse-card")];
    if (!cards.length) return;
    const songs = viewSongs();
    cards.forEach((card, index) => {
      const song = songs[index];
      if (!song) return;

      const actions = card.querySelector(".browse-card-actions");
      if (actions && !actions.querySelector(".browse-tag-edit")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "browse-tag-edit";
        button.textContent = "#";
        button.title = `「${song.title}」のタグを編集`;
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          openSongTagDialog(song.id);
        });
        actions.prepend(button);
      }

      const status = card.querySelector(".browse-status");
      if (status && !status.querySelector(".browse-tag-pills")) {
        const assigned = songTagIds(song).map(tagById).filter(Boolean);
        if (assigned.length) {
          const wrap = document.createElement("div");
          wrap.className = "browse-tag-pills";
          assigned.slice(0, 2).forEach(tag => wrap.appendChild(makeTagPill(tag, { compact: true })));
          if (assigned.length > 2) {
            const more = document.createElement("span");
            more.className = "tag-more";
            more.textContent = `+${assigned.length - 2}`;
            wrap.appendChild(more);
          }
          status.appendChild(wrap);
        }
      }
    });
  }

  function updateTopTagButton() {
    const button = $("songTagsBtn");
    if (!button) return;
    const song = typeof getSong === "function" ? getSong() : null;
    button.disabled = !song;
    if (!song) {
      button.textContent = "タグ";
      return;
    }
    const count = songTagIds(song).filter(id => tagById(id)).length;
    button.textContent = count ? `タグ ${count}` : "タグ";
  }

  function renderTagManagerPage() {
    const page = $("tagsPage");
    if (!page) return;
    const summary = $("tagsSummary");
    if (summary) {
      const taggedSongs = (library.songs || []).filter(song => songTagIds(song).length).length;
      const totalLinks = (library.songs || []).reduce((sum, song) => sum + songTagIds(song).length, 0);
      summary.innerHTML = `<div><strong>${tags().length}</strong><span>タグ</span></div><div><strong>${taggedSongs}</strong><span>タグ付き曲</span></div><div><strong>${totalLinks}</strong><span>タグ付け数</span></div>`;
    }

    const list = $("tagManagerList");
    if (!list) return;
    list.innerHTML = "";

    if (!tags().length) {
      const empty = document.createElement("div");
      empty.className = "tag-manager-empty compact";
      empty.innerHTML = "<strong>タグがまだありません</strong><span>「＋ タグを作成」から、自分用の分類を作れます。</span>";
      list.appendChild(empty);
      managerSelectedTagId = "";
      renderManagerSongList();
      return;
    }

    if (!tagById(managerSelectedTagId)) managerSelectedTagId = tags()[0].id;

    for (const tag of tags()) {
      const item = document.createElement("div");
      item.className = `tag-manager-item${managerSelectedTagId === tag.id ? " active" : ""}`;
      item.dataset.tagId = tag.id;
      const select = document.createElement("button");
      select.type = "button";
      select.className = "tag-manager-select";
      const dot = document.createElement("i");
      dot.className = `tag-dot large ${tagClass(tag)}`;
      const copy = document.createElement("span");
      copy.className = "tag-manager-copy";
      const name = document.createElement("strong");
      name.textContent = tag.name;
      const count = document.createElement("span");
      count.textContent = `${tagUsageCount(tag.id)}曲`;
      copy.append(name, count);
      select.append(dot, copy);
      select.addEventListener("click", () => {
        managerSelectedTagId = tag.id;
        managerSongQuery = "";
        if ($("tagSongSearch")) $("tagSongSearch").value = "";
        renderTagManagerPage();
      });

      const actions = document.createElement("div");
      actions.className = "tag-manager-item-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "tag-manager-icon";
      edit.textContent = "編集";
      edit.addEventListener("click", () => openTagEditor(tag.id));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "tag-manager-icon danger";
      del.textContent = "削除";
      del.addEventListener("click", () => deleteTag(tag.id));
      actions.append(edit, del);
      item.append(select, actions);
      list.appendChild(item);
    }
    renderManagerSongList();
  }

  function managerVisibleSongs() {
    const q = String(managerSongQuery || "").normalize("NFKC").toLowerCase().trim();
    if (!q) return [...(library.songs || [])];
    return (library.songs || []).filter(song => {
      const haystack = `${song.title || ""} ${song.artist || ""} ${(song.versions || []).map(v => `${v.performer || ""} ${v.label || ""}`).join(" ")}`
        .normalize("NFKC").toLowerCase();
      return haystack.includes(q);
    });
  }

  function renderManagerSongList() {
    const holder = $("tagSongManager");
    const empty = $("tagSongManagerEmpty");
    const list = $("tagSongList");
    const tag = tagById(managerSelectedTagId);
    if (!holder || !empty || !list) return;

    if (!tag) {
      holder.hidden = true;
      empty.hidden = false;
      list.innerHTML = "";
      return;
    }

    holder.hidden = false;
    empty.hidden = true;
    const title = $("tagSongManagerTitle");
    if (title) {
      title.innerHTML = "";
      title.append(makeTagPill(tag), document.createTextNode(" を付ける曲"));
    }

    const visible = managerVisibleSongs();
    const assignedCount = tagUsageCount(tag.id);
    if ($("tagSongManagerCount")) $("tagSongManagerCount").textContent = `${assignedCount}/${library.songs.length}曲`;
    list.innerHTML = "";

    if (!visible.length) {
      const no = document.createElement("div");
      no.className = "tag-manager-empty compact";
      no.innerHTML = "<strong>該当する曲がありません</strong><span>検索条件を変えてください。</span>";
      list.appendChild(no);
      return;
    }

    for (const song of visible) {
      const label = document.createElement("label");
      label.className = "tag-song-row";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = songTagIds(song).includes(tag.id);
      check.addEventListener("change", () => {
        setSongTag(song, tag.id, check.checked);
        persistLibrary();
        renderTagSidebar();
        renderTagFilter();
        renderBrowse();
        renderLibrary();
        const managerItem = document.querySelector(`.tag-manager-item[data-tag-id="${CSS.escape(tag.id)}"] .tag-manager-copy span`);
        if (managerItem) managerItem.textContent = `${tagUsageCount(tag.id)}曲`;
        if ($("tagSongManagerCount")) $("tagSongManagerCount").textContent = `${tagUsageCount(tag.id)}/${library.songs.length}曲`;
      });

      const thumb = document.createElement("span");
      thumb.className = "tag-song-thumb";
      const videoId = song.versions?.[0]?.videoId;
      if (videoId) {
        const img = document.createElement("img");
        img.src = thumbnailUrl(videoId);
        img.alt = "";
        img.loading = "lazy";
        thumb.appendChild(img);
      } else {
        thumb.textContent = "♫";
      }
      const copy = document.createElement("span");
      copy.className = "tag-song-copy";
      const strong = document.createElement("strong");
      strong.textContent = song.title || "無題";
      const artist = document.createElement("span");
      artist.textContent = song.artist || "アーティスト未設定";
      copy.append(strong, artist);
      label.append(check, thumb, copy);
      list.appendChild(label);
    }
  }

  function setSongTag(song, tagId, enabled) {
    const set = new Set(songTagIds(song));
    if (enabled) set.add(tagId);
    else set.delete(tagId);
    song.tagIds = [...set];
    song.updatedAt = nowIso();
  }

  function applyTagToVisibleSongs(enabled) {
    const tag = tagById(managerSelectedTagId);
    if (!tag) return;
    const visible = managerVisibleSongs();
    if (!visible.length) return;
    visible.forEach(song => setSongTag(song, tag.id, enabled));
    persistLibrary();
    renderTagManagerPage();
    renderTagSidebar();
    renderTagFilter();
    if (typeof renderBrowse === "function") renderBrowse();
    if (typeof renderLibrary === "function") renderLibrary();
    safeShowToast(enabled ? `${visible.length}曲に「${tag.name}」を付けました。` : `${visible.length}曲から「${tag.name}」を外しました。`);
  }

  function openTagEditor(tagId = "") {
    const dialog = $("tagEditorDialog");
    if (!dialog) return;
    const tag = tagId ? tagById(tagId) : null;
    editingTagId = tag?.id || "";
    editorColor = tag?.color || "violet";
    $("tagEditorTitle").textContent = tag ? "タグを編集" : "タグを作成";
    $("tagNameInput").value = tag?.name || "";
    renderColorPresets();
    renderTagEditorPreview();
    if (!dialog.open) dialog.showModal();
    setTimeout(() => $("tagNameInput")?.focus(), 0);
  }

  function renderColorPresets() {
    const wrap = $("tagColorPresets");
    if (!wrap) return;
    wrap.innerHTML = "";
    for (const preset of COLOR_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tag-color-choice ${tagClass({ color: preset.id })}${editorColor === preset.id ? " active" : ""}`;
      button.title = preset.label;
      button.setAttribute("aria-label", preset.label);
      button.addEventListener("click", () => {
        editorColor = preset.id;
        renderColorPresets();
        renderTagEditorPreview();
      });
      wrap.appendChild(button);
    }
  }

  function renderTagEditorPreview() {
    const holder = $("tagEditorPreview");
    if (!holder) return;
    holder.innerHTML = "";
    const name = String($("tagNameInput")?.value || "").trim() || "タグ名";
    holder.appendChild(makeTagPill({ name, color: editorColor }));
  }

  function saveTagEditor() {
    const name = String($("tagNameInput")?.value || "").trim().slice(0, 24);
    if (!name) return safeShowToast("タグ名を入力してください。");
    const duplicate = tags().find(tag => tag.id !== editingTagId && tag.name.normalize("NFKC").toLowerCase() === name.normalize("NFKC").toLowerCase());
    if (duplicate) return safeShowToast("同じ名前のタグがあります。");

    const wasEditing = Boolean(editingTagId);
    if (editingTagId) {
      const tag = tagById(editingTagId);
      if (!tag) return;
      tag.name = name;
      tag.color = editorColor;
      managerSelectedTagId = tag.id;
    } else {
      const tag = { id: uid(), name, color: editorColor };
      tags().push(tag);
      managerSelectedTagId = tag.id;
    }
    persistLibrary();
    $("tagEditorDialog")?.close();
    renderAll();
    renderTagManagerPage();
    safeShowToast(wasEditing ? "タグを更新しました。" : "タグを作成しました。");
  }

  function deleteTag(tagId) {
    const tag = tagById(tagId);
    if (!tag) return;
    if (!confirm(`タグ「${tag.name}」を削除しますか？\n曲自体は削除されません。`)) return;
    library.settings.tags = tags().filter(item => item.id !== tagId);
    for (const song of library.songs || []) {
      if (songTagIds(song).includes(tagId)) {
        song.tagIds = songTagIds(song).filter(id => id !== tagId);
        song.updatedAt = nowIso();
      }
    }
    activeTagIds.delete(tagId);
    if (managerSelectedTagId === tagId) managerSelectedTagId = tags()[0]?.id || "";
    persistLibrary();
    renderAll();
    renderTagManagerPage();
    safeShowToast("タグを削除しました。");
  }

  function openSongTagDialog(songId) {
    const song = (library.songs || []).find(item => item.id === songId);
    const dialog = $("songTagDialog");
    if (!song || !dialog) return;
    songTagTargetId = song.id;
    songTagDraft = new Set(songTagIds(song));
    $("songTagDialogTitle").textContent = `${song.title} のタグ`;
    $("quickTagName").value = "";
    $("quickTagColor").value = "violet";
    renderSongTagChecklist();
    if (!dialog.open) dialog.showModal();
  }

  function renderSongTagChecklist() {
    const list = $("songTagList");
    if (!list) return;
    list.innerHTML = "";
    if (!tags().length) {
      const empty = document.createElement("div");
      empty.className = "tag-manager-empty compact";
      empty.innerHTML = "<strong>タグがまだありません</strong><span>下から新しいタグを作ると、そのままこの曲へ付けられます。</span>";
      list.appendChild(empty);
      return;
    }
    for (const tag of tags()) {
      const label = document.createElement("label");
      label.className = "song-tag-check-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = songTagDraft.has(tag.id);
      input.addEventListener("change", () => {
        if (input.checked) songTagDraft.add(tag.id);
        else songTagDraft.delete(tag.id);
      });
      label.append(input, makeTagPill(tag), document.createTextNode(`${tagUsageCount(tag.id)}曲`));
      list.appendChild(label);
    }
  }

  function quickCreateTag() {
    const name = String($("quickTagName")?.value || "").trim().slice(0, 24);
    const color = COLOR_IDS.has($("quickTagColor")?.value) ? $("quickTagColor").value : "violet";
    if (!name) return safeShowToast("新しいタグ名を入力してください。");
    const duplicate = tags().find(tag => tag.name.normalize("NFKC").toLowerCase() === name.normalize("NFKC").toLowerCase());
    if (duplicate) {
      songTagDraft.add(duplicate.id);
      renderSongTagChecklist();
      safeShowToast("既存のタグを選択しました。");
      return;
    }
    const tag = { id: uid(), name, color };
    tags().push(tag);
    songTagDraft.add(tag.id);
    persistLibrary();
    $("quickTagName").value = "";
    renderSongTagChecklist();
    renderTagSidebar();
    renderTagFilter();
    renderTagManagerPage();
    safeShowToast("タグを作成して選択しました。");
  }

  function saveSongTags() {
    const song = (library.songs || []).find(item => item.id === songTagTargetId);
    if (!song) return;
    song.tagIds = [...songTagDraft].filter(id => tagById(id));
    song.updatedAt = nowIso();
    persistLibrary();
    $("songTagDialog")?.close();
    renderAll();
    safeShowToast("曲のタグを保存しました。");
  }

  function installHooks() {
    const hooks=window.LyricTubeHooks;
    if(!hooks)throw new Error("core/runtime-hooks.js is required before tags.js");

    hooks.on("dialog:song-open", detail => {
      resetSongFormTags(detail?.song || null);
    });

    hooks.addFilter("song:before-save", song => ({
      ...song,
      tagIds:[...songFormTagDraft].filter(id => tagById(id))
    }));

    hooks.addFilter("songs:view", result => {
      if(!activeTagIds.size)return result;
      const required=[...activeTagIds];
      return result.filter(song => {
        const set=new Set(songTagIds(song));
        return required.every(id => set.has(id));
      });
    });

    hooks.on("render:browse", () => {
      ensureBrowseTagFilter();
      renderTagFilter();
      augmentBrowseCards();
    });

    hooks.on("render:all", () => {
      ensureUi();
      renderTagSidebar();
      renderTagFilter();
      updateTopTagButton();
      if(tagPageOpen)renderTagManagerPage();
    });

    hooks.handle("render:main-page", () => {
      const tagsPage=$("tagsPage");
      if(tagPageOpen&&tagsPage){
        $("browsePage")?.classList.add("page-hidden");
        $("playerWorkspace")?.classList.add("page-hidden");
        tagsPage.classList.remove("page-hidden");
        $("playerPageBtn")?.classList.remove("active");
        $("browsePageBtn")?.classList.remove("active");
        $("tagsPageBtn")?.classList.add("active");
        return true;
      }
      tagsPage?.classList.add("page-hidden");
      $("tagsPageBtn")?.classList.remove("active");
      return false;
    });
  }

  function installEvents() {
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !$("tagFilterPopover")?.hidden) {
        $("tagFilterPopover").hidden = true;
        $("tagFilterBtn")?.setAttribute("aria-expanded", "false");
      }
    });
  }

  function init() {
    if (ready) return;
    ready = true;
    const changed = normalizeTagData();
    if (changed) persistLibrary();
    ensureUi();
    installHooks();
    installEvents();
    renderAll();
    document.documentElement.dataset.tags = TAG_VERSION;
  }

  function appCoreReady() {
    return document.documentElement.dataset.lyricTubeReady !== "error" &&
      typeof library !== "undefined" &&
      typeof viewSongs === "function" &&
      typeof renderBrowse === "function" &&
      typeof renderAll === "function" &&
      typeof renderSelectedSong === "function" &&
      typeof renderMainPage === "function" &&
      typeof persistLibrary === "function" &&
      $("browsePage") && $("browsePageBtn");
  }

  function startWhenReady() {
    if (appCoreReady()) init();
  }

  document.addEventListener("lyrictube:app-ready", startWhenReady);
  queueMicrotask(startWhenReady);
})();
