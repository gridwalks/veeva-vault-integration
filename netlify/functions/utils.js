/**
 * Shared utility functions for netlify functions
 * Consolidates duplicate code to improve maintainability
 */

/**
 * Generate a safe filename for storage
 * Replaces invalid characters with hyphens and limits length
 * @param {string} fileName - Original filename
 * @returns {string} Safe filename
 */
export function generateSafeFileName(fileName) {
  if (!fileName) {
    return '';
  }

  const trimmed = fileName.trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  const lastDotIndex = lower.lastIndexOf('.');
  let base = lower;
  let extension = '';

  if (lastDotIndex > 0 && lastDotIndex < lower.length - 1) {
    base = lower.substring(0, lastDotIndex);
    extension = lower.substring(lastDotIndex + 1);
  }

  // Limit length first to prevent ReDoS, then sanitize
  const limitedBase = base.substring(0, 96);
  let safeBase = limitedBase.replace(/[^a-z0-9]+/g, '-');
  
  // Trim leading hyphens using string methods to avoid ReDoS vulnerability
  // Since string is already limited to 96 chars, this is safe
  while (safeBase.startsWith('-') && safeBase.length > 0) {
    safeBase = safeBase.slice(1);
  }
  
  // Trim trailing hyphens using string methods to avoid ReDoS vulnerability
  while (safeBase.endsWith('-') && safeBase.length > 0) {
    safeBase = safeBase.slice(0, -1);
  }
  
  safeBase = safeBase || 'document';

  const safeExtension = extension.replace(/[^a-z0-9]+/g, '').substring(0, 16);
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

