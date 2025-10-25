import { ManagementClient } from 'auth0';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Get Auth0 Management API credentials
    let domain = process.env.AUTH0_MGMT_DOMAIN || process.env.VITE_AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
    const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

    // Clean domain - remove https:// prefix and /api/v2/ suffix if present
    if (domain && domain.startsWith('https://')) {
      domain = domain.replace('https://', '');
    }
    if (domain && domain.endsWith('/api/v2/')) {
      domain = domain.replace('/api/v2/', '');
    }
    if (domain && domain.endsWith('/api/v2')) {
      domain = domain.replace('/api/v2', '');
    }
    
    // Ensure domain ends with .auth0.com or .auth0.com/ if it doesn't already
    if (domain && !domain.includes('.auth0.com')) {
      domain = domain + '.auth0.com';
    }

    const config = {
      domain: domain,
      clientId: clientId,
      clientSecret: clientSecret,
      scope: 'read:users update:users'
    };

    // Add token configuration
    if (!config.domain.startsWith('https://')) {
      config.audience = `https://${domain}/api/v2/`;
      config.tokenProvider = {
        enableCache: true,
        cacheTTLInSeconds: 3600
      };
    } else {
      config.audience = `${domain}/api/v2/`;
    }

    // Test Management Client initialization
    let managementClient = null;
    let initError = null;
    
    try {
      managementClient = new ManagementClient(config);
      console.log('Management client initialized successfully');
    } catch (error) {
      initError = error;
      console.error('Failed to initialize Management Client:', error);
    }

    // Test token retrieval
    let tokenTest = null;
    if (managementClient && !initError) {
      try {
        // Try to get a token (this will test the credentials)
        const token = await managementClient.getAccessToken();
        tokenTest = {
          success: true,
          hasToken: !!token,
          tokenLength: token ? token.length : 0
        };
      } catch (error) {
        tokenTest = {
          success: false,
          error: error.message,
          status: error.status,
          statusCode: error.statusCode
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        config: {
          domain: config.domain,
          audience: config.audience,
          clientId: clientId ? `${clientId.substring(0, 8)}...` : 'missing',
          clientSecret: clientSecret ? 'present' : 'missing',
          scope: config.scope
        },
        managementClient: {
          initialized: !!managementClient,
          initError: initError ? {
            message: initError.message,
            status: initError.status,
            statusCode: initError.statusCode
          } : null
        },
        tokenTest: tokenTest,
        environment: {
          AUTH0_MGMT_DOMAIN: process.env.AUTH0_MGMT_DOMAIN,
          VITE_AUTH0_DOMAIN: process.env.VITE_AUTH0_DOMAIN,
          AUTH0_MGMT_CLIENT_ID: process.env.AUTH0_MGMT_CLIENT_ID ? 'present' : 'missing',
          AUTH0_MGMT_CLIENT_SECRET: process.env.AUTH0_MGMT_CLIENT_SECRET ? 'present' : 'missing'
        }
      })
    };

  } catch (error) {
    console.error('Error testing Auth0 config:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};
