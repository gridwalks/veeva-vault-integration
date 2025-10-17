import { getPool } from './db.js';

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
      documentType,
      version,
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
    const trimmedType = typeof documentType === 'string' ? documentType.trim() : undefined;
    const trimmedVersion = typeof version === 'string' ? version.trim() : undefined;
    const cleanedSummary = typeof aiSummary === 'string' ? aiSummary.trim() : typeof aiSummary === 'undefined' ? undefined : aiSummary;

    const setClauses = [];
    const values = [];

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

    const updateFields = [...setClauses, 'updated_at = CURRENT_TIMESTAMP'];
    const pool = getPool();

    const result = await pool.query(
      `UPDATE qms_chat_documents
       SET ${updateFields.join(', ')}
       WHERE id = $${values.length + 1}
         AND user_id = $${values.length + 2}
         AND source_type = 'upload'
       RETURNING id, document_name, document_type, version, ai_summary, file_size, extraction_method, blob_url, original_filename, mime_type, created_at, updated_at`,
      [...values, documentId, userId]
    );

    if (result.rowCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Document not found or access denied'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        document: result.rows[0]
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
