package com.medanime.app;

import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Android side of the image cache (the Electron side is in main.js): posters/banners from the scraped sites are
 * kept on disk for good. A saved image shows at once and is re-downloaded from the site once per app run.
 */
final class ImageCache {

    private static final Pattern HOSTS = Pattern.compile("^https://(images\\.witanime\\.site|eva\\.animerco\\.org/wp-content/uploads|(appswat|meshmanga)\\.com/v2/media/__sized__|cdn\\.olympustaff\\.com/images/manga|img\\.animeschedule\\.net/production|([a-z0-9-]+\\.)*(egydead|myseed|arabseed)\\.[a-z]+/wp-content/uploads)/.*"); // manga posters, not chapter pages
    private static final String UA =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";
    private static final Set<String> checked = ConcurrentHashMap.newKeySet();

    private ImageCache() {}

    static File dir(Context c) {
        File d = new File(c.getFilesDir(), "images");
        d.mkdirs();
        return d;
    }

    /** a response for an image request from the scraped sites, or null to let the WebView load it normally */
    static WebResourceResponse serve(Context c, WebResourceRequest req) {
        String url = req.getUrl().toString();
        if (!"GET".equals(req.getMethod())) return null;
        String ua = req.getRequestHeaders().getOrDefault("User-Agent", UA);
        if (!HOSTS.matcher(url).matches()) return null;
        File f = new File(dir(c), sha1(url));
        try {
            if (!f.exists()) download(url, f, ua);
            else if (checked.add(url)) new Thread(() -> {
                try {
                    download(url, f, ua);
                } catch (IOException ignored) {
                    // offline: keep the saved copy
                }
            }).start();
            return new WebResourceResponse(mime(url), null, new FileInputStream(f));
        } catch (IOException e) {
            return null;
        }
    }

    /** with the WebView's cookies, so a Cloudflare clearance it earned counts */
    private static HttpURLConnection open(String url, String ua) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestProperty("User-Agent", ua); // and no Referer: witanime blocks hotlinks
        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null) conn.setRequestProperty("Cookie", cookies);
        return conn;
    }

    private static void download(String url, File f, String ua) throws IOException {
        HttpURLConnection conn = open(url, ua);
        if (conn.getResponseCode() != 200) throw new IOException("HTTP " + conn.getResponseCode());
        File tmp = new File(f.getPath() + ".tmp");
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[16384];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        }
        if (!tmp.renameTo(f)) throw new IOException("rename failed");
    }

    private static String mime(String url) {
        String u = url.toLowerCase();
        return u.endsWith(".png") ? "image/png" : u.endsWith(".webp") ? "image/webp" : u.endsWith(".gif") ? "image/gif" : "image/jpeg";
    }

    private static String sha1(String s) {
        try {
            StringBuilder hex = new StringBuilder();
            for (byte b : MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"))) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
