// Utility functions for chunking documents for RAG

/**
 * Estimates the number of tokens in a text string
 * Using a simple heuristic: ~4 characters per token for English text
 * This is an approximation; actual token count may vary
 */
export function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Chunks text into smaller segments with optional overlap
 * @param {string} text - The text to chunk
 * @param {number} maxTokensPerChunk - Maximum tokens per chunk (default: 512)
 * @param {number} overlapTokens - Number of tokens to overlap between chunks (default: 50)
 * @returns {Array<{text: string, tokenCount: number, index: number}>} Array of chunks
 */
export function chunkText(text, maxTokensPerChunk = 512, overlapTokens = 50) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Convert tokens to approximate character count
  const maxCharsPerChunk = maxTokensPerChunk * 4;
  const overlapChars = overlapTokens * 4;

  // Split text into paragraphs first (preserves document structure)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  
  const chunks = [];
  let currentChunk = '';
  let currentChunkSize = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    const paragraphSize = paragraph.length;

    // If adding this paragraph would exceed the max size
    if (currentChunkSize + paragraphSize > maxCharsPerChunk && currentChunk.length > 0) {
      // Save the current chunk
      chunks.push({
        text: currentChunk.trim(),
        tokenCount: estimateTokenCount(currentChunk),
        index: chunks.length
      });

      // Start new chunk with overlap from the end of the previous chunk
      if (overlapChars > 0 && currentChunk.length > overlapChars) {
        currentChunk = currentChunk.slice(-overlapChars) + '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
      currentChunkSize = currentChunk.length;
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
      currentChunkSize = currentChunk.length;
    }

    // If a single paragraph is larger than max chunk size, split it by sentences
    if (paragraphSize > maxCharsPerChunk) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      currentChunk = '';
      currentChunkSize = 0;

      for (const sentence of sentences) {
        if (currentChunkSize + sentence.length > maxCharsPerChunk && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            tokenCount: estimateTokenCount(currentChunk),
            index: chunks.length
          });

          // Start new chunk with overlap
          if (overlapChars > 0 && currentChunk.length > overlapChars) {
            currentChunk = currentChunk.slice(-overlapChars) + ' ' + sentence;
          } else {
            currentChunk = sentence;
          }
          currentChunkSize = currentChunk.length;
        } else {
          currentChunk += sentence;
          currentChunkSize = currentChunk.length;
        }
      }
    }
  }

  // Add the last chunk if it's not empty
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      tokenCount: estimateTokenCount(currentChunk),
      index: chunks.length
    });
  }

  return chunks;
}

/**
 * Validates and cleans chunks before embedding
 * @param {Array} chunks - Array of chunk objects
 * @returns {Array} Cleaned chunks
 */
export function validateChunks(chunks) {
  const results = chunks.map((chunk, index) => {
    const reasons = [];
    
    // TEMPORARY: Much more lenient validation for debugging
    // Remove chunks that are too small (less than 20 characters after trimming)
    const trimmedLength = chunk.text.trim().length;
    if (trimmedLength < 20) {
      reasons.push(`too_short_after_trim(${trimmedLength})`);
    }
    
    // Remove chunks that are ALL whitespace
    if (trimmedLength === 0) {
      reasons.push(`all_whitespace`);
    }
    
    const isValid = reasons.length === 0;
    
    if (!isValid) {
      console.log(`Chunk ${index} rejected: ${reasons.join(', ')} - Preview: "${chunk.text.substring(0, 100)}"`);
    }
    
    return { chunk, isValid, reasons };
  });
  
  const validChunks = results.filter(r => r.isValid).map(r => r.chunk);
  const rejectedCount = results.filter(r => !r.isValid).length;
  
  if (rejectedCount > 0) {
    console.log(`Validation summary: ${validChunks.length} valid, ${rejectedCount} rejected`);
  }
  
  return validChunks;
}

/**
 * Generates a preview of a chunk (first 100 chars)
 * @param {string} text - The chunk text
 * @returns {string} Preview text
 */
export function generateChunkPreview(text) {
  if (!text) return '';
  const preview = text.substring(0, 100).replace(/\n/g, ' ');
  return preview + (text.length > 100 ? '...' : '');
}

