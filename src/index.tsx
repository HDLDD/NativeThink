import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { AuthProvider } from "./lib/auth-provider";
import CloudSyncProvider from "./components/CloudSyncProvider";
import { FocusModeProvider } from "./lib/focus-mode";
import { Toaster } from "@/components/ui/sonner";
import App from "./app";
import "./index.css";
import { checkBundledEngineHealth } from "./lib/sherpa-tts";

// 内置朗读引擎是原生代码，崩起来直接杀进程 —— 启动时检查上次是否崩过，
// 崩过就自动停用它（朗读回退到系统/云端），避免反复闪退。
checkBundledEngineHealth();

/** Simple error fallback — works on all platforms without Lark dependencies */
function GlobalErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>页面加载出错</h2>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>{error?.message || '未知错误'}</p>
        <button onClick={resetErrorBoundary} style={{ padding: '8px 24px', borderRadius: 12, background: '#00B894', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
          刷新重试
        </button>
      </div>
    </div>
  );
}

/**
 * Check if running on the miaoda platform (has appId injected by platform runtime).
 */
function isMiaodaPlatform(): boolean {
  if (typeof window !== 'undefined') {
    const appId = (window as any).appId;
    return typeof appId === 'string' && appId.length > 0 && !appId.startsWith('{{');
  }
  return false;
}

function SafeShell({ children }: { children: React.ReactNode }) {
  const [appContainerFailed, setAppContainerFailed] = useState(false);

  // Skip AppContainer on non-miaoda platforms
  if (!isMiaodaPlatform() || appContainerFailed) {
    return <>{children}</>;
  }

  // Lazy-import AppContainer only on miaoda platform
  const { AppContainer } = require("@lark-apaas/client-toolkit-lite");
  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => {
        setAppContainerFailed(true);
        return <>{children}</>;
      }}
    >
      <AppContainer>{children}</AppContainer>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={process.env.CLIENT_BASE_PATH || "/"}>
      {/*
        全站唯一的 toast 出口。以前只 import 了 sonner 的 toast() 却从未挂载 <Toaster />，
        所以所有提示（AI 不可用、目标已设、音色回退、反馈是否送达…）都是静默的。
        位置 top-center：桌面避开 sticky 头（h-20=80px），APK 里 edge-to-edge 必须再让开状态栏。
      */}
      <Toaster
        position="top-center"
        visibleToasts={3}
        offset={{ top: '88px', right: 16, left: 16 }}
        mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 84px)', right: 12, left: 12 }}
      />
      <SafeShell>
        <FocusModeProvider>
        <AuthProvider>
          <CloudSyncProvider>
          <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => (
            <GlobalErrorFallback error={error as Error} resetErrorBoundary={resetErrorBoundary} />
          )}>
            <App />
          </ErrorBoundary>
          </CloudSyncProvider>
        </AuthProvider>
        </FocusModeProvider>
      </SafeShell>
    </BrowserRouter>
  </StrictMode>,
);
