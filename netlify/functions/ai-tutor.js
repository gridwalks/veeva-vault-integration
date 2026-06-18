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

    const { message, course_id, lesson_id, conversation_history = [], socratic_mode = true } = data;

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
            `SELECT document_name, ai_summary as summary, null as manual_summary FROM qms_chat_documents WHERE id = $1`,
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

    // Get student progress for adaptive learning context
    let studentProgressContext = '';
    if (userId && lesson_id) {
      try {
        const progressResult = await pool.query(
          `SELECT status, progress_percentage, score FROM gxp_student_progress 
           WHERE user_id = $1 AND lesson_id = $2`,
          [userId, lesson_id]
        );
        if (progressResult.rows.length > 0) {
          const progress = progressResult.rows[0];
          studentProgressContext = `\n\nStudent Progress: ${progress.status}, ${progress.progress_percentage}% complete`;
          if (progress.score) {
            studentProgressContext += `, Score: ${progress.score}%`;
          }
        }
      } catch (err) {
        console.error('Error fetching student progress:', err);
      }
    }

    // Build tutoring prompt with enhanced Socratic method
    const socraticInstruction = socratic_mode 
      ? `**CRITICAL: You MUST use the Socratic method as your primary teaching approach. Start with guiding questions, not direct answers. Only provide the answer after the student has engaged with 2-3 probing questions.**`
      : `You may provide direct answers when appropriate, but still use Socratic questioning when it would help the student learn better.`;

    const systemPrompt = `You are an expert GxP (Good Practice) Quality Assurance tutor specializing in regulatory compliance, particularly 21 CFR regulations and ICH guidelines. Your role is to:

${socraticInstruction}

1. **Use Socratic method FIRST**: When a student asks a question, your default approach should be to guide them through Socratic questioning. Only provide direct answers if:
   - The student explicitly asks for a direct answer (e.g., "Just tell me the answer")
   - The question is about a simple fact that requires no reasoning (e.g., "What year was 21 CFR Part 11 published?")
   - The student has already attempted to reason through the problem and is stuck
   
   Socratic questioning approach:
   - Start with: "That's a great question! Let me help you think through this. What do you already know about [related concept]?"
   - Ask probing questions: "What do you think might happen if...?" or "How does this relate to...?" or "Why do you think that might be important?"
   - Guide discovery: "Based on what we've discussed, what conclusion can you draw?" or "What patterns do you notice?"
   - Build on their answers: "Good thinking! Now, what about...?" or "That's on the right track. How might that apply to...?"
   - Only provide the answer after they've engaged with 2-3 guiding questions, or if they're clearly stuck

2. **Educate, not just answer**: Provide explanations that help students understand concepts deeply
3. **Reference regulations**: When discussing regulatory topics, cite specific CFR parts (e.g., "21 CFR Part 11, Section 11.10") or ICH guidelines with section numbers
4. **Provide examples**: Use real-world scenarios relevant to pharmaceutical/biotech quality assurance
5. **Encourage critical thinking**: Help students understand the "why" behind regulations and practices
6. **Be patient and supportive**: Learning GxP can be challenging, so be encouraging and celebrate their thinking process
7. **Generate practice questions**: When appropriate, suggest practice questions to reinforce learning
8. **Explain in accessible language**: Break down regulatory jargon into understandable terms

${educationalContext}
${materialsContext}
${studentProgressContext}

Examples of Socratic questioning:

Student: "What is a CAPA?"
Tutor: "Great question! Before I explain, let me ask: What do you think 'CAPA' stands for? And in your experience, what happens when something goes wrong in a quality system? How do you think organizations typically address those issues?"

Student: "How do I validate a system under 21 CFR Part 11?"
Tutor: "That's an important topic! Let's think through this step by step. What do you think 'validation' means in the context of electronic systems? And what makes a system need validation under Part 11? What would happen if a system wasn't validated?"

Student: "What's the difference between a deviation and a non-conformance?"
Tutor: "Excellent question! Let's explore this together. What do you think each term means based on what you've learned? Can you think of a scenario where something might be a deviation but not a non-conformance, or vice versa?"

When answering questions:
- **ALWAYS start with a Socratic question** unless the student explicitly asks for a direct answer
- Break down complex concepts into understandable parts
- Use analogies when helpful (e.g., "Think of it like...")
- Reference the course/lesson context when relevant
- Suggest related topics or next steps for learning
- If the student seems confused, ask clarifying questions before providing a detailed answer

Response format:
- Start with a brief acknowledgment and a guiding Socratic question
- Use the Socratic method to guide discovery (ask 2-3 questions before revealing the answer)
- Provide clear, structured explanations after the student has engaged or if they're stuck
- End with a summary or key takeaway
- Optionally suggest practice questions or next learning steps`;

    // Build conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversation_history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // Call OpenAI with enhanced parameters for educational responses
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: messages,
      temperature: 0.7, // Balanced creativity and accuracy
      max_tokens: 2500, // Increased for more detailed explanations
      presence_penalty: 0.3, // Encourage diverse explanations
      frequency_penalty: 0.1 // Reduce repetition
    });

    let response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
    
    // Detect if student might benefit from practice questions
    const needsPractice = message.toLowerCase().includes('practice') || 
                         message.toLowerCase().includes('quiz') ||
                         message.toLowerCase().includes('test') ||
                         message.toLowerCase().includes('question');
    
    // Optionally generate practice questions if requested or appropriate
    let practiceQuestions = null;
    if (needsPractice || lesson_id) {
      try {
        const practicePrompt = `Based on the lesson context and the student's question, generate 2-3 practice questions that would help reinforce understanding.

Lesson context: ${educationalContext}
Student question: ${message}

Generate practice questions as a JSON object with a "questions" array. Each question should have:
- "question": the question text
- "type": "multiple_choice", "true_false", or "short_answer"
- "options": array of options (for multiple choice)
- "correct_answer": the correct answer
- "explanation": brief explanation of the answer

Return format: {"questions": [...]}`;
        
        const practiceCompletion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4',
          messages: [
            { role: 'system', content: 'You are an educational content generator. Generate practice questions in valid JSON format only. Always return a JSON object with a "questions" array.' },
            { role: 'user', content: practicePrompt }
          ],
          temperature: 0.8,
          max_tokens: 1000,
          response_format: { type: "json_object" }
        });
        
        try {
          const practiceJson = JSON.parse(practiceCompletion.choices[0]?.message?.content || '{}');
          if (practiceJson.questions && Array.isArray(practiceJson.questions) && practiceJson.questions.length > 0) {
            practiceQuestions = practiceJson.questions;
          }
        } catch (parseErr) {
          console.error('Error parsing practice questions:', parseErr);
        }
      } catch (practiceErr) {
        console.error('Error generating practice questions:', practiceErr);
        // Don't fail the main response if practice questions fail
      }
    }

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
      practice_questions: practiceQuestions,
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

