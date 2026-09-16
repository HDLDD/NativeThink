package com.nativethink.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 内置离线朗读引擎（sherpa-onnx + Piper），需在 super 之前注册
        registerPlugin(SherpaTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
