/**
 * Authentication middleware for API routes
 * Validates session tokens and user permissions
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

// Session token schema
const SessionTokenSchema = z.string().min(32).max(256);

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  username?: string;
  error?: string;
}

interface AuthOptions {
  required?: boolean;
}

/**
 * Authenticate incoming request
 */
export async function authenticateRequest(
  request: NextRequest,
  options: AuthOptions = { required: true }
): Promise<AuthResult> {
  try {
    // Check for session token in headers
    const authHeader = request.headers.get('authorization');
    const sessionToken = request.headers.get('x-session-token');
    
    // Try Bearer token first
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return await validateToken(token);
    }
    
    // Try session token
    if (sessionToken) {
      return await validateToken(sessionToken);
    }
    
    // Check cookies
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const sessionCookie = parseCookie(cookieHeader, 'session_token');
      if (sessionCookie) {
        return await validateToken(sessionCookie);
      }
    }
    
    // No authentication provided
    if (options.required) {
      return {
        authenticated: false,
        error: 'Authentication required'
      };
    }
    
    // Authentication optional and not provided
    return { authenticated: false };
    
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      authenticated: false,
      error: 'Authentication failed'
    };
  }
}

/**
 * Validate session token
 */
async function validateToken(token: string): Promise<AuthResult> {
  try {
    // Validate token format
    const validToken = SessionTokenSchema.safeParse(token);
    if (!validToken.success) {
      return {
        authenticated: false,
        error: 'Invalid token format'
      };
    }
    
    // In production, this would:
    // 1. Check token against database/cache
    // 2. Verify token hasn't expired
    // 3. Load user data
    
    // For MVP, we'll use a simple validation
    if (token.startsWith('dev_token_')) {
      // Development token for testing
      return {
        authenticated: true,
        userId: 'dev_user_123',
        username: 'dev_user'
      };
    }
    
    // In production, implement proper token validation
    // For now, consider all other tokens invalid
    return {
      authenticated: false,
      error: 'Invalid token'
    };
    
  } catch (error) {
    return {
      authenticated: false,
      error: 'Token validation failed'
    };
  }
}

/**
 * Parse cookie string
 */
function parseCookie(cookieString: string, name: string): string | null {
  const cookies = cookieString.split(';').map(c => c.trim());
  
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return value;
    }
  }
  
  return null;
}

/**
 * Generate session token (for auth endpoints)
 */
export function generateSessionToken(): string {
  // In production, use a secure random token generator
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `session_${timestamp}_${random}`;
}

/**
 * Hash password (for auth endpoints)
 */
export async function hashPassword(password: string): Promise<string> {
  // In production, use bcrypt or argon2
  // For MVP, we'll use a simple hash (NOT SECURE)
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify password
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}