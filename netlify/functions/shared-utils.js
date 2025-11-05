/**
 * Shared utility functions for Netlify Functions
 * Provides common CORS headers, response builders, Auth0 helpers, and database utilities
 */

/**
 * Get CORS headers for API responses
 * @param {Array<string>} allowedMethods - HTTP methods to allow (default: GET, POST, PUT, DELETE, OPTIONS)
 * @param {Object} event - Optional Netlify function event for origin checking
 * @returns {Object} Headers object with CORS configuration
 */
export function getCorsHeaders(allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], event = null) {
  // Check for origin-based CORS if event is provided
  let allowOrigin = '*';
  if (event) {
    const allowedOrigins = process.env.ALLOWED_CORS_ORIGINS;
    if (allowedOrigins) {
      const origins = allowedOrigins.split(',').map(o => o.trim()).filter(Boolean);
      const origin = event.headers?.origin || event.headers?.Origin || '';
      if (origins.includes('*') || origins.includes(origin)) {
        allowOrigin = origin || '*';
      } else if (origins.length > 0) {
        allowOrigin = origins[0];
      }
    }
  }

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': allowedMethods.join(', ') + ', OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
    'X-Content-Type-Options': 'nosniff'
  };
}

/**
 * Handle OPTIONS preflight requests
 * @param {Object} corsHeaders - CORS headers to return
 * @returns {Object} Response object for OPTIONS request
 */
export function handleOptionsRequest(corsHeaders) {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: ''
  };
}

/**
 * Create a standardized API response
 * @param {number} statusCode - HTTP status code
 * @param {Object} data - Response data
 * @param {Object} headers - Optional custom headers
 * @returns {Object} Response object
 */
export function createResponse(statusCode, data, headers = null) {
  const corsHeaders = headers || getCorsHeaders();
  
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(data)
  };
}

/**
 * Create an error response
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error message
 * @param {Object} headers - Optional custom headers (defaults to CORS headers)
 * @param {Object} details - Optional error details
 * @returns {Object} Error response object
 */
export function createErrorResponse(statusCode, error, headers = null, details = null) {
  const corsHeaders = headers || getCorsHeaders();
  
  const response = {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({
      success: false,
      error,
      ...(details && { details })
    })
  };
  
  return response;
}

/**
 * Create a success response
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Success response object
 */
export function createSuccessResponse(data, statusCode = 200) {
  const corsHeaders = getCorsHeaders();
  
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      ...data
    })
  };
}

/**
 * Parse JSON request body safely
 * @param {string} body - Request body string
 * @param {Object} corsHeaders - CORS headers to use for error responses
 * @returns {Object} Parsed JSON or null if parsing fails
 */
export function parseRequestBody(body, corsHeaders) {
  if (!body) return null;
  
  try {
    return JSON.parse(body);
  } catch (parseError) {
    return null;
  }
}

/**
 * Get JSON parsing error response
 * @param {Object} corsHeaders - CORS headers
 * @returns {Object} Error response for invalid JSON
 */
export function getJsonParseErrorResponse(corsHeaders) {
  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ 
      success: false,
      error: 'Invalid JSON in request body' 
    })
  };
}

/**
 * Extract and validate authorization header from event
 * @param {Object} event - Netlify function event
 * @returns {Object} - { valid: boolean, token: string|null, error: string|null }
 */
export function extractAuthToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      token: null,
      error: 'Missing or invalid authorization header'
    };
  }

  return {
    valid: true,
    token: authHeader.substring(7),
    error: null
  };
}

/**
 * Clean Auth0 domain - remove https:// prefix and /api/v2/ suffix if present
 * @param {string} domain - Auth0 domain string
 * @returns {string} - Cleaned domain
 */
export function cleanAuth0Domain(domain) {
  if (!domain) return domain;
  
  let cleaned = domain;
  if (cleaned.startsWith('https://')) {
    cleaned = cleaned.replace('https://', '');
  }
  if (cleaned.endsWith('/api/v2/')) {
    cleaned = cleaned.replace('/api/v2/', '');
  }
  if (cleaned.endsWith('/api/v2')) {
    cleaned = cleaned.replace('/api/v2', '');
  }
  
  return cleaned;
}

/**
 * Get Auth0 Management API credentials
 * @returns {Object} - { domain: string|null, clientId: string|null, clientSecret: string|null, error: string|null }
 */
export function getAuth0Credentials() {
  let domain = process.env.AUTH0_MGMT_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

  domain = cleanAuth0Domain(domain);

  if (!domain || !clientId || !clientSecret) {
    return {
      domain: null,
      clientId: null,
      clientSecret: null,
      error: 'Missing Auth0 Management API credentials'
    };
  }

  return {
    domain,
    clientId,
    clientSecret,
    error: null
  };
}

/**
 * Initialize Auth0 Management Client
 * @param {string} scope - Required scope (default: 'read:users')
 * @returns {Object} - { client: ManagementClient|null, error: string|null }
 */
export function initAuth0ManagementClient(scope = 'read:users') {
  const credentials = getAuth0Credentials();
  
  if (credentials.error) {
    return {
      client: null,
      error: credentials.error
    };
  }

  try {
    const { ManagementClient } = require('auth0');
    
    const managementConfig = {
      domain: credentials.domain,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      scope: scope
    };
    
    // Add token configuration to help the SDK authenticate properly
    if (!managementConfig.domain.startsWith('https://')) {
      managementConfig.audience = `https://${credentials.domain}/api/v2/`;
      managementConfig.tokenProvider = {
        enableCache: true,
        cacheTTLInSeconds: 3600
      };
    }
    
    const client = new ManagementClient(managementConfig);
    
    return {
      client,
      error: null
    };
  } catch (error) {
    return {
      client: null,
      error: `Failed to initialize Auth0 Management Client: ${error.message}`
    };
  }
}

/**
 * Create common error responses
 */
export const errorResponses = {
  /**
   * Missing or invalid authorization header
   */
  unauthorized: (headers) => ({
    statusCode: 401,
    headers,
    body: JSON.stringify({ success: false, error: 'Missing or invalid authorization header' })
  }),

  /**
   * Missing request body
   */
  missingBody: (headers) => ({
    statusCode: 400,
    headers,
    body: JSON.stringify({ success: false, error: 'Request body is required' })
  }),

  /**
   * Invalid JSON payload
   */
  invalidJson: (headers) => ({
    statusCode: 400,
    headers,
    body: JSON.stringify({ success: false, error: 'Invalid JSON payload' })
  }),

  /**
   * Missing Auth0 credentials
   */
  missingAuth0Credentials: (headers) => ({
    statusCode: 500,
    headers,
    body: JSON.stringify({ 
      success: false, 
      error: 'Server configuration error: Missing Auth0 credentials' 
    })
  }),

  /**
   * Internal server error
   */
  internalError: (headers, message = 'Internal server error') => ({
    statusCode: 500,
    headers,
    body: JSON.stringify({ 
      success: false, 
      error: message 
    })
  }),

  /**
   * Method not allowed
   */
  methodNotAllowed: (headers, allowedMethods = ['GET', 'POST']) => ({
    statusCode: 405,
    headers,
    body: JSON.stringify({ 
      success: false, 
      error: `Method not allowed. Allowed methods: ${allowedMethods.join(', ')}` 
    })
  })
};

