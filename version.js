(() => {
  "use strict";

  const meta = Object.freeze({
    version: "v0.10.0",
    build: "20260829-10",
    dataSchema: 4,
    product: "LyricTube"
  });

  function applyUi() {
    document.title = meta.product;
    document.querySelectorAll(".version-badge").forEach(el => {
      el.textContent = meta.version;
      el.title = `${meta.product} ${meta.version} · build ${meta.build}`;
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
