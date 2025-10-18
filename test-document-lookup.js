import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testDocumentLookup() {
  const documentId = 'a1db3cbd-2cab-4015-a08b-29fd726d178b';
  
  console.log('Testing document lookup for ID:', documentId);
  
  try {
    // Try to find document by UUID
    const uuidResult = await pool.query(`
      SELECT 
        id,
        document_name,
        original_filename,
        mime_type,
        file_size,
        blob_url,
        source_type,
        content,
        created_at
      FROM qms_chat_documents 
      WHERE id::text = $1
    `, [documentId]);
    
    console.log('UUID lookup result:', uuidResult.rows.length, 'rows');
    if (uuidResult.rows.length > 0) {
      console.log('Document found:', uuidResult.rows[0]);
    }
    
    // Try to find by document name
    const nameResult = await pool.query(`
      SELECT 
        id,
        document_name,
        original_filename,
        mime_type,
        file_size,
        blob_url,
        source_type,
        content,
        created_at
      FROM qms_chat_documents 
      WHERE document_name ILIKE $1 OR original_filename ILIKE $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [`%21 CFR Part 11%`]);
    
    console.log('Name lookup result:', nameResult.rows.length, 'rows');
    if (nameResult.rows.length > 0) {
      console.log('Documents found by name:');
      nameResult.rows.forEach((doc, index) => {
        console.log(`${index + 1}. ID: ${doc.id}, Name: ${doc.document_name}, Blob URL: ${doc.blob_url ? 'Yes' : 'No'}`);
      });
    }
    
    // Get all uploaded documents
    const allResult = await pool.query(`
      SELECT 
        id,
        document_name,
        original_filename,
        mime_type,
        file_size,
        blob_url,
        source_type,
        content,
        created_at
      FROM qms_chat_documents 
      WHERE source_type = 'upload'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log('All uploaded documents:', allResult.rows.length, 'rows');
    if (allResult.rows.length > 0) {
      console.log('Recent uploaded documents:');
      allResult.rows.forEach((doc, index) => {
        console.log(`${index + 1}. ID: ${doc.id}, Name: ${doc.document_name}, Blob URL: ${doc.blob_url ? 'Yes' : 'No'}`);
      });
    }
    
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await pool.end();
  }
}

testDocumentLookup();
