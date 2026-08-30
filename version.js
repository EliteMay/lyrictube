(() => {
  "use strict";

  const meta = Object.freeze({
    version: "v0.12.0",
    build: "20260830-4",
    dataSchema: 4,
    product: "LyricTube"
  });

  function applyUi() {
    document.title = meta.product;
    document.querySelectorAll("[data-app-version], .version-badge").forEach(el => {
      el.textContent = meta.version;
      el.title = `${meta.product} ${meta.version} · build ${meta.build}`;
      el.setAttribute("aria-label", `${meta.product} ${meta.version}`);
    });
    const settings = document.getElementById("settingsAppVersion");
    if (settings) {
      settings.textContent = meta.version;
      settings.title = `build ${meta.build}`;
    }
  }

  window.LyricTubeVersion = Object.freeze({ ...meta, applyUi });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyUi, { once: true });
  else applyUi();

  document.addEventListener("lyrictube:ui-ready", applyUi);
})();
