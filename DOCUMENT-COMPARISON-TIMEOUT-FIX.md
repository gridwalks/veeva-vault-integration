# Document Comparison Timeout Fix

## Problem
When attempting to compare two documents, users were getting an error message: *"I started analyzing the provided documents but ran out of time before completing the response. Please try again with fewer attachments or a narrower question."*

This was caused by:
1. Too many chunks being retrieved (20 chunks for comparison queries)
2. Full chunk text being included without size limits
3. Large system prompts with untruncated summaries
4. Insufficient time budget allocation for comparison queries

## Solution
Made the following optimizations to the document comparison flow in `netlify/functions/chat-with-documents.js`:

### 1. Reduced Chunk Count for Comparisons
- **Before**: 12 chunks for comparison queries (originally 20)
- **After**: 8 chunks for comparison queries
- **Reason**: Further reduces context size to prevent prompt overflow

### 2. Truncated Chunk Text
- Added intelligent text truncation to limit chunk content size
- **Comparison queries**: Max 800 characters per chunk (reduced from 1200)
- **Regular queries**: Max 1500 characters per chunk
- **Benefit**: Prevents oversized contexts that lead to timeouts

### 3. Truncated Document Summaries
- AI summaries and manual summaries are now truncated for comparison queries
- **Comparison queries**: Max 400 characters per summary (reduced from 600)
- **Regular queries**: Max 800 characters per summary
- **Applied to**: Document summaries, keyword search results, and documents without chunks

### 4. Limited Keyword Search Documents
- **Before**: Up to 10 documents from keyword search added to context
- **After**: Max 3 keyword documents for comparison queries
- **Reason**: Prevents context bloat from loosely related documents

### 5. Increased Time Budget for Comparisons
- Reduced the response finalization buffer for comparison queries (extra 2 seconds for processing)
- Added a 3-second budget boost specifically for comparison queries
- **Result**: More time available for LLM to complete comparison analysis

### 6. Increased Max Tokens for Comparison Responses
- **Before**: 3000 max_tokens for comparison queries
- **After**: 4000 max_tokens for comparison queries
- **Benefit**: Allows the AI to generate more detailed comparison analysis without hitting token limits

### Issue Identified
The error `finish_reason: length` indicates the model ran out of completion tokens, not that it timed out. The system prompt was 32KB (33,000 characters), which was too large. The changes above reduce the context size significantly while maintaining comprehensive analysis capabilities.

## Impact
These changes will:
- ✅ Dramatically reduce context size (from 33KB to estimated ~8-12KB)
- ✅ Prevent "length" finish reason errors (running out of completion tokens)
- ✅ Prevent timeout errors during document comparisons
- ✅ Allow for more comprehensive comparison analysis (4000 tokens)
- ✅ Maintain quality while improving reliability
- ✅ Better balance between detail and performance

## Testing Recommendations
1. Test document comparison with 2-3 documents
2. Test with documents containing large summaries
3. Verify timeout errors are resolved
4. Confirm comparison results are still comprehensive

## Files Modified
- `netlify/functions/chat-with-documents.js` (6 changes)

