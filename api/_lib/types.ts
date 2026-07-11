/** Shared types for API functions */

export interface User {
  id: string;
  email: string;
  passwordHash: string; // "saltHex:hashHex"
  createdAt: number;
}

export interface UserSession {
  userId: string;
  email: string;
}

// KV key conventions:
//   users:email:<email>        → JSON<User>
//   users:data:<userId>:<key>  → string (user's app data)
//   passages:<userId>:<id>     → JSON<GeneratedPassage>

export interface GeneratedPassage {
  id: string;
  title: string;
  content: string;
  words: string[];
  createdAt: number;
}
