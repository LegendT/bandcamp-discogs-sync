'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { discogsService } from '@/app/services/discogs.service';
import { secureTokenStorage } from '@/app/utils/secure-storage';
import { maskToken } from '@/app/utils/token-security';

export function useDiscogsAuth() {
  const [token, setToken] = useState('');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const activeValidationRef = useRef<number>(0);
  const validationCounterRef = useRef<number>(0);
  const ongoingValidationsRef = useRef<Set<number>>(new Set());
  
  const validateStoredToken = useCallback(async (storedToken: string) => {
    const validationId = ++validationCounterRef.current;
    activeValidationRef.current = validationId;
    ongoingValidationsRef.current.add(validationId);
    setIsValidating(true);
    
    try {
      const result = await discogsService.validateToken(storedToken);
      
      // Only update state if this validation is still the active one
      if (activeValidationRef.current === validationId) {
        setTokenValid(result.valid);
        if (result.valid && result.username) {
          setUsername(result.username);
        } else {
          // Clear invalid token from storage
          secureTokenStorage.clear();
          setToken('');
          setUsername('');
        }
      }
      
      return result.valid;
    } catch (err) {
      // Only update if this validation is still the active one
      if (activeValidationRef.current === validationId) {
        setTokenValid(false);
        secureTokenStorage.clear();
        setToken('');
        setUsername('');
      }
      return false;
    } finally {
      // Always clean up this validation
      ongoingValidationsRef.current.delete(validationId);
      // Only clear loading state if no other validations are running
      if (ongoingValidationsRef.current.size === 0) {
        setIsValidating(false);
      }
    }
  }, []);

  // Restore token on mount - only run once
  useEffect(() => {
    const stored = secureTokenStorage.getToken();
    if (stored) {
      setToken(maskToken(stored)); // Show masked version in UI
      // Auto-validate restored token
      validateStoredToken(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - we only want this to run once on mount

  const validateToken = useCallback(async () => {
    if (!token || token.includes('...')) return; // Don't validate masked tokens
    
    const validationId = ++validationCounterRef.current;
    activeValidationRef.current = validationId;
    ongoingValidationsRef.current.add(validationId);
    setIsValidating(true);
    
    try {
      const result = await discogsService.validateToken(token);
      
      // Only update state if this validation is still the active one
      if (activeValidationRef.current === validationId) {
        setTokenValid(result.valid);
        if (result.valid && result.username) {
          setUsername(result.username);
          // Store valid token securely
          secureTokenStorage.setToken(token);
        } else {
          // Clear invalid state
          setUsername('');
        }
      }
      
      return result.valid;
    } catch (err) {
      // Only update if this validation is still the active one
      if (activeValidationRef.current === validationId) {
        setTokenValid(false);
        setUsername('');
      }
      return false;
    } finally {
      // Always clean up this validation
      ongoingValidationsRef.current.delete(validationId);
      // Only clear loading state if no other validations are running
      if (ongoingValidationsRef.current.size === 0) {
        setIsValidating(false);
      }
    }
  }, [token]);

  const resetAuth = useCallback(() => {
    activeValidationRef.current = 0; // Invalidate any ongoing validations
    ongoingValidationsRef.current.clear(); // Clear all ongoing validations
    setToken('');
    setTokenValid(null);
    setUsername('');
    setIsValidating(false);
    secureTokenStorage.clear();
  }, []);
  
  // Get actual token for API calls - prioritize storage over state
  const getActualToken = useCallback(() => {
    const storedToken = secureTokenStorage.getToken();
    // Only use state token if it's not masked and there's no valid stored token
    if (!storedToken && token && !token.includes('...')) {
      return token;
    }
    return storedToken;
  }, [token]);

  return {
    token,
    setToken,
    tokenValid,
    username,
    isValidating,
    validateToken,
    resetAuth,
    getActualToken,
  };
}