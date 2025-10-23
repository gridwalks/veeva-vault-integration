import { getPool } from './db.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedSupport = null;
let lastCheckedAt = 0;

function createDefaultSupport() {
  return {
    safeFileName: false,
    manualSummary: false,
  };
}

export function clearUploadedDocumentColumnCache() {
  cachedSupport = null;
  lastCheckedAt = 0;
}

export async function ensureUploadedDocumentColumnSupport(poolParam) {
  const now = Date.now();
  if (cachedSupport && (now - lastCheckedAt) < CACHE_TTL_MS) {
    return cachedSupport;
  }

  const pool = poolParam || getPool();
  if (!pool) {
    cachedSupport = createDefaultSupport();
    lastCheckedAt = now;
    return cachedSupport;
  }

  const columnsToEnsure = [
    { name: 'safe_file_name', type: 'TEXT' },
    { name: 'manual_summary', type: 'TEXT' },
  ];

  for (const column of columnsToEnsure) {
    try {
      await pool.query(
        `ALTER TABLE qms_chat_documents ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`
      );
    } catch (error) {
      console.warn(
        `Unable to ensure qms_chat_documents.${column.name} column: ${error.message}`
      );
    }
  }

  try {
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'qms_chat_documents'
          AND column_name IN ('safe_file_name', 'manual_summary')`
    );

    const columns = new Set(result.rows.map(row => row.column_name));
    cachedSupport = {
      safeFileName: columns.has('safe_file_name'),
      manualSummary: columns.has('manual_summary'),
    };
  } catch (error) {
    console.warn('Unable to determine qms_chat_documents column support:', error.message);
    cachedSupport = createDefaultSupport();
  }

  lastCheckedAt = now;
  return cachedSupport;
}
