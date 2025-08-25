/**
 * Token security utilities
 * Prevents token exposure in logs, DevTools, etc.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9]{40}$/; // Discogs tokens are 40 chars

export function validateToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function sanitizeToken(token: string): string {
  return token.trim();
}

export function maskToken(token: string): string {
  if (token.length < 8) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

// Prevent token from being logged
export function createSecureTokenHandler() {
  let token: string | null = null;

  return {
    set(newToken: string) {
      token = sanitizeToken(newToken);
    },
    get() {
      return token;
    },
    clear() {
      token = null;
    },
    isValid() {
      return token ? validateToken(token) : false;
    },
    getMasked() {
      return token ? maskToken(token) : '';
    }
  };
}