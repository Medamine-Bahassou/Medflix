package com.medanime.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.os.Build;
import android.os.Environment;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Android side of episode downloads (the Electron side is in main.js): streams a MediaFire zip
 * and unpacks its one .mp4 while it downloads, reporting "progress" events to the page.
 */
@CapacitorPlugin(name = "Downloader")
public class DownloaderPlugin extends Plugin {

    private static final String UA =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";
    // static: download threads outlive the page (app swiped away) and report to whichever plugin instance is live now
    private static final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private static final Map<String, JSObject> last = new ConcurrentHashMap<>(); // each download's latest progress
    private static volatile DownloaderPlugin live;

    // --- the download queue: each show's episodes or chapters, one at a time, oldest first; shows side by side ---
    // It runs here, not in the page: with the screen off Android stops the page, and a queue the page ran sat at
    // "Preparing download…" until the app was opened. The page hands each item over as soon as it's queued (enqueue),
    // then fetches all their sources ahead of time (an episode's file link, a chapter's page images) and hands those over
    // too. An item reached before its sources came, this looks up itself, with the same requests as mobile.js and
    // manga.js; and a file link fetched ahead that has expired by its turn is looked up again.
    private static final class Job {
        final String id, show, kind; // kind: "episode" (a MediaFire zip) or "pages" (a manga chapter's images)
        String url, quality, name, epPath, chapterId, title, labelDone, labelFailed;
        JSONArray urls, folder;

        Job(String id, String show, String kind) {
            this.id = id;
            this.show = show;
            this.kind = kind;
        }
    }
    private static final Object lock = new Object(); // guards waiting, busy and running
    private static final Map<String, List<Job>> waiting = new java.util.LinkedHashMap<>(); // show -> its jobs, in order
    private static final Set<String> busy = new java.util.HashSet<>(); // shows with a job running (looked up or downloading)
    private static final Set<String> running = new java.util.HashSet<>(); // those jobs' ids

    /** a failure before any data came (an expired link): the episode's link can be looked up again */
    private static final class StartFailed extends IOException {
        StartFailed(String m) {
            super(m);
        }
    }

    @Override
    public void load() {
        live = this;
    }

    // --- witanime and egydead through a real WebView ---
    // On some networks Cloudflare refuses the app's native HTTP client outright (a 403 no cookie fixes), while a real
    // browser on the site goes through. So the page's requests to those sites can run as fetch() inside a hidden WebView
    // sitting on the site (one per site): same origin, the site's cookies, Chrome's own network stack. If Cloudflare does
    // show its check there, the WebView comes up over the app so it can be passed.
    private static final String SITE = "https://witanime.site";
    private static final java.util.regex.Pattern ORIGINS = java.util.regex.Pattern.compile("https://(witanime\\.site|([a-z0-9-]+\\.)*(egydead|myseed|arabseed)\\.[a-z]+)");
    // the page the requests are made from: any address on the site will do, and this one is a few KB of text, no scripts or ads
    private static final String HOME = "/robots.txt";
    private final Map<String, Site> sites = new ConcurrentHashMap<>();
    private int ids;

    private final class Site {
        final String origin, home;
        WebView view;
        boolean ready;
        final List<Runnable> waiting = new ArrayList<>();
        final List<PluginCall> waitingCalls = new ArrayList<>(); // theirs: rejected if the page is dropped before it's ready
        final Map<String, PluginCall> fetches = new ConcurrentHashMap<>();
        volatile PluginCall gateCall; // one gate at a time (the page queues them)

        Site(String origin) {
            this.origin = origin;
            this.home = origin + HOME;
        }

