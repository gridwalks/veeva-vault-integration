import { getSessionId } from "./vault-auth.js";

export const handler = async (event) => {
  console.log('=== TEST VEEVA QUERIES ===');
  
  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const sessionId = await getSessionId();
    
    const queries = [
      {
        name: "Simple document lookup by ID",
        vql: "SELECT id, document_number__v, name__v, status__v, subtype__v, type__v FROM documents WHERE id = '210326'"
      },
      {
        name: "Lookup by document number",
        vql: "SELECT id, document_number__v, name__v, status__v, subtype__v, type__v FROM documents WHERE document_number__v = 'QAC-P003'"
      },
      {
        name: "Lookup by document name",
        vql: "SELECT id, document_number__v, name__v, status__v, subtype__v, type__v FROM documents WHERE name__v = 'Data Integrity Policy'"
      },
      {
        name: "Lookup by document name (contains)",
        vql: "SELECT id, document_number__v, name__v, status__v, subtype__v, type__v FROM documents WHERE name__v CONTAINS 'Data Integrity'"
      },
      {
        name: "All documents with status Effective",
        vql: "SELECT id, document_number__v, name__v, status__v, subtype__v, type__v FROM documents WHERE status__v = 'Effective' LIMIT 5"
      },
      {
        name: "All Policy documents",
        vql: "SELECT id, document_number__v, name__v, status__v, subtype__v, type__v FROM documents WHERE subtype__v = 'Policy' LIMIT 5"
      },
      {
        name: "QAC-P003 with Policy subtype",
        vql: "SELECT id, document_number__v, name__v, status__v, subtype__v, type__v FROM documents WHERE document_number__v = 'QAC-P003' AND subtype__v = 'Policy'"
      },
      {
        name: "Original complex query",
        vql: "SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, subtype__v, type__v FROM documents WHERE status__v = 'Effective' AND (subtype__v = 'Standard Operating Procedure' OR subtype__v = 'Work Instruction' OR subtype__v = 'Policy') AND (name__v CONTAINS 'QAC-P003' OR document_number__v CONTAINS 'QAC-P003')"
      }
    ];
    
    const results = [];
    
    for (const query of queries) {
      console.log(`Testing query: ${query.name}`);
      
      try {
        const body = new URLSearchParams({ q: query.vql });
        
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
        
        results.push({
          name: query.name,
          vql: query.vql,
          status: res.status,
          ok: res.ok,
          responseStatus: data.responseStatus,
          dataLength: data.data?.length || 0,
          documents: data.data || [],
          errors: data.errors || [],
          responseDetails: data.responseDetails
        });
        
        console.log(`Query result: ${query.name}`, {
          status: res.status,
          responseStatus: data.responseStatus,
          dataLength: data.data?.length || 0
        });
        
      } catch (error) {
        results.push({
          name: query.name,
          vql: query.vql,
          error: error.message,
          status: 'ERROR'
        });
        console.error(`Query failed: ${query.name}`, error);
      }
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        environment: {
          domain,
          apiVersion: v,
          hasSessionId: !!sessionId
        },
        results
      })
    };
    
  } catch (error) {
    console.error('Test Veeva queries error:', error);
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
