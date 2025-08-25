import { validateToken, sanitizeToken, maskToken, createSecureTokenHandler } from '@/app/utils/token-security';

describe('token-security', () => {
  describe('validateToken', () => {
    it('should validate correct Discogs token format', () => {
      const validToken = 'a'.repeat(40); // 40 alphanumeric characters
      expect(validateToken(validToken)).toBe(true);
    });

    it('should reject tokens with wrong length', () => {
      expect(validateToken('short')).toBe(false);
      expect(validateToken('a'.repeat(41))).toBe(false);
    });

    it('should reject tokens with special characters', () => {
      expect(validateToken('a'.repeat(39) + '!')).toBe(false);
      expect(validateToken('token-with-dashes-40-characters-long!!!')).toBe(false);
    });

    it('should accept valid alphanumeric tokens', () => {
      expect(validateToken('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij1234')).toBe(true);
    });
  });

  describe('sanitizeToken', () => {
    it('should trim whitespace', () => {
      expect(sanitizeToken('  token  ')).toBe('token');
      expect(sanitizeToken('\ntoken\t')).toBe('token');
    });
  });

  describe('maskToken', () => {
    it('should mask token showing first 4 and last 4 characters', () => {
      const token = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';
      expect(maskToken(token)).toBe('ABCD...ABCD');
    });

    it('should return *** for very short tokens', () => {
      expect(maskToken('short')).toBe('***');
      expect(maskToken('')).toBe('***');
    });
  });

  describe('createSecureTokenHandler', () => {
    it('should store and retrieve token securely', () => {
      const handler = createSecureTokenHandler();
      
      handler.set('  mytoken  '); // with whitespace
      expect(handler.get()).toBe('mytoken'); // trimmed
      expect(handler.isValid()).toBe(false); // not 40 chars
    });

    it('should validate stored token', () => {
      const handler = createSecureTokenHandler();
      const validToken = 'a'.repeat(40);
      
      handler.set(validToken);
      expect(handler.isValid()).toBe(true);
      expect(handler.getMasked()).toBe('aaaa...aaaa');
    });

    it('should clear token', () => {
      const handler = createSecureTokenHandler();
      
      handler.set('token');
      handler.clear();
      
      expect(handler.get()).toBeNull();
      expect(handler.isValid()).toBe(false);
      expect(handler.getMasked()).toBe('');
    });

    it('should prevent token exposure in logs', () => {
      const handler = createSecureTokenHandler();
      const token = 'SECRET1234567890ABCDEFGHIJKLMNOPQRSTUVWX';
      
      handler.set(token);
      
      // Trying to log the handler should not expose the token
      const stringified = JSON.stringify(handler);
      expect(stringified).not.toContain(token);
    });
  });
});