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
      'Content-Type': 'application/json',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
      'X-Content-Type-Options': 'nosniff'
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
    if (method === 'POST' && path.endsWith('/chat-sessions')) {
      return await createChatSession(pool, body, headers);
    } else if (method === 'GET' && path.endsWith('/chat-sessions')) {
      return await getChatSessions(pool, event.queryStringParameters, headers);
    } else if (method === 'GET' && path.includes('/chat-sessions/')) {
      const id = path.split('/').pop();
      return await getChatSession(pool, id, headers);
    } else if (method === 'PUT' && path.includes('/chat-sessions/')) {
      const id = path.split('/').pop();
      return await updateChatSessionName(pool, id, body, headers);
    } else if (method === 'DELETE' && path.includes('/chat-sessions/')) {
      const id = path.split('/').pop();
      return await deleteChatSession(pool, id, headers);
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Endpoint not found' })
      };
    }

  } catch (error) {
    console.error('Error in chat-sessions handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
};

// Create a new chat session
async function createChatSession(pool, body, headers) {
  const { user_id, session_name, conversation_history, document_metadata } = body;

  if (!user_id || !conversation_history || !Array.isArray(conversation_history)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'user_id and conversation_history array are required' })
    };
  }

  // Calculate message count
  const message_count = conversation_history.length;

  try {
    const result = await pool.query(`
      INSERT INTO qms_chat_sessions 
      (user_id, session_name, conversation_history, document_metadata, message_count)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [user_id, session_name, JSON.stringify(conversation_history), JSON.stringify(document_metadata), message_count]);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        data: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error creating chat session:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create chat session',
        details: error.message 
      })
    };
  }
}

// Get chat sessions with pagination and filtering
async function getChatSessions(pool, queryParams, headers) {
  const page = parseInt(queryParams?.page) || 1;
  const limit = parseInt(queryParams?.limit) || 20;
  // Use offset from query params if provided, otherwise calculate from page
  const offset = queryParams?.offset !== undefined 
    ? parseInt(queryParams.offset) 
    : (page - 1) * limit;
  const searchText = queryParams?.search || '';
  const startDate = queryParams?.startDate;
  const endDate = queryParams?.endDate;
  const user_id = queryParams?.user_id;

  try {
    // Try to ensure table exists first
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qms_chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        session_name VARCHAR(500),
        conversation_history JSONB NOT NULL,
        document_metadata JSONB,
        message_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_user_id ON qms_chat_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_created_at ON qms_chat_sessions(created_at);
    `);
  } catch (tableError) {
    console.error('Error ensuring table exists:', tableError);
    // Continue anyway, table might already exist
  }

  try {
    // First, let's check if there are any sessions at all (for debugging)
    try {
      const allSessionsCheck = await pool.query('SELECT COUNT(*) as total, COUNT(DISTINCT user_id) as unique_users FROM qms_chat_sessions');
      console.log('Database check - Total sessions:', allSessionsCheck.rows[0]?.total, 'Unique users:', allSessionsCheck.rows[0]?.unique_users);
      
      // Get sample user_ids to see what format they're stored in
      const sampleUsers = await pool.query('SELECT DISTINCT user_id FROM qms_chat_sessions LIMIT 5');
      console.log('Sample user_ids in database:', sampleUsers.rows.map(r => r.user_id));
      
      // Check if there are any sessions for this specific user
      if (user_id) {
        const userSessionsCheck = await pool.query('SELECT COUNT(*) as count FROM qms_chat_sessions WHERE user_id = $1', [user_id]);
        console.log(`Sessions for user ${user_id}:`, userSessionsCheck.rows[0]?.count);
        
        // Also try a case-insensitive search to see if that's the issue
        const caseInsensitiveCheck = await pool.query('SELECT COUNT(*) as count FROM qms_chat_sessions WHERE LOWER(user_id) = LOWER($1)', [user_id]);
        console.log(`Sessions for user (case-insensitive):`, caseInsensitiveCheck.rows[0]?.count);
      }
    } catch (debugError) {
      console.error('Error in debug queries:', debugError);
    }
    
    let whereClause = '';
    let queryParams_array = [];
    let paramCount = 0;

    // Always filter by user_id
    if (user_id) {
      paramCount++;
      whereClause = ` WHERE user_id = $${paramCount}`;
      queryParams_array.push(user_id);
      console.log('Filtering by user_id:', user_id);
    }

    // Add search filter
    if (searchText) {
      paramCount++;
      whereClause += whereClause 
        ? ` AND session_name ILIKE $${paramCount}` 
        : ` WHERE session_name ILIKE $${paramCount}`;
      queryParams_array.push(`%${searchText}%`);
    }

    // Add date filters
    if (startDate) {
      paramCount++;
      whereClause += whereClause 
        ? ` AND created_at >= $${paramCount}` 
        : ` WHERE created_at >= $${paramCount}`;
      queryParams_array.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += whereClause 
        ? ` AND created_at <= $${paramCount}` 
        : ` WHERE created_at <= $${paramCount}`;
      queryParams_array.push(endDate);
    }

    // Get total count and paginated results
    const countQuery = `SELECT COUNT(*) FROM qms_chat_sessions${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams_array);
    
    // Add limit and offset parameters
    paramCount++;
    const dataQuery = `
      SELECT * FROM qms_chat_sessions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams_array.push(parseInt(limit), parseInt(offset));
    
    console.log('Executing data query:', dataQuery);
    console.log('Query parameters:', queryParams_array);
    console.log('Query parameter count:', queryParams_array.length);
    const dataResult = await pool.query(dataQuery, queryParams_array);
    console.log('Query result:', { 
      rowCount: dataResult.rows.length, 
      total: countResult.rows[0].count,
      sampleRow: dataResult.rows[0] ? {
        id: dataResult.rows[0].id,
        user_id: dataResult.rows[0].user_id,
        session_name: dataResult.rows[0].session_name,
        created_at: dataResult.rows[0].created_at
      } : null
    });
    
    const total = parseInt(countResult.rows[0].count);

    const responseData = {
      success: true,
      data: {
        items: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
    
    console.log('Returning response with', responseData.data.items.length, 'items');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData)
    };
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to get chat sessions',
        details: error.message 
      })
    };
  }
}

// Get a specific chat session
async function getChatSession(pool, id, headers) {
  if (!id || isNaN(parseInt(id))) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Valid ID is required' })
    };
  }

  try {
    const result = await pool.query(
      'SELECT * FROM qms_chat_sessions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Chat session not found' })
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
    console.error('Error getting chat session:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to get chat session',
        details: error.message 
      })
    };
  }
}

// Update chat session name
async function updateChatSessionName(pool, id, body, headers) {
  const { session_name } = body;

  if (!id || isNaN(parseInt(id))) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Valid ID is required' })
    };
  }

  if (!session_name) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'session_name is required' })
    };
  }

  try {
    const result = await pool.query(`
      UPDATE qms_chat_sessions 
      SET session_name = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [session_name, id]);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Chat session not found' })
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
    console.error('Error updating chat session name:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to update chat session',
        details: error.message 
      })
    };
  }
}

// Delete a chat session
async function deleteChatSession(pool, id, headers) {
  if (!id || isNaN(parseInt(id))) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Valid ID is required' })
    };
  }

  try {
    const result = await pool.query(
      'DELETE FROM qms_chat_sessions WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Chat session not found' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Chat session deleted successfully',
        data: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error deleting chat session:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to delete chat session',
        details: error.message 
      })
    };
  }
}