        /**
         * Hands a finished request back to the page. The scripts leave their result in window.__med on the site's light page
         * and this polls for it, rather than injecting a JavascriptInterface: that object would sit on every page this
         * WebView opens, Cloudflare's check included, and an unusual global is just what a bot check looks for.
         */
        void collect(String id, PluginCall call, long start) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (view == null || fetches.get(id) != call) return; // dropped (drop rejected it)
                if (!ready || !home.equals(view.getUrl())) { // the page moved (Cloudflare's check opened): the script is gone
                    fetches.remove(id);
                    call.reject("interrupted");
                    return;
                }
                view.evaluateJavascript("(() => { const m = window.__med || {}, r = m[" + JSONObject.quote(id) + "]; if (r === undefined) return null; delete m[" +
                    JSONObject.quote(id) + "]; return r; })()", v -> {
                    try {
                        Object r = new JSONArray("[" + v + "]").get(0); // evaluateJavascript hands the value back as JSON
                        if (r == JSONObject.NULL) {
                            if (System.currentTimeMillis() - start < 120000) collect(id, call, start);
                            else if (fetches.remove(id) != null) call.reject("no answer");
                            return;
                        }
                        if (fetches.remove(id) == null) return;
                        JSObject res = new JSObject((String) r);
                        if (res.has("error")) call.reject(res.getString("error"));
                        else call.resolve(res);
                    } catch (Exception e) {
                        if (fetches.remove(id) != null) call.reject("bad reply");
                    }
                });
            }, 150);
        }

        void full(boolean on) {
            if (view == null) return;
            view.setAlpha(on ? 1f : 0f);
            view.setFocusable(on);
            view.setFocusableInTouchMode(on);
        }

        /** runs then once the site's page is ready; call (if any) is rejected should the page be dropped first */
        void ensure(PluginCall call, Runnable then) {
            if (ready) {
                then.run();
                return;
            }
            waiting.add(then);
            if (call != null) waitingCalls.add(call);
            if (view != null) return;
            // always full screen so the check never loads at 1px and zooms when resized; hidden by alpha, touches pass through
            view = new WebView(getActivity()) {
                @Override
                public boolean dispatchTouchEvent(android.view.MotionEvent e) {
                    return getAlpha() > 0f && super.dispatchTouchEvent(e);
                }
            };
            // it fetches the next download's link with the screen off too (see MainActivity)
            if (Build.VERSION.SDK_INT >= 26) view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setDomStorageEnabled(true);
            view.getSettings().setTextZoom(100);
            CookieManager.getInstance().setAcceptThirdPartyCookies(view, true); // Cloudflare's checkbox is a challenges.cloudflare.com frame
            view.setBackgroundColor(Color.BLACK);
            view.setWebViewClient(
                new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        String url = r.getUrl().toString();
                        // else the page stays on its site: an ad on a page opened here (siteVisit) can't take it away
                        return captureGate(url) || (r.isForMainFrame() && !url.startsWith(origin + "/"));
                    }

                    @Override
                    public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                        drop("browser stopped"); // handled: Android would otherwise close the whole app
                        return true;
                    }

                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                        String accept = r.getRequestHeaders().get("Accept");
                        if ((r.isForMainFrame() || (accept != null && accept.startsWith("text/html"))) && captureGate(r.getUrl().toString()))
                            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                        return null;
                    }
                }
            );
            full(false);
            ViewGroup decor = (ViewGroup) getActivity().getWindow().getDecorView();
            decor.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            view.layout(0, 0, decor.getWidth(), decor.getHeight());
            view.loadUrl(home);
            watch();
        }

        void drop(String why) {
            if (view == null) return;
            if (view.getParent() != null) ((ViewGroup) view.getParent()).removeView(view);
            view.destroy();
            view = null;
            ready = false;
            waiting.clear();
            // a gate or visit still waiting for the page: without this its promise never settled, and as gates run one at a
            // time, every later download sat at "Preparing download…" (Cloudflare's check timing out with the screen off)
            for (PluginCall c : waitingCalls) c.reject(why);
            waitingCalls.clear();
            for (PluginCall c : fetches.values()) c.reject(why);
            fetches.clear();
            PluginCall g = gateCall;
            gateCall = null;
            if (g != null) g.reject(why);
        }

        /** waits for the site's page, showing Cloudflare's check over the app meanwhile */
        void watch() {
            long start = System.currentTimeMillis();
            Handler h = new Handler(Looper.getMainLooper());
            h.post(new Runnable() {
                @Override
                public void run() {
                    if (view == null || ready) return;
                    // robots.txt itself showing (plain text): through. Cloudflare's check is an HTML page in its place
                    view.evaluateJavascript("location.href === " + JSONObject.quote(home) + " && (document.contentType === 'text/plain' || /^\\s*(user-agent|sitemap|disallow|allow)\\s*:/im.test(document.body ? document.body.innerText : ''))", r -> {
                        if (view == null || ready || !"true".equals(r)) return;
                        ready = true;
                        full(false);
                        List<Runnable> go = new ArrayList<>(waiting);
                        waiting.clear();
                        waitingCalls.clear();
                        for (Runnable g : go) g.run();
                    });
                    long waited = System.currentTimeMillis() - start;
                    if (waited > 90000) { // never got past Cloudflare: give up, a later request tries again
                        drop("challenge not passed");
                        return;
                    }
                    if (waited > 1500) // Cloudflare's check: over the app, so a tap on its box can pass it
                        full(true);
                    h.postDelayed(this, 500);
                }
            });
        }

        /** a navigation leaving the site while a gate is pending is where the gate sent us: hand it back, don't load it */
        boolean captureGate(String url) {
            PluginCall call = gateCall;
            if (call == null || url.startsWith(origin) || !url.startsWith("http")) return false;
            gateCall = null;
            JSObject r = new JSObject();
            r.put("url", url);
            call.resolve(r);
            getActivity().runOnUiThread(this::reload);
            return true;
        }

        void reload() {
            if (view == null || ready) return;
            view.loadUrl(home);
            watch();
        }
    }

    /** the hidden page for this address's site, or null (and the call rejected) for a site that isn't one of ours */
    private Site siteOf(PluginCall call, String url) {
        Uri u = Uri.parse(url);
        String origin = u.getScheme() + "://" + u.getHost();
        if (u.getPort() != -1 || !ORIGINS.matcher(origin).matches() || !url.startsWith(origin + "/")) {
            call.reject("bad url");
            return null;
        }
        return sites.computeIfAbsent(origin, Site::new);
    }

    /**
     * A request was refused (Cloudflare's check can only be passed by opening the page itself, never by a script request):
     * open that page full screen in the site's WebView so its check can be ticked. Resolves once the site's own page is
     * showing (Cloudflare let this browser through), then goes back to the light page the requests are made from.
     * Rejects if witanime itself refuses ("blocked"), on Android's back button, or after 2 minutes.
     * ok: a CSS selector only the site's own page has (default: witanime's csrf-token)
     */
    @PluginMethod
    public void siteVisit(PluginCall call) {
        String url = call.getString("url", ""), ok = call.getString("ok", "meta[name=csrf-token]");
        Site s = siteOf(call, url);
        if (s == null) return;
        getActivity().runOnUiThread(() -> s.ensure(call, () -> {
            if (s.view == null) return;
            s.ready = false; // other requests wait meanwhile; back closes it (closeChallenge)
            s.full(true);
            s.view.loadUrl(url);
            WebView mine = s.view;
            long start = System.currentTimeMillis();
            Handler h = new Handler(Looper.getMainLooper());
            h.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (s.view != mine) { // closed with back, or the browser stopped
                        call.reject("check closed");
                        return;
                    }
                    // the site's own page = through; witanime's 403 page (data-status) = witanime refuses us
                    s.view.evaluateJavascript("document.documentElement.dataset.status === '403' ? 'blocked' : document.querySelector(" + JSONObject.quote(ok) + ") ? 'ok' : ''", r -> {
                        if (s.view != mine) return;
                        if (r.contains("ok") || r.contains("blocked") || System.currentTimeMillis() - start > 120000) {
                            boolean through = r.contains("ok");
                            s.view.loadUrl(s.home);
                            s.watch(); // back to the light page, hidden again once it's there
                            if (through) call.resolve();
                            else call.reject(r.contains("blocked") ? "witanime refused this phone" : "check not passed");
                            return;
                        }
                        h.postDelayed(this, 700);
                    });
                }
            }, 1500);
        }));
    }

    /** Android's back button while Cloudflare's check is up: close it (its requests fail, the next one asks again) */
    static boolean closeChallenge() {
        DownloaderPlugin p = live;
        if (p == null) return false;
        for (Site s : p.sites.values()) {
            if (s.view == null || s.ready) continue;
            s.drop("check closed");
            return true;
        }
        return false;
    }

    /** a request to the site, as the site's own page would make it: { status, url, data, headers } */
    @PluginMethod
    public void siteFetch(PluginCall call) {
        String url = call.getString("url", "");
        Site s = siteOf(call, url);
        if (s == null) return;
        getActivity().runOnUiThread(() -> {
            String id = String.valueOf(++ids);
            s.fetches.put(id, call);
            s.ensure(null, () -> { // its call is in fetches, rejected from there
                if (s.view == null) return;
                JSObject headers = call.getObject("headers", new JSObject());
                String body = call.getString("body"), referrer = call.getString("referrer"); // referrer: a page of the site, as a form on it sends it
                String js = "(async () => { try {" +
                    "const r = await fetch(" + JSONObject.quote(url) + ", { method: " + JSONObject.quote(call.getString("method", "GET")) +
                    ", headers: " + headers + ", credentials: 'include'" + (body == null ? "" : ", body: " + JSONObject.quote(body)) +
                    (referrer == null ? "" : ", referrer: " + JSONObject.quote(referrer) + ", referrerPolicy: 'unsafe-url'") + " });" +
                    // stopAt: stop reading once it matches (an episode page is ~3MB; its csrf token is in <head>)
                    "const stop = " + JSONObject.quote(call.getString("stopAt", "")) + ", re = stop && new RegExp(stop), rd = r.body.getReader(), dec = new TextDecoder();" +
                    "let t = ''; for (;;) { const { done, value } = await rd.read(); if (done) break; t += dec.decode(value, { stream: true }); if (re && re.test(t)) { rd.cancel(); break; } }" +
                    "(window.__med = window.__med || {})[" + JSONObject.quote(id) + "] = JSON.stringify({ status: r.status, url: r.url, data: t," +
                    " headers: { 'cf-mitigated': r.headers.get('cf-mitigated') || '', 'retry-after': r.headers.get('retry-after') || '' } });" +
                    "} catch (e) { (window.__med = window.__med || {})[" + JSONObject.quote(id) + "] = JSON.stringify({ error: String(e) }); } })()";
                s.view.evaluateJavascript(js, null);
                s.collect(id, call, System.currentTimeMillis());
            });
        });
    }

    /**
     * a witanime download gate: witanime redirects it to the host, but only for the site's own page loads. Load it that
     * way from the site's page and catch where it goes: { url }. (Stream gates answer only iframe loads, whose redirects
     * WebView never reports: mobile.js asks those natively.)
     */
    @PluginMethod
    public void siteGate(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith(SITE + "/watch/")) {
            call.reject("bad url");
            return;
        }
        Site s = siteOf(call, url);
        if (s == null) return;
        getActivity().runOnUiThread(() -> s.ensure(call, () -> {
            if (s.view == null) return;
            s.gateCall = call;
            s.ready = false; // the page itself navigates: reloaded after (captureGate / the timeout below)
            // The gate 404s unless the Referer is the bare origin (as the site's own page sends it), never a page address.
            s.view.evaluateJavascript("(() => { const a = document.createElement('a'); a.referrerPolicy = 'origin'; a.href = " +
                JSONObject.quote(url) + "; document.body.append(a); a.click(); })()", null);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (s.gateCall == call) {
                    s.gateCall = null;
                    call.reject("gate gave no link");
                    s.reload();
                }
            }, 20000);
        }));
    }

    /** the latest progress of every download this app run, for a page reopened while they ran (or finished) */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        for (Map.Entry<String, JSObject> e : last.entrySet()) r.put(e.getKey(), e.getValue());
        call.resolve(r);
    }

    /**
     * With "All files access" granted, everything lives in a visible MEDFLIX folder on the phone's storage
     * (Downloads/ and Data/), which survives uninstalling the app. Without it, downloads stay in the app's
     * private folder and the data only in the WebView's IndexedDB, as before.
     */
    private static File shared() {
        File root = Environment.getExternalStorageDirectory(), dir = new File(root, "MEDFLIX"), old = new File(root, "MedAnime");
        if (!dir.exists() && old.isDirectory()) old.renameTo(dir); // the app's name before: take its folder along
        return dir;
    }

    private File privateDir() {
        return new File(getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES), "MedAnime");
    }

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private File dir() {
        return granted() ? new File(shared(), "Downloads") : privateDir();
    }

    @PluginMethod
    public void storage(PluginCall call) {
        JSObject r = new JSObject();
        String[] saved = new File(shared(), "Data").list();
        r.put("granted", granted());
        r.put("hasData", granted() && saved != null && saved.length > 0); // left by an earlier install
        r.put("path", shared().getAbsolutePath());
        call.resolve(r);
    }

    /** play on a TV (see Cast): { title, file?, at? }; a file only from the downloads folders */
    @PluginMethod
    public void cast(PluginCall call) {
        String file = call.getString("file");
        try {
            if (file != null && !inside(new File(file), shared()) && !inside(new File(file), privateDir())) {
                call.reject("bad path");
                return;
            }
        } catch (IOException e) {
            call.reject("bad path");
            return;
        }
        askNotifications(); // the cast's controls are a notification (Android 13+: hidden without this)
        getActivity().runOnUiThread(() -> Cast.start(getActivity(), call));
    }

    private static boolean inside(File f, File dir) throws IOException {
        return f.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator);
    }

    /** keep the screen on while watching: the WebView's iframe players don't hold a wake lock themselves */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    @PluginMethod
    public void castReset(PluginCall call) {
        Cast.reset();
        call.resolve();
    }

    /** an https link in the phone's browser (the app's "open in browser"; players' popups are refused, see MainActivity) */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://")) {
            call.reject("bad url");
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            call.resolve();
        } catch (Exception e) {
            call.reject("no browser");
        }
    }

    /** the app's own update (api.checkUpdate, mobile.js): the release's APK into the cache, then Android's installer on it */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://github.com/Medamine-Bahassou/Medflix/releases/download/")) { // only ever our own releases
            call.reject("bad url");
            return;
        }
        // Android asks once to allow installs from this app: its settings page opens, then the update is tapped again
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
            call.reject("allow installs");
            return;
        }
        new Thread(() -> {
            File apk = new File(getContext().getCacheDir(), "update.apk");
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection(); // follows GitHub's redirect to its file host
                c.setRequestProperty("User-Agent", UA);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
                long size = c.getContentLengthLong(), got = 0;
                int pct = -2;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        got += n;
                        int p = size > 0 ? (int) (got * 100 / size) : -1;
                        if (p == pct) continue;
                        pct = p;
                        JSObject e = new JSObject();
                        e.put("pct", p);
                        notifyListeners("updateProgress", e);
                    }
                }
                if (size > 0 && got != size) throw new IOException("cut off");
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
                call.resolve();
            } catch (Exception e) {
                apk.delete();
                call.reject("update failed: " + e.getMessage());
            }
        }).start();
    }

    /** the WebView's own scrollbar on or off (the manga reader draws its own; CSS can't hide this one) */
    @PluginMethod
    public void scrollbar(PluginCall call) {
        boolean on = call.getBoolean("on", true);
        getActivity().runOnUiThread(() -> getBridge().getWebView().setVerticalScrollBarEnabled(on));
        call.resolve();
    }

    /** opens Android's "All files access" page for the app (asks for the storage permission before Android 11) */
    @PluginMethod
    public void requestStorage(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName())));
            } catch (Exception e) { // some phones only have the list of all apps
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            }
        } else {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, 2);
        }
        call.resolve();
    }

    private File dataFile(String key) throws IOException {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,40}")) throw new IOException("bad key");
        return new File(new File(shared(), "Data"), key + ".json");
    }

    /** one saved store (settings, history, list...) as MEDFLIX/Data/<key>.json; value is null when missing or not allowed */
    @PluginMethod
    public void readData(PluginCall call) {
        JSObject r = new JSObject();
        try {
            File f = dataFile(call.getString("key"));
            r.put("value", granted() && f.isFile() ? new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8) : null);
        } catch (IOException e) {
            r.put("value", null);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void writeData(PluginCall call) {
        String value = call.getString("value");
        if (!granted() || value == null) {
            call.reject("not allowed");
            return;
        }
        try { // write aside, then swap in: a crash mid-write never leaves a half file
            File f = dataFile(call.getString("key")), tmp = new File(f.getPath() + ".tmp");
            f.getParentFile().mkdirs();
            Files.write(tmp.toPath(), value.getBytes(StandardCharsets.UTF_8));
            try {
                Files.move(tmp.toPath(), f.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException e) { // storage that can't swap atomically: a plain replace
                Files.move(tmp.toPath(), f.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage());
        }
    }

    /** counts the zip bytes read, for progress against Content-Length */
    private static class Counting extends FilterInputStream {
        volatile long count;

        Counting(InputStream in) {
            super(in);
        }

        @Override
        public int read() throws IOException {
            int b = super.read();
            if (b >= 0) count++;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            int n = super.read(buf, off, len);
            if (n > 0) count += n;
            return n;
        }
    }

    private void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }
    }

    /** on: the page has downloads waiting, so the service (and its hold on CPU and Wi-Fi) stays up; the labels: its texts */
    @PluginMethod
    public void hold(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        DownloadService.labelActive = call.getString("labelActive", DownloadService.labelActive);
        DownloadService.labelMany = call.getString("labelMany", DownloadService.labelMany);
        DownloadService.labelPreparing = call.getString("labelPreparing", DownloadService.labelPreparing);
        synchronized (lock) {
            DownloadService.held = on || !waiting.isEmpty() || !busy.isEmpty(); // the queue here may know better (the page asleep)
        }
        if (DownloadService.held) {
            askNotifications();
            DownloadService.start(getContext().getApplicationContext()); // the notification shows at once, before the file's link is found
        }
        else DownloadService.update(getContext().getApplicationContext()); // stops it if nothing is transferring
        call.resolve();
    }

    /**
     * Queues an episode or chapter (see Job), or adds what the page has found out since (its sources) to one still waiting.
     * { id, show, kind, title, labelDone, labelFailed } and, for an episode, { name (without the quality), epPath, quality,
     * url? }; for a chapter, { chapterId, folder, urls? }
     */
    @PluginMethod
    public void enqueue(PluginCall call) {
        String id = call.getString("id"), show = call.getString("show", ""), kind = call.getString("kind", "episode");
        if (id == null) {
            call.reject("bad arguments");
            return;
        }
        askNotifications();
        synchronized (lock) {
            if (!running.contains(id)) {
                List<Job> l = waiting.computeIfAbsent(show, k -> new ArrayList<>());
                Job j = null;
                for (Job x : l) if (x.id.equals(id)) j = x;
                if (j == null) {
                    l.add(j = new Job(id, show, kind));
                    cancelled.remove(id);
                }
                for (String k : new String[] { "url", "quality", "name", "epPath", "chapterId", "title", "labelDone", "labelFailed" }) {
                    String v = call.getString(k);
                    if (v == null) continue;
                    switch (k) {
                        case "url": j.url = v; break;
                        case "quality": j.quality = v; break;
                        case "name": j.name = v; break;
                        case "epPath": j.epPath = v; break;
                        case "chapterId": j.chapterId = v; break;
                        case "title": j.title = v; break;
                        case "labelDone": j.labelDone = v; break;
                        default: j.labelFailed = v;
                    }
                }
                if (call.getArray("urls") != null) j.urls = call.getArray("urls");
                if (call.getArray("folder") != null) j.folder = call.getArray("folder");
            }
            DownloadService.held = true;
        }
        DownloadService.start(getContext().getApplicationContext());
        next(show);
        call.resolve();
    }

    /** starts the show's next job, unless one of its jobs is running */
    private void next(String show) {
        Job j;
        synchronized (lock) {
            List<Job> l = waiting.get(show);
            if (busy.contains(show) || l == null || l.isEmpty()) return;
            j = l.remove(0);
            if (l.isEmpty()) waiting.remove(show);
            busy.add(show);
            running.add(j.id);
        }
        emit(j.id, "active", 0, 0, null); // taken: the page shows it preparing
        new Thread(() -> run(j)).start();
    }

    private void run(Job j) {
        String state;
        try {
            if (j.kind.equals("pages")) {
                if (j.urls == null) j.urls = chapterPages(j.chapterId);
                if (cancelled.contains(j.id)) throw new IOException("cancelled");
                state = pagesNow(j);
            } else {
                String[] link = j.url != null ? new String[] { j.url, j.quality } : episodeLink(j.epPath, j.quality);
                if (cancelled.contains(j.id)) throw new IOException("cancelled");
                try {
                    state = fileNow(j, link[0], link[1]);
                } catch (StartFailed e) {
                    if (j.url == null) throw e;
                    link = episodeLink(j.epPath, j.quality); // the link fetched ahead has expired: a fresh one
                    state = fileNow(j, link[0], link[1]);
                }
            }
        } catch (Exception e) {
            state = cancelled.contains(j.id) ? "cancelled" : "error";
            emit(j.id, state, 0, 0, null);
        }
        cancelled.remove(j.id);
        Context c = getContext().getApplicationContext();
        if (!state.equals("cancelled")) DownloadService.finished(c, j.id, state.equals("done") ? j.labelDone : j.labelFailed, j.title);
        synchronized (lock) {
            busy.remove(j.show);
            running.remove(j.id);
        }
        next(j.show);
        synchronized (lock) {
            if (!waiting.isEmpty() || !busy.isEmpty()) return;
            DownloadService.held = false; // all done: the service goes (see DownloadService.update)
        }
        DownloadService.update(c);
    }

    /** a manga chapter's page images, from its site (MangaSwat's ids are numbers, Olympus's start with o:) */
    private static JSONArray chapterPages(String chapterId) throws Exception {
        if (chapterId == null) throw new IOException("no chapter");
        if (chapterId.matches("\\d+")) { // as manga.js's mangaChapter: the images, in their order
            JSONArray imgs = new JSONObject(readUntil(get("https://appswat.com/v2/api/v2/chapters/" + chapterId + "/"), null)).getJSONArray("images");
            List<JSONObject> l = new ArrayList<>();
            for (int i = 0; i < imgs.length(); i++) l.add(imgs.getJSONObject(i));
            l.sort((a, b) -> Integer.compare(a.optInt("order"), b.optInt("order")));
            JSONArray out = new JSONArray();
            for (JSONObject o : l) out.put(o.getString("image"));
            return out;
        }
        if (!chapterId.startsWith("o:")) throw new IOException("bad chapter");
        String[] parts = chapterId.substring(2).split(":", 2);
        String page = readUntil(get("https://olympustaff.com/series/" + Uri.encode(parts[0]) + "/" + Uri.encode(parts[1])), null);
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("<img[^>]*class=\"[^\"]*manga-chapter-img[^\"]*\"[^>]*>").matcher(page == null ? "" : page);
        java.util.Set<String> seen = new java.util.LinkedHashSet<>();
        while (m.find()) {
            java.util.regex.Matcher src = java.util.regex.Pattern.compile("src=\"([^\"]+)\"").matcher(m.group());
            if (src.find()) seen.add(src.group(1));
        }
        JSONArray out = new JSONArray();
        for (String u : seen) out.put(u);
        return out;
    }

    private static HttpURLConnection get(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestProperty("User-Agent", UA);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        return c;
    }

    /** an episode's MediaFire file: { url, quality }, the chosen quality first, then best to worst (see mobile.js) */
    private String[] episodeLink(String epPath, String quality) throws Exception {
        if (!epPath.matches("/watch/[^?#]+")) throw new IOException("bad path");
        // as the WebView, whose Cloudflare cookies these requests share (CapacitorCookies); the API wants the client hint
        String ua = android.webkit.WebSettings.getDefaultUserAgent(getContext());
        java.util.regex.Matcher v = java.util.regex.Pattern.compile("Chrome/(\\d+)").matcher(ua);
        String ch = "\"Chromium\";v=\"" + (v.find() ? v.group(1) : "138") + "\"";
        HttpURLConnection page = site(SITE + epPath, "GET", ua, ch, null, null);
        String csrf = readUntil(page, java.util.regex.Pattern.compile("name=\"csrf-token\" content=\"([^\"]+)\""));
        if (csrf == null) throw new IOException("episode page HTTP " + page.getResponseCode());
        HttpURLConnection src = site(SITE + epPath + "/sources", "POST", ua, ch, csrf, null);
        if (src.getResponseCode() >= 400) throw new IOException("sources HTTP " + src.getResponseCode());
        JSONObject downloads = new JSONObject(readUntil(src, null)).optJSONObject("downloads");
        List<String[]> links = new ArrayList<>(); // { token, quality }
        List<String> order = java.util.Arrays.asList("4K", "FHD", "HD", "SD");
        for (java.util.Iterator<String> q = downloads == null ? java.util.Collections.<String>emptyIterator() : downloads.keys(); q.hasNext(); ) {
            String k = q.next();
            JSONArray l = downloads.getJSONArray(k);
            for (int i = 0; i < l.length(); i++) if ("mediafire".equals(l.getJSONObject(i).optString("label"))) links.add(new String[] { l.getJSONObject(i).getString("token"), k });
        }
        links.sort((a, b) -> Integer.compare(a[1].equals(quality) ? -1 : order.indexOf(a[1]), b[1].equals(quality) ? -1 : order.indexOf(b[1])));
        for (String[] l : links) {
            try {
                if (!l[0].matches("[a-f0-9]{64}")) continue;
                if (site(SITE + "/watch/download-source/" + l[0], "POST", ua, ch, csrf, null).getResponseCode() >= 400) continue;
                String host = site(SITE + "/watch/download-gate/" + l[0], "GET", ua, ch, null, "document").getHeaderField("Location");
                if (host == null || !Uri.parse(host).getHost().endsWith("mediafire.com")) continue;
                HttpURLConnection mf = (HttpURLConnection) new URL(host).openConnection();
                mf.setRequestProperty("User-Agent", UA);
                mf.setConnectTimeout(15000);
                mf.setReadTimeout(30000);
                String direct = readUntil(mf, java.util.regex.Pattern.compile("href=\"(https://download\\d*\\.mediafire\\.com/[^\"]+)\""));
                if (direct != null) return new String[] { direct, l[1] };
            } catch (Exception e) {
                // that one: try the next quality
            }
        }
        throw new IOException("no link");
    }

    /** a request to witanime as mobile.js makes it; waits and asks again when it rate-limits (429), as mobile.js does */
    private static HttpURLConnection site(String url, String method, String ua, String ch, String csrf, String dest) throws Exception {
        for (int i = 0; ; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(dest == null);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestMethod(method);
            c.setRequestProperty("User-Agent", ua);
            c.setRequestProperty("Accept-Language", "ar,en;q=0.8");
            c.setRequestProperty("sec-ch-ua", ch);
            if (csrf != null) {
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("X-CSRF-TOKEN", csrf);
            }
            if (dest != null) { // a gate: answers (redirects) only the kind of load the site's own page makes
                c.setRequestProperty("Sec-Fetch-Dest", dest);
                c.setRequestProperty("Sec-Fetch-Mode", "navigate");
                c.setRequestProperty("Sec-Fetch-Site", "same-origin");
            }
            if (method.equals("POST")) {
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(0);
                c.getOutputStream().close();
            }
            if (c.getResponseCode() != 429 || i == 3) return c;
            String after = c.getHeaderField("Retry-After");
            c.disconnect();
            Thread.sleep((after != null && after.matches("\\d+") ? Integer.parseInt(after) : 1 << i) * 1000L);
        }
    }

    /** the body as text up to where re matches (its first group; null if it never does), or all of it (re null) */
    private static String readUntil(HttpURLConnection c, java.util.regex.Pattern re) throws IOException {
        if (c.getResponseCode() >= 400) {
            c.disconnect();
            return null;
        }
        try (InputStream in = c.getInputStream()) {
            java.io.ByteArrayOutputStream all = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[1 << 14];
            for (int n; (n = in.read(buf)) > 0; ) {
                all.write(buf, 0, n);
                if (re != null) {
                    java.util.regex.Matcher m = re.matcher(all.toString("UTF-8"));
                    if (m.find()) return m.group(1);
                }
            }
            return re == null ? all.toString("UTF-8") : null;
        } finally {
            c.disconnect();
        }
    }

    /** an episode: the MediaFire zip streamed into <downloads>/<name> <quality>.mp4 as it unpacks; its state at the end */
    private String fileNow(Job j, String url, String quality) throws StartFailed {
        File dir = dir();
        dir.mkdirs();
        File file = new File(dir, (j.name + " " + quality).replaceAll("[\\\\/:*?\"<>|]+", " ").trim() + ".mp4");
        DownloadService.Item item = new DownloadService.Item(j.title);
        DownloadService.active.put(j.id, item);
        Context c = getContext().getApplicationContext();
        DownloadService.start(c);
        HttpURLConnection conn;
        try {
            conn = get(url);
            if (conn.getResponseCode() >= 400) throw new IOException("HTTP " + conn.getResponseCode());
        } catch (IOException e) {
            DownloadService.active.remove(j.id);
            throw new StartFailed(e.getMessage());
        }
        String state = "done";
        long total = item.total = conn.getContentLengthLong();
        Counting in = null;
        try {
            in = new Counting(conn.getInputStream());
            try (ZipInputStream zip = new ZipInputStream(in); OutputStream out = new FileOutputStream(file)) {
                if (zip.getNextEntry() == null) throw new IOException("empty zip");
                byte[] buf = new byte[1 << 16];
                long sent = 0;
                for (int n; (n = zip.read(buf)) > 0; ) {
                    if (cancelled.contains(j.id)) throw new IOException("cancelled");
                    out.write(buf, 0, n);
                    if (System.currentTimeMillis() - sent > 1000) { // Android drops notification updates faster than this
                        sent = System.currentTimeMillis();
                        item.received = in.count;
                        emit(j.id, "active", in.count, total, file);
                        DownloadService.update(c);
                    }
                }
            }
        } catch (Exception e) {
            state = cancelled.contains(j.id) ? "cancelled" : "error";
            file.delete();
        }
        emit(j.id, state, in == null ? 0 : in.count, total, file);
        DownloadService.active.remove(j.id);
        return state;
    }

    private void emit(String id, String state, long received, long total, File file) {
        emit(id, state, received, total, file, null);
    }

    private void emit(String id, String state, long received, long total, File file, JSArray files) {
        JSObject p = new JSObject();
        p.put("id", id);
        p.put("state", state);
        p.put("received", received);
        p.put("total", total);
        if (file != null) p.put("file", file.getAbsolutePath());
        p.put("t", System.currentTimeMillis()); // when: the page, reopened, tells this from an older run of the same id
        if (files != null) p.put("files", files);
        last.put(id, p);
        live.notifyListeners("progress", p);
    }

    /** a manga chapter: each page image into <downloads>/Manga/<series>/<chapter>/, progress counted in pages; its state */
    private String pagesNow(Job j) throws Exception {
        File out = new File(dir(), "Manga");
        for (int i = 0; i < j.folder.length(); i++) out = new File(out, j.folder.getString(i).replaceAll("[\\\\/:*?\"<>|]+", " ").trim());
        out.mkdirs();
        JSONArray urls = j.urls;
        DownloadService.Item item = new DownloadService.Item(j.title);
        item.total = urls.length();
        DownloadService.active.put(j.id, item);
        Context c = getContext().getApplicationContext();
        DownloadService.start(c);
        String state = "done";
        JSArray files = new JSArray();
        try {
            if (urls.length() == 0) throw new IOException("no pages");
            for (int i = 0; i < urls.length(); i++) {
                if (cancelled.contains(j.id)) throw new IOException("cancelled");
                String url = urls.getString(i);
                if (!url.matches("https://(appswat|meshmanga)\\.com/v2/media/.*") && !url.startsWith("https://cdn.olympustaff.com/uploads/")) throw new IOException("bad url");
                String ext = url.replaceAll("[?#].*", "");
                ext = ext.substring(ext.lastIndexOf('.'));
                File f = new File(out, String.format("%04d%s", i + 1, ext.length() <= 5 ? ext : ".jpg"));
                HttpURLConnection conn = get(url);
                item.received = i + 1;
                if (conn.getResponseCode() == 404) continue; // pages the site lists but doesn't have: skip, like its reader
                if (conn.getResponseCode() >= 400) throw new IOException("HTTP " + conn.getResponseCode());
                try (InputStream in = conn.getInputStream()) {
                    Files.copy(in, f.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
                files.put(f.getAbsolutePath());
                emit(j.id, "active", i + 1, urls.length(), out);
                DownloadService.update(c);
            }
        } catch (Exception e) {
            state = cancelled.contains(j.id) ? "cancelled" : "error";
            deleteTree(out);
        }
        emit(j.id, state, item.received, urls.length(), out, files);
        DownloadService.active.remove(j.id);
        return state;
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /** stops a running download, or drops a waiting one */
    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id", "");
        boolean dropped = false;
        synchronized (lock) {
            if (running.contains(id)) cancelled.add(id);
            for (java.util.Iterator<List<Job>> it = waiting.values().iterator(); it.hasNext(); ) {
                List<Job> l = it.next();
                dropped |= l.removeIf(x -> x.id.equals(id));
                if (l.isEmpty()) it.remove();
            }
        }
        if (dropped) emit(id, "cancelled", 0, 0, null);
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        File f = new File(call.getString("path", ""));
        // only ever delete inside our own downloads folders (an episode file, or a chapter's folder); either one,
        // since downloads made before access was granted stay where they were saved
        try {
            String path = f.getCanonicalPath();
            for (File root : new File[] { new File(shared(), "Downloads"), privateDir() })
                if (path.startsWith(root.getCanonicalPath() + File.separator)) deleteTree(f);
        } catch (IOException ignored) {}
        call.resolve();
    }
}
