/**
 * Shared utility functions for Netlify Functions
 * Provides common CORS headers, response builders, and database utilities
 */

/**
 * Get CORS headers for API responses
 * @param {Array<string>} allowedMethods - HTTP methods to allow (default: GET, POST, PUT, DELETE, OPTIONS)
 * @returns {Object} Headers object with CORS configuration
 */
export function getCorsHeaders(allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': allowedMethods.join(', ') + ', OPTIONS'
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
 * @param {Object} details - Optional error details
 * @returns {Object} Error response object
 */
export function createErrorResponse(statusCode, error, details = null) {
  const corsHeaders = getCorsHeaders();
  
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

