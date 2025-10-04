import { getSessionId } from "./vault-auth.js";

export const handler = async (event) => {
  console.log('=== VEEVA CONNECTION TEST ===');
  console.log('Testing Veeva connection...', {
    timestamp: new Date().toISOString()
  });

  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;

    console.log('Environment check:', {
      hasDomain: !!domain,
      hasApiVersion: !!v,
      hasUsername: !!process.env.VAULT_USERNAME,
      hasPassword: !!process.env.VAULT_PASSWORD,
      domain: domain,
      apiVersion: v
    });

    // Test 1: Authentication
    console.log('Test 1: Testing authentication...');
    const sessionId = await getSessionId();
    console.log('Test 1: Authentication successful:', {
      hasSessionId: !!sessionId,
      sessionIdLength: sessionId?.length || 0
    });

    // Test 2: Simple query
    console.log('Test 2: Testing simple VQL query...');
    const simpleVql = 'SELECT id, name__v FROM documents LIMIT 5';
    const body = new URLSearchParams({ q: simpleVql });

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

    console.log('Test 2: Simple query response:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok
    });

    const data = await res.json();
    console.log('Test 2: Simple query data:', {
      responseStatus: data.responseStatus,
      hasData: !!data.data,
      dataLength: data.data?.length || 0,
      responseDetails: data.responseDetails
    });

    // Test 3: SOP query (same as indexing)
    console.log('Test 3: Testing SOP query...');
    const sopVql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, type__v
      FROM documents
        WHERE status__v = STEADYSTATE() AND
        subtype__v = 'Standard Operating Procedure'
      LIMIT 5
    `;
    
    const sopBody = new URLSearchParams({ q: sopVql });
    const sopRes = await fetch(`https://${domain}/api/${v}/query`, {
      method: "POST",
      headers: {
        "Authorization": sessionId,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-VaultAPI-DescribeQuery": "true",
        "X-VaultAPI-PageSize": "5",
      },
      body: sopBody,
    });

    console.log('Test 3: SOP query response:', {
      status: sopRes.status,
      statusText: sopRes.statusText,
      ok: sopRes.ok
    });

    const sopData = await sopRes.json();
    console.log('Test 3: SOP query data:', {
      responseStatus: sopData.responseStatus,
      hasData: !!sopData.data,
      dataLength: sopData.data?.length || 0,
      responseDetails: sopData.responseDetails,
      errors: sopData.errors
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        tests: {
          authentication: {
            success: !!sessionId,
            sessionIdLength: sessionId?.length || 0
          },
          simpleQuery: {
            success: res.ok && data.responseStatus === "SUCCESS",
            status: res.status,
            dataLength: data.data?.length || 0
          },
          sopQuery: {
            success: sopRes.ok && sopData.responseStatus === "SUCCESS",
            status: sopRes.status,
            dataLength: sopData.data?.length || 0,
            errors: sopData.errors
          }
        },
        environment: {
          domain: domain,
          apiVersion: v,
          hasUsername: !!process.env.VAULT_USERNAME,
          hasPassword: !!process.env.VAULT_PASSWORD
        }
      }),
    };

  } catch (error) {
    console.error('=== VEEVA TEST ERROR ===');
    console.error('Veeva test error:', {
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
        stack: error.stack
      }),
    };
  }
};
