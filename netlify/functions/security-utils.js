/**
 * Security utilities for Netlify functions
 * Provides authentication, rate limiting, input validation, and log redaction
 */

// Rate limiting store (in-memory, resets on function restart)
// For production, consider using Redis or a database
const rateLimitStore = new Map();

/**
 * Decode JWT token (without verification - for production, use proper JWT verification library)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded token claims or null if invalid
 */
export function decodeJwt(token) {
  try {
    if (!token || typeof token !== 'string') {
      console.warn('JWT decode error: token is not a string', { type: typeof token });
      return null;
    }
    
    const parts = token.split('.');
    if (parts.length < 2) {
      console.warn('JWT decode error: token does not have enough parts', { partsCount: parts.length });
      return null;
    }

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed;
  } catch (error) {
    console.warn('JWT decode error:', {
      message: error.message,
      tokenLength: token?.length,
      tokenPrefix: token?.substring(0, 20) + '...',
      errorType: error.constructor.name
    });
    return null;
  }
}

/**
 * Verify JWT token from Authorization header
 * @param {Object} event - Netlify function event
 * @returns {Object} - { valid: boolean, token: string|null, claims: Object|null, error: string|null }
 */
export function verifyAuthToken(event) {
  // Netlify normalizes headers to lowercase, but check both cases for compatibility
  const authHeader = event.headers?.authorization || 
                     event.headers?.Authorization ||
                     (event.headers && Object.keys(event.headers).find(key => key.toLowerCase() === 'authorization') ? event.headers[Object.keys(event.headers).find(key => key.toLowerCase() === 'authorization')] : null);
  
  // Log for debugging (redacted)
  if (!authHeader) {
    console.log('Auth header missing. Available headers:', Object.keys(event.headers || {}).map(k => `${k.toLowerCase()}: ${typeof event.headers[k]}`));
    return {
      valid: false,
      token: null,
      claims: null,
      error: 'Missing authorization header'
    };
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.log('Auth header format invalid:', {
      headerPrefix: authHeader.substring(0, 20) + '...',
      startsWithBearer: authHeader.startsWith('Bearer ')
    });
    return {
      valid: false,
      token: null,
      claims: null,
      error: 'Invalid authorization header format (must start with "Bearer ")'
    };
  }

  const token = authHeader.substring(7);
  
  // Log token info for debugging (without exposing full token)
  console.log('Token received:', {
    tokenLength: token.length,
    tokenPrefix: token.substring(0, 20) + '...',
    hasBearer: authHeader.startsWith('Bearer ')
  });
  
  const claims = decodeJwt(token);

  if (!claims) {
    console.log('Failed to decode JWT token');
    return {
      valid: false,
      token: null,
      claims: null,
      error: 'Invalid token format (failed to decode)'
    };
  }

  // Log decoded claims (safe - these are public)
  console.log('Token decoded successfully:', {
    sub: claims.sub,
    exp: claims.exp,
    expDate: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
    now: new Date().toISOString(),
    isExpired: claims.exp ? claims.exp * 1000 < Date.now() : false
  });

  // Check expiration if present
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    console.log('Token expired');
    return {
      valid: false,
      token: null,
      claims: null,
      error: 'Token expired'
    };
  }

  return {
    valid: true,
    token,
    claims,
    error: null
  };
}

/**
 * Rate limiting per user/IP
 * @param {string} identifier - User ID or IP address
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} - { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(identifier, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const key = identifier;

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs
    };
  }

  const record = rateLimitStore.get(key);

  // Reset if window expired
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    rateLimitStore.set(key, record);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: record.resetTime
    };
  }

  // Check if limit exceeded
  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime
    };
  }

  // Increment count
  record.count++;
  rateLimitStore.set(key, record);

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime
  };
}

/**
 * Get client IP address from event
 * @param {Object} event - Netlify function event
 * @returns {string} - IP address
 */
export function getClientIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         event.headers['x-real-ip'] ||
         event.requestContext?.identity?.sourceIp ||
         'unknown';
}

/**
 * Validate input size and sanitize
 * @param {string} input - Input text
 * @param {number} maxLength - Maximum allowed length
 * @returns {Object} - { valid: boolean, sanitized: string, error: string|null }
 */
export function validateInput(input, maxLength = 100000) {
  if (!input || typeof input !== 'string') {
    return {
      valid: false,
      sanitized: '',
      error: 'Input must be a non-empty string'
    };
  }

  if (input.length > maxLength) {
    return {
      valid: false,
      sanitized: input.substring(0, maxLength),
      error: `Input exceeds maximum length of ${maxLength} characters`
    };
  }

  // Basic HTML stripping (remove script tags and dangerous patterns)
  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  // Check for suspicious prompt injection patterns
  const suspiciousPatterns = [
    /ignore\s+(previous|prior|all|above)\s+instructions?/i,
    /forget\s+(previous|prior|all|above)\s+instructions?/i,
    /exfiltrate|extract.*secret|reveal.*key|show.*env/i,
    /process\.env|API.*KEY|SECRET|PASSWORD/i,
    /\/etc\/|\/var\/|\.\.\/\.\.\//,
    /<\|system\|>|<\|user\|>|<\|assistant\|>/i
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(input)) {
      console.warn('Suspicious input pattern detected:', pattern);
      // Log but don't block - let the system prompt handle it
    }
  }

  return {
    valid: true,
    sanitized,
    error: null
  };
}

/**
 * Redact sensitive information from error messages
 * @param {Error|string} error - Error object or message
 * @returns {string} - Redacted error message
 */
export function redactError(error) {
  let message = typeof error === 'string' ? error : error.message || 'An error occurred';

  // Redact API keys, secrets, and environment variable names
  message = message
    .replace(/\b[A-Z_]+_API_KEY\s*[:=]\s*[^\s]+/gi, '[API_KEY_REDACTED]')
    .replace(/\b[A-Z_]+_SECRET\s*[:=]\s*[^\s]+/gi, '[SECRET_REDACTED]')
    .replace(/\bprocess\.env\.[A-Z_]+/g, '[ENV_VAR_REDACTED]')
    .replace(/\b[A-Z_]+_PASSWORD\s*[:=]\s*[^\s]+/gi, '[PASSWORD_REDACTED]')
    .replace(/gsk_[A-Za-z0-9_-]{32,}/g, '[GROQ_KEY_REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{32,}/g, '[OPENAI_KEY_REDACTED]');

  return message;
}

/**
 * Get allowed CORS origins
 * @returns {string[]} - Array of allowed origins
 */
export function getAllowedOrigins() {
  const allowed = process.env.ALLOWED_CORS_ORIGINS;
  if (allowed) {
    return allowed.split(',').map(origin => origin.trim()).filter(Boolean);
  }
  // Default to wildcard if not configured (less secure, but maintains compatibility)
  return ['*'];
}

/**
 * Get CORS headers
 * @param {Object} event - Netlify function event
 * @param {string[]} allowedMethods - Allowed HTTP methods
 * @returns {Object} - CORS headers
 */
export function getCorsHeaders(event, allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
  const origins = getAllowedOrigins();
  const origin = event.headers.origin || event.headers.Origin || '';
  
  // Check if origin is allowed
  const allowOrigin = origins.includes('*') || origins.includes(origin) 
    ? origin || '*'
    : origins[0] || '*';

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': allowedMethods.join(', ') + ', OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/**
 * Get security headers
 * @returns {Object} - Security headers
 */
export function getSecurityHeaders() {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests"
  };
}

/**
 * Log with redaction
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
export function logSafely(level, message, data = {}) {
  const redactedData = { ...data };
  
  // Redact sensitive fields
  Object.keys(redactedData).forEach(key => {
    if (typeof redactedData[key] === 'string') {
      redactedData[key] = redactError(redactedData[key]);
    } else if (typeof redactedData[key] === 'object' && redactedData[key] !== null) {
      redactedData[key] = logSafely(level, '', redactedData[key]);
    }
  });

  const logMessage = redactError(message);
  
  switch (level) {
    case 'error':
      console.error(logMessage, redactedData);
      break;
    case 'warn':
      console.warn(logMessage, redactedData);
      break;
    default:
      console.log(logMessage, redactedData);
  }
}

