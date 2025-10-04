import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  try {
    // Initialize database
    await initDatabase();
    
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const q = new URL(event.rawUrl).searchParams;

    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);

    // Query Veeva for approved documents
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, type__v
      FROM documents
        WHERE status__v = STEADYSTATE() AND
        subtype__v = 'Standard Operating Procedure'
    `;

    if (nameLike) vql += ` AND name__v CONTAINS '${nameLike.replace(/'/g, "''")}' `;
    vql += " ORDER BY name__v ";

    const sessionId = await getSessionId();
    const body = new URLSearchParams({ q: vql });

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

    const data = await res.json();
    if (!res.ok || data.responseStatus !== "SUCCESS") {
      return { statusCode: res.status || 500, body: JSON.stringify(data) };
    }

    const documents = data.data || [];
    const pool = getPool();
    const results = [];

    for (const doc of documents) {
      try {
        // Check if document already exists
        const existingDoc = await pool.query(
          'SELECT * FROM document_index WHERE veeva_document_id = $1',
          [doc.id]
        );

        const documentData = {
          veeva_document_id: doc.id,
          document_number: doc.document_number__v,
          document_name: doc.name__v,
          major_version: doc.major_version_number__v,
          minor_version: doc.minor_version_number__v,
          document_type: doc.type__v,
          status: doc.status__v,
        };

        // If document exists, check if we need to update
        if (existingDoc.rows.length > 0) {
          const existing = existingDoc.rows[0];
          const needsUpdate = 
            existing.document_name !== documentData.document_name ||
            existing.major_version !== documentData.major_version ||
            existing.minor_version !== documentData.minor_version ||
            existing.status !== documentData.status;

          if (needsUpdate) {
            // Update existing record
            await pool.query(`
              UPDATE document_index 
              SET document_name = $1, major_version = $2, minor_version = $3, 
                  status = $4, updated_at = CURRENT_TIMESTAMP
              WHERE veeva_document_id = $5
            `, [
              documentData.document_name,
              documentData.major_version,
              documentData.minor_version,
              documentData.status,
              doc.id
            ]);
            
            results.push({
              action: 'updated',
              document: documentData,
              summary: existing.summary // Keep existing summary
            });
          } else {
            results.push({
              action: 'unchanged',
              document: documentData,
              summary: existing.summary
            });
          }
        } else {
          // New document - fetch content and generate summary
          let summary = null;
          try {
            // Download document content
            const downloadRes = await fetch(`https://${domain}/api/${v}/objects/documents/${doc.id}/file`, {
              headers: { "Authorization": sessionId }
            });

            if (downloadRes.ok) {
              const documentContent = await downloadRes.text();
              
              // Generate summary using OpenAI
              const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                  {
                    role: "system",
                    content: "You are a helpful assistant that creates concise summaries of pharmaceutical documents. Focus on key procedures, requirements, and important details."
                  },
                  {
                    role: "user",
                    content: `Please provide a concise summary of this document: ${documentContent.substring(0, 4000)}`
                  }
                ],
                max_tokens: 500,
                temperature: 0.3,
              });

              summary = completion.choices[0]?.message?.content || null;
            }
          } catch (error) {
            console.error(`Error generating summary for document ${doc.id}:`, error);
            // Continue without summary
          }

          // Insert new record
          await pool.query(`
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

          results.push({
            action: 'created',
            document: documentData,
            summary: summary
          });
        }
      } catch (error) {
        console.error(`Error processing document ${doc.id}:`, error);
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

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: documents.length,
        processed: results.length,
        results: results
      }),
    };
  } catch (e) {
    console.error('Index documents error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
