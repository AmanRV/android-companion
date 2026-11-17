package com.androidcompanion.dashboard;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String HOME = "http://127.0.0.1:8765/";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private TextView waiting;
    private boolean active;
    private boolean pageFailed;
    private final Runnable retry = new Runnable() {
        @Override public void run() {
            if (!active) return;
            pageFailed = false;
            webView.loadUrl(HOME);
        }
    };

    private static boolean localUrl(String value) {
        try {
            URI uri = new URI(value);
            return "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())
                && uri.getPort() == 8765 && uri.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        immersive();

        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(17, 18, 20));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(17, 18, 20));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " AndroidCompanionApp");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !localUrl(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (localUrl(request.getUrl().toString())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                    java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) scheduleRetry();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) scheduleRetry();
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageFailed && localUrl(url)) waiting.setVisibility(View.GONE);
            }
        });
        frame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        waiting = new TextView(this);
        waiting.setText("waiting for usb\n\nconnect the phone and start the PC monitor");
        waiting.setTextColor(Color.rgb(154, 157, 162));
        waiting.setTextSize(16);
        waiting.setTypeface(android.graphics.Typeface.MONOSPACE);
        waiting.setGravity(Gravity.CENTER);
        waiting.setBackgroundColor(Color.rgb(17, 18, 20));
        frame.addView(waiting, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
    }

    private void scheduleRetry() {
        pageFailed = true;
        waiting.setVisibility(View.VISIBLE);
        handler.removeCallbacks(retry);
        if (active) handler.postDelayed(retry, 5000);
    }

    private void immersive() {
        View decor = getWindow().getDecorView();
        decor.setOnApplyWindowInsetsListener((view, insets) -> {
            WindowInsetsController controller = view.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            return view.onApplyWindowInsets(insets);
        });
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onResume() {
        super.onResume();
        active = true;
        immersive();
        webView.onResume();
        if (pageFailed || webView.getUrl() == null) retry.run();
    }

    @Override public void onPause() {
        active = false;
        handler.removeCallbacks(retry);
        webView.onPause();
        super.onPause();
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("if(window.CompanionSceneExit)window.CompanionSceneExit()", null);
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(retry);
        webView.destroy();
        super.onDestroy();
    }
}
