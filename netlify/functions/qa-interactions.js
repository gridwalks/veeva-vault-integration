import { getPool, initDatabase } from './db.js';

export const handler = async (event, context) => {
  // Initialize database connection
  await initDatabase();
  const pool = getPool();

  try {
    const method = event.httpMethod;
    const path = event.path;

    // Handle CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: ''
      };
    }

    // Parse request body for POST/PUT requests
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      try {
        body = JSON.parse(event.body || '{}');
      } catch (parseError) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid JSON in request body' })
        };
      }
    }

    // Route requests based on method and path
    if (method === 'POST' && path.endsWith('/qa-interactions')) {
      return await createQAInteraction(pool, body, headers);
    } else if (method === 'GET' && path.endsWith('/qa-interactions')) {
      return await getQAInteractions(pool, event.queryStringParameters, headers);
    } else if (method === 'GET' && path.includes('/qa-interactions/export')) {
      return await exportQAInteractions(pool, event.queryStringParameters, headers);
    } else if (method === 'PUT' && path.includes('/qa-interactions/') && path.includes('/feedback')) {
      const id = path.split('/')[path.split('/').length - 2]; // Get ID before 'feedback'
      return await updateQAFeedback(pool, id, body, headers);
    } else if (method === 'DELETE' && path.includes('/qa-interactions/')) {
      const id = path.split('/').pop();
      return await deleteQAInteraction(pool, id, headers);
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Endpoint not found' })
      };
    }

  } catch (error) {
    console.error('Error in qa-interactions handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
};

// Create a new Q&A interaction
async function createQAInteraction(pool, body, headers) {
  const { question, answer, document_ids = [], document_names = [], user_id, session_id, user_rating = null, feedback_notes = null } = body;

  if (!question || !answer) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Question and answer are required' })
    };
  }

  try {
    // Try the new columns first, fallback to original if they don't exist
    let result;
    try {
      // Attempt to use new columns with proper type casting
      const ratingValue = user_rating === null ? null : parseInt(user_rating);
      const notesValue = feedback_notes === null ? null : String(feedback_notes);
      
      result = await pool.query(`
        INSERT INTO qms_chat_qa_interactions 
        (question, answer, document_ids, document_names, user_id, session_id, user_rating, feedback_notes, feedback_submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::INTEGER, $8::TEXT, CASE WHEN $7::INTEGER IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END)
        RETURNING *
      `, [question, answer, document_ids, document_names, user_id, session_id, ratingValue, notesValue]);
    } catch (newColumnError) {
      // If new columns don't exist, fall back to original columns
      if (newColumnError.code === '42703' || newColumnError.message.includes('column') || newColumnError.message.includes('does not exist')) {
        console.log('New columns not found, using fallback query');
        result = await pool.query(`
          INSERT INTO qms_chat_qa_interactions 
          (question, answer, document_ids, document_names, user_id, session_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [question, answer, document_ids, document_names, user_id, session_id]);
      } else {
        throw newColumnError;
      }
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        data: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error creating Q&A interaction:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create Q&A interaction',
        details: error.message 
      })
    };
  }
}

// Get Q&A interactions with pagination and filtering
async function getQAInteractions(pool, queryParams, headers) {
  const page = parseInt(queryParams?.page) || 1;
  const limit = parseInt(queryParams?.limit) || 50;
  const offset = (page - 1) * limit;
  const search = queryParams?.search || '';
  const user_id = queryParams?.user_id;
  const session_id = queryParams?.session_id;
  const rating = queryParams?.rating; // 'liked', 'disliked', 'unrated'

  try {
    let whereClause = '';
    let queryParams_array = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereClause += ` WHERE (question ILIKE $${paramCount} OR answer ILIKE $${paramCount})`;
      queryParams_array.push(`%${search}%`);
    }

    if (user_id) {
      paramCount++;
      whereClause += whereClause ? ` AND user_id = $${paramCount}` : ` WHERE user_id = $${paramCount}`;
      queryParams_array.push(user_id);
    }

    if (session_id) {
      paramCount++;
      whereClause += whereClause ? ` AND session_id = $${paramCount}` : ` WHERE session_id = $${paramCount}`;
      queryParams_array.push(session_id);
    }

    if (rating) {
      // Add rating filter - will be ignored if column doesn't exist
      paramCount++;
      if (rating === 'liked') {
        whereClause += whereClause ? ` AND user_rating = $${paramCount}` : ` WHERE user_rating = $${paramCount}`;
        queryParams_array.push(1);
      } else if (rating === 'disliked') {
        whereClause += whereClause ? ` AND user_rating = $${paramCount}` : ` WHERE user_rating = $${paramCount}`;
        queryParams_array.push(-1);
      } else if (rating === 'unrated') {
        whereClause += whereClause ? ` AND user_rating IS NULL` : ` WHERE user_rating IS NULL`;
      }
    }

    // Get total count and paginated results
    let countResult, dataResult;
    
    try {
      const countQuery = `SELECT COUNT(*) FROM qms_chat_qa_interactions${whereClause}`;
      countResult = await pool.query(countQuery, queryParams_array);
      
      paramCount++;
      const dataQuery = `
        SELECT * FROM qms_chat_qa_interactions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      queryParams_array.push(limit, offset);
      
      dataResult = await pool.query(dataQuery, queryParams_array);
    } catch (queryError) {
      // If rating column doesn't exist, retry without rating filter
      if (queryError.code === '42703' || queryError.message.includes('column') || queryError.message.includes('does not exist')) {
        console.log('Rating column not found, retrying without rating filter');
        
        // Rebuild query without rating filter
        whereClause = '';
        queryParams_array = [];
        paramCount = 0;
        
        if (search) {
          paramCount++;
          whereClause += ` WHERE (question ILIKE $${paramCount} OR answer ILIKE $${paramCount})`;
          queryParams_array.push(`%${search}%`);
        }

        if (user_id) {
          paramCount++;
          whereClause += whereClause ? ` AND user_id = $${paramCount}` : ` WHERE user_id = $${paramCount}`;
          queryParams_array.push(user_id);
        }

        if (session_id) {
          paramCount++;
          whereClause += whereClause ? ` AND session_id = $${paramCount}` : ` WHERE session_id = $${paramCount}`;
          queryParams_array.push(session_id);
        }
        
        const countQuery = `SELECT COUNT(*) FROM qms_chat_qa_interactions${whereClause}`;
        countResult = await pool.query(countQuery, queryParams_array);
        
        paramCount++;
        const dataQuery = `
          SELECT * FROM qms_chat_qa_interactions
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        queryParams_array.push(limit, offset);
        
        dataResult = await pool.query(dataQuery, queryParams_array);
      } else {
        throw queryError;
      }
    }
    
    const total = parseInt(countResult.rows[0].count);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          items: dataResult.rows,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      })
    };
  } catch (error) {
    console.error('Error getting Q&A interactions:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to get Q&A interactions',
        details: error.message 
      })
    };
  }
}

// Export Q&A interactions as CSV
async function exportQAInteractions(pool, queryParams, headers) {
  const search = queryParams?.search || '';
  const user_id = queryParams?.user_id;
  const session_id = queryParams?.session_id;
  const startDate = queryParams?.start_date;
  const endDate = queryParams?.end_date;

  try {
    let whereClause = '';
    let queryParams_array = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereClause += ` WHERE (question ILIKE $${paramCount} OR answer ILIKE $${paramCount})`;
      queryParams_array.push(`%${search}%`);
    }

    if (user_id) {
      paramCount++;
      whereClause += whereClause ? ` AND user_id = $${paramCount}` : ` WHERE user_id = $${paramCount}`;
      queryParams_array.push(user_id);
    }

    if (session_id) {
      paramCount++;
      whereClause += whereClause ? ` AND session_id = $${paramCount}` : ` WHERE session_id = $${paramCount}`;
      queryParams_array.push(session_id);
    }

    if (startDate) {
      paramCount++;
      whereClause += whereClause ? ` AND created_at >= $${paramCount}` : ` WHERE created_at >= $${paramCount}`;
      queryParams_array.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += whereClause ? ` AND created_at <= $${paramCount}` : ` WHERE created_at <= $${paramCount}`;
      queryParams_array.push(endDate);
    }

    const query = `
      SELECT * FROM qms_chat_qa_interactions
      ${whereClause}
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query, queryParams_array);

    // Convert to CSV format
    const csvHeaders = 'ID,Question,Answer,Document IDs,Document Names,User ID,Session ID,Created At,Updated At\n';
    const csvRows = result.rows.map(row => {
      const documentIds = Array.isArray(row.document_ids) ? row.document_ids.join(';') : '';
      const documentNames = Array.isArray(row.document_names) ? row.document_names.join(';') : '';
      
      return [
        row.id,
        `"${(row.question || '').replace(/"/g, '""')}"`,
        `"${(row.answer || '').replace(/"/g, '""')}"`,
        `"${documentIds}"`,
        `"${documentNames}"`,
        row.user_id || '',
        row.session_id || '',
        row.created_at,
        row.updated_at
      ].join(',');
    }).join('\n');

    const csvContent = csvHeaders + csvRows;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="qa-interactions-${new Date().toISOString().split('T')[0]}.csv"`
      },
      body: csvContent
    };
  } catch (error) {
    console.error('Error exporting Q&A interactions:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Failed to export Q&A interactions',
        details: error.message 
      })
    };
  }
}

// Delete a Q&A interaction
async function deleteQAInteraction(pool, id, headers) {
  if (!id || isNaN(parseInt(id))) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Valid ID is required' })
    };
  }

  try {
    const result = await pool.query(
      'DELETE FROM qms_chat_qa_interactions WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Q&A interaction not found' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Q&A interaction deleted successfully',
        data: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error deleting Q&A interaction:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to delete Q&A interaction',
        details: error.message 
      })
    };
  }
}

// Update Q&A interaction feedback
async function updateQAFeedback(pool, id, body, headers) {
  const { user_rating, feedback_notes = null } = body;

  if (user_rating === undefined || user_rating === null) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'User rating is required' })
    };
  }

  if (user_rating !== 1 && user_rating !== -1) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'User rating must be 1 (like) or -1 (dislike)' })
    };
  }

  try {
    // Try to use new columns, return error if they don't exist
    const ratingValue = parseInt(user_rating);
    const notesValue = feedback_notes === null ? null : String(feedback_notes);
    
    const result = await pool.query(`
      UPDATE qms_chat_qa_interactions 
      SET user_rating = $1::INTEGER, 
          feedback_notes = $2::TEXT, 
          feedback_submitted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [ratingValue, notesValue, id]);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Q&A interaction not found' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error updating Q&A feedback:', error);
    
    // Check if it's a column not found error
    if (error.code === '42703' || error.message.includes('column') || error.message.includes('does not exist')) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ 
          error: 'Feedback system not available - database migration required',
          details: 'Please run the database migration to enable feedback functionality'
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to update Q&A feedback',
        details: error.message 
      })
    };
  }
}
