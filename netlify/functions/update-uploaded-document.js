import { getPool } from './db.js';
import { ensureUploadedDocumentColumnSupport } from './uploaded-document-columns.js';
import { generateSafeFileName } from './utils.js';

const ALLOWED_METHODS = ['PUT', 'PATCH'];

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'PUT, PATCH, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (!ALLOWED_METHODS.includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ALLOWED_METHODS
      })
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Request body is required'
        })
      };
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON payload'
        })
      };
    }

    const {
      documentId,
      userId,
      documentName,
      safeFileName,
      documentType,
      version,
      manualSummary,
      aiSummary
    } = payload;

    if (!documentId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Document ID is required'
        })
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'User ID is required'
        })
      };
    }

    const trimmedName = typeof documentName === 'string' ? documentName.trim() : undefined;
    const trimmedSafeName = typeof safeFileName === 'string' ? safeFileName.trim() : undefined;
    const trimmedType = typeof documentType === 'string' ? documentType.trim() : undefined;
    const trimmedVersion = typeof version === 'string' ? version.trim() : undefined;
    const cleanedSummary = typeof aiSummary === 'string' ? aiSummary.trim() : typeof aiSummary === 'undefined' ? undefined : aiSummary;
    const cleanedManualSummary = typeof manualSummary === 'string' ? manualSummary.trim() : typeof manualSummary === 'undefined' ? undefined : manualSummary;

    const setClauses = [];
    const values = [];
    const warnings = [];

    if (typeof trimmedName !== 'undefined') {
      if (!trimmedName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Document name cannot be empty'
          })
        };
      }
      setClauses.push(`document_name = $${values.length + 1}`);
      values.push(trimmedName);
    }

    if (typeof trimmedType !== 'undefined') {
      const typeValue = trimmedType || 'uploaded_document';
      setClauses.push(`document_type = $${values.length + 1}`);
      values.push(typeValue);
    }

    if (typeof trimmedVersion !== 'undefined') {
      const versionValue = trimmedVersion || null;
      setClauses.push(`version = $${values.length + 1}`);
      values.push(versionValue);
    }

    if (typeof cleanedSummary !== 'undefined') {
      const summaryValue = cleanedSummary === '' ? null : cleanedSummary;
      setClauses.push(`ai_summary = $${values.length + 1}`);
      values.push(summaryValue);
    }

    const pool = getPool();
    const { safeFileName: hasSafeFileName, manualSummary: hasManualSummary } =
      await ensureUploadedDocumentColumnSupport(pool);

    if (typeof trimmedSafeName !== 'undefined') {
      if (hasSafeFileName) {
        const sanitizedSafeName = generateSafeFileName(trimmedSafeName).substring(0, 120) || null;
        setClauses.push(`safe_file_name = $${values.length + 1}`);
        values.push(sanitizedSafeName);
      } else {
        warnings.push('safe_file_name column unavailable');
      }
    }

    if (typeof cleanedManualSummary !== 'undefined') {
      if (hasManualSummary) {
        const manualSummaryValue = cleanedManualSummary === '' ? null : cleanedManualSummary;
        setClauses.push(`manual_summary = $${values.length + 1}`);
        values.push(manualSummaryValue);
      } else {
        warnings.push('manual_summary column unavailable');
      }
    }

    if (setClauses.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No metadata fields provided for update'
        })
      };
    }

    const existingDocResult = await pool.query(
      `SELECT user_id
         FROM qms_chat_documents
        WHERE id = $1
          AND source_type = 'upload'`,
      [documentId]
    );

    if (existingDocResult.rowCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Document not found'
        })
      };
    }

    const originalUserId = existingDocResult.rows[0]?.user_id || null;
    if (originalUserId && originalUserId !== userId) {
      warnings.push('Document updated by a different user than the original uploader');
    }

    const updateFields = [...setClauses, 'updated_at = CURRENT_TIMESTAMP'];

    const returningFields = [
      'id',
      'document_name',
      hasSafeFileName ? 'safe_file_name' : 'NULL::TEXT AS safe_file_name',
      'document_type',
      'version',
      'ai_summary',
      hasManualSummary ? 'manual_summary' : 'NULL::TEXT AS manual_summary',
      'file_size',
      'extraction_method',
      'blob_url',
      'original_filename',
      'mime_type',
      'created_at',
      'updated_at'
    ];

    const result = await pool.query(
      `UPDATE qms_chat_documents
       SET ${updateFields.join(', ')}
       WHERE id = $${values.length + 1}
         AND source_type = 'upload'
       RETURNING ${returningFields.join(', ')}`,
      [...values, documentId]
    );

    if (result.rowCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Document not found'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        document: result.rows[0],
        warnings: warnings.length ? warnings : undefined
      })
    };
  } catch (error) {
    console.error('Error updating uploaded document metadata:', {
      message: error.message,
      stack: error.stack
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to update uploaded document metadata'
      })
    };
  }
};
