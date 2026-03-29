import { randomBytes } from 'node:crypto';
import type { AppStore, DemoUser } from './types.js';
import { readStore } from './store.js';

/** In-memory sessions (cleared on server restart). */
const tokenToUserId = new Map<string, string>();

export function findUserByEmail(store: AppStore, email: string): DemoUser | undefined {
  const e = email.trim().toLowerCase();
  return store.users.find((u) => u.email.toLowerCase() === e);
}

export function verifyPassword(user: DemoUser, password: string): boolean {
  return user.password === password;
}

export function createSession(userId: string): string {
  const token = randomBytes(24).toString('hex');
  tokenToUserId.set(token, userId);
  return token;
}

export function getUserIdForToken(token: string | undefined): string | undefined {
  if (!token) {
    return undefined;
  }
  return tokenToUserId.get(token);
}

/** Validates token exists and email still in store (demo). */
export function getAuthUser(authorizationHeader: string | undefined): DemoUser | undefined {
  const token =
    authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice(7).trim()
      : undefined;
  const userId = getUserIdForToken(token);
  if (!userId) {
    return undefined;
  }
  const store = readStore();
  return store.users.find((u) => u.id === userId);
}

export function assertValidSession(authorizationHeader: string | undefined): DemoUser {
  const user = getAuthUser(authorizationHeader);
  if (!user) {
    const err = new Error('Unauthorized');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}
