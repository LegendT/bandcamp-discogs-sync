/**
 * Session-based token storage for Discogs API tokens
 * 
 * SECURITY NOTE: This stores tokens in plain text in sessionStorage.
 * sessionStorage is cleared when the browser tab is closed, but tokens
 * remain accessible to any JavaScript running on this domain.
 * 
 * For production applications handling sensitive data, consider:
 * - Server-side token management with HTTP-only cookies
 * - Web Crypto API for client-side encryption with user-derived keys
 * - Token rotation with short expiration times
 */

const STORAGE_KEY = 'bc_dc_auth';

export class SecureTokenStorage {
  private static instance: SecureTokenStorage;
  private token: string | null = null;
  private tokenExpiresAt: number | null = null;
  private migrationTimeoutId: NodeJS.Timeout | null = null;

  private constructor() {
    // Try to restore from session storage
    this.restore();
  }

  static getInstance(): SecureTokenStorage {
    if (!SecureTokenStorage.instance) {
      SecureTokenStorage.instance = new SecureTokenStorage();
    }
    return SecureTokenStorage.instance;
  }

  setToken(token: string, expiresInMinutes: number = 60): void {
    this.token = token;
    this.tokenExpiresAt = Date.now() + (expiresInMinutes * 60 * 1000);
    this.saveToStorage(expiresInMinutes);
  }

  getToken(): string | null {
    // Check expiration
    if (this.tokenExpiresAt && Date.now() > this.tokenExpiresAt) {
      this.clear();
      return null;
    }
    
    return this.token;
  }

  clear(): void {
    this.token = null;
    this.tokenExpiresAt = null;
    this.clearMigrationTimeout();
    
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  private clearMigrationTimeout(): void {
    if (this.migrationTimeoutId) {
      clearTimeout(this.migrationTimeoutId);
      this.migrationTimeoutId = null;
    }
  }

  private restore(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }

    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored);
      
      // Support both new format (token) and legacy format (t/e) during migration
      const token = data.token || (data.t ? this.legacyDeobfuscate(data.t) : null);
      const expiresAt = data.expiresAt || data.e;
      
      if (token && expiresAt && Date.now() < expiresAt) {
        this.token = token;
        this.tokenExpiresAt = expiresAt;
        
        // Schedule async migration to avoid recursion during restore
        if (data.t && !data.token) {
          this.clearMigrationTimeout(); // Clear any existing migration timeout
          this.migrationTimeoutId = setTimeout(() => {
            this.migrateToNewFormat();
            this.migrationTimeoutId = null;
          }, 0);
        }
      } else {
        // Expired, clear it
        this.clear();
      }
    } catch {
      // Invalid data, clear it
      this.clear();
    }
  }

  private migrateToNewFormat(): void {
    // Only migrate if we still have the token and it's not already in new format
    if (this.token && this.tokenExpiresAt) {
      try {
        const stored = window.sessionStorage?.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          // Only migrate if still in legacy format
          if (data.t && !data.token) {
            const remainingMinutes = Math.floor((this.tokenExpiresAt - Date.now()) / (60 * 1000));
            if (remainingMinutes > 0) {
              this.saveToStorage(remainingMinutes);
            }
          }
        }
      } catch {
        // Migration failed, but token is still in memory - continue working
      }
    }
  }

  private saveToStorage(expiresInMinutes: number): void {
    if (typeof window !== 'undefined' && window.sessionStorage && this.token) {
      const data = {
        token: this.token,
        expiresAt: this.tokenExpiresAt,
        _warning: 'This contains sensitive token data in plain text'
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  // Legacy support for existing obfuscated tokens
  private legacyDeobfuscate(str: string): string {
    const key = 'BC2DC2024SYNC';
    try {
      return atob(str)
        .split('')
        .map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length)))
        .join('');
    } catch {
      return '';
    }
  }

  // Prevent token from being logged
  toJSON() {
    return { hasToken: !!this.token, expiresAt: this.tokenExpiresAt };
  }

  toString() {
    return '[SecureTokenStorage]';
  }
}

// Singleton instance
export const secureTokenStorage = SecureTokenStorage.getInstance();