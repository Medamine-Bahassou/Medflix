# Manga Slayer v41 provider recovery

Analyzed 2026-11-01. APK SHA-256: `e45c7732ce7c96481afc4ae0d35a0fb65b4fed17cf867d51642d6b7e8ab18ba8`.

REA 6.7.0 was acquired from the official `rea-agents` npm package outside the project. Its Android engine is JADX headless MCP 0.7.1, SHA-256 `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`, matching REA's pinned release metadata. No agent configuration was changed. The Evidence JSON files here contain the APK-bound results, engine identity, limitations and decompiled method evidence.

## Inventory and coverage

| Finding | Evidence | Implementation |
| --- | --- | --- |
| Main Madara/LekManga source, bundled domain `manga-starz.net` | `res/raw/app_config.gz`, decompressed as `app_config.json`; chapter and page parser methods | Legacy Starz instance of the shared parser |
| Same main source, current domain `sparkmanga.net` | Public `https://api.mangaslayers.com/source/main_source_config`, saved as `remote-config.json`, version 1.6 | Current Spark instance of the shared parser |
| `io.lek-manga.net`, `like-manga.net`, `link-manga.net`, image subdomains | Config image-domain and URL transformations; `ChapterPagesParser.parse` | Image extraction and current/legacy hostname rewriting; these are image hosts, not independent catalogues |
| Dilar (`dilar.tube`) DTOs | Residual `data/provider/sites/dilar/model` classes | No working adapter recovered: REA confirms `ProviderDispatcher` has zero methods and fields. DTOs alone do not establish its requests or a usable provider |
| Manga Slayer catalogue API | `MangaAPI`: `manga`, `manga/search`, `manga/detail/{id}` | Not copied: catalogue access returned HTTP 401. Public source websites supply their own catalogues instead |

This is one recovered main provider with current and legacy domains, **not an assertion that every historical or server-side Manga Slayer provider was recovered**. The supplied APK contains no populated provider dispatcher. Dilar is not presented as a working source.

## App behavior

`slayer.js` and native `Slayer.kt` implement website listing/search pagination, series metadata, chapter-list form POSTs, nested JSON chapter-page POSTs, Arabic chapter numbers, lazy images, image URL transformations, and source-scoped base64url IDs. They join the existing manga latest feed and unfiltered browsing/search. Existing MangaSwat-specific filters stay with providers that support them.

Exact normalized Latin-title matches contribute missing chapters to an existing MangaSwat series. Android retains duplicate chapter numbers as reader source alternatives. Errors from optional sources leave existing providers usable. Chapter responses use the existing offline page cache, including form fields in native cache keys. The native Cloudflare WebView path now forwards form bodies; the desktop/Capacitor fetch allowlists and desktop chapter-download image allowlist include the recovered domains.

The APK's direct-IP/plain-HTTP image mode and quality proxy routing were not copied. Image rewriting retains HTTPS and DNS names. This avoids pinning obsolete IP addresses, but image hosts can still refuse access. Domain configuration is a reviewed snapshot; future backend domain changes require updating the adapter.

## Validation

- `node --test tests/slayer.test.js`: route isolation, Arabic/encoded paths, chapter numbers, filter compatibility, image transformations.
- `env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx electron tools/slayer-check.js`: actual browser DOM parser checks for listing, pagination, details, chapter IDs and numbers.
- With `SLAYER_CAPTURE_DIR=/tmp/manga-slayer-analysis`, the same check parsed live captured Spark HTML (20 series) and the real nested chapter response (13 image URLs).
- `MEDFLIX_LIVE_SLAYER=1 ./android/gradlew -p android testDebugUnitTest --tests '*SlayerTest' assembleDebug`: deterministic parser tests plus opt-in public catalogue/chapter/page endpoint checks and an Android debug APK build.
- The broader JS suite has 16 cast-info failures. Repeating the original `HEAD` version of `cast-info.js` and its tests in an isolated temporary directory reproduced the same 16 failures.

Live limitations: Spark/Starz home pages respond, but detail/search and image hosts can return Cloudflare challenges. Public chapter-list and page AJAX endpoints were tested separately; image extraction does not establish successful image downloads. No claim of end-to-end visual reading verification or usable Dilar coverage is made. The application's pre-existing live `selftest.js` stops at `closeness is not defined`; it does not establish end-to-end validation. The targeted Android live test passed with 20 series, 19 chapters and 13 extracted image URLs. The debug APK built successfully.

## Reproduce REA analysis

Use the engine JAR linked by [REA's Android guide](https://github.com/morluto/rea/blob/main/docs/android-analysis.md), verify its hash, and set `REA_JADX_MCP_JAR` to its absolute path. Then:

```sh
rea inspect-android-package /absolute/path/manga_slayer-universal_41.apk --format json
rea inspect-android-class /absolute/path/manga_slayer-universal_41.apk com.abmo.mangaslayer.data.provider.ProviderDispatcher --format json
rea inspect-android-method /absolute/path/manga_slayer-universal_41.apk com.abmo.mangaslayer.data.repository.MangaRepositoryImpl f --format json
rea inspect-android-method /absolute/path/manga_slayer-universal_41.apk com.abmo.mangaslayer.data.parser.ChapterPagesParser parse --format json
```

## Loading fixes

Manga home rows and banners now arrive independently. Native browse and series screens publish the selected source first, then merge results from other providers as they complete. The reader publishes downloaded/fetched images before waiting for its merged navigation list. Desktop optional provider results are cached and refresh the current screen after completion; repeated renders reuse in-flight lookups. Source-specific series pages no longer wait for canonical cross-site searches on desktop.

Optional provider requests reuse cached pages/cookies but cannot open Cloudflare verification over the current page. Explicitly opening a source still permits its normal verification flow. Spark chapter reading now requests the page AJAX endpoint immediately after metadata, avoiding a full chapter-list fetch and a challenged chapter-HTML request first. Network speed and challenges on the selected source still determine uncached availability.

Regression checks: `node --test tests/manga-loading.test.js tests/slayer.test.js` verifies that unresolved providers/banner work cannot block own-source content, that late optional results update only the current page, and that the reader skips unnecessary chapter-list requests. Native `MangaLoadingTest` uses gated coroutines to verify first-result delivery, preservation of primary data on optional failure, cancellation, and opening cached series/chapters without cross-source requests.

## Embedded error-heading fix

The original Android series selector joined every `h1`, including a blocked embed's “Access Denied” heading, into the title. The desktop selector could choose that first unrelated heading as well. Both now select one valid heading inside the series title container and reject error-only documents. Cover extraction skips inline placeholders, supports lazy source sets and relative URLs, and falls back to `og:image`.

Old desktop parsed-series entries containing error titles are invalidated by parser revision; valid offline entries are retained. Native invalid source responses are evicted individually and fetched again once, while other offline pages remain intact. Reopening a valid series repairs matching saved titles that begin with a block-page heading. Browser DOM and native parser regression fixtures cover a denied embed before `Fall for Me`, unrelated headings, lazy covers, Open Graph fallback and error-only pages. Direct tests of the image CDN still returned HTTP 403; extraction fallbacks do not guarantee access to a cover that the source itself refuses.
