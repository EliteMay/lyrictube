(() => {
  "use strict";

  // User-facing version follows semantic versioning, like VReview.
  // Build revision is only for cache/debug purposes and is intentionally hidden
  // from the normal UI.
  const DISPLAY_VERSION = "v0.9.1";
  const BUILD_REVISION = "20260829-9";
  const PRODUCT_TITLE = "LyricTube";

  window.LyricTubeVersion = Object.freeze({
    version: DISPLAY_VERSION,
    build: BUILD_REVISION
  });

  function applyVersionUi() {
    // Match VReview: the browser tab stays clean; version is shown inside the app.
    if (document.title !== PRODUCT_TITLE) document.title = PRODUCT_TITLE;

    document.querySelectorAll(".version-badge").forEach(badge => {
      if (badge.textContent !== DISPLAY_VERSION) badge.textContent = DISPLAY_VERSION;
      badge.title = `${PRODUCT_TITLE} ${DISPLAY_VERSION} · build ${BUILD_REVISION}`;
      badge.setAttribute("aria-label", `${PRODUCT_TITLE} ${DISPLAY_VERSION}`);
    });

    const settingsVersion = document.getElementById("settingsAppVersion");
    if (settingsVersion) {
      if (settingsVersion.textContent !== DISPLAY_VERSION) settingsVersion.textContent = DISPLAY_VERSION;
      settingsVersion.title = `build ${BUILD_REVISION}`;
    }
  }

  applyVersionUi();

  // Keep the last successful cloud account name on this device so the normal
  // login flow only needs the password next time. The password is never stored.
  if (!document.querySelector('script[data-login-memory]')) {
    const loginScript = document.createElement("script");
    loginScript.src = `login-memory.js?v=${BUILD_REVISION}`;
    loginScript.async = false;
    loginScript.dataset.loginMemory = "true";
    loginScript.onerror = () => console.warn("[LyricTube] login-memory.js could not be loaded.");
    document.body.appendChild(loginScript);
  }

  // app.js / site-shell.js still contain legacy generation labels internally.
  // They may rewrite the title or settings text later, so keep only the public
  // presentation normalized without touching saved-data compatibility.
  const observer = new MutationObserver(() => queueMicrotask(applyVersionUi));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  document.addEventListener("click", event => {
    if (event.target?.closest?.("#settingsBtn,#openSettingsBtn")) {
      setTimeout(applyVersionUi, 0);
    }
  });

  console.info(`[LyricTube] ${DISPLAY_VERSION} (build ${BUILD_REVISION})`);
})();
