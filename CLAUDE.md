# Medflix

A Netflix-style client for Arabic anime, manga, and movies & series. It scrapes the sites and shows them in its own UI.
Two apps share the same sites and the same user data format:
- **Desktop**: one web front end (`index.html`, `app.js`, `style.css`) in Electron (`main.js` + `preload.js`), run with `npm start`
- **Android**: a native app (Kotlin + Jetpack Compose) in `android/app/src/main/java/com/medanime/app/ui/`, built with `npm run apk`.
  It ports the web app section by section; a scraper or behaviour change usually belongs in both (`scraper.js` ↔ `Witanime.kt`,
  `manga.js` ↔ `Manga.kt`, `cinema.js` ↔ `Cinema.kt`, `STR` ↔ `Str.kt`, `icons.js` ↔ `Icons.kt`; the last two are generated from the JS)

Web: plain JS with no framework, no bundler. Android: Compose, Coil (images), Jsoup (HTML), OkHttp; nothing more without need.

## Architecture: one `window.api`, two implementations

The UI only talks to `window.api`. It never calls the network or storage directly.
- `preload.js` exposes `api` over IPC to `main.js` (Electron).
- `mobile.js` builds the same `api` on Capacitor: `CapacitorHttp`, IndexedDB, and the custom `Downloader` plugin (`DownloaderPlugin.java`).

**Rule:** a new `api` call goes in both `preload.js`/`main.js` and `mobile.js`. A phone-only feature is called with
`api.x?.()` so the desktop skips it (examples: `storage`, `cast`, `checkUpdate`, `installUpdate`).

| File | Role |
|------|------|
| `app.js` | UI: strings (`STR`), nav/dock/drawer, router (`route()`), every page, player, downloads, settings, sheets, toasts, pull-to-refresh |
| `scraper.js` | witanime HTML → plain objects, plus the page cache (`load()`) |
| `manga.js` | Manga section: MeshManga JSON API (`appswat.com`) merged with MangaTek |
| `cinema.js` | Movies & series: ArabSeed/MySeed/EgyDead (WordPress) |
| `filter.js` | witanime browse filters page |
| `icons.js` | Inline SVG icons (`ICON.x`), filled into `data-icon` elements |
| `main.js` | Electron: fetching, Cloudflare check windows, 429 retry, downloads, `medimg://` image cache, player view, JSON DB |
| `mobile.js` | The same on Android, plus the in-app update check and install |
| `DownloaderPlugin.java` | Native side: download queue, in-page site fetches (Cloudflare), MEDFLIX folder data, open URL, install update |
| `DownloadService.java` | Foreground service and download notification |
| `ImageCache.java` | Native poster cache (host allowlist `HOSTS`) |
| `Cast.java` | Chromecast / Android TV: sniffs the video URL, serves it from a small local server, MEGA decryption |
| `MainActivity.java` | WebView setup; blocks popups, navigation away, and players' alert dialogs |
| `selftest.js` | Live scraper check against the real sites: `npx electron selftest.js` |

`www/` is generated (`npm run build:web`). Never edit it. On Android, `ui/` is the app: `NativeActivity` (shell, drawer, dock, shared
builders), `Net.kt` (requests, Cloudflare through a hidden WebView, the page cache `Pages`), `Store.kt` (user data), `Player.kt`,
`Screens.kt` / `MangaScreens.kt` / `CinemaScreens.kt`, `Settings.kt`, `Updater.kt`. `mobile.js`, `MainActivity` and the Capacitor plugin
Java no longer ship, except `DownloadService` (the download notification), which `Downloads.kt` drives; casting is still to be ported from `Cast`. Live check: `./gradlew testDebugUnitTest`.

## Data

- **Sources**: witanime.site (anime, the main source), eva.animerco.org (backup servers), appswat.com + mangatek.com (manga),
  myseed/arabseed/egydead (movies, which hop between domains), cima.my-cima.net and wecima.singles (backup servers),
  animeschedule.net (air times), kitsu.io + IMDb suggest (search suggestions).
