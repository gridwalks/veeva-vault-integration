import { getPool } from './db.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
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
    
    const retentionDays = parseInt(params.get('retentionDays') || '30');
    const dryRun = params.get('dryRun') === 'true';

    console.log(`Starting log cleanup process:`, {
      retentionDays,
      dryRun,
      timestamp: new Date().toISOString()
    });

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString();

    console.log(`Cutoff date for cleanup: ${cutoffDateStr}`);

    // First, get count of logs to be deleted
    const countQuery = `
      SELECT COUNT(*) as count
      FROM qms_chat_indexing_logs
      WHERE created_at < $1
    `;
    
    const countResult = await pool.query(countQuery, [cutoffDateStr]);
    const logsToDelete = parseInt(countResult.rows[0].count);

    console.log(`Found ${logsToDelete} logs older than ${retentionDays} days`);

    if (dryRun) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          dryRun: true,
          logsToDelete,
          retentionDays,
          cutoffDate: cutoffDateStr,
          message: `Would delete ${logsToDelete} logs older than ${retentionDays} days`
        })
      };
    }

    if (logsToDelete === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          logsDeleted: 0,
          retentionDays,
          cutoffDate: cutoffDateStr,
          message: 'No logs to delete'
        })
      };
    }

    // Delete old logs
    const deleteQuery = `
      DELETE FROM qms_chat_indexing_logs
      WHERE created_at < $1
    `;
    
    const deleteResult = await pool.query(deleteQuery, [cutoffDateStr]);
    const logsDeleted = deleteResult.rowCount;

    console.log(`Successfully deleted ${logsDeleted} logs`);

    // Get updated statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_logs,
        MIN(created_at) as oldest_log,
        MAX(created_at) as newest_log
      FROM qms_chat_indexing_logs
    `;
    
    const statsResult = await pool.query(statsQuery);
    const stats = statsResult.rows[0];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        logsDeleted,
        retentionDays,
        cutoffDate: cutoffDateStr,
        statistics: {
          totalLogs: parseInt(stats.total_logs),
          oldestLog: stats.oldest_log,
          newestLog: stats.newest_log
        },
        message: `Successfully deleted ${logsDeleted} logs older than ${retentionDays} days`
      })
    };

  } catch (error) {
    console.error('Error cleaning up indexing logs:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: 'Failed to cleanup indexing logs',
        message: error.message 
      })
    };
  }
};
