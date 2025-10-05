import { getPool, initDatabase } from "./db.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('=== CHAT WITH DOCUMENTS STARTED ===');
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { message, documentIds, conversationHistory = [] } = body;
    
    if (!message || !message.trim()) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Message is required"
        })
      };
    }

    // Initialize database
    await initDatabase();
    const pool = getPool();

    console.log('Chat request details:', {
      message: message.substring(0, 100) + '...',
      documentIds: documentIds || 'all',
      historyLength: conversationHistory.length
    });

    // Get relevant documents based on documentIds or search for relevant ones
    let relevantDocuments = [];
    
    if (documentIds && documentIds.length > 0) {
      // Get specific documents by IDs
      const placeholders = documentIds.map((_, index) => `$${index + 1}`).join(',');
      const query = `
        SELECT veeva_document_id, document_number, document_name, 
               major_version, minor_version, document_type, status, summary, manual_summary
        FROM document_index 
        WHERE veeva_document_id IN (${placeholders})
        ORDER BY document_name
      `;
      
      const result = await pool.query(query, documentIds);
      relevantDocuments = result.rows;
      
      console.log(`Retrieved ${relevantDocuments.length} specific documents for chat`);
    } else {
      // Search for relevant documents based on the message
      const searchTerms = message.toLowerCase().split(' ').filter(term => term.length > 3);
      
      if (searchTerms.length > 0) {
        // Create a search query that looks for terms in document names, summaries, manual summaries, and types
        const searchConditions = searchTerms.map((term, index) => 
          `(document_name ILIKE $${index + 1} OR summary ILIKE $${index + 1} OR manual_summary ILIKE $${index + 1} OR document_type ILIKE $${index + 1})`
        ).join(' OR ');
        
        const searchParams = searchTerms.map(term => `%${term}%`);
        const query = `
          SELECT veeva_document_id, document_number, document_name, 
                 major_version, minor_version, document_type, status, summary, manual_summary
          FROM document_index 
          WHERE ${searchConditions}
          ORDER BY 
            CASE 
              WHEN document_name ILIKE ANY($${searchParams.length + 1}) THEN 1
              WHEN manual_summary ILIKE ANY($${searchParams.length + 2}) THEN 2
              WHEN summary ILIKE ANY($${searchParams.length + 3}) THEN 3
              ELSE 4
            END,
            document_name
          LIMIT 10
        `;
        
        const result = await pool.query(query, [...searchParams, searchParams, searchParams, searchParams]);
        relevantDocuments = result.rows;
        
        console.log(`Found ${relevantDocuments.length} relevant documents based on search terms:`, searchTerms);
      } else {
        // If no search terms, get the most recent documents
        const query = `
          SELECT veeva_document_id, document_number, document_name, 
                 major_version, minor_version, document_type, status, summary, manual_summary
          FROM document_index 
          ORDER BY updated_at DESC
          LIMIT 5
        `;
        
        const result = await pool.query(query);
        relevantDocuments = result.rows;
        
        console.log(`Retrieved ${relevantDocuments.length} recent documents for chat`);
      }
    }

    if (relevantDocuments.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: "I couldn't find any relevant documents to answer your question. Please make sure documents have been indexed first.",
          documents: [],
          conversationHistory: [...conversationHistory, { role: 'user', content: message }]
        })
      };
    }

    // Build context from relevant documents
    const documentContext = relevantDocuments.map(doc => {
      let context = `**${doc.document_name}** (${doc.document_number} v${doc.major_version}.${doc.minor_version})
Type: ${doc.document_type || 'Unknown'}
Status: ${doc.status || 'Unknown'}`;

      // Add AI summary if available
      if (doc.summary) {
        context += `\nAI Summary: ${doc.summary}`;
      }

      // Add manual summary if available
      if (doc.manual_summary) {
        context += `\nManual Summary: ${doc.manual_summary}`;
      }

      // If no summaries available
      if (!doc.summary && !doc.manual_summary) {
        context += `\nSummary: No summary available`;
      }

      context += '\n\n---';
      return context;
    }).join('\n\n');

    // Prepare the system prompt
    const systemPrompt = `You are an AI assistant that helps users understand and work with pharmaceutical documents from Veeva Vault. You have access to both AI-generated summaries and user-added manual summaries from an indexed document collection.

When answering questions:
1. Use the provided document context to give accurate, helpful answers
2. Reference specific documents by name and number when relevant
3. If the answer isn't in the provided documents, say so clearly
4. Provide actionable insights based on the document content
5. Maintain a professional, helpful tone appropriate for the pharmaceutical industry
6. If asked about processes, procedures, or compliance topics, focus on what the documents actually say
7. When both AI and manual summaries are available, consider both perspectives and note any differences
8. Prioritize manual summaries when they provide additional context or corrections to AI summaries

Document Context:
${documentContext}`;

    // Prepare conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    console.log('Sending request to OpenAI:', {
      messageCount: messages.length,
      documentCount: relevantDocuments.length,
      totalContextLength: systemPrompt.length + message.length
    });

    // Call OpenAI API
    const openaiStartTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
      max_tokens: 1000,
      temperature: 0.3,
    });

    const openaiDuration = Date.now() - openaiStartTime;
    const response = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

    console.log('OpenAI response received:', {
      responseTime: `${openaiDuration}ms`,
      responseLength: response.length,
      tokensUsed: completion.usage?.total_tokens || 0,
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0
    });

    const totalDuration = Date.now() - startTime;
    console.log('Chat with documents completed:', {
      totalDuration: `${totalDuration}ms`,
      documentsUsed: relevantDocuments.length,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response,
        documents: relevantDocuments.map(doc => ({
          id: doc.veeva_document_id,
          name: doc.document_name,
          number: doc.document_number,
          version: `${doc.major_version}.${doc.minor_version}`,
          type: doc.document_type,
          status: doc.status
        })),
        conversationHistory: [
          ...conversationHistory.slice(-9), // Keep last 9 to make room for new messages
          { role: 'user', content: message },
          { role: 'assistant', content: response }
        ],
        metadata: {
          documentsUsed: relevantDocuments.length,
          responseTime: openaiDuration,
          tokensUsed: completion.usage?.total_tokens || 0
        }
      })
    };

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('=== CHAT WITH DOCUMENTS ERROR ===');
    console.error('Error:', {
      message: error.message,
      stack: error.stack,
      duration: `${totalDuration}ms`,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to process chat request",
        message: error.message
      })
    };
  }
};
