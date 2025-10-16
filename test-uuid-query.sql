-- Test query to verify UUID vs SERIAL UNION compatibility
-- This simulates the fixed query from get-indexed-documents.js

-- Test the UNION with type casting
SELECT * FROM (
  SELECT 
    id::text as id, veeva_document_id, document_number, document_name, 
    major_version, minor_version, document_type, status, 
    summary, manual_summary, indexed_at, updated_at,
    'veeva' as source_type, null as blob_url, null as original_filename, null as mime_type
  FROM Veeva_Doc_Chat_document_index
  
  UNION ALL
  
  SELECT 
    id::text as id, 
    null as veeva_document_id, 
    null as document_number, 
    document_name, 
    '1' as major_version, 
    '0' as minor_version, 
    document_type, 
    'uploaded' as status, 
    ai_summary as summary, 
    null as manual_summary, 
    created_at as indexed_at, 
    updated_at,
    'upload' as source_type,
    blob_url,
    original_filename,
    mime_type
  FROM qms_chat_documents
) combined_documents
LIMIT 5;

-- Test the count query
SELECT COUNT(*) FROM (
  SELECT id::text FROM Veeva_Doc_Chat_document_index
  UNION ALL
  SELECT id::text FROM qms_chat_documents
) combined_documents;
