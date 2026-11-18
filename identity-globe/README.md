# Identity Exposure Observatory — integrated application

Source: user-supplied `index(1).html`, copied into `static/identity-globe/index.html` without modifying application logic.

The Zola article at `content/identity/identity-globe.md` embeds the app using a relative URL, with a separate wide-screen link. The article stylesheet contains a full-bleed iframe wrapper.

The app performs client-side requests to HIBP, MyRecon and Ransomwhere. Browser CORS, provider availability, and rate limits can prevent live data loading. A production service should proxy and cache approved sources server-side, apply provenance and deduplication rules, and avoid embedding API secrets in browser JavaScript.

Test locally with `zola serve`, including the standalone route and embedded iframe; then validate on the deployed GitHub Pages base URL.
