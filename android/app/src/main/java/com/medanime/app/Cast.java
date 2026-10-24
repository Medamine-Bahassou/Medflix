package com.medanime.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastOptions;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.OptionsProvider;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.SessionProvider;
import com.google.android.gms.cast.framework.media.CastMediaOptions;
import com.google.android.gms.cast.framework.media.NotificationOptions;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Cast to a TV (Chromecast, Android TV) the way video apps do: the TV plays the video itself. The hosts only give
 * embed pages, so the video's own address is caught as their player loads it (sniff, from MainActivity), and the TV
 * gets it through a small server on the phone (serve), which asks the host as its player did (Referer, cookies, the
 * WebView's user agent) and adds the CORS headers the TV's player needs. Downloaded episodes are served from the file.
 * MEGA's player has no such address (it decrypts the file in the page): for its links the server fetches the file from
 * MEGA and decrypts it itself, with the key in the link (page: the player's address).
 */
public final class Cast {

    /** the Cast SDK's settings (AndroidManifest.xml): Google's default player on the TV, and a notification to control it */
    public static final class Options implements OptionsProvider {
        @Override
        public CastOptions getCastOptions(Context c) {
            NotificationOptions n = new NotificationOptions.Builder().setTargetActivityClassName(MainActivity.class.getName()).build();
            return new CastOptions.Builder()
                .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
                .setCastMediaOptions(new CastMediaOptions.Builder().setNotificationOptions(n).build())
                .build();
        }

        @Override
        public List<SessionProvider> getAdditionalSessionProviders(Context c) {
            return null;
        }
    }

    // --- the video the player in the page is playing: { url, referer } ---
    private static final Pattern MEDIA = Pattern.compile("\\.(m3u8|mp4|mkv|webm)$", Pattern.CASE_INSENSITIVE);
    private static volatile String[] hls, video;

    // ponytail: by address only (.m3u8/.mp4); a host whose links look like neither isn't caught, and an mp4 ad that
    // plays after the film started would be taken instead. Upgrade path: look at the responses' Content-Type.
    static void sniff(WebResourceRequest r) {
        String path = r.getUrl().getPath();
        if (path == null || !MEDIA.matcher(path).find()) return;
        String referer = null;
        for (Map.Entry<String, String> h : r.getRequestHeaders().entrySet()) if (h.getKey().equalsIgnoreCase("referer")) referer = h.getValue();
        String[] m = { r.getUrl().toString(), referer };
        if (path.toLowerCase().endsWith(".m3u8")) {
            if (hls == null) hls = m; // the first playlist is the master one; the ones it lists come after
        } else video = m; // the last file: ads play before the film
    }

    /** another server or episode in the player: forget the last one's video */
    static void reset() {
        hls = video = null;
    }

    /** cast { title, file?, at?, page? }: a downloaded file, else the video the player is playing; resolves once the TV plays it */
    static void start(Activity a, PluginCall call) {
        String file = call.getString("file");
        boolean mega = file == null && mega(call.getString("page"));
        String[] m = file != null || mega ? null : hls != null ? hls : video;
        if (m == null && file == null && !mega) {
            call.reject("no video");
            return;
        }
        CastContext cc;
        try {
            cc = CastContext.getSharedInstance(a);
        } catch (Exception e) { // no Google Play services: mirror the screen instead
            screen(a, call);
            return;
        }
        token = UUID.randomUUID().toString();
        source = file;
        referer = m == null ? null : m[1];
        try {
            base = server(a) + "/" + token;
        } catch (IOException e) {
            call.reject("no wifi");
            return;
        }
        MediaMetadata md = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);
        md.putString(MediaMetadata.KEY_TITLE, call.getString("title", ""));
        MediaInfo info = new MediaInfo.Builder(file != null ? base + "/f" : mega ? base + "/m" : base + "/v?u=" + Uri.encode(m[0]))
            .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType(m != null && m == hls ? "application/x-mpegurl" : "video/mp4")
            .setMetadata(md)
            .build();
        long at = (long) (call.getDouble("at", 0.0) * 1000);

        SessionManager sm = cc.getSessionManager();
        CastSession s = sm.getCurrentCastSession();
        if (s != null && s.isConnected()) {
            load(s, info, at, call);
            return;
        }
        // not connected yet: the list of TVs; casting starts once one is picked
        boolean[] picked = { false };
        SessionManagerListener<CastSession> l = new SessionManagerListener<CastSession>() {
            @Override
            public void onSessionStarting(CastSession s) {
                picked[0] = true;
            }

            @Override
            public void onSessionStarted(CastSession s, String id) {
                sm.removeSessionManagerListener(this, CastSession.class);
                load(s, info, at, call);
            }

            @Override
            public void onSessionStartFailed(CastSession s, int error) {
                sm.removeSessionManagerListener(this, CastSession.class);
                call.reject("cast failed");
            }

            @Override
            public void onSessionEnding(CastSession s) {}

            @Override
            public void onSessionEnded(CastSession s, int error) {}

            @Override
            public void onSessionResuming(CastSession s, String id) {}

            @Override
            public void onSessionResumed(CastSession s, boolean wasSuspended) {}

            @Override
            public void onSessionResumeFailed(CastSession s, int error) {}

            @Override
            public void onSessionSuspended(CastSession s, int reason) {}
        };
        sm.addSessionManagerListener(l, CastSession.class);
        MediaRouteChooserDialog d = new MediaRouteChooserDialog(a);
        d.setRouteSelector(cc.getMergedSelector());
        d.setOnDismissListener(x ->
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (picked[0]) return;
                sm.removeSessionManagerListener(l, CastSession.class);
                call.reject("cancelled");
            }, 1000)
        );
        d.show();
    }

    private static void load(CastSession s, MediaInfo info, long at, PluginCall call) {
        RemoteMediaClient r = s.getRemoteMediaClient();
        if (r == null) {
            call.reject("cast failed");
            return;
        }
        r.load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).setCurrentTime(at).build())
            .setResultCallback(res -> {
                if (res.getStatus().isSuccess()) {
                    CastContext.getSharedInstance().getMediaNotificationManager().updateNotification(); // its controls, now
                    call.resolve();
                }
                else call.reject("cast failed");
            });
    }

    /** the phone's screen cast picker; Samsung and others name it differently */
    private static void screen(Activity a, PluginCall call) {
        for (String action : new String[] { Settings.ACTION_CAST_SETTINGS, "android.settings.WIFI_DISPLAY_SETTINGS" }) {
            try {
                a.startActivity(new Intent(action));
                JSObject r = new JSObject();
                r.put("screen", true);
                call.resolve(r);
                return;
            } catch (Exception ignored) {}
        }
        call.reject("no cast");
    }

    // --- the server the TV plays from: http://<phone>:<port>/<token>/v?u=<host's url> or /<token>/f (the file) ---
    // The token changes with each cast, so only the TV it was handed to can use it (it's not an open proxy).
    private static ServerSocket server;
    private static String ua;
    private static volatile String token = "", base = "", source, referer;
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");

    private static synchronized String server(Context c) throws IOException {
        if (server == null) {
            ua = WebSettings.getDefaultUserAgent(c);
            ServerSocket ss = new ServerSocket(0);
            Thread t = new Thread(() -> {
                while (true) try {
                    Socket s = ss.accept();
                    new Thread(() -> serve(s)).start();
                } catch (IOException e) {
                    return;
                }
            });
            t.setDaemon(true);
            t.start();
            server = ss;
        }
        String ip = lanIp();
        if (ip == null) throw new IOException("no wifi");
        return "http://" + ip + ":" + server.getLocalPort();
    }

    /** the phone's address on the Wi-Fi (the TV's network) */
    private static String lanIp() throws IOException {
        String any = null;
        for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!n.isUp() || n.isLoopback()) continue;
            for (InetAddress a : Collections.list(n.getInetAddresses())) {
                if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                if (n.getName().startsWith("wlan")) return a.getHostAddress();
                if (any == null) any = a.getHostAddress();
            }
        }
        return any;
    }

    private static void serve(Socket sock) {
        try (Socket s = sock) {
            s.setSoTimeout(60000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            String line = readLine(in);
            if (line == null) return;
            String[] req = line.split(" ");
            String range = null;
            for (String h; (h = readLine(in)) != null && !h.isEmpty(); ) if (h.toLowerCase().startsWith("range:")) range = h.substring(6).trim();
            OutputStream out = s.getOutputStream();
            Uri u = Uri.parse(req[1]);
            List<String> seg = u.getPathSegments();
            if (seg.size() != 2 || !seg.get(0).equals(token)) head(out, "404 Not Found", null, 0, null);
            else if (req[0].equals("OPTIONS")) head(out, "204 No Content", null, -1, null); // CORS preflight
            else if (seg.get(1).equals("f") && source != null) file(out, range, req[0].equals("HEAD"));
            else if (seg.get(1).equals("m") && megaKey != null) mega(out, range, req[0].equals("HEAD"));
            else if (seg.get(1).equals("v")) url(out, u.getQueryParameter("u"), range, req[0].equals("HEAD"));
            else head(out, "404 Not Found", null, 0, null);
        } catch (Exception ignored) {} // the TV closed the connection (seeking, stopped)
    }

    /** the bytes a Range header asks of a file of size bytes: { from, to, 1 if it asked (a 206), else 0 }; null: none of them */
    private static long[] span(String range, long size) {
        long from = 0, to = size - 1;
        Matcher m = RANGE.matcher(range == null ? "" : range);
        if (!m.find()) return new long[] { from, to, 0 };
        if (!m.group(1).isEmpty()) {
            from = Long.parseLong(m.group(1));
            if (!m.group(2).isEmpty()) to = Math.min(Long.parseLong(m.group(2)), size - 1);
        } else if (!m.group(2).isEmpty()) from = size - Long.parseLong(m.group(2)); // the last n bytes
        return from >= size || from < 0 ? null : new long[] { from, to, 1 };
    }

    /** the response's head for a span of a file of size bytes (a 416 for none) */
    private static boolean spanHead(OutputStream out, long[] r, long size) throws IOException {
        if (r == null) head(out, "416 Range Not Satisfiable", null, 0, "bytes */" + size);
        else head(out, r[2] == 1 ? "206 Partial Content" : "200 OK", "video/mp4", r[1] - r[0] + 1, r[2] == 1 ? "bytes " + r[0] + "-" + r[1] + "/" + size : null);
        return r != null;
    }

    private static void file(OutputStream out, String range, boolean headOnly) throws IOException {
        File f = new File(source);
        long size = f.length();
        long[] r = span(range, size);
        if (!spanHead(out, r, size) || headOnly) return;
        long from = r[0], to = r[1];
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            raf.seek(from);
            byte[] b = new byte[65536];
            for (long left = to - from + 1; left > 0; ) {
                int n = raf.read(b, 0, (int) Math.min(b.length, left));
                if (n <= 0) break;
                out.write(b, 0, n);
                left -= n;
            }
        }
    }

    private static void url(OutputStream out, String url, String range, boolean headOnly) throws IOException {
        if (url == null || !url.startsWith("http")) {
            head(out, "400 Bad Request", null, 0, null);
            return;
        }
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", ua);
        if (referer != null) c.setRequestProperty("Referer", referer);
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null) c.setRequestProperty("Cookie", cookie);
        if (range != null) c.setRequestProperty("Range", range);
        int code = c.getResponseCode();
        String type = c.getContentType();
        InputStream body = code >= 400 ? c.getErrorStream() : c.getInputStream();
        try {
            // a playlist: every address in it goes through here too
            if ((type != null && type.toLowerCase().contains("mpegurl")) || c.getURL().getPath().toLowerCase().endsWith(".m3u8")) {
                String text = new String(readAll(body), StandardCharsets.UTF_8);
                if (text.trim().startsWith("#EXTM3U")) text = rewrite(text, c.getURL());
                byte[] b = text.getBytes(StandardCharsets.UTF_8);
                head(out, code + " OK", "application/vnd.apple.mpegurl", b.length, null);
                if (!headOnly) out.write(b);
                return;
            }
            head(out, code + " OK", type, c.getContentLengthLong(), c.getHeaderField("Content-Range"));
            if (headOnly || body == null) return;
            byte[] b = new byte[65536];
            for (int n; (n = body.read(b)) > 0; ) out.write(b, 0, n);
        } finally {
            if (body != null) body.close();
            c.disconnect();
        }
    }

    // --- MEGA: mega.nz/embed/<id>#<key> (or /file/, or the old #!<id>!<key>). The key's 32 bytes hold the AES-128 key
    // (its two halves XORed) and the counter's first 8 bytes; the file is AES-CTR, so any part decrypts on its own ---
    private static final Pattern MEGA_LINK = Pattern.compile("mega(?:\\.co)?\\.nz/(?:embed|file)?[/#!]*([\\w-]{8,})[#!]([\\w-]{43})");
    private static volatile String megaId, megaUrl;
    private static volatile byte[] megaKey, megaIv;
    private static volatile long megaSize;

    private static boolean mega(String page) {
        megaKey = null;
        Matcher m = MEGA_LINK.matcher(page == null ? "" : page);
        if (!m.find()) return false;
        byte[] k = Base64.decode(m.group(2), Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        if (k.length != 32) return false;
        byte[] key = new byte[16], iv = new byte[16];
        for (int i = 0; i < 16; i++) key[i] = (byte) (k[i] ^ k[i + 16]);
        System.arraycopy(k, 16, iv, 0, 8);
        megaId = m.group(1); megaIv = iv; megaUrl = null; megaKey = key;
        return true;
    }

    /** the file's download address (it expires: asked again then) and size, from MEGA's API */
    private static synchronized void megaFile() throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL("https://g.api.mega.co.nz/cs").openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.getOutputStream().write(("[{\"a\":\"g\",\"g\":1,\"ssl\":2,\"p\":\"" + megaId + "\"}]").getBytes(StandardCharsets.UTF_8));
        String text = new String(readAll(c.getInputStream()), StandardCharsets.UTF_8);
        try {
            JSONObject o = new JSONArray(text).getJSONObject(0);
            megaUrl = o.getString("g");
            megaSize = o.getLong("s");
        } catch (JSONException e) { // a number instead: MEGA's error code (-9: gone, -18: unavailable...)
            throw new IOException("mega " + text);
        }
    }

    private static HttpURLConnection megaGet(long from, long to) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(megaUrl + "/" + from + "-" + to).openConnection(); // MEGA's ranges
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", ua);
        return c;
    }

    private static void mega(OutputStream out, String range, boolean headOnly) throws Exception {
        if (megaUrl == null) megaFile();
        long[] r = span(range, megaSize);
        if (r == null || headOnly) {
            spanHead(out, r, megaSize);
            return;
        }
        long at = r[0] - r[0] % 16; // decrypting starts on a block
        HttpURLConnection c = megaGet(at, r[1]);
        if (c.getResponseCode() == 403 || c.getResponseCode() == 404) { // the address expired
            c.disconnect();
            megaFile();
            c = megaGet(at, r[1]);
        }
        if (c.getResponseCode() >= 400) { // 509: MEGA's transfer quota for this connection is used up
            head(out, "502 Bad Gateway", null, 0, null);
            c.disconnect();
            return;
        }
        byte[] iv = megaIv.clone();
        long block = at / 16;
        for (int i = 0; i < 8; i++) iv[15 - i] = (byte) (block >>> (8 * i));
        Cipher ci = Cipher.getInstance("AES/CTR/NoPadding");
        ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(megaKey, "AES"), new IvParameterSpec(iv));
        spanHead(out, r, megaSize);
        try (InputStream body = c.getInputStream()) {
            byte[] b = new byte[65536];
            int skip = (int) (r[0] - at);
            for (int n; (n = body.read(b)) > 0; ) {
                byte[] d = ci.update(b, 0, n);
                if (d == null) continue;
                int o = Math.min(skip, d.length);
                skip -= o;
                out.write(d, o, d.length - o);
            }
        } finally {
            c.disconnect();
        }
    }

    static String rewrite(String text, URL from) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\r?\n")) {
            String l = line.trim();
            if (l.startsWith("#")) { // tags: their URI="..." (encryption keys, audio tracks, sub-playlists)
                Matcher m = URI_ATTR.matcher(l);
                StringBuffer b = new StringBuffer();
                while (m.find()) m.appendReplacement(b, Matcher.quoteReplacement("URI=\"" + proxied(from, m.group(1)) + "\""));
                m.appendTail(b);
                l = b.toString();
            } else if (!l.isEmpty()) l = proxied(from, l);
            sb.append(l).append('\n');
        }
        return sb.toString();
    }

    private static String proxied(URL from, String ref) throws IOException {
        return base + "/v?u=" + Uri.encode(new URL(from, ref).toString());
    }

    private static void head(OutputStream out, String status, String type, long length, String contentRange) throws IOException {
        StringBuilder h = new StringBuilder("HTTP/1.1 ").append(status).append("\r\n")
            .append("Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n")
            .append("Access-Control-Expose-Headers: Content-Length, Content-Range\r\nAccept-Ranges: bytes\r\nConnection: close\r\n");
        if (type != null) h.append("Content-Type: ").append(type).append("\r\n");
        if (length >= 0) h.append("Content-Length: ").append(length).append("\r\n");
        if (contentRange != null) h.append("Content-Range: ").append(contentRange).append("\r\n");
        out.write(h.append("\r\n").toString().getBytes(StandardCharsets.ISO_8859_1));
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int b; (b = in.read()) != '\n'; ) {
            if (b < 0) return sb.length() == 0 ? null : sb.toString();
            if (b != '\r') sb.append((char) b);
        }
        return sb.toString();
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        if (in == null) return o.toByteArray();
        byte[] b = new byte[16384];
        for (int n; (n = in.read(b)) > 0; ) o.write(b, 0, n);
        return o.toByteArray();
    }
}
