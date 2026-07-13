import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { AuthProvider } from "./lib/auth-provider";
import CloudSyncProvider from "./components/CloudSyncProvider";
import App from "./app";
import "./index.css";

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
      <SafeShell>
        <AuthProvider>
          <CloudSyncProvider>
          <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => (
            <GlobalErrorFallback error={error as Error} resetErrorBoundary={resetErrorBoundary} />
          )}>
            <App />
          </ErrorBoundary>
          </CloudSyncProvider>
        </AuthProvider>
      </SafeShell>
    </BrowserRouter>
  </StrictMode>,
);
