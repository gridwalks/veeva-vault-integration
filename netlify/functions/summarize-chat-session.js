import { getPool, initDatabase } from './db.js';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 20000,
});

export const handler = async (event, context) => {
  // Initialize database connection
  await initDatabase();
  const pool = getPool();

  try {
    const method = event.httpMethod;

    // Handle CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    if (method !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Parse request body
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { session_id, conversation_history, session_name } = body;

    // Validate input
    if (!session_id && !conversation_history) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Either session_id or conversation_history is required' })
      };
    }

    let conversationHistory = conversation_history;
    let sessionId = session_id;
    let sessionName = session_name;

    // If session_id is provided, fetch the conversation history from database
    if (session_id) {
      try {
        const sessionResult = await pool.query(
          'SELECT conversation_history, session_name FROM qms_chat_sessions WHERE id = $1',
          [session_id]
        );

        if (sessionResult.rows.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Chat session not found' })
          };
        }

        const session = sessionResult.rows[0];
        conversationHistory = typeof session.conversation_history === 'string'
          ? JSON.parse(session.conversation_history)
          : session.conversation_history;
        sessionName = sessionName || session.session_name || 'Chat Session';
      } catch (dbError) {
        console.error('Error fetching session:', dbError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch chat session', details: dbError.message })
        };
      }
    }

    // Validate conversation history
    if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Conversation history must be a non-empty array' })
      };
    }

    // Build conversation text from history
    const conversationText = conversationHistory
      .map(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.content || ''}`;
      })
      .join('\n\n');

    // Limit conversation text to avoid token limits (keep last 8000 characters)
    const maxConversationLength = 8000;
    const truncatedConversation = conversationText.length > maxConversationLength
      ? conversationText.substring(conversationText.length - maxConversationLength)
      : conversationText;

    // Generate study notes using Groq API
    let studyNotes = null;
    try {
      if (!process.env.GROQ_API_KEY) {
        console.warn('GROQ_API_KEY not configured, creating basic summary');
        studyNotes = `# Study Notes: ${sessionName}\n\n## Discussion Summary\n\nThis chat session contains ${conversationHistory.length} messages. AI summarization is not available (API key missing).`;
      } else {
        console.log('Generating study notes with Groq API...');
        const completion = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `You are an educational assistant that creates structured study notes from chat conversations. Your goal is to help users reinforce their learning by extracting key information, concepts, and takeaways from discussions.

Create study notes in the following structured format:

# Study Notes: [Session Name]

## Key Topics Discussed
- List the main topics that were discussed

## Learning Points
- Extract important learning points and insights

## Important Concepts
- Highlight key concepts, definitions, or principles covered

## Discussion Summary
Provide a brief summary of the conversation flow and main discussion points

## Key Takeaways
- List the most important takeaways that reinforce learning

Format the output as clear, well-structured markdown. Be specific and reference actual content from the conversation. Focus on educational value and reinforcement of learning.`
            },
            {
              role: "user",
              content: `Session Name: "${sessionName || 'Chat Session'}"

Please create structured study notes from the following conversation:

${truncatedConversation}`
            }
          ],
          max_tokens: 1200,
          temperature: 0.3,
        });

        studyNotes = completion.choices[0]?.message?.content || null;
        console.log('Study notes generated successfully:', {
          notesLength: studyNotes?.length || 0,
          tokensUsed: completion.usage?.total_tokens || 0
        });
      }
    } catch (groqError) {
      console.error('Error generating study notes with Groq:', groqError);
      // Return a basic summary if AI generation fails
      studyNotes = `# Study Notes: ${sessionName}\n\n## Discussion Summary\n\nThis chat session contains ${conversationHistory.length} messages. AI summarization encountered an error: ${groqError.message}`;
    }

    // If session_id was provided, update the session with study notes
    if (session_id && studyNotes) {
      try {
        await pool.query(
          'UPDATE qms_chat_sessions SET study_notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [studyNotes, session_id]
        );
        console.log('Study notes saved to session:', session_id);
      } catch (updateError) {
        console.error('Error updating session with study notes:', updateError);
        // Don't fail the request if update fails, just log it
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          study_notes: studyNotes,
          session_id: session_id || null
        }
      })
    };

  } catch (error) {
    console.error('Error in summarize-chat-session handler:', error);
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

