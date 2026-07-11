import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { Layout } from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage/DashboardPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";

const ThinkInEnglishPage = lazy(() => import("@/pages/ThinkInEnglishPage/ThinkInEnglishPage"));
const ChunkTrainingPage = lazy(() => import("@/pages/ChunkTrainingPage/ChunkTrainingPage"));
const ConversationPage = lazy(() => import("@/pages/ConversationPage/ConversationPage"));
const ShadowingPage = lazy(() => import("@/pages/ShadowingPage/ShadowingPage"));
const ArticlePage = lazy(() => import("@/pages/ArticlePage/ArticlePage"));
const DeepVocabularyPage = lazy(() => import("@/pages/DeepVocabularyPage/DeepVocabularyPage"));
const WritingPage = lazy(() => import("@/pages/WritingPage/WritingPage"));
const ProgressPage = lazy(() => import("@/pages/ProgressPage/ProgressPage"));
const FavoritesPage = lazy(() => import("@/pages/FavoritesPage/FavoritesPage"));

function PageErrorFallback({ page }: { page: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center space-y-4">
        <div className="size-16 rounded-2xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mx-auto">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-xl font-black text-foreground">{page}页面出错</h2>
        <p className="text-sm text-muted-foreground">页面加载时发生错误，请刷新重试</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-[#00B894] text-white font-black text-sm hover:bg-[#00a882] transition-colors"
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="think" element={<ThinkInEnglishPage />} />
        <Route path="chunks" element={<ErrorBoundary fallback={<PageErrorFallback page="语块训练" />}><ChunkTrainingPage /></ErrorBoundary>} />
        <Route path="conversation" element={<ConversationPage />} />
        <Route path="shadowing" element={<ShadowingPage />} />
        <Route path="articles" element={<ErrorBoundary fallback={<PageErrorFallback page="文章阅读" />}><ArticlePage /></ErrorBoundary>} />
        <Route path="vocabulary" element={<ErrorBoundary fallback={<PageErrorFallback page="词汇深度" />}><DeepVocabularyPage /></ErrorBoundary>} />
        <Route path="writing" element={<WritingPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
