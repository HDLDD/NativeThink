import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Clean text for display and TTS: unescape backslash-apostrophe and remove stray slashes */
export function cleanText(s: string): string {
  return s
    .replace(/\\'/g, "'")
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract and parse JSON from AI response text.
 *  Handles markdown code blocks, leading/trailing text, and nested structures.
 *  Uses balanced bracket matching instead of greedy regex. */
export function extractJson<T>(raw: string): T {
  let text = raw.trim();

  // Strip markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // Try direct parse first (clean JSON)
  try { return JSON.parse(text) as T; } catch { /* continue */ }

  // Try to extract balanced JSON object
  const objMatch = extractBalanced(text, '{', '}');
  if (objMatch !== null) {
    try { return JSON.parse(objMatch) as T; } catch { /* continue */ }
  }

  // Try to extract balanced JSON array
  const arrMatch = extractBalanced(text, '[', ']');
  if (arrMatch !== null) {
    try { return JSON.parse(arrMatch) as T; } catch { /* continue */ }
  }

  throw new Error('无法从 AI 返回中提取有效 JSON');
}

/** Find the first balanced bracket span — handles strings, escaping, and nesting */
function extractBalanced(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
