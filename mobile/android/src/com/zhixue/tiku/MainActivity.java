package com.zhixue.tiku;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.database.Cursor;
import android.os.Environment;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 智学题库手机版：一个全屏 WebView，页面和题库打包在 assets/www 里。
 * 用虚拟域名 https://app.zhixue/ 加载，这样页面里 /media/... 这类绝对路径照常能用。
 * 做题记录通过 ZXStore 写到应用私有目录 files/progress.json（覆盖安装不会丢，卸载会删）。
 *
 * 热更新：local.js 下载新的界面和题库，经 ZXStore.contentBegin/Write/Commit 放到 files/content/current/www，
 * 以后页面优先从那里读（版本比 App 自带的新、并且这个版本的 App 能用时，见 chooseContent）。
 */
public class MainActivity extends Activity {
    static final String HOST = "app.zhixue";
    static final String HOME = "https://" + HOST + "/index.html";
    WebView web;
    volatile File contentRoot;       // 热更新下载的内容（www 目录）；null 表示用 App 自带的 assets/www

    File contentDir() { return new File(getFilesDir(), "content"); }

    String appVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "0";
        }
    }

    static int[] ver(String v) {
        int[] out = new int[3];
        String[] p = (v == null ? "" : v.replaceFirst("^[vV]", "")).split("\\.");
        for (int i = 0; i < 3 && i < p.length; i++) {
            try { out[i] = Integer.parseInt(p[i].trim()); } catch (NumberFormatException e) { out[i] = 0; }
        }
        return out;
    }

    static int cmp(String a, String b) {
        int[] x = ver(a), y = ver(b);
        for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i] < y[i] ? -1 : 1;
        return 0;
    }

    static String readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    /** 下载的内容版本更高、并且这个版本的 App 能用（min_android_version），就用下载的 */
    void chooseContent() {
        int bundled = 0;
        try {
            bundled = new JSONObject(readAll(getAssets().open("www/content.json"))).optInt("content_version", 0);
        } catch (Exception e) {
            // 没有清单就当 0
        }
        File www = new File(new File(contentDir(), "current"), "www");
        File root = null;
        try {
            JSONObject m = new JSONObject(readAll(new FileInputStream(new File(www, "content.json"))));
            if (m.optInt("content_version", 0) > bundled && cmp(appVersion(), m.optString("min_android_version", "0")) >= 0) {
                root = www;
            }
        } catch (Exception e) {
            // 没下载过
        }
        contentRoot = root;
    }

    /** 从正在用的内容里打开一个文件（path 不带开头的 /） */
    InputStream openContent(String path) throws IOException {
        if (path.contains("..")) throw new IOException("bad path");
        File root = contentRoot;
        if (root != null) {
            File f = new File(root, path);
            if (f.isFile()) return new FileInputStream(f);
        }
        return getAssets().open("www/" + path);
    }

    static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    static void copy(InputStream in, File dst) throws IOException {
        dst.getParentFile().mkdirs();
        try (OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } finally {
            in.close();
        }
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        w.setStatusBarColor(Color.parseColor(night ? "#282828" : "#f6f7f9"));
        if (!night && Build.VERSION.SDK_INT >= 23) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        chooseContent();
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Store(), "ZXStore");
        web.setWebViewClient(new Client());
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    void openUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            // 没有浏览器就算了
        }
    }

    class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            openUrl(u.toString());          // 外部链接交给系统浏览器
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            try {
                InputStream in = openContent(path.substring(1));
                WebResourceResponse r = new WebResourceResponse(mime(path), mime(path).startsWith("text/") ||
                        path.endsWith(".js") || path.endsWith(".json") ? "utf-8" : null, in);
                return r;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }
        }
    }

    static String mime(String p) {
        p = p.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    /** 页面里的 window.ZXStore */
    class Store {
        File file() { return new File(getFilesDir(), "progress.json"); }

        @JavascriptInterface
        public String read() {
            File f = file();
            if (!f.exists()) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[(int) f.length()];
                int off = 0;
                while (off < buf.length) {
                    int n = in.read(buf, off, buf.length - off);
                    if (n < 0) break;
                    off += n;
                }
                return new String(buf, 0, off, StandardCharsets.UTF_8);
            } catch (IOException e) {
                return "";
            }
        }

        @JavascriptInterface
        public void write(String text) {
            // 先写临时文件再改名，写到一半断电也不会把记录弄坏
            File tmp = new File(getFilesDir(), "progress.json.tmp");
            try (OutputStream out = new FileOutputStream(tmp)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
                out.flush();
            } catch (IOException e) {
                return;
            }
            if (!tmp.renameTo(file())) {
                file().delete();
                tmp.renameTo(file());
            }
        }

        @JavascriptInterface
        public void backup(String text) {
            File dir = new File(getFilesDir(), "backups");
            dir.mkdirs();
            String name = "progress-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date()) + ".json";
            try (OutputStream out = new FileOutputStream(new File(dir, name))) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                // 备份失败不影响清除
            }
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> MainActivity.this.openUrl(url));
        }

        @JavascriptInterface
        public String appVersion() {
            return MainActivity.this.appVersion();
        }

        /** 热更新第一步：建 content/next/www，把没变的文件（keepJson 是路径数组）从正在用的内容复制过去。
         *  返回复制不了的路径（JSON 数组），由页面改成下载 */
        @JavascriptInterface
        public String contentBegin(String keepJson) {
            JSONArray missing = new JSONArray();
            try {
                File next = new File(contentDir(), "next");
                deleteTree(next);
                File www = new File(next, "www");
                www.mkdirs();
                JSONArray keep = new JSONArray(keepJson);
                for (int i = 0; i < keep.length(); i++) {
                    String p = keep.getString(i);
                    try {
                        copy(openContent(p), new File(www, p));
                    } catch (IOException e) {
                        missing.put(p);
                    }
                }
            } catch (Exception e) {
                return "[]";
            }
            return missing.toString();
        }

        /** 热更新第二步：写一个下载好的文件（内容是 base64） */
        @JavascriptInterface
        public boolean contentWrite(String path, String b64) {
            if (path == null || path.contains("..") || path.startsWith("/")) return false;
            try {
                File f = new File(new File(new File(contentDir(), "next"), "www"), path);
                copy(new java.io.ByteArrayInputStream(Base64.decode(b64, Base64.DEFAULT)), f);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** 热更新第三步：写清单，next 换成 current，重新选内容。之后页面刷新就是新内容 */
        @JavascriptInterface
        public boolean contentCommit(String manifestJson) {
            try {
                File dir = contentDir(), next = new File(dir, "next"), cur = new File(dir, "current"), old = new File(dir, "old");
                copy(new java.io.ByteArrayInputStream(manifestJson.getBytes(StandardCharsets.UTF_8)),
                        new File(new File(next, "www"), "content.json"));
                deleteTree(old);
                if (cur.exists() && !cur.renameTo(old)) return false;
                if (!next.renameTo(cur)) {
                    old.renameTo(cur);           // 换不上就退回原来的
                    return false;
                }
                deleteTree(old);
                chooseContent();
                return contentRoot != null;
            } catch (Exception e) {
                return false;
            }
        }

        /** 用系统下载器下新版 apk（通知栏也有进度），返回下载编号；失败返回空串 */
        @JavascriptInterface
        public String download(String url, String name) {
            try {
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                File old = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), name);
                if (old.exists()) old.delete();
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setTitle("智学题库 更新");
                r.setMimeType("application/vnd.android.package-archive");
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                r.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS, name);
                return String.valueOf(dm.enqueue(r));
            } catch (Exception e) {
                return "";
            }
        }

        /** 下载进度 JSON：{state: downloading|waiting|done|error, done, total, reason} */
        @JavascriptInterface
        public String dlProgress(String id) {
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(Long.parseLong(id)))) {
                if (c == null || !c.moveToFirst()) return "{\"state\":\"error\",\"reason\":\"下载任务不见了\"}";
                int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                long done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                String state = st == DownloadManager.STATUS_SUCCESSFUL ? "done"
                        : st == DownloadManager.STATUS_FAILED ? "error"
                        : st == DownloadManager.STATUS_PAUSED ? "waiting" : "downloading";
                String why = st == DownloadManager.STATUS_PAUSED
                        ? (reason == DownloadManager.PAUSED_WAITING_FOR_NETWORK ? "等待网络连接"
                           : reason == DownloadManager.PAUSED_WAITING_TO_RETRY ? "网络出错，正在重试" : "已暂停")
                        : st == DownloadManager.STATUS_FAILED ? "下载失败（错误码 " + reason + "）" : "";
                return "{\"state\":\"" + state + "\",\"done\":" + done + ",\"total\":" + Math.max(total, 0)
                        + ",\"reason\":\"" + why + "\"}";
            } catch (Exception e) {
                return "{\"state\":\"error\",\"reason\":\"查不到下载进度\"}";
            }
        }

        @JavascriptInterface
        public void cancelDownload(String id) {
            try {
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).remove(Long.parseLong(id));
            } catch (Exception e) {
                // 已经结束了
            }
        }

        /** 下载完成后打开系统安装界面；返回 false 表示打不开 */
        @JavascriptInterface
        public boolean installApk(String id) {
            try {
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                Uri uri = dm.getUriForDownloadedFile(Long.parseLong(id));
                if (uri == null) return false;
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
