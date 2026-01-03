import { getPool, initDatabase } from './db.js';

export const handler = async (event, context) => {
  // Initialize database connection
  await initDatabase();
  const pool = getPool();

  try {
    const method = event.httpMethod;
    const path = event.path;

    console.log('Chat sessions handler called:', { method, path, hasBody: !!event.body });

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
        console.log('Parsed request body:', { 
          hasUserId: !!body.user_id, 
          hasConversationHistory: !!body.conversation_history,
          conversationHistoryLength: body.conversation_history?.length || 0
        });
      } catch (parseError) {
        console.error('Error parsing request body:', parseError);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid JSON in request body' })
        };
      }
    }

    // Route requests based on method and path
    // Check for both /chat-sessions and /api/chat-sessions paths
    const isChatSessionsPath = path.endsWith('/chat-sessions') || path.includes('/chat-sessions');
    console.log('Path matching:', { path, isChatSessionsPath, endsWith: path.endsWith('/chat-sessions') });
    
    if (method === 'POST' && isChatSessionsPath && !path.includes('/chat-sessions/')) {
      console.log('Routing to createChatSession');
      return await createChatSession(pool, body, headers);
    } else if (method === 'GET' && isChatSessionsPath && !path.includes('/chat-sessions/')) {
      console.log('Routing to getChatSessions');
      return await getChatSessions(pool, event.queryStringParameters, headers);
    } else if (method === 'GET' && path.includes('/chat-sessions/')) {
      const id = path.split('/').pop();
      console.log('Routing to getChatSession, id:', id);
      return await getChatSession(pool, id, headers);
    } else if (method === 'PUT' && path.includes('/chat-sessions/')) {
      const id = path.split('/').pop();
      console.log('Routing to updateChatSession, id:', id);
      // Check if this is a study notes update or name update
      if (body.study_notes !== undefined) {
        return await updateChatSessionStudyNotes(pool, id, body, headers);
      } else {
        return await updateChatSessionName(pool, id, body, headers);
      }
    } else if (method === 'DELETE' && path.includes('/chat-sessions/')) {
      const id = path.split('/').pop();
      console.log('Routing to deleteChatSession, id:', id);
      return await deleteChatSession(pool, id, headers);
    } else {
      console.log('No route matched:', { method, path });
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Endpoint not found', method, path })
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
  const { user_id, session_name, conversation_history, document_metadata, study_notes } = body;

  console.log('createChatSession called with:', {
    hasUserId: !!user_id,
    hasConversationHistory: !!conversation_history,
    isArray: Array.isArray(conversation_history),
    conversationHistoryLength: conversation_history?.length || 0
  });

  if (!user_id || !conversation_history || !Array.isArray(conversation_history)) {
    console.error('Validation failed:', {
      hasUserId: !!user_id,
      hasConversationHistory: !!conversation_history,
      isArray: Array.isArray(conversation_history)
    });
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'user_id and conversation_history array are required' })
    };
  }

  // Trim user_id to avoid whitespace issues
  const trimmedUserId = String(user_id).trim();
  console.log('Creating chat session for user_id:', trimmedUserId, 'Type:', typeof trimmedUserId, 'Length:', trimmedUserId.length);
  console.log('Raw user_id from body:', user_id, 'Type:', typeof user_id);

  // Calculate message count
  const message_count = conversation_history.length;

  // Ensure table exists before inserting
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qms_chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        session_name VARCHAR(500),
        conversation_history JSONB NOT NULL,
        document_metadata JSONB,
        message_count INTEGER DEFAULT 0,
        study_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Ensure indexes exist
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_user_id 
      ON qms_chat_sessions(user_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_created_at 
      ON qms_chat_sessions(created_at)
    `);
    
    // Try to add study_notes column if it doesn't exist (for existing databases)
    try {
      await pool.query(`
        ALTER TABLE qms_chat_sessions 
        ADD COLUMN IF NOT EXISTS study_notes TEXT
      `);
    } catch (alterError) {
      // Column might already exist, ignore error
      console.log('Note: study_notes column may already exist');
    }
    
    console.log('Table qms_chat_sessions ensured to exist');
  } catch (tableError) {
    console.error('Error ensuring table exists:', tableError);
    // Continue anyway - table might already exist
  }

  try {
    console.log('Attempting to INSERT chat session into database...');
    const result = await pool.query(`
      INSERT INTO qms_chat_sessions 
      (user_id, session_name, conversation_history, document_metadata, message_count, study_notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [trimmedUserId, session_name, JSON.stringify(conversation_history), JSON.stringify(document_metadata), message_count, study_notes || null]);
    
    console.log('Chat session inserted successfully. ID:', result.rows[0]?.id);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        data: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error creating chat session:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create chat session',
        details: error.message,
        code: error.code
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
  // Trim user_id to avoid whitespace issues
  const user_id = queryParams?.user_id ? String(queryParams.user_id).trim() : null;
  console.log('getChatSessions called with user_id:', user_id, 'Type:', typeof user_id, 'Length:', user_id?.length);

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
        study_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_user_id ON qms_chat_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_created_at ON qms_chat_sessions(created_at);
    `);
    
    // Try to add study_notes column if it doesn't exist (for existing databases)
    try {
      await pool.query(`
        ALTER TABLE qms_chat_sessions 
        ADD COLUMN IF NOT EXISTS study_notes TEXT;
      `);
    } catch (alterError) {
      // Column might already exist, ignore error
      console.log('Note: study_notes column may already exist');
    }
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
      const sampleUsers = await pool.query('SELECT DISTINCT user_id FROM qms_chat_sessions LIMIT 10');
      console.log('Sample user_ids in database:', sampleUsers.rows.map(r => ({
        user_id: r.user_id,
        type: typeof r.user_id,
        length: r.user_id?.length,
        charCodes: r.user_id?.split('').map(c => c.charCodeAt(0)).slice(0, 20)
      })));
      
      // Also get a few actual session records to see the full data
      const sampleSessions = await pool.query('SELECT id, user_id, session_name, created_at FROM qms_chat_sessions ORDER BY created_at DESC LIMIT 5');
      console.log('Sample sessions:', sampleSessions.rows);
      
      // Check if there are any sessions for this specific user
      if (user_id) {
        console.log(`Querying for user_id: "${user_id}" (type: ${typeof user_id}, length: ${user_id.length})`);
        const userSessionsCheck = await pool.query('SELECT COUNT(*) as count FROM qms_chat_sessions WHERE user_id = $1', [user_id]);
        console.log(`Exact match sessions for user ${user_id}:`, userSessionsCheck.rows[0]?.count);
        
        // Also try a case-insensitive search to see if that's the issue
        const caseInsensitiveCheck = await pool.query('SELECT COUNT(*) as count FROM qms_chat_sessions WHERE LOWER(user_id) = LOWER($1)', [user_id]);
        console.log(`Case-insensitive match sessions:`, caseInsensitiveCheck.rows[0]?.count);
        
        // Try with trimmed version
        const trimmedUserId = String(user_id).trim();
        if (trimmedUserId !== user_id) {
          const trimmedCheck = await pool.query('SELECT COUNT(*) as count FROM qms_chat_sessions WHERE user_id = $1', [trimmedUserId]);
          console.log(`Trimmed user_id match sessions:`, trimmedCheck.rows[0]?.count);
        }
        
        // Try a LIKE search to see if there are similar user_ids
        const likeCheck = await pool.query('SELECT user_id, COUNT(*) as count FROM qms_chat_sessions WHERE user_id LIKE $1 GROUP BY user_id', [`%${user_id.substring(0, 10)}%`]);
        console.log(`Similar user_ids (LIKE search):`, likeCheck.rows);
      }
    } catch (debugError) {
      console.error('Error in debug queries:', debugError);
    }
    
    // Always filter by user_id - this is required
    if (!user_id) {
      console.warn('No user_id provided in query params');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'user_id is required',
          data: { items: [], total: 0, page: 1, limit, totalPages: 0 }
        })
      };
    }
    
    // Use a simpler, more direct query approach
    const trimmedUserId = String(user_id).trim();
    console.log('Filtering by user_id:', trimmedUserId, 'Type:', typeof trimmedUserId, 'Length:', trimmedUserId.length);
    
    // Build WHERE clause parts
    const whereConditions = [`user_id = $1`];
    const queryParams = [trimmedUserId];
    let paramIndex = 2;

    // Add search filter
    if (searchText) {
      whereConditions.push(`session_name ILIKE $${paramIndex}`);
      queryParams.push(`%${searchText}%`);
      paramIndex++;
    }

    // Add date filters
    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }
    
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get total count and paginated results
    const countQuery = `SELECT COUNT(*) FROM qms_chat_sessions ${whereClause}`;
    console.log('Count query:', countQuery);
    console.log('Count query params:', queryParams);
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0]?.count || 0);
    console.log('Count result:', total);
    
    // Build data query with limit and offset
    const dataQueryParams = [...queryParams];
    const limitParamIndex = paramIndex;
    const offsetParamIndex = paramIndex + 1;
    dataQueryParams.push(parseInt(limit), parseInt(offset));
    
    const dataQuery = `
      SELECT * FROM qms_chat_sessions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `;
    
    // Try a simple direct query first to test if we can get any results
    try {
      const testQuery = await pool.query(
        `SELECT id, user_id, session_name, created_at FROM qms_chat_sessions WHERE user_id = $1 LIMIT 5`,
        [trimmedUserId]
      );
      console.log('Direct test query result:', {
        rowCount: testQuery.rows.length,
        rows: testQuery.rows.map(r => ({
          id: r.id,
          user_id: r.user_id,
          session_name: r.session_name
        }))
      });
    } catch (testError) {
      console.error('Test query error:', testError);
    }
    
    console.log('Executing data query:', dataQuery);
    console.log('Data query parameters:', dataQueryParams);
    console.log('Parameter indices - LIMIT:', limitParamIndex, 'OFFSET:', offsetParamIndex);
    const dataResult = await pool.query(dataQuery, dataQueryParams);
    console.log('Query result:', { 
      rowCount: dataResult.rows.length, 
      total: total,
      sampleRow: dataResult.rows[0] ? {
        id: dataResult.rows[0].id,
        user_id: dataResult.rows[0].user_id,
        session_name: dataResult.rows[0].session_name,
        created_at: dataResult.rows[0].created_at
      } : null
    });

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

// Update chat session study notes
async function updateChatSessionStudyNotes(pool, id, body, headers) {
  const { study_notes } = body;

  if (!id || isNaN(parseInt(id))) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Valid ID is required' })
    };
  }

  try {
    const result = await pool.query(`
      UPDATE qms_chat_sessions 
      SET study_notes = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [study_notes || null, id]);

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
    console.error('Error updating chat session study notes:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to update chat session study notes',
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

