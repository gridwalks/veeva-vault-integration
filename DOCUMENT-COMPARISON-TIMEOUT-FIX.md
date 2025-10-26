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
- **After**: 6 chunks for comparison queries
- **Reason**: Aggressively reduces context size to prevent prompt overflow and "length" errors

### 2. Truncated Chunk Text
- Added intelligent text truncation to limit chunk content size
- **Comparison queries**: Max 600 characters per chunk (aggressive truncation)
- **Regular queries**: Max 1500 characters per chunk
- **Benefit**: Prevents oversized contexts that lead to "finish_reason: length" errors

### 3. Truncated Document Summaries
- AI summaries and manual summaries are now truncated for comparison queries
- **Comparison queries**: Max 300 characters per summary (very aggressive truncation)
- **Regular queries**: Max 800 characters per summary
- **Applied to**: Document summaries, keyword search results, and documents without chunks

### 4. Limited Keyword Search Documents
- **Before**: Up to 10 documents from keyword search added to context
- **After**: Max 2 keyword documents for comparison queries
- **Reason**: Dramatically reduces context bloat from loosely related documents

### 5. Reduced Attachment Text Size
- **Comparison queries**: Max 3,000 characters per attachment (down from 6,000)
- **Regular queries**: Max 6,000 characters per attachment
- **Reason**: Attachments can be large and contribute significantly to context size

### 6. Increased Time Budget for Comparisons
- Reduced the response finalization buffer for comparison queries (extra 2 seconds for processing)
- Added a 3-second budget boost specifically for comparison queries
- **Result**: More time available for LLM to complete comparison analysis

### 7. Increased Max Tokens for Comparison Responses
- **Before**: 4000 max_tokens for comparison queries
- **After**: 16000 max_tokens for comparison queries (4x increase!)
- **Benefit**: Allows the AI to generate extremely detailed comparison analysis without hitting token limits

### Issue Identified
The error `finish_reason: length` indicates the model ran out of completion tokens, not that it timed out. From the logs:
- **Original attempt**: 33KB prompt → `finish_reason: length`
- **After first fix**: 23KB prompt → still `finish_reason: length`

The issue was that even with 4000 max_tokens, the model's response needed more room. By reducing the prompt size further AND increasing max_tokens to 16000, we give the model plenty of room to generate comprehensive, detailed responses (well within Groq's 65,536 token limit).

## Impact
These changes will:
- ✅ Dramatically reduce context size (from 33KB to estimated ~6-10KB)
- ✅ Prevent "length" finish reason errors (running out of completion tokens)
- ✅ Prevent timeout errors during document comparisons
- ✅ Allow for extremely detailed comparison analysis (16000 tokens - well within Groq's 65,536 limit)
- ✅ Maintain quality with more focused, relevant content
- ✅ Better balance between detail and performance
- ✅ More reliable document comparison functionality

## Testing Recommendations
1. Test document comparison with 2-3 documents
2. Test with documents containing large summaries
3. Verify timeout errors are resolved
4. Confirm comparison results are still comprehensive

## Files Modified
- `netlify/functions/chat-with-documents.js` (6 changes)

