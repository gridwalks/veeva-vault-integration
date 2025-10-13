/**
 * Session Manager Utility
 * 
 * Manages user sessions for document upload functionality.
 * Generates unique session IDs and stores them in localStorage.
 * This provides user-specific document isolation without requiring full authentication.
 */

const SESSION_KEY = 'veeva_chat_session_id';
const SESSION_EXPIRY_DAYS = 30; // Sessions expire after 30 days

/**
 * Generate a cryptographically secure session ID
 * @returns {string} Unique session ID
 */
function generateSessionId() {
  // Use crypto.getRandomValues for secure random generation
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  
  // Convert to hex string
  const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  
  // Add timestamp for uniqueness
  const timestamp = Date.now().toString(16);
  
  return `session_${timestamp}_${hex}`;
}

/**
 * Get or create a user session ID
 * @returns {string} Current session ID
 */
export function getSessionId() {
  try {
    // Check if session exists in localStorage
    const stored = localStorage.getItem(SESSION_KEY);
    
    if (stored) {
      const sessionData = JSON.parse(stored);
      
      // Check if session has expired
      const now = Date.now();
      const expiryTime = sessionData.createdAt + (SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      
      if (now < expiryTime) {
        console.log('Using existing session:', sessionData.sessionId);
        return sessionData.sessionId;
      } else {
        console.log('Session expired, creating new one');
        localStorage.removeItem(SESSION_KEY);
      }
    }
    
    // Create new session
    const sessionId = generateSessionId();
    const sessionData = {
      sessionId,
      createdAt: Date.now()
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    console.log('Created new session:', sessionId);
    
    return sessionId;
    
  } catch (error) {
    console.error('Error managing session:', error);
    
    // Fallback: generate session ID without localStorage
    const sessionId = generateSessionId();
    console.log('Using fallback session (no localStorage):', sessionId);
    return sessionId;
  }
}

/**
 * Clear the current session
 * This will force creation of a new session on next access
 */
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    console.log('Session cleared');
  } catch (error) {
    console.error('Error clearing session:', error);
  }
}

/**
 * Get session info (for debugging)
 * @returns {Object|null} Session data or null if no session
 */
export function getSessionInfo() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error getting session info:', error);
  }
  return null;
}

/**
 * Check if current session is valid
 * @returns {boolean} True if session exists and is not expired
 */
export function isSessionValid() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const sessionData = JSON.parse(stored);
      const now = Date.now();
      const expiryTime = sessionData.createdAt + (SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      return now < expiryTime;
    }
  } catch (error) {
    console.error('Error checking session validity:', error);
  }
  return false;
}
