import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== CLEAR ALL CHUNKS ===');

  try {
    await initDatabase();
    const pool = getPool();

    // Delete all uploaded document chunks
    const result = await pool.query('DELETE FROM qms_chat_document_chunks');

    console.log(`Deleted ${result.rowCount} chunks`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        deletedCount: result.rowCount,
        message: `Deleted ${result.rowCount} chunks. Ready for re-indexing.`,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('=== CLEAR CHUNKS ERROR ===');
    console.error('Error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
