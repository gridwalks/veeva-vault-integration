import { getPool } from './db.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const pool = getPool();
    if (!pool) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: 'Database connection not available' })
      };
    }

    // Parse query parameters
    const url = new URL(event.rawUrl);
    const params = url.searchParams;
    
    const limit = Math.min(parseInt(params.get('limit') || '50'), 1000);
    const offset = parseInt(params.get('offset') || '0');
    const operationType = params.get('operationType');
    const sourceType = params.get('sourceType');
    const status = params.get('status');
    const batchId = params.get('batchId');
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');

    // Build the query
    let query = `
      SELECT 
        id,
        operation_type,
        source_type,
        document_id,
        veeva_document_id,
        document_name,
        document_number,
        document_type,
        version,
        status,
        processing_duration_ms,
        chunks_created,
        summary_generated,
        error_message,
        batch_id,
        batch_offset,
        user_id,
        session_id,
        force_regenerate,
        created_at,
        updated_at
      FROM qms_chat_indexing_logs
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (operationType) {
      paramCount++;
      query += ` AND operation_type = $${paramCount}`;
      queryParams.push(operationType);
    }

    if (sourceType) {
      paramCount++;
      query += ` AND source_type = $${paramCount}`;
      queryParams.push(sourceType);
    }

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }

    if (batchId) {
      paramCount++;
      query += ` AND batch_id = $${paramCount}`;
      queryParams.push(batchId);
    }

    if (startDate) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      queryParams.push(endDate);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limit, offset);

    console.log('Executing query:', query);
    console.log('Query parameters:', queryParams);

    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM qms_chat_indexing_logs WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;

    if (operationType) {
      countParamCount++;
      countQuery += ` AND operation_type = $${countParamCount}`;
      countParams.push(operationType);
    }

    if (sourceType) {
      countParamCount++;
      countQuery += ` AND source_type = $${countParamCount}`;
      countParams.push(sourceType);
    }

    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (batchId) {
      countParamCount++;
      countQuery += ` AND batch_id = $${countParamCount}`;
      countParams.push(batchId);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND created_at >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND created_at <= $${countParamCount}`;
      countParams.push(endDate);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Get statistics
    const statsQuery = `
      SELECT 
        operation_type,
        source_type,
        status,
        COUNT(*) as count,
        AVG(processing_duration_ms) as avg_duration_ms,
        SUM(chunks_created) as total_chunks_created,
        SUM(CASE WHEN summary_generated THEN 1 ELSE 0 END) as summaries_generated
      FROM qms_chat_indexing_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY operation_type, source_type, status
      ORDER BY operation_type, source_type, status
    `;

    const statsResult = await pool.query(statsQuery);

    // Format the response
    const logs = result.rows.map(row => ({
      id: row.id,
      operationType: row.operation_type,
      sourceType: row.source_type,
      documentId: row.document_id,
      veevaDocumentId: row.veeva_document_id,
      documentName: row.document_name,
      documentNumber: row.document_number,
      documentType: row.document_type,
      version: row.version,
      status: row.status,
      processingDurationMs: row.processing_duration_ms,
      chunksCreated: row.chunks_created,
      summaryGenerated: row.summary_generated,
      errorMessage: row.error_message,
      batchId: row.batch_id,
      batchOffset: row.batch_offset,
      userId: row.user_id,
      sessionId: row.session_id,
      forceRegenerate: row.force_regenerate,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      durationDisplay: formatDuration(row.processing_duration_ms)
    }));

    const statistics = statsResult.rows.map(row => ({
      operationType: row.operation_type,
      sourceType: row.source_type,
      status: row.status,
      count: parseInt(row.count),
      avgDurationMs: parseFloat(row.avg_duration_ms) || 0,
      totalChunksCreated: parseInt(row.total_chunks_created) || 0,
      summariesGenerated: parseInt(row.summaries_generated) || 0
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logs,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        },
        statistics,
        filters: {
          operationType,
          sourceType,
          status,
          batchId,
          startDate,
          endDate
        }
      })
    };

  } catch (error) {
    console.error('Error fetching indexing logs:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: 'Failed to fetch indexing logs',
        message: error.message 
      })
    };
  }
};

function formatDuration(ms) {
  if (!ms) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
