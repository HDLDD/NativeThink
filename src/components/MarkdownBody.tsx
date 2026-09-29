/**
 * Markdown 正文渲染器 —— 单独成模块只为了一件事：**让 react-markdown 与 remark-gfm
 * 一起被懒加载**。
 *
 * 这两个包（连 unified / mdast / micromark）压缩后 ≈45KB，而 ChangelogDialog 挂在顶栏、
 * 每条路由都在，静态引用会把它们拉进入口依赖图。收在这里之后，需要渲染 Markdown 的地方
 * 一律 `lazy(() => import('@/components/MarkdownBody'))`。
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownBody({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}
