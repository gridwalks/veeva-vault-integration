-- Migration: ensure uploaded documents can store safe file names and manual summaries
-- Adds the missing columns and backfills safe file names for existing records

ALTER TABLE qms_chat_documents
  ADD COLUMN IF NOT EXISTS safe_file_name TEXT;

ALTER TABLE qms_chat_documents
  ADD COLUMN IF NOT EXISTS manual_summary TEXT;

-- Backfill safe file names for existing rows using the original filename when available
UPDATE qms_chat_documents
SET safe_file_name = CASE
  WHEN original_filename IS NOT NULL AND original_filename <> '' THEN
    LOWER(REGEXP_REPLACE(original_filename, '[^a-z0-9._-]+', '-', 'g'))
  ELSE LOWER(REGEXP_REPLACE(document_name, '[^a-z0-9._-]+', '-', 'g'))
END
WHERE safe_file_name IS NULL;
