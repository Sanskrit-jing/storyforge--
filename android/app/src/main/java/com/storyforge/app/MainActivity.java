package com.storyforge.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * 应用主 Activity。
 *
 * 满屏（edge-to-edge）策略：Capacitor 内置 SystemBars 插件在「WebView < 140」时
 * 会改为给 decorView 上下加 padding（WebView 被内缩），露出的系统栏区域显示
 * capacitor.config 里的深色窗口底色，用户看到的就是顶/底两条黑边。
 * 这里通过 `insetsHandling: "disable"` 关掉内置处理（见 capacitor.config.ts），
 * 由本类自行接管 insets：无论 WebView 版本如何都走「透传 + 注入 CSS 变量」路径，
 * Web 端再用 .safe-area-pad 按 CSS 变量避让系统栏，实现真正的满屏显示。
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate(), which is where the Bridge is built.
        registerPlugin(SafFolderPlugin.class);
        super.onCreate(savedInstanceState);

        setupEdgeToEdge();
    }

    /** 与 Capacitor SystemBars 的 passthrough 分支一致，但不设 WebView 版本门槛。 */
    private void setupEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View decorView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = insets.getInsets(types);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            // 键盘弹起时由原生侧收缩 WebView（WebView < 144 自身不会处理底部 inset）
            v.setPadding(0, 0, 0, keyboardVisible ? ime.bottom : 0);

            int bottom = keyboardVisible ? 0 : bars.bottom;
            injectSafeAreaCss(bars.left, bars.top, bars.right, bottom);

            // 透传：WebView 延伸到系统栏之下，Web 内部用 CSS 变量避让
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(types, Insets.of(bars.left, bars.top, bars.right, bottom))
                    .build();
        });

        // 页面每次提交后重放一次 insets：确保首次加载时 CSS 变量一定被注入
        // （首次 insets 派发可能早于页面 DOM 就绪，evaluateJavascript 会落空）。
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                view.requestApplyInsets();
            }
        });

        // 系统栏前景：应用页头是浅色，透明系统条下用深色前景图标，否则白图标不可读。
        // 使用平台 systemUiVisibility 标志（API 23+/26+），避免 androidx.core 版本差异。
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        int flags = decorView.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decorView.setSystemUiVisibility(flags);
    }

    /** 把系统栏 inset 以 CSS 变量形式注入 :root（单位 dp，与 CSS px 对齐）。 */
    private void injectSafeAreaCss(int left, int top, int right, int bottom) {
        float density = getResources().getDisplayMetrics().density;
        final String script = String.format(
                "try{var s=document.documentElement.style;"
                        + "s.setProperty('--safe-area-inset-top','%dpx');"
                        + "s.setProperty('--safe-area-inset-right','%dpx');"
                        + "s.setProperty('--safe-area-inset-bottom','%dpx');"
                        + "s.setProperty('--safe-area-inset-left','%dpx');}catch(e){}",
                (int) (top / density),
                (int) (right / density),
                (int) (bottom / density),
                (int) (left / density));
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(script, null);
            }
        });
    }
}
