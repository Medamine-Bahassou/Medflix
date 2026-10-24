package com.medanime.app;

import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;

public class MainActivity extends BridgeActivity {

    private View fullscreenView;
    private BridgeWebChromeClient.CustomViewCallback fullscreenCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DownloaderPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        // started with the app, so the Cast SDK follows it to the background (where it keeps the cast's notification up)
        // and the TVs are already found when the cast button is tapped; no Google Play services: casting mirrors the screen
        try {
            com.google.android.gms.cast.framework.CastContext.getSharedInstance(this);
        } catch (Exception ignored) {}

        webView.getSettings().setSupportMultipleWindows(true); // window.open goes to onCreateWindow (refused), never this page
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER); // no Android stretch at a scroll's ends (see overscroll-behavior in style.css)

        // A player in another site's frame can't be reached from the page. This script, in every frame, plays / pauses its
        // video when the app's play button asks (a message passed down the frames), and tells the app when it plays or
        // pauses, for the button's icon (MEGA's player has no pause button of its own on phones). Before its first play the
        // video has no source yet (MEGA loads it from its own big play button): the tap goes to what is in the frame's middle
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) WebViewCompat.addDocumentStartJavaScript(webView,
            "(() => { if (window === top) return;" +
            " const tell = e => e.target.tagName === 'VIDEO' && parent.postMessage({ medPaused: e.target.paused }, '*');" +
            " ['playing', 'pause', 'ended'].forEach(n => addEventListener(n, tell, true));" +
            " addEventListener('message', e => { const d = e.data;" +
            "  if (d && d.medToggle && e.source === parent) { const v = document.querySelector('video');" +
            "   const c = document.elementFromPoint(innerWidth / 2, innerHeight / 2);" +
            "   if (v && v.played.length) v.paused ? v.play() : v.pause();" +
            "   else if (frames.length && (!c || c.tagName === 'IFRAME')) for (let i = 0; i < frames.length; i++) frames[i].postMessage(d, '*');" +
            "   else if (c && c !== v) c.click(); else if (v) v.play(); }" +
            "  else if (d && typeof d.medPaused === 'boolean' && e.source !== parent) parent.postMessage(d, '*'); }); })();",
            Collections.singleton("*"));

        // The page runs the download queue: as one file finishes, it looks up the next one's link. With the screen off,
        // WebView by default lets its renderer's priority drop (the app isn't visible), and Android then freezes that
        // process: the next download sat at "Preparing download…" until the phone was unlocked. Keep it running.
        if (Build.VERSION.SDK_INT >= 26) webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

        // posters and banners: through the disk cache, fetched without the app's Referer (witanime 403s hotlinks)
        getBridge().setWebViewClient(
            new BridgeWebViewClient(getBridge()) {
                // a player trying to take the whole app to its ad (top navigation after a tap): stay on the app
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request.isForMainFrame() && !fromApp(request.getUrl().toString())) return true;
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    // the page's browser process died (memory...): start the screen over rather than let Android close the app
                    if (!super.onRenderProcessGone(view, detail)) recreate();
                    return true;
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (!fromApp(request.getUrl().toString())) Cast.sniff(request); // the players' video, for casting to a TV
                    WebResourceResponse cached = ImageCache.serve(MainActivity.this, request);
                    return cached != null ? cached : super.shouldInterceptRequest(view, request);
                }
            }
        );

        // Capacitor's chrome client cancels fullscreen requests right away, so players' fullscreen buttons did nothing.
        // Show the video view ourselves, over everything, with the status and navigation bars hidden.
        webView.setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onShowCustomView(View view, CustomViewCallback callback) {
                    enterFullscreen(view, callback);
                }

                @Override
                public void onHideCustomView() {
                    exitFullscreen();
                }

                // Players run in plain iframes (several movie hosts refuse sandboxed ones), so what the sandbox did is
                // done here: no popups at all (the app opens its own links with Downloader.openUrl), and no alert /
                // confirm / prompt boxes from them; the app's own page keeps its dialogs
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                    return false;
                }

                @Override
                public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
                    if (fromApp(url)) return super.onJsAlert(view, url, message, result);
                    result.cancel();
                    return true;
                }

                @Override
                public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                    if (fromApp(url)) return super.onJsConfirm(view, url, message, result);
                    result.cancel();
                    return true;
                }

                @Override
                public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, android.webkit.JsPromptResult result) {
                    if (fromApp(url)) return super.onJsPrompt(view, url, message, defaultValue, result);
                    result.cancel();
                    return true;
                }
            }
        );

        // Back button: leave fullscreen, else let the page close its open menu/overlay, else go back a page, else quit.
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (fullscreenView != null) {
                            exitFullscreen();
                            return;
                        }
                        if (DownloaderPlugin.closeChallenge()) return; // Cloudflare's check over the app
                        webView.evaluateJavascript(
                            "!!(window.androidBack && androidBack())",
                            handled -> {
                                if ("true".equals(handled)) return;
                                if (webView.canGoBack()) webView.goBack();
                                else finish();
                            }
                        );
                    }
                }
            );
    }

    private boolean fromApp(String url) {
        return url != null && url.startsWith(getBridge().getLocalUrl());
    }

    private WindowInsetsControllerCompat systemBars() {
        return WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    }

    private void enterFullscreen(View view, BridgeWebChromeClient.CustomViewCallback callback) {
        if (fullscreenView != null) {
            callback.onCustomViewHidden();
            return;
        }
        fullscreenView = view;
        fullscreenCallback = callback;
        view.setBackgroundColor(Color.BLACK);
        ((FrameLayout) getWindow().getDecorView()).addView(
                view,
                new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            );
        // bars stay hidden; a swipe from the edge shows them briefly
        systemBars().setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        systemBars().hide(WindowInsetsCompat.Type.systemBars());
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        ((FrameLayout) getWindow().getDecorView()).removeView(fullscreenView);
        fullscreenView = null;
        systemBars().show(WindowInsetsCompat.Type.systemBars());
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
    }
}
