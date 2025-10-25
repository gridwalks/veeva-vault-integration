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
    // Extract JWT token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing or invalid authorization header',
          receivedHeaders: Object.keys(event.headers)
        })
      };
    }

    const token = authHeader.substring(7);
    console.log('Received token for debugging');

    const decodeJwt = (jwt) => {
      const parts = jwt.split('.');
      if (parts.length < 2) {
        throw new Error('Invalid JWT');
      }

      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const json = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(json);
    };

    let tokenClaims = {};
    let decodeError = null;
    
    try {
      tokenClaims = decodeJwt(token);
    } catch (error) {
      decodeError = error;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tokenInfo: {
          length: token.length,
          parts: token.split('.').length,
          startsWithBearer: authHeader.startsWith('Bearer '),
          headerLength: authHeader.length
        },
        tokenClaims: tokenClaims,
        decodeError: decodeError ? {
          message: decodeError.message,
          stack: decodeError.stack
        } : null,
        userIdentification: {
          sub: tokenClaims.sub,
          user_id: tokenClaims.user_id,
          oid: tokenClaims.oid,
          allClaims: Object.keys(tokenClaims),
          hasSub: !!tokenClaims.sub,
          hasUserId: !!tokenClaims.user_id,
          hasOid: !!tokenClaims.oid
        }
      })
    };

  } catch (error) {
    console.error('Error debugging token:', error);
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
