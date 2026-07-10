import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage/DashboardPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";

const ThinkInEnglishPage = lazy(() => import("@/pages/ThinkInEnglishPage/ThinkInEnglishPage"));
const ChunkTrainingPage = lazy(() => import("@/pages/ChunkTrainingPage/ChunkTrainingPage"));
const ConversationPage = lazy(() => import("@/pages/ConversationPage/ConversationPage"));
const ShadowingPage = lazy(() => import("@/pages/ShadowingPage/ShadowingPage"));
const DeepVocabularyPage = lazy(() => import("@/pages/DeepVocabularyPage/DeepVocabularyPage"));
const WritingPage = lazy(() => import("@/pages/WritingPage/WritingPage"));
const ProgressPage = lazy(() => import("@/pages/ProgressPage/ProgressPage"));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="think" element={<ThinkInEnglishPage />} />
        <Route path="chunks" element={<ChunkTrainingPage />} />
        <Route path="conversation" element={<ConversationPage />} />
        <Route path="shadowing" element={<ShadowingPage />} />
        <Route path="vocabulary" element={<DeepVocabularyPage />} />
        <Route path="writing" element={<WritingPage />} />
        <Route path="progress" element={<ProgressPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
