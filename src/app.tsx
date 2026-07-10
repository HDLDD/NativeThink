import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage/DashboardPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import { Loader2 } from "lucide-react";

// Lazy-load all pages except the dashboard (index route).
// This keeps the main bundle lean; each page chunk loads on-demand.
const ThinkInEnglishPage = lazy(() => import("@/pages/ThinkInEnglishPage/ThinkInEnglishPage"));
const ChunkTrainingPage = lazy(() => import("@/pages/ChunkTrainingPage/ChunkTrainingPage"));
const ConversationPage = lazy(() => import("@/pages/ConversationPage/ConversationPage"));
const ShadowingPage = lazy(() => import("@/pages/ShadowingPage/ShadowingPage"));
const DeepVocabularyPage = lazy(() => import("@/pages/DeepVocabularyPage/DeepVocabularyPage"));
const WritingPage = lazy(() => import("@/pages/WritingPage/WritingPage"));
const ProgressPage = lazy(() => import("@/pages/ProgressPage/ProgressPage"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="size-8 animate-spin text-[#00B894]" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="think" element={<Suspense fallback={<PageFallback />}><ThinkInEnglishPage /></Suspense>} />
        <Route path="chunks" element={<Suspense fallback={<PageFallback />}><ChunkTrainingPage /></Suspense>} />
        <Route path="conversation" element={<Suspense fallback={<PageFallback />}><ConversationPage /></Suspense>} />
        <Route path="shadowing" element={<Suspense fallback={<PageFallback />}><ShadowingPage /></Suspense>} />
        <Route path="vocabulary" element={<Suspense fallback={<PageFallback />}><DeepVocabularyPage /></Suspense>} />
        <Route path="writing" element={<Suspense fallback={<PageFallback />}><WritingPage /></Suspense>} />
        <Route path="progress" element={<Suspense fallback={<PageFallback />}><ProgressPage /></Suspense>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
