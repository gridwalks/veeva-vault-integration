# RAG (Retrieval-Augmented Generation) Implementation Guide

## Overview

This Veeva Vault integration now includes a powerful RAG search capability that enables semantic search across document content using vector embeddings. When documents are indexed, they are automatically chunked and embedded for intelligent retrieval.

## What's New

### 1. Document Chunking
- Documents are automatically split into smaller, semantically meaningful chunks during indexing
- Each chunk is approximately 512 tokens (configurable) with 50-token overlap to preserve context
- Chunking respects document structure (paragraphs, sentences) for better coherence

### 2. Vector Embeddings
- Each chunk is embedded using OpenAI's `text-embedding-ada-002` model (1536 dimensions)
- Embeddings are stored in a PostgreSQL database with pgvector extension
- Enables semantic search based on meaning, not just keywords

### 3. Semantic Search
- User queries are embedded and compared against document chunks using cosine similarity
- Returns the most relevant chunks with similarity scores
- Falls back to keyword search if embedding generation fails

## Database Schema Updates

### New Table: `document_chunks`
```sql
CREATE TABLE document_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES document_index(id) ON DELETE CASCADE,
  veeva_document_id VARCHAR(255) NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 embeddings
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);
```

### Requirements
- **pgvector extension** must be enabled in your PostgreSQL/Neon database
- Run: `CREATE EXTENSION IF NOT EXISTS vector;`

## How It Works

### Indexing Process

1. **Document Download**: Document is downloaded from Veeva Vault
2. **Text Extraction**: Text is extracted from PDF/DOCX files
3. **Summary Generation**: AI summary is generated (as before)
4. **Chunking**: Document text is split into overlapping chunks
5. **Embedding**: Each chunk is embedded using OpenAI embeddings API
6. **Storage**: Chunks and embeddings are stored in the database

### Query Process

1. **Query Embedding**: User's question is embedded using the same model
2. **Vector Search**: Database performs cosine similarity search
3. **Chunk Retrieval**: Top 10 most relevant chunks are retrieved
4. **Context Building**: Chunks are formatted with metadata (document name, similarity score)
5. **AI Response**: GPT-4 generates answer based on relevant chunks

## Configuration

### Chunking Parameters
Located in `netlify/functions/index-documents.js`:
```javascript
const chunks = chunkText(documentText, 512, 50);
// 512 tokens per chunk, 50 token overlap
```

### Search Parameters
Located in `netlify/functions/chat-with-documents.js`:
```javascript
LIMIT 10  // Retrieve top 10 most relevant chunks
```

## API Usage

### Indexing with Chunking
```bash
# Index all documents (automatically chunks and embeds)
curl https://your-site.netlify.app/.netlify/functions/index-documents

# Force re-index (regenerates chunks and embeddings)
curl https://your-site.netlify.app/.netlify/functions/index-documents?force=true
```

### Chat with RAG
```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/chat-with-documents \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the approval process for SOPs?",
    "documentIds": [],  # Empty for search across all docs
    "conversationHistory": []
  }'
```

Response includes:
```json
{
  "response": "The AI's answer...",
  "documents": [...],
  "metadata": {
    "documentsUsed": 3,
    "chunksUsed": 10,
    "usingRAG": true,
    "responseTime": 1234,
    "tokensUsed": 567
  }
}
```

## Performance Considerations

### Indexing
- Embedding generation is done in batches of 10 chunks
- Large documents may take longer to index
- Consider adjusting `batchSize` parameter for timeouts

### Querying
- Vector search is fast with proper indexes
- Consider creating IVFFLAT index after bulk loading:
  ```sql
  CREATE INDEX idx_chunks_embedding 
  ON document_chunks USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
  ```

### Costs
- **Embeddings**: ~$0.0001 per 1K tokens (ada-002)
- A 10-page document (~5000 words) ≈ $0.001-0.002 to embed
- Query embeddings are minimal cost (<$0.0001 per query)

## Monitoring and Debugging

### Check Chunk Count
```sql
SELECT 
  di.document_name,
  COUNT(dc.id) as chunk_count,
  SUM(dc.token_count) as total_tokens
FROM document_index di
LEFT JOIN document_chunks dc ON di.id = dc.document_id
GROUP BY di.id, di.document_name
ORDER BY chunk_count DESC;
```

### Test Vector Search
```sql
-- Find chunks similar to a specific chunk
SELECT 
  dc1.chunk_text as query_chunk,
  dc2.chunk_text as similar_chunk,
  1 - (dc1.embedding <=> dc2.embedding) as similarity
FROM document_chunks dc1
CROSS JOIN document_chunks dc2
WHERE dc1.id = 123  -- Your test chunk ID
  AND dc2.id != dc1.id
ORDER BY dc1.embedding <=> dc2.embedding
LIMIT 5;
```

### Logs
All functions include detailed logging:
- Chunk counts and token estimates
- Embedding generation times
- Similarity scores for retrieved chunks
- Fallback to keyword search when needed

## Fallback Behavior

The system gracefully handles failures:

1. **No pgvector**: Falls back to keyword search using document summaries
2. **Embedding API failure**: Uses keyword search instead
3. **No chunks**: Uses existing document summaries
4. **Network issues**: Logs errors and continues with available data

## Best Practices

1. **Re-index when needed**: Use `?force=true` to regenerate chunks after schema changes
2. **Monitor costs**: Track OpenAI API usage for embeddings
3. **Tune chunk size**: Adjust based on your document types and query patterns
4. **Index optimization**: Create vector indexes after bulk document loading
5. **Query specificity**: More specific queries return better results

## Files Modified

- `database-schema.sql` - Added document_chunks table
- `netlify/functions/db.js` - Added chunks table initialization
- `netlify/functions/chunking-utils.js` - New chunking utilities
- `netlify/functions/index-documents.js` - Added chunking and embedding
- `netlify/functions/chat-with-documents.js` - Added semantic search

## Next Steps

Consider these enhancements:
- [ ] Add chunk visualization in the UI
- [ ] Display similarity scores to users
- [ ] Allow users to adjust chunk size
- [ ] Implement chunk-level citations
- [ ] Add hybrid search (combine vector + keyword)
- [ ] Cache embeddings for common queries
- [ ] Implement re-ranking for better results

