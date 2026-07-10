import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { AppContainer, ErrorRender } from "@lark-apaas/client-toolkit-lite";
import App from "./app";
import "./index.css";

/**
 * SafeShell — wraps AppContainer with a try/catch + inner error boundary
 * so that platform-only features (IframeBridge, MiaodaInspector, Watermark)
 * can't trigger an infinite crash → reset → crash loop when running
 * outside the miaoda platform (e.g., local Vite dev server or GitHub Pages).
 */
function SafeShell({ children }: { children: React.ReactNode }) {
  const [appContainerFailed, setAppContainerFailed] = useState(false);

  if (appContainerFailed) {
    // Degrade gracefully — skip platform container entirely.
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
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ErrorRender error={error} resetErrorBoundary={resetErrorBoundary} />
          )}
        >
          <App />
        </ErrorBoundary>
      </SafeShell>
    </BrowserRouter>
  </StrictMode>,
);
