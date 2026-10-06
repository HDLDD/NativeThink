package com.nativethink.app;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 内置离线朗读引擎（sherpa-onnx + Piper），需在 super 之前注册
        registerPlugin(SherpaTtsPlugin.class);
        super.onCreate(savedInstanceState);

        // 高 DPI 手机（density ≥ 3.0）上 WebView 内容偏小 —— 文本放大 20%，
        // 布局不变（只影响文字大小，不会撑破容器）
        float density = getResources().getDisplayMetrics().density;
        if (density >= 3.0f) {
            android.webkit.WebView webView = bridge.getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setTextZoom(120);   // 文本 120%（默认 100）
            }
        }
    }
}
