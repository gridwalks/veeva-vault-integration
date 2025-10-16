import { getSessionId } from "./vault-auth.js";

export const handler = async (event) => {
  console.log('=== DEBUG INDEXING ===');
  console.log('Debug indexing process...', {
    timestamp: new Date().toISOString(),
    queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams)
  });

  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const q = new URL(event.rawUrl).searchParams;

    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);

    console.log('Environment check:', {
      hasDomain: !!domain,
      hasApiVersion: !!v,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      domain: domain,
      apiVersion: v
    });

    // Query Veeva for approved documents
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, subtype__v, type__v
      FROM documents
        WHERE status__v = STEADYSTATE() AND
        (subtype__v = 'Standard Operating Procedure' OR 
         subtype__v = 'Work Instruction' OR 
         subtype__v = 'Policy')
    `;

    if (nameLike) vql += ` AND name__v CONTAINS '${nameLike.replace(/'/g, "''")}' `;
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
        "X-VaultAPI-PageSize": String(limit),
      },
      body,
    });

    const data = await res.json();
    console.log('Veeva response:', {
      status: res.status,
      ok: res.ok,
      responseStatus: data.responseStatus,
      hasData: !!data.data,
      dataLength: data.data?.length || 0,
      responseDetails: data.responseDetails
    });

    if (!res.ok || data.responseStatus !== "SUCCESS") {
      console.error('Veeva query failed:', {
        status: res.status,
        statusText: res.statusText,
        responseStatus: data.responseStatus,
        responseDetails: data.responseDetails,
        errors: data.errors
      });
      return { statusCode: res.status || 500, body: JSON.stringify(data) };
    }

    const documents = data.data || [];
    console.log(`Found ${documents.length} documents to process`);

    // Return debug information
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        debug: {
          environment: {
            hasDomain: !!domain,
            hasApiVersion: !!v,
            hasOpenaiKey: !!process.env.OPENAI_API_KEY,
            hasDatabaseUrl: !!process.env.DATABASE_URL,
            domain: domain,
            apiVersion: v
          },
          veevaQuery: {
            vql: vql,
            limit: limit,
            nameLike: nameLike
          },
          veevaResponse: {
            status: res.status,
            ok: res.ok,
            responseStatus: data.responseStatus,
            totalDocuments: documents.length,
            responseDetails: data.responseDetails
          },
          documents: documents.slice(0, 3).map(doc => ({
            id: doc.id,
            number: doc.document_number__v,
            name: doc.name__v,
            status: doc.status__v,
            major: doc.major_version_number__v,
            minor: doc.minor_version_number__v,
            type: doc.type__v
          }))
        }
      }),
    };

  } catch (error) {
    console.error('=== DEBUG INDEXING ERROR ===');
    console.error('Debug indexing error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
