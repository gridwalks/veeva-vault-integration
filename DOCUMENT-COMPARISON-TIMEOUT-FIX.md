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
- **Before**: 20 chunks for comparison queries
- **After**: 12 chunks for comparison queries
- **Reason**: Reduces context size while still providing comprehensive analysis

### 2. Truncated Chunk Text
- Added intelligent text truncation to limit chunk content size
- **Comparison queries**: Max 1200 characters per chunk
- **Regular queries**: Max 1500 characters per chunk
- **Benefit**: Prevents oversized contexts that lead to timeouts

### 3. Truncated Document Summaries
- AI summaries and manual summaries are now truncated for comparison queries
- **Comparison queries**: Max 600 characters per summary
- **Regular queries**: Max 800 characters per summary
- **Applied to**: Document summaries, keyword search results, and documents without chunks

### 4. Increased Time Budget for Comparisons
- Reduced the response finalization buffer for comparison queries (extra 2 seconds for processing)
- Added a 3-second budget boost specifically for comparison queries
- **Result**: More time available for LLM to complete comparison analysis

### 5. Increased Max Tokens for Comparison Responses
- **Before**: 2000 max_tokens for all queries
- **After**: 3000 max_tokens for comparison queries
- **Benefit**: Allows the AI to generate more detailed comparison analysis

## Impact
These changes will:
- ✅ Reduce context size and processing time
- ✅ Prevent timeout errors during document comparisons
- ✅ Allow for more comprehensive comparison analysis
- ✅ Maintain quality while improving reliability

## Testing Recommendations
1. Test document comparison with 2-3 documents
2. Test with documents containing large summaries
3. Verify timeout errors are resolved
4. Confirm comparison results are still comprehensive

## Files Modified
- `netlify/functions/chat-with-documents.js` (6 changes)

