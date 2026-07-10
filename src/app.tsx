import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage/DashboardPage";
import ThinkInEnglishPage from "@/pages/ThinkInEnglishPage/ThinkInEnglishPage";
import ChunkTrainingPage from "@/pages/ChunkTrainingPage/ChunkTrainingPage";
import ConversationPage from "@/pages/ConversationPage/ConversationPage";
import ShadowingPage from "@/pages/ShadowingPage/ShadowingPage";
import ProgressPage from "@/pages/ProgressPage/ProgressPage";
import WritingPage from "@/pages/WritingPage/WritingPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import { Loader2 } from "lucide-react";

// Lazy-load vocabulary page — the word bank has ~47K words (~30MB raw data).
// This keeps it out of the main bundle; it loads only when the user navigates to /vocabulary.
const DeepVocabularyPage = lazy(() => import("@/pages/DeepVocabularyPage/DeepVocabularyPage"));

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
        <Route path="think" element={<ThinkInEnglishPage />} />
        <Route path="chunks" element={<ChunkTrainingPage />} />
        <Route path="conversation" element={<ConversationPage />} />
        <Route path="shadowing" element={<ShadowingPage />} />
        <Route path="vocabulary" element={<Suspense fallback={<PageFallback />}><DeepVocabularyPage /></Suspense>} />
        <Route path="writing" element={<WritingPage />} />
        <Route path="progress" element={<ProgressPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
