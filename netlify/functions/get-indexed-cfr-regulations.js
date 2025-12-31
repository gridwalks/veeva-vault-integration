import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('Getting indexed CFR regulations...');

  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Get all regulations that have chunks
    const query = `
      SELECT DISTINCT
        r.id,
        r.regulation_id,
        r.regulation_type,
        r.title,
        r.granule_id,
        r.chapter_id,
        r.subchapter_id,
        COUNT(c.id) as chunk_count
      FROM cfr_title21_regulations r
      INNER JOIN cfr_title21_regulation_chunks c ON r.id = c.regulation_id
      GROUP BY r.id, r.regulation_id, r.regulation_type, r.title, r.granule_id, r.chapter_id, r.subchapter_id
      ORDER BY r.regulation_id
    `;

    const result = await pool.query(query);
    const totalDuration = Date.now() - startTime;

    console.log(`Found ${result.rows.length} indexed CFR regulations with chunks`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        regulations: result.rows.map(row => ({
          id: row.id,
          regulationId: row.regulation_id,
          regulationType: row.regulation_type,
          title: row.title,
          granuleId: row.granule_id,
          chapterId: row.chapter_id,
          subchapterId: row.subchapter_id,
          chunkCount: parseInt(row.chunk_count)
        })),
        total: result.rows.length,
        duration: totalDuration
      }),
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('Error getting indexed CFR regulations:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        duration: totalDuration
      }),
    };
  }
};

