import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('=== DOCUMENT INDEXING STARTED ===');
  console.log('Starting document indexing process...', {
    timestamp: new Date().toISOString(),
    queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams),
    eventMethod: event.httpMethod,
    eventPath: event.path
  });

  // Quick test response
  if (event.queryStringParameters?.test === 'true') {
    console.log('Returning test response');
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: 0,
        processed: 0,
        duration: 100,
        stats: { created: 0, updated: 0, unchanged: 0, errors: 0 },
        results: [],
        test: true
      }),
    };
  }

  try {
    // Initialize database
    console.log('Step 1: Initializing database...');
    await initDatabase();
    console.log('Step 1: Database initialization completed');
    
    console.log('Step 2: Getting environment variables...');
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const q = new URL(event.rawUrl).searchParams;

    console.log('Environment check:', {
      hasDomain: !!domain,
      hasApiVersion: !!v,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      domain: domain,
      apiVersion: v
    });

    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);
    const forceRegenerate = q.get("force") === 'true';

    console.log('Step 3: Querying Veeva for documents...', {
      nameLike,
      limit,
      forceRegenerate,
      domain,
      apiVersion: v
    });

    // Query Veeva for approved documents
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, type__v
      FROM documents
        WHERE status__v = STEADYSTATE() AND
        subtype__v = 'Standard Operating Procedure'
    `;

    if (nameLike) vql += ` AND name__v CONTAINS '${nameLike.replace(/'/g, "''")}' `;
    vql += " ORDER BY name__v ";

    console.log('VQL Query:', vql);

    console.log('Step 4: Getting Veeva session ID...');
    const sessionId = await getSessionId();
    console.log('Step 4: Session ID obtained:', {
      hasSessionId: !!sessionId,
      sessionIdLength: sessionId?.length || 0
    });

    const body = new URLSearchParams({ q: vql });
    console.log('Step 5: Making Veeva API request...', {
      url: `https://${domain}/api/${v}/query`,
      body: body.toString()
    });

    const res = await fetch(`https://${domain}/api/${v}/query`, {
      method: "POST",
      headers: {
        "Authorization": sessionId,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-VaultAPI-DescribeQuery": "true",
        "X-VaultAPI-PageSize": String(limit),
      },
      body,
    });

    console.log('Step 6: Veeva API response received:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries())
    });

    const data = await res.json();
    console.log('Step 7: Veeva API response parsed:', {
      responseStatus: data.responseStatus,
      hasData: !!data.data,
      dataLength: data.data?.length || 0,
      responseDetails: data.responseDetails,
      errors: data.errors
    });

    if (!res.ok || (data.responseStatus !== "SUCCESS" && data.responseStatus !== "WARNING")) {
      console.error('Veeva query failed:', {
        status: res.status,
        statusText: res.statusText,
        responseStatus: data.responseStatus,
        responseDetails: data.responseDetails,
        errors: data.errors
      });
      return { statusCode: res.status || 500, body: JSON.stringify(data) };
    }

    console.log('Step 8: Veeva query successful:', {
      totalDocuments: data.data?.length || 0,
      responseDetails: data.responseDetails
    });

    const documents = data.data || [];
    console.log('Step 9: Getting database pool...');
    const pool = getPool();
    console.log('Step 9: Database pool obtained:', {
      hasPool: !!pool,
      poolType: typeof pool
    });
    
    const results = [];

    console.log(`Step 10: Processing ${documents.length} documents...`);
    
    if (documents.length === 0) {
      console.log('WARNING: No documents returned from Veeva query!');
      console.log('This could mean:');
      console.log('1. No documents match the VQL criteria');
      console.log('2. Veeva query is incorrect');
      console.log('3. Veeva API permissions issue');
      console.log('4. Veeva domain/version configuration issue');
    }

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const docStartTime = Date.now();
      
      try {
        console.log(`=== PROCESSING DOCUMENT ${i + 1}/${documents.length} ===`);
        console.log(`Document: ${doc.name__v} (${doc.id})`);
        console.log(`Document details:`, {
          id: doc.id,
          number: doc.document_number__v,
          name: doc.name__v,
          status: doc.status__v,
          major: doc.major_version_number__v,
          minor: doc.minor_version_number__v,
          type: doc.type__v
        });
        
        // Check if document already exists
        console.log(`Checking if document ${doc.id} already exists in database...`);
        const existingDoc = await pool.query(
          'SELECT * FROM document_index WHERE veeva_document_id = $1',
          [doc.id]
        );
        
        console.log(`Database lookup result:`, {
          found: existingDoc.rows.length > 0,
          rowCount: existingDoc.rows.length,
          existingRecord: existingDoc.rows[0] ? {
            id: existingDoc.rows[0].id,
            document_name: existingDoc.rows[0].document_name,
            major_version: existingDoc.rows[0].major_version,
            minor_version: existingDoc.rows[0].minor_version,
            status: existingDoc.rows[0].status
          } : null
        });

        const documentData = {
          veeva_document_id: doc.id,
          document_number: doc.document_number__v,
          document_name: doc.name__v,
          major_version: doc.major_version_number__v,
          minor_version: doc.minor_version_number__v,
          document_type: doc.type__v,
          status: doc.status__v,
        };

        console.log(`Prepared document data:`, documentData);

        // If document exists, check if we need to update
        if (existingDoc.rows.length > 0) {
          console.log(`Document exists, checking if update needed...`);
          const existing = existingDoc.rows[0];
          const needsUpdate = forceRegenerate ||
            existing.document_name !== documentData.document_name ||
            existing.major_version !== documentData.major_version ||
            existing.minor_version !== documentData.minor_version ||
            existing.status !== documentData.status;

          console.log(`Update check:`, {
            needsUpdate,
            nameChanged: existing.document_name !== documentData.document_name,
            majorChanged: existing.major_version !== documentData.major_version,
            minorChanged: existing.minor_version !== documentData.minor_version,
            statusChanged: existing.status !== documentData.status
          });

          if (needsUpdate) {
            console.log(`Updating existing document: ${doc.name__v}${forceRegenerate ? ' (force regenerate enabled)' : ''}`);
            
            let updatedSummary = existing.summary;
            
            // If force regenerate is enabled, generate new summary
            if (forceRegenerate) {
              console.log(`Force regenerating summary for document: ${doc.id}`);
              try {
                // Download document content
                console.log(`Downloading content for document: ${doc.id}`);
                const downloadUrl = `https://${domain}/api/${v}/objects/documents/${doc.id}/file`;
                console.log(`Download URL: ${downloadUrl}`);
                
                const downloadRes = await fetch(downloadUrl, {
                  headers: { "Authorization": sessionId }
                });

                console.log(`Download response:`, {
                  status: downloadRes.status,
                  statusText: downloadRes.statusText,
                  ok: downloadRes.ok,
                  contentType: downloadRes.headers.get('content-type')
                });

                if (downloadRes.ok) {
                  const documentBuffer = await downloadRes.arrayBuffer();
                  const documentName = doc.name__v || `document_${doc.id}`;
                  
                  console.log(`Downloaded ${documentBuffer.byteLength} bytes for document: ${doc.id}`);
                  
                  // Extract text from document using the text extraction service
                  console.log(`Extracting text from document: ${doc.id}`);
                  const extractionStartTime = Date.now();
                  
                  try {
                    // Create FormData for text extraction
                    const formData = new FormData();
                    formData.append('file', new Blob([documentBuffer]), documentName);

                    const extractionRes = await fetch('/api/extract-text', {
                      method: 'POST',
                      body: formData
                    });

                    if (!extractionRes.ok) {
                      throw new Error(`Text extraction failed: ${extractionRes.status}`);
                    }

                    const extractionResult = await extractionRes.json();
                    const extractionDuration = Date.now() - extractionStartTime;
                    
                    console.log(`Text extraction completed in ${extractionDuration}ms for document: ${doc.id}`, {
                      extractedLength: extractionResult.textLength,
                      extractionMethod: extractionResult.extractionMethod,
                      fileType: extractionResult.fileType
                    });

                    const documentText = extractionResult.extractedText;
                    
                    if (!documentText || documentText.trim().length === 0) {
                      throw new Error('No text content extracted from document');
                    }

                    // Generate new summary using improved OpenAI prompt
                    console.log(`Generating new AI summary for document: ${doc.id}`);
                    const openaiStartTime = Date.now();
                    
                    const completion = await openai.chat.completions.create({
                      model: "gpt-3.5-turbo",
                      messages: [
                        {
                          role: "system",
                          content: `You are a pharmaceutical document analyst. Create detailed, actionable summaries that help users quickly understand:

1. **Purpose & Scope**: What is this document for and who should use it?
2. **Key Topics**: What main subjects does it cover (procedures, policies, systems, etc.)?
3. **Target Audience**: Who is this document intended for (roles, departments, users)?
4. **High-Level Process**: What are the main steps or workflow described?
5. **Important Requirements**: Any critical compliance, quality, or regulatory requirements?
6. **Key Responsibilities**: Who does what in the described processes?
7. **Timeline/Deadlines**: Any important timeframes or schedules?

Format as clear, structured bullet points. Be specific and reference actual content from the document. Avoid generic statements like "contains various information" - instead describe what specific information is included.`
                        },
                        {
                          role: "user",
                          content: `Document Title: "${doc.name__v}"
Document Type: "${doc.type__v}"
Document Number: "${doc.document_number__v}"

Please analyze this document and provide a detailed summary covering the areas above:

${documentText.substring(0, 4000)}`
                        }
                      ],
                      max_tokens: 800,
                      temperature: 0.2,
                    });

                    const openaiDuration = Date.now() - openaiStartTime;
                    updatedSummary = completion.choices[0]?.message?.content || null;
                    console.log(`New AI summary generated in ${openaiDuration}ms for document: ${doc.id}`, {
                      summaryLength: updatedSummary?.length || 0,
                      tokensUsed: completion.usage?.total_tokens || 0,
                      totalProcessingTime: extractionDuration + openaiDuration
                    });
                    
                  } catch (extractionError) {
                    console.error(`Text extraction failed for document ${doc.id} during force regenerate:`, {
                      message: extractionError.message,
                      documentId: doc.id,
                      documentName: doc.name__v
                    });
                    // Keep existing summary if extraction fails
                    console.log(`Keeping existing summary due to extraction failure`);
                  }
                } else {
                  console.error(`Failed to download document content during force regenerate: ${doc.id}`, {
                    status: downloadRes.status,
                    statusText: downloadRes.statusText
                  });
                  // Keep existing summary if download fails
                  console.log(`Keeping existing summary due to download failure`);
                }
              } catch (error) {
                console.error(`Error during force regenerate for document ${doc.id}:`, {
                  message: error.message,
                  stack: error.stack,
                  documentId: doc.id,
                  documentName: doc.name__v
                });
                // Keep existing summary if generation fails
                console.log(`Keeping existing summary due to error`);
              }
            }
            
            console.log(`Executing UPDATE query for document ${doc.id}...`);
            
            // Update existing record with new summary if force regenerate was used
            const updateResult = await pool.query(`
              UPDATE document_index 
              SET document_name = $1, major_version = $2, minor_version = $3, 
                  status = $4, summary = $5, updated_at = CURRENT_TIMESTAMP
              WHERE veeva_document_id = $6
            `, [
              documentData.document_name,
              documentData.major_version,
              documentData.minor_version,
              documentData.status,
              updatedSummary,
              doc.id
            ]);
            
            console.log(`UPDATE query result:`, {
              rowCount: updateResult.rowCount,
              command: updateResult.command
            });
            
            results.push({
              action: 'updated',
              document: documentData,
              summary: updatedSummary
            });
            console.log(`Document updated: ${doc.name__v}`);
          } else {
            console.log(`Document unchanged: ${doc.name__v}`);
            results.push({
              action: 'unchanged',
              document: documentData,
              summary: existing.summary
            });
          }
        } else {
          console.log(`Document does not exist, creating new record...`);
          // New document - fetch content and generate summary
          console.log(`Processing new document: ${doc.name__v}`);
          let summary = null;
          try {
            // Download document content
            console.log(`Downloading content for document: ${doc.id}`);
            const downloadUrl = `https://${domain}/api/${v}/objects/documents/${doc.id}/file`;
            console.log(`Download URL: ${downloadUrl}`);
            
            const downloadRes = await fetch(downloadUrl, {
              headers: { "Authorization": sessionId }
            });

            console.log(`Download response:`, {
              status: downloadRes.status,
              statusText: downloadRes.statusText,
              ok: downloadRes.ok,
              contentType: downloadRes.headers.get('content-type')
            });

            if (downloadRes.ok) {
              const documentBuffer = await downloadRes.arrayBuffer();
              const documentName = doc.name__v || `document_${doc.id}`;
              
              console.log(`Downloaded ${documentBuffer.byteLength} bytes for document: ${doc.id}`);
              
              // Extract text from document using the text extraction service
              console.log(`Extracting text from document: ${doc.id}`);
              const extractionStartTime = Date.now();
              
              try {
                // Create FormData for text extraction
                const formData = new FormData();
                formData.append('file', new Blob([documentBuffer]), documentName);

                const extractionRes = await fetch('/api/extract-text', {
                  method: 'POST',
                  body: formData
                });

                if (!extractionRes.ok) {
                  throw new Error(`Text extraction failed: ${extractionRes.status}`);
                }

                const extractionResult = await extractionRes.json();
                const extractionDuration = Date.now() - extractionStartTime;
                
                console.log(`Text extraction completed in ${extractionDuration}ms for document: ${doc.id}`, {
                  extractedLength: extractionResult.textLength,
                  extractionMethod: extractionResult.extractionMethod,
                  fileType: extractionResult.fileType
                });

                const documentText = extractionResult.extractedText;
                
                if (!documentText || documentText.trim().length === 0) {
                  throw new Error('No text content extracted from document');
                }

                // Generate summary using OpenAI
                console.log(`Generating AI summary for document: ${doc.id}`);
                const openaiStartTime = Date.now();
                
                const completion = await openai.chat.completions.create({
                  model: "gpt-3.5-turbo",
                  messages: [
                    {
                      role: "system",
                      content: `You are a pharmaceutical document analyst. Create detailed, actionable summaries that help users quickly understand:

1. **Purpose & Scope**: What is this document for and who should use it?
2. **Key Topics**: What main subjects does it cover (procedures, policies, systems, etc.)?
3. **Target Audience**: Who is this document intended for (roles, departments, users)?
4. **High-Level Process**: What are the main steps or workflow described?
5. **Important Requirements**: Any critical compliance, quality, or regulatory requirements?
6. **Key Responsibilities**: Who does what in the described processes?
7. **Timeline/Deadlines**: Any important timeframes or schedules?

Format as clear, structured bullet points. Be specific and reference actual content from the document. Avoid generic statements like "contains various information" - instead describe what specific information is included.`
                    },
                    {
                      role: "user",
                      content: `Document Title: "${doc.name__v}"
Document Type: "${doc.type__v}"
Document Number: "${doc.document_number__v}"

Please analyze this document and provide a detailed summary covering the areas above:

${documentText.substring(0, 4000)}`
                    }
                  ],
                  max_tokens: 800,
                  temperature: 0.2,
                });

                const openaiDuration = Date.now() - openaiStartTime;
                summary = completion.choices[0]?.message?.content || null;
                console.log(`AI summary generated in ${openaiDuration}ms for document: ${doc.id}`, {
                  summaryLength: summary?.length || 0,
                  tokensUsed: completion.usage?.total_tokens || 0,
                  totalProcessingTime: extractionDuration + openaiDuration
                });
                
              } catch (extractionError) {
                console.error(`Text extraction failed for document ${doc.id}:`, {
                  message: extractionError.message,
                  documentId: doc.id,
                  documentName: doc.name__v
                });
                
                // Fallback: try to use the document as plain text
                try {
                  const fallbackText = new TextDecoder().decode(documentBuffer);
                  if (fallbackText && fallbackText.trim().length > 0) {
                    console.log(`Using fallback text extraction for document: ${doc.id}`);
                    
                    const completion = await openai.chat.completions.create({
                      model: "gpt-3.5-turbo",
                      messages: [
                        {
                          role: "system",
                          content: `You are a pharmaceutical document analyst. Create detailed, actionable summaries that help users quickly understand:

1. **Purpose & Scope**: What is this document for and who should use it?
2. **Key Topics**: What main subjects does it cover (procedures, policies, systems, etc.)?
3. **Target Audience**: Who is this document intended for (roles, departments, users)?
4. **High-Level Process**: What are the main steps or workflow described?
5. **Important Requirements**: Any critical compliance, quality, or regulatory requirements?
6. **Key Responsibilities**: Who does what in the described processes?
7. **Timeline/Deadlines**: Any important timeframes or schedules?

Format as clear, structured bullet points. Be specific and reference actual content from the document. Avoid generic statements like "contains various information" - instead describe what specific information is included.`
                        },
                        {
                          role: "user",
                          content: `Document Title: "${doc.name__v}"
Document Type: "${doc.type__v}"
Document Number: "${doc.document_number__v}"

Please analyze this document and provide a detailed summary covering the areas above:

${fallbackText.substring(0, 4000)}`
                        }
                      ],
                      max_tokens: 800,
                      temperature: 0.2,
                    });

                    summary = completion.choices[0]?.message?.content || null;
                    console.log(`Fallback summary generated for document: ${doc.id}`);
                  } else {
                    throw new Error('No readable text found in document');
                  }
                } catch (fallbackError) {
                  console.error(`Fallback text extraction also failed for document ${doc.id}:`, fallbackError);
                  throw extractionError; // Re-throw original error
                }
              }
            } else {
              console.error(`Failed to download document content: ${doc.id}`, {
                status: downloadRes.status,
                statusText: downloadRes.statusText
              });
            }
          } catch (error) {
            console.error(`Error generating summary for document ${doc.id}:`, {
              message: error.message,
              stack: error.stack,
              documentId: doc.id,
              documentName: doc.name__v
            });
            // Continue without summary
          }

          // Insert new record
          console.log(`Inserting new document record: ${doc.id}`);
          console.log(`INSERT query parameters:`, [
            documentData.veeva_document_id,
            documentData.document_number,
            documentData.document_name,
            documentData.major_version,
            documentData.minor_version,
            documentData.document_type,
            documentData.status,
            summary
          ]);
          
          const insertResult = await pool.query(`
            INSERT INTO document_index 
            (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            documentData.veeva_document_id,
            documentData.document_number,
            documentData.document_name,
            documentData.major_version,
            documentData.minor_version,
            documentData.document_type,
            documentData.status,
            summary
          ]);

          console.log(`INSERT query result:`, {
            rowCount: insertResult.rowCount,
            command: insertResult.command,
            oid: insertResult.oid
          });

          results.push({
            action: 'created',
            document: documentData,
            summary: summary
          });
          console.log(`Document inserted: ${doc.name__v}`);
        }

        const docDuration = Date.now() - docStartTime;
        console.log(`=== DOCUMENT ${i + 1} COMPLETED ===`);
        console.log(`Document processed in ${docDuration}ms: ${doc.name__v}`);
        
      } catch (error) {
        const docDuration = Date.now() - docStartTime;
        console.error(`=== DOCUMENT ${i + 1} ERROR ===`);
        console.error(`Error processing document ${doc.id} after ${docDuration}ms:`, {
          message: error.message,
          stack: error.stack,
          documentId: doc.id,
          documentName: doc.name__v,
          documentNumber: doc.document_number__v,
          errorType: error.constructor.name
        });
        
        results.push({
          action: 'error',
          document: {
            veeva_document_id: doc.id,
            document_number: doc.document_number__v,
            document_name: doc.name__v,
          },
          error: error.message
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const stats = {
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      unchanged: results.filter(r => r.action === 'unchanged').length,
      errors: results.filter(r => r.action === 'error').length
    };

    console.log('=== DOCUMENT INDEXING COMPLETED ===');
    console.log('Document indexing completed:', {
      totalDuration: `${totalDuration}ms`,
      totalDocuments: documents.length,
      processed: results.length,
      stats,
      timestamp: new Date().toISOString()
    });
    
    if (documents.length === 0) {
      console.log('=== TROUBLESHOOTING INFO ===');
      console.log('No documents were processed. Check the following:');
      console.log('1. Veeva VQL query:', vql);
      console.log('2. Environment variables:', {
        domain: domain,
        apiVersion: v,
        hasUsername: !!process.env.VAULT_USERNAME,
        hasPassword: !!process.env.VAULT_PASSWORD
      });
      console.log('3. Try accessing the list-approved endpoint first to verify Veeva connection');
      console.log('4. Check Veeva permissions for the user account');
    }

    const response = {
      total: documents.length,
      processed: results.length,
      duration: totalDuration,
      stats,
      results: results
    };

    console.log('Final response being sent:', response);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (e) {
    const totalDuration = Date.now() - startTime;
    console.error('=== DOCUMENT INDEXING ERROR ===');
    console.error('Index documents error:', {
      message: e.message,
      stack: e.stack,
      duration: `${totalDuration}ms`,
      timestamp: new Date().toISOString()
    });
    console.error('=== ERROR DETAILS ===');
    console.error('Error type:', e.constructor.name);
    console.error('Error message:', e.message);
    console.error('Error stack:', e.stack);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
