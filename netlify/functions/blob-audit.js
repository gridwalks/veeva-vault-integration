import { getPool } from './db.js';

let auditTableInitialized = false;

async function ensureAuditTable() {
  if (auditTableInitialized) {
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set. Blob audit logging is disabled.');
    return;
  }

  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blob_audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(32) NOT NULL,
        blob_key TEXT,
        status VARCHAR(32) NOT NULL,
        metadata JSONB,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    auditTableInitialized = true;
  } catch (error) {
    console.error('Failed to ensure blob_audit_log table exists:', error);
  }
}

export async function writeBlobAudit({ action, blobKey, status, metadata = null, errorMessage = null }) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    await ensureAuditTable();
    if (!auditTableInitialized) {
      return;
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO blob_audit_log (action, blob_key, status, metadata, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        action,
        blobKey || null,
        status,
        metadata ? JSON.stringify(metadata) : null,
        errorMessage || null
      ]
    );
  } catch (error) {
    console.error('Failed to write blob audit entry:', error);
  }
}
