/** Shared types (Cloudflare-compatible — no imports needed) */

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

export interface UserSession {
  userId: string;
  email: string;
}

export interface GeneratedPassage {
  id: string;
  title: string;
  content: string;
  words: string[];
  createdAt: number;
}
