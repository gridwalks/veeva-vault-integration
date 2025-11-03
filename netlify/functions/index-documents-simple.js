import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== SIMPLE INDEXING APPROACH ===');
  
  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();
    
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const q = new URL(event.rawUrl).searchParams;
    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);
    
    console.log('Simple indexing parameters:', { nameLike, limit });
    
    // Step 1: Get all documents without complex filters - latest steady-state version per document
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, subtype__v, type__v
      FROM document_versions
      WHERE status__v = STEADYSTATE() AND
      (subtype__v = 'Standard Operating Procedure' OR 
       subtype__v = 'Work Instruction' OR 
       subtype__v = 'Policy')
      ORDER BY document_number__v, major_version_number__v DESC, minor_version_number__v DESC
    `;

    console.log('VQL Query (no search filter):', vql);

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
    
    console.log('Veeva API Response:', {
      status: res.status,
      responseStatus: data.responseStatus,
      dataLength: data.data?.length || 0
    });

    if (!res.ok || (data.responseStatus !== "SUCCESS" && data.responseStatus !== "WARNING")) {
      return {
        statusCode: res.status || 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Veeva query failed",
          details: data
        })
      };
    }

    const allDocuments = data.data || [];
    console.log(`Retrieved ${allDocuments.length} document versions from Veeva`);

    // Step 1.5: Deduplicate to get only latest steady-state version per document
    // Since we ordered by document_number__v, major DESC, minor DESC, we keep first occurrence
    const seenDocuments = new Map();
    const latestVersions = [];
    for (const doc of allDocuments) {
      const docNumber = doc.document_number__v;
      if (!seenDocuments.has(docNumber)) {
        seenDocuments.set(docNumber, true);
        latestVersions.push(doc);
      }
    }
    console.log(`Deduplicated to ${latestVersions.length} unique documents (latest steady-state versions)`);

    // Step 2: Filter in JavaScript if search term provided
    let filteredDocuments = latestVersions;
    if (nameLike) {
      filteredDocuments = latestVersions.filter(doc => {
        const docName = (doc.name__v || '').toLowerCase();
        const docNumber = (doc.document_number__v || '').toLowerCase();
        const searchTerm = nameLike.toLowerCase();
        
        return docName.includes(searchTerm) || docNumber.includes(searchTerm);
      });
      console.log(`Filtered to ${filteredDocuments.length} documents matching '${nameLike}'`);
    }

    // Step 3: Check which documents are already in database
    const existingDocs = new Set();
    if (filteredDocuments.length > 0) {
      const docIds = filteredDocuments.map(doc => doc.id);
      const placeholders = docIds.map((_, index) => `$${index + 1}`).join(',');
      const existingQuery = `
        SELECT veeva_document_id FROM Veeva_Doc_Chat_document_index 
        WHERE veeva_document_id IN (${placeholders})
      `;
      const existingResult = await pool.query(existingQuery, docIds);
      existingResult.rows.forEach(row => existingDocs.add(row.veeva_document_id));
    }

    // Step 4: Identify new documents to process
    const newDocuments = filteredDocuments.filter(doc => !existingDocs.has(doc.id));
    const existingDocuments = filteredDocuments.filter(doc => existingDocs.has(doc.id));

    console.log('Document analysis:', {
      totalFiltered: filteredDocuments.length,
      newDocuments: newDocuments.length,
      existingDocuments: existingDocuments.length
    });

    // Step 5: Process new documents (simplified - just add to database without full processing)
    const results = [];
    for (const doc of newDocuments.slice(0, 5)) { // Limit to 5 for testing
      try {
        const documentData = {
          veeva_document_id: doc.id,
          document_number: doc.document_number__v,
          document_name: doc.name__v,
          major_version: doc.major_version_number__v,
          minor_version: doc.minor_version_number__v,
          document_type: doc.type__v,
          status: doc.status__v,
        };

        const insertResult = await pool.query(`
          INSERT INTO Veeva_Doc_Chat_document_index 
          (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary, indexed_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [
          documentData.veeva_document_id,
          documentData.document_number,
          documentData.document_name,
          documentData.major_version,
          documentData.minor_version,
          documentData.document_type,
          documentData.status,
          `Basic summary for ${documentData.document_name} (${documentData.document_number})`
        ]);

        results.push({
          id: doc.id,
          document_number: doc.document_number__v,
          document_name: doc.name__v,
          status: 'added',
          database_id: insertResult.rows[0].id
        });

        console.log(`Added document: ${doc.document_number__v} - ${doc.name__v}`);
      } catch (error) {
        console.error(`Error adding document ${doc.id}:`, error);
        results.push({
          id: doc.id,
          document_number: doc.document_number__v,
          document_name: doc.name__v,
          status: 'error',
          error: error.message
        });
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        summary: {
          totalDocuments: allDocuments.length,
          filteredDocuments: filteredDocuments.length,
          newDocuments: newDocuments.length,
          existingDocuments: existingDocuments.length,
          processedDocuments: results.length
        },
        searchTerm: nameLike,
        vqlQuery: vql,
        results: results,
        filteredDocumentList: filteredDocuments.map(doc => ({
          id: doc.id,
          document_number: doc.document_number__v,
          document_name: doc.name__v,
          status: doc.status__v,
          subtype: doc.subtype__v,
          type: doc.type__v
        }))
      })
    };

  } catch (error) {
    console.error('Simple indexing error:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};
