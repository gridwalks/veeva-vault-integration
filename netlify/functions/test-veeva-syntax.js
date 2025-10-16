import { getSessionId } from "./vault-auth.js";

export const handler = async (event) => {
  console.log('=== TEST VEEVA SYNTAX ===');
  
  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const sessionId = await getSessionId();
    
    // Test different syntax variations for searching
    const queries = [
      {
        name: "LIKE with % wildcards",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v LIKE '%QAC-P003%'"
      },
      {
        name: "LIKE with single %",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v LIKE 'QAC-P003%'"
      },
      {
        name: "CONTAINS without quotes",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v CONTAINS QAC-P003"
      },
      {
        name: "CONTAINS with double quotes",
        vql: 'SELECT id, document_number__v, name__v FROM documents WHERE document_number__v CONTAINS "QAC-P003"'
      },
      {
        name: "IN operator",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v IN ('QAC-P003')"
      },
      {
        name: "REGEXP operator",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v REGEXP 'QAC-P003'"
      },
      {
        name: "MATCH operator",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v MATCH 'QAC-P003'"
      },
      {
        name: "SEARCH operator",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v SEARCH 'QAC-P003'"
      },
      {
        name: "FIND operator",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v FIND 'QAC-P003'"
      },
      {
        name: "Simple exact match (should work)",
        vql: "SELECT id, document_number__v, name__v FROM documents WHERE document_number__v = 'QAC-P003'"
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
            "X-VaultAPI-PageSize": "5",
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
          dataLength: data.data?.length || 0,
          hasErrors: (data.errors || []).length > 0
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
    
    // Find working syntax
    const workingQueries = results.filter(r => r.responseStatus === 'SUCCESS' && r.dataLength > 0);
    const failedQueries = results.filter(r => r.responseStatus === 'FAILURE' || r.status === 'ERROR');
    
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
        summary: {
          totalQueries: results.length,
          workingQueries: workingQueries.length,
          failedQueries: failedQueries.length
        },
        workingQueries: workingQueries.map(q => ({
          name: q.name,
          vql: q.vql,
          dataLength: q.dataLength
        })),
        failedQueries: failedQueries.map(q => ({
          name: q.name,
          vql: q.vql,
          error: q.errors?.[0]?.message || q.error
        })),
        allResults: results
      })
    };
    
  } catch (error) {
    console.error('Test Veeva syntax error:', error);
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