- **Adding a host**: update the allowlist in `main.js`, the `fetch` allowlist in `mobile.js` (and its constants at the top),
  `ImageCache.HOSTS` if it serves images, and the CSP in `index.html` if needed.
- **Page cache** (`scraper.js` `load()`): stale-while-revalidate. Scraped pages are kept 90 days and shown from the cache
  instantly. The site is asked again at most once a minute per page, and if the result changed the view redraws (`route(true)`).
  Offline, the saved copy is served. `newView()` drops loads from a page the user already left.
- **User state**: the `store` in `app.js` (`list, history, seen, prefs, downloads, manga, mangaSeen, hidden, streams`).
  Each key is saved whole with `persist(key)`, which calls `api.set`.
  - Desktop: one JSON file in userData.
  - Android: IndexedDB, plus a copy in the phone's `MEDFLIX` folder once all-files access is granted, so data survives a reinstall.
    `pages` (the cache) is the one key kept only in IndexedDB.
- **Network behaviour that must stay**: the desktop Chrome UA; retry and backoff on witanime's 429; witanime sometimes
  needs a client-hint header; Cloudflare checks are passed in a real page (a window on desktop, `siteFetch`/`siteVisit` on Android).

## Style

- **Look**: Netflix dark. `--bg #000` (AMOLED black), `--red #e50914`, `--card #181818`, `--muted`, `--ease`, defined on `:root` in `style.css`.
  Use these tokens, not new colours. Hero with Ken Burns slides, horizontal card rows, skeleton loaders, bottom sheets
  (`.sheet-wrap` / `.sheet`), and toasts (`toast(msg, bad)`).
- **Arabic first, RTL**: the default language is `ar`. Every user-visible string goes in `STR` in **both** `ar` and `en`, read with `t('key')`.
  Use logical CSS (`inset-inline-start`, `padding-inline`), `[dir=rtl]` flips, and wrap numbers and Latin text in LTR isolates (`⁦…⁩`).
- **Phones**: `@media (max-width: 760px)`, with a bottom dock of up to 4 sections plus the ☰ drawer, swipe gestures, and pull-to-refresh.
  Touch handlers must not fight horizontal rows (`.track`, `.fchips`, `.hero`).
- **No site names in the UI**: `noNames()` strips source names from error messages.
- Reuse existing builders before writing new ones: `card`, `row`, `grid`, `skel`, `storageSheet`/`updateSheet` (sheet pattern), `confirmSheet`, `selectable`.

## Code style

- Dense, modern JS: arrow functions, template-literal HTML, `esc()` on every interpolated string, `$()` for querySelector.
- Comments explain **why** (a site quirk, an Android limitation), written short and in lowercase, next to the line they're about.
  Match the density of the surrounding code: most non-obvious lines carry one.
- Smallest change that works. No new dependencies, abstractions, or files unless needed. Shared fixes go in the shared function.
- Java follows the same rule: comment the reason, and keep each feature in one `@PluginMethod`.

## Workflow

- `npm start`: desktop dev run.
- `npx electron selftest.js`: run after any scraper change, since the sites change their markup.
- `npm run apk` builds `MEDFLIX.apk` (debug build, signed with `~/.android/debug.keystore`). **That keystore must not change**,
  or installed apps refuse the update. `versionCode` is minutes since 1970, so every build installs as an update.
- `npm run release`: builds the APK and publishes a GitHub release tagged `b<yyyymmddhhmm>` (the build's stamp, `BuildConfig.BUILD`).
  Commit and push first. The repo (`Medamine-Bahassou/Medflix`) is public, so releases are public.
- **Update system**: on launch the app checks GitHub's latest release (`api.checkUpdate`) and compares its tag with `BUILD`.
  If it's newer, `updateSheet` offers it; `installUpdate` downloads the APK in the app and opens Android's installer.
  The first time, Android asks to allow installs from the app. If the in-app download fails, it falls back to the browser.
- Commits: short imperative subject plus bullet details. Ask before committing or pushing.
