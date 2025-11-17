/**
 * HTML text extraction utilities
 * Extracts clean text content from HTML for indexing
 */

/**
 * Extract text from HTML content
 * @param {string} htmlContent - The HTML content to extract text from
 * @returns {string} Extracted and cleaned text
 */
export function extractTextFromHTML(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  try {
    // Remove script and style elements and their content
    let text = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    
    // Remove navigation, header, footer elements (common in eCFR.gov pages)
    text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
    text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    
    // Try to extract main content area (eCFR.gov uses specific classes/IDs)
    // eCFR.gov structure: look for content divs with specific patterns
    const mainContentMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                            text.match(/<div[^>]*id="[^"]*cfr-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                            text.match(/<div[^>]*class="[^"]*cfr-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                            text.match(/<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                            text.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                            text.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                            // Try to find the body content directly
                            text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    
    if (mainContentMatch && mainContentMatch[1]) {
      text = mainContentMatch[1];
    }
    
    // Convert HTML entities to their text equivalents
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&apos;/g, "'");
    
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Decode common HTML entities (numeric and named)
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    text = text.replace(/&#x([a-f\d]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' '); // Replace multiple spaces with single space
    text = text.replace(/\n\s*\n/g, '\n\n'); // Normalize line breaks
    text = text.trim();
    
    // Remove excessive line breaks (more than 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');
    
    return text;
  } catch (error) {
    console.error('Error extracting text from HTML:', error);
    // Fallback: basic tag removal
    return htmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Extract text from HTML with better structure preservation
 * Attempts to preserve paragraph structure
 * @param {string} htmlContent - The HTML content to extract text from
 * @returns {string} Extracted text with preserved structure
 */
export function extractTextFromHTMLStructured(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  try {
    console.log(`Extracting text from HTML (${htmlContent.length} chars)`);
    
    // Remove script and style elements
    let text = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    
    // Remove navigation, header, footer
    text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
    text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    
    // Try multiple patterns to find main content (eCFR.gov specific)
    let mainContentMatch = null;
    const patterns = [
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*id="[^"]*cfr-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*cfr-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*section[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="[^"]*section[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      // Last resort: get body content
      /<body[^>]*>([\s\S]*?)<\/body>/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim().length > 100) {
        mainContentMatch = match;
        console.log(`Found content using pattern: ${pattern}`);
        break;
      }
    }
    
    if (mainContentMatch && mainContentMatch[1]) {
      text = mainContentMatch[1];
      console.log(`Extracted content section (${text.length} chars)`);
    } else {
      console.warn('No main content section found, using full HTML');
    }
    
    // Convert block-level elements to line breaks
    text = text.replace(/<\/?(p|div|h[1-6]|li|tr|td|th|section|article)[^>]*>/gi, '\n');
    text = text.replace(/<br[^>]*>/gi, '\n');
    
    // Convert HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    text = text.replace(/&#x([a-f\d]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Clean up whitespace while preserving paragraph structure
    text = text.replace(/[ \t]+/g, ' '); // Multiple spaces to single space
    text = text.replace(/\n{3,}/g, '\n\n'); // More than 2 newlines to 2
    text = text.trim();
    
    return text;
  } catch (error) {
    console.error('Error extracting structured text from HTML:', error);
    return extractTextFromHTML(htmlContent); // Fallback to simple extraction
  }
}

