import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { AppContainer, ErrorRender } from "@lark-apaas/client-toolkit-lite";
import { AuthProvider } from "./lib/auth-provider";
import App from "./app";
import "./index.css";

/**
 * SafeShell — wraps AppContainer with a try/catch + inner error boundary
 * so that platform-only features (IframeBridge, MiaodaInspector, Watermark)
 * can't trigger an infinite crash → reset → crash loop when running
 * outside the miaoda platform (e.g., local Vite dev server or GitHub Pages).
 */
/**
 * Check if running on the miaoda platform (has appId injected by platform runtime).
 * On standalone deployments (Cloudflare, GitHub Pages, Vite dev), skip AppContainer
 * entirely to avoid watermarks, missing-platform errors, and template placeholders.
 */
function isMiaodaPlatform(): boolean {
  if (typeof window !== 'undefined') {
    const appId = (window as any).appId;
    // Platform injects a real appId (non-template string like "app_xxx")
    return typeof appId === 'string' && appId.length > 0 && !appId.startsWith('{{');
  }
  return false;
}

function SafeShell({ children }: { children: React.ReactNode }) {
  const [appContainerFailed, setAppContainerFailed] = useState(false);

  // Skip AppContainer on non-miaoda platforms — no watermarks, no platform features
  if (!isMiaodaPlatform()) {
    return <>{children}</>;
  }

  if (appContainerFailed) {
    return <>{children}</>;
  }

  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => {
        // On first error from AppContainer, degrade permanently.
        // We don't call resetErrorBoundary() because that would
        // re-mount AppContainer and trigger another crash.
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
          <ErrorBoundary
            fallbackRender={({ error, resetErrorBoundary }) => (
              <ErrorRender error={error} resetErrorBoundary={resetErrorBoundary} />
            )}
          >
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </SafeShell>
    </BrowserRouter>
  </StrictMode>,
);
