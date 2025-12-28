import { getPool, initDatabase } from "./db.js";
import { getCorsHeaders, handleOptionsRequest, parseRequestBody, getJsonParseErrorResponse, createErrorResponse, createSuccessResponse } from "./shared-utils.js";
import { verifyAuthToken } from "./security-utils.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(['POST', 'OPTIONS'], event);
    return handleOptionsRequest(corsHeaders);
  }

  const corsHeaders = getCorsHeaders(['POST', 'OPTIONS'], event);

  try {
    // Verify authentication
    const authResult = verifyAuthToken(event);
    if (!authResult.valid) {
      return createErrorResponse(401, 'Authentication required', corsHeaders);
    }

    const userId = authResult.claims?.sub || null;

    // Initialize database
    await initDatabase();
    const pool = getPool();

    if (event.httpMethod === 'POST') {
      return await handleTutoringRequest(pool, userId, event.body, corsHeaders);
    } else {
      return createErrorResponse(405, 'Method not allowed', corsHeaders);
    }
  } catch (error) {
    console.error('Error in ai-tutor:', error);
    return createErrorResponse(500, error.message || 'Internal server error', corsHeaders);
  }
};

// Handle tutoring request with educational context
async function handleTutoringRequest(pool, userId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    const { message, course_id, lesson_id, conversation_history = [] } = data;

    if (!message || !message.trim()) {
      return createErrorResponse(400, 'Message is required', corsHeaders);
    }

    // Build educational context
    let educationalContext = '';
    let relevantDocuments = [];
    let relevantRegulations = [];

    if (course_id) {
      const courseResult = await pool.query(
        `SELECT title, description, category FROM gxp_courses WHERE id = $1`,
        [course_id]
      );
      if (courseResult.rows.length > 0) {
        const course = courseResult.rows[0];
        educationalContext += `\n\nCourse Context: ${course.title}\nDescription: ${course.description}\nCategory: ${course.category}`;
      }
    }

    if (lesson_id) {
      const lessonResult = await pool.query(
        `SELECT 
          l.title, l.description, l.content_type, l.content_data,
          l.cfr_regulation_id, l.document_id, l.workflow_template_id,
          m.title as module_title,
          c.title as course_title
        FROM gxp_lessons l
        INNER JOIN gxp_modules m ON l.module_id = m.id
        INNER JOIN gxp_courses c ON m.course_id = c.id
        WHERE l.id = $1`,
        [lesson_id]
      );

      if (lessonResult.rows.length > 0) {
        const lesson = lessonResult.rows[0];
        educationalContext += `\n\nCurrent Lesson: ${lesson.title}\nDescription: ${lesson.description}\nModule: ${lesson.module_title}\nCourse: ${lesson.course_title}`;

        // Get linked CFR regulation if available
        if (lesson.cfr_regulation_id) {
          const regResult = await pool.query(
            `SELECT title, full_text, ai_summary FROM cfr_title21_regulations WHERE id = $1`,
            [lesson.cfr_regulation_id]
          );
          if (regResult.rows.length > 0) {
            relevantRegulations.push(regResult.rows[0]);
          }
        }

        // Get linked document if available
        if (lesson.document_id) {
          const docResult = await pool.query(
            `SELECT document_name, summary, manual_summary FROM Veeva_Doc_Chat_document_index WHERE id = $1`,
            [lesson.document_id]
          );
          if (docResult.rows.length > 0) {
            relevantDocuments.push(docResult.rows[0]);
          }
        }
      }
    }

    // Build context from relevant materials
    let materialsContext = '';
    if (relevantRegulations.length > 0) {
      materialsContext += '\n\nRelevant Regulations:\n';
      relevantRegulations.forEach(reg => {
        materialsContext += `- ${reg.title}\n`;
        if (reg.ai_summary) {
          materialsContext += `  Summary: ${reg.ai_summary.substring(0, 500)}\n`;
        }
      });
    }

    if (relevantDocuments.length > 0) {
      materialsContext += '\n\nRelevant Documents:\n';
      relevantDocuments.forEach(doc => {
        materialsContext += `- ${doc.document_name}\n`;
        if (doc.manual_summary || doc.summary) {
          materialsContext += `  Summary: ${(doc.manual_summary || doc.summary).substring(0, 500)}\n`;
        }
      });
    }

    // Build tutoring prompt
    const systemPrompt = `You are an expert GxP (Good Practice) Quality Assurance tutor specializing in regulatory compliance, particularly 21 CFR regulations and ICH guidelines. Your role is to:

1. **Educate, not just answer**: Provide explanations that help students understand concepts deeply
2. **Use Socratic method**: Guide students to discover answers through thoughtful questions when appropriate
3. **Reference regulations**: When discussing regulatory topics, cite specific CFR parts or ICH guidelines
4. **Provide examples**: Use real-world scenarios relevant to pharmaceutical/biotech quality assurance
5. **Encourage critical thinking**: Help students understand the "why" behind regulations and practices
6. **Be patient and supportive**: Learning GxP can be challenging, so be encouraging

${educationalContext}
${materialsContext}

When answering questions:
- Break down complex concepts into understandable parts
- Use analogies when helpful
- Reference the course/lesson context when relevant
- Suggest related topics or next steps for learning
- If the student seems confused, ask clarifying questions before providing a detailed answer`;

    // Build conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversation_history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000
    });

    const response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';

    // Save tutoring interaction to educational Q&A table
    try {
      // First, save to qms_chat_qa_interactions
      const qaResult = await pool.query(
        `INSERT INTO qms_chat_qa_interactions 
          (question, answer, document_ids, document_names, user_id, created_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          RETURNING id`,
        [
          message,
          response,
          relevantDocuments.map(d => d.id?.toString() || ''),
          relevantDocuments.map(d => d.document_name || ''),
          userId
        ]
      );

      const qaId = qaResult.rows[0]?.id;

      // Then link to educational Q&A table
      if (qaId) {
        await pool.query(
          `INSERT INTO gxp_educational_qa 
            (qa_interaction_id, user_id, course_id, lesson_id, context_type, is_tutoring_session)
            VALUES ($1, $2, $3, $4, $5, true)`,
          [
            qaId,
            userId,
            course_id || null,
            lesson_id || null,
            course_id || lesson_id ? (course_id ? 'course' : 'lesson') : 'general'
          ]
        );
      }
    } catch (dbError) {
      console.error('Error saving tutoring interaction:', dbError);
      // Don't fail the request if saving fails
    }

    // Update conversation history
    const updatedHistory = [
      ...conversation_history,
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    ];

    return createSuccessResponse({
      response,
      conversation_history: updatedHistory,
      context: {
        course_id: course_id || null,
        lesson_id: lesson_id || null,
        relevant_documents: relevantDocuments.map(d => ({
          id: d.id,
          name: d.document_name
        })),
        relevant_regulations: relevantRegulations.map(r => ({
          id: r.id,
          title: r.title
        }))
      }
    }, 200);
  } catch (error) {
    console.error('Error handling tutoring request:', error);
    throw error;
  }
}

