package com.aster.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * ASTER Android shell: serves the bundled web app (assets/app/**) from the
 * reserved origin https://appassets.androidplatform.net so ES modules,
 * localStorage and IndexedDB all behave exactly like on the web.
 */
public class MainActivity extends Activity {

    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_SAVE_FILE = 1002;

    private WebView web;
    private ValueCallback<Uri[]> fileChooserCallback;
    private byte[] pendingSave;
    private String pendingSaveName;
    private int notifId = 4000;
    private static final String CHANNEL_ID = "aster-reminders";

    /** Injected after load: catches blob:/data: anchor downloads (backup export). */
    private static final String SHIM_JS =
        "(function(){ if(window.__asterShim) return; window.__asterShim=true;" +
        "document.addEventListener('click', function(e){" +
        "  var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;" +
        "  if(!a) return; var href = a.href || '';" +
        "  if(!/^blob:|^data:/.test(href)) return;" +
        "  e.preventDefault(); e.stopPropagation();" +
        "  var name = a.getAttribute('download') || 'aster-backup.json';" +
        "  fetch(href).then(function(r){return r.blob()}).then(function(b){" +
        "    return new Promise(function(res){ var fr=new FileReader();" +
        "      fr.onload=function(){res(fr.result)}; fr.readAsDataURL(b); });" +
        "  }).then(function(dataUrl){ AsterFiles.save(name, dataUrl); })" +
        "  .catch(function(){ AsterFiles.save(name, 'data:application/octet-stream;base64,'); });" +
        "}, true); })();";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge-to-edge: draw behind the status & navigation bars; the web app
        // pads itself with env(safe-area-inset-*) insets.
        Window w = getWindow();
        w.setStatusBarColor(android.graphics.Color.TRANSPARENT);
        w.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        w.getDecorView().setSystemUiVisibility(
            android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#FAF7F2"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);

        // No long-press text selection / link "copy url" menu / haptic buzz —
        // the app handles its own interactions.
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(new android.view.View.OnLongClickListener() {
            @Override public boolean onLongClick(android.view.View v) { return true; }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!uri.toString().startsWith(APP_ORIGIN + "/")) return null;
                String p = uri.getPath();
                if (p == null || p.equals("/")) p = "/index.html";
                try {
                    InputStream in = getAssets().open("app" + p);
                    String mime = mimeFor(p);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-cache");
                    String encoding = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "utf-8" : null;
                    return new WebResourceResponse(mime, encoding, 200, "OK", headers, in);
                } catch (java.io.IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            Collections.<String, String>emptyMap(),
                            new ByteArrayInputStream(new byte[0]));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if (u.toString().startsWith(APP_ORIGIN)) return false;
                if (scheme.equals("http") || scheme.equals("https")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) {}
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(SHIM_JS, null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                String accept = "*/*";
                String[] types = params.getAcceptTypes();
                if (types != null && types.length > 0 && types[0] != null && !types[0].trim().isEmpty()) {
                    accept = types[0].trim();
                }
                if (accept.startsWith(".")) accept = "*/*"; // ".json" → let the picker filter by name
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(accept);
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "Select file"), REQ_FILE_CHOOSER);
                } catch (ActivityNotFoundException e) {
                    fileChooserCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AsterFiles");
        web.addJavascriptInterface(new NotifyBridge(), "AsterNotify");
        // Widget deep link: tap a row → open ASTER at that route / space
        String hash = deepLinkHash(getIntent());
        web.loadUrl(APP_ORIGIN + "/index.html" + (hash != null ? hash : ""));
    }

    /** "#/space/<id>" / "#/<route>" from widget taps, or null for plain boot. */
    private static String deepLinkHash(Intent it) {
        if (it == null) return null;
        String spaceId = it.getStringExtra("spaceId");
        if (spaceId != null && spaceId.matches("[A-Za-z0-9_-]+")) return "#/space/" + spaceId;
        String route = it.getStringExtra("route");
        if (route != null && route.matches("[a-z]+")) return "#/" + route;
        return null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String hash = deepLinkHash(intent);
        if (hash != null && web != null) {
            try {
                web.evaluateJavascript("location.hash = '" + hash + "'", null);
            } catch (Exception ignored) {
            }
        }
    }

    /** JS bridge — system notifications + native alarms (fire even when app is closed). */
    private class NotifyBridge {
        @JavascriptInterface
        public void request() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (Build.VERSION.SDK_INT >= 33 &&
                        checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 3001);
                    }
                }
            });
        }

        @JavascriptInterface
        public void show(final String title, final String body) {
            runOnUiThread(new Runnable() {
                @Override public void run() { postNotification(MainActivity.this, title, body); }
            });
        }

        /** App theme changed — flip system bar icon color + webview backdrop. */
        @JavascriptInterface
        public void theme(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    int flags = android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                    if (!dark) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                        | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    getWindow().getDecorView().setSystemUiVisibility(flags);
                    web.setBackgroundColor(dark ? 0xFF14121C : 0xFFFAF7F2);
                }
            });
        }

        /** Full list of upcoming reminders — replaces every scheduled alarm. */
        @JavascriptInterface
        public void sync(final String json) {
            try {
                getSharedPreferences("aster_reminders", MODE_PRIVATE).edit().putString("json", json).apply();
                scheduleAll(MainActivity.this);
            } catch (Exception ignored) {
            }
        }

        /** Everything the home-screen widgets show — one push, all widgets refresh. */
        @JavascriptInterface
        public void widgetData(final String json) {
            try {
                getSharedPreferences("aster_widget", MODE_PRIVATE).edit()
                    .putString("data", json == null ? "{}" : json).apply();
                ListWidget.bumpRev(MainActivity.this);
                WidgetClickReceiver.refreshWidgets(MainActivity.this);
            } catch (Exception ignored) {
            }
        }
    }

    /** Schedule every pending reminder as an exact OS alarm (survives app close + reboot). */
    static void scheduleAll(Context ctx) {
        try {
            String json = ctx.getSharedPreferences("aster_reminders", MODE_PRIVATE).getString("json", "[]");
            org.json.JSONArray arr = new org.json.JSONArray(json);
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            java.util.List<Integer> codes = new java.util.ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject r = arr.optJSONObject(i);
                if (r == null) continue;
                long at = r.optLong("at", 0);
                if (at <= System.currentTimeMillis()) continue;
                String id = r.optString("id", String.valueOf(i));
                String title = r.optString("title", "ASTER");
                String body = r.optString("body", "");
                int code = id.hashCode();
                codes.add(code);
                Intent it = new Intent(ctx, AlarmReceiver.class)
                    .putExtra("title", "ASTER: " + title)
                    .putExtra("body", body)
                    .putExtra("code", code);
                PendingIntent pi = PendingIntent.getBroadcast(ctx, code, it,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                } catch (SecurityException e) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); // no exact-alarm grant
                }
            }
        } catch (Exception ignored) {
        }
    }

    /** Post a system notification (used by the bridge and the alarm receivers). */
    static void postNotification(Context ctx, String title, String body) {
        try {
            if (Build.VERSION.SDK_INT >= 33 &&
                ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Reminders",
                    NotificationManager.IMPORTANCE_DEFAULT));
            }
            Intent open = new Intent(ctx, MainActivity.class);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            int iconId = ctx.getResources().getIdentifier("ic_launcher", "mipmap", ctx.getPackageName());
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, CHANNEL_ID)
                : new Notification.Builder(ctx);
            Notification n = b
                .setSmallIcon(iconId != 0 ? iconId : android.R.drawable.ic_dialog_info)
                .setContentTitle(title == null ? "ASTER" : title)
                .setContentText(body == null ? "" : body)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
            nm.notify((int) (System.currentTimeMillis() % 100000), n);
        } catch (Exception ignored) {
        }
    }

    void notifyNow(String title, String body) {
        postNotification(this, title, body);
    }

    /** JS bridge — called by the download shim with a data: URL. */
    private class Bridge {
        @JavascriptInterface
        public void save(final String name, final String dataUrl) {
            try {
                String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                pendingSave = Base64.decode(b64, Base64.DEFAULT);
                pendingSaveName = name;
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        i.setType("application/json");
                        i.putExtra(Intent.EXTRA_TITLE, name);
                        try {
                            startActivityForResult(i, REQ_SAVE_FILE);
                        } catch (ActivityNotFoundException e) {
                            pendingSave = null;
                            toast("No place to save the backup");
                        }
                    }
                });
            } catch (Exception e) {
                pendingSave = null;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (fileChooserCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getData() != null) {
                    result = new Uri[]{ data.getData() };
                } else if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                }
            }
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        } else if (requestCode == REQ_SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    out.write(pendingSave);
                    toast("Saved ✦ " + pendingSaveName);
                } catch (Exception e) {
                    toast("Could not save the backup");
                }
            }
            pendingSave = null;
            pendingSaveName = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase();
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs":   return "text/javascript";
            case "css":              return "text/css";
            case "json":             return "application/json";
            case "svg":              return "image/svg+xml";
            case "png":              return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif":              return "image/gif";
            case "webp":             return "image/webp";
            case "ico":              return "image/x-icon";
            case "txt":              return "text/plain";
            case "woff":             return "font/woff";
            case "woff2":            return "font/woff2";
            default:                 return "application/octet-stream";
        }
    }
}
