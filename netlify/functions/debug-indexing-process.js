import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== DEBUG INDEXING PROCESS ===');
  
  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();
    
    // Get search term from query parameters
    const q = new URL(event.rawUrl).searchParams;
    const searchTerm = q.get("search") || "QAC-P003";
    
    console.log('Debugging indexing process for:', searchTerm);
    
    // Step 1: Check what Veeva returns
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, subtype__v, type__v
      FROM documents
        WHERE status__v = 'Effective' AND
        (subtype__v = 'Standard Operating Procedure' OR 
         subtype__v = 'Work Instruction' OR 
         subtype__v = 'Policy')
    `;

    if (searchTerm) vql += ` AND (name__v LIKE '%${searchTerm.replace(/'/g, "''")}%' OR document_number__v LIKE '%${searchTerm.replace(/'/g, "''")}%') `;
    vql += " ORDER BY name__v ";

    console.log('VQL Query:', vql);

    const sessionId = await getSessionId();
    const body = new URLSearchParams({ q: vql });

    const res = await fetch(`https://${domain}/api/${v}/query`, {
      method: "POST",
      headers: {
        "Authorization": sessionId,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-VaultAPI-DescribeQuery": "true",
        "X-VaultAPI-PageSize": "10",
      },
      body,
    });

    const data = await res.json();
    
    console.log('Veeva API Response:', {
      status: res.status,
      ok: res.ok,
      responseStatus: data.responseStatus,
      dataLength: data.data?.length || 0,
      errors: data.errors
    });

    // Step 2: Check what's in the database
    const dbQuery = `
      SELECT veeva_document_id, document_number, document_name, 
             major_version, minor_version, document_type, status, 
             summary, manual_summary, indexed_at
      FROM Veeva_Doc_Chat_document_index 
      WHERE document_number ILIKE $1 OR document_name ILIKE $1
      ORDER BY document_name
    `;
    
    const dbResult = await pool.query(dbQuery, [`%${searchTerm}%`]);
    
    console.log('Database query result:', {
      found: dbResult.rows.length,
      documents: dbResult.rows.map(doc => ({
        id: doc.veeva_document_id,
        number: doc.document_number,
        name: doc.document_name,
        hasSummary: !!doc.summary
      }))
    });

    // Step 3: Check if QAC-P003 specifically exists
    const specificQuery = `
      SELECT veeva_document_id, document_number, document_name, 
             major_version, minor_version, document_type, status, 
             summary, manual_summary, indexed_at
      FROM Veeva_Doc_Chat_document_index 
      WHERE document_number = $1
    `;
    
    const specificResult = await pool.query(specificQuery, [searchTerm]);
    
    console.log('Specific document lookup:', {
      searchTerm,
      found: specificResult.rows.length,
      document: specificResult.rows[0] || null
    });

    // Step 4: Check Veeva response for QAC-P003
    const veevaDocuments = data.data || [];
    const qacDocument = veevaDocuments.find(doc => 
      doc.document_number__v === searchTerm || 
      doc.name__v?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    console.log('Veeva response analysis:', {
      totalDocuments: veevaDocuments.length,
      qacDocumentFound: !!qacDocument,
      qacDocument: qacDocument ? {
        id: qacDocument.id,
        number: qacDocument.document_number__v,
        name: qacDocument.name__v,
        status: qacDocument.status__v,
        subtype: qacDocument.subtype__v,
        type: qacDocument.type__v
      } : null
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        searchTerm,
        veevaResponse: {
          status: res.status,
          ok: res.ok,
          responseStatus: data.responseStatus,
          totalDocuments: veevaDocuments.length,
          documents: veevaDocuments.map(doc => ({
            id: doc.id,
            number: doc.document_number__v,
            name: doc.name__v,
            status: doc.status__v,
            subtype: doc.subtype__v,
            type: doc.type__v
          }))
        },
        databaseResults: {
          totalFound: dbResult.rows.length,
          documents: dbResult.rows.map(doc => ({
            id: doc.veeva_document_id,
            number: doc.document_number,
            name: doc.document_name,
            hasSummary: !!doc.summary,
            indexedAt: doc.indexed_at
          }))
        },
        specificDocument: {
          searchTerm,
          found: specificResult.rows.length > 0,
          document: specificResult.rows[0] || null
        },
        analysis: {
          veevaHasDocument: !!qacDocument,
          databaseHasDocument: specificResult.rows.length > 0,
          vqlQuery: vql,
          issue: !qacDocument ? 'Document not found in Veeva response' : 
                 specificResult.rows.length === 0 ? 'Document found in Veeva but not in database' :
                 'Document exists in both Veeva and database'
        }
      })
    };
    
  } catch (error) {
    console.error('Debug indexing process error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};
