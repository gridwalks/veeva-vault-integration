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

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      AUTH0_MGMT_DOMAIN: process.env.AUTH0_MGMT_DOMAIN,
      AUTH0_MGMT_CLIENT_ID: process.env.AUTH0_MGMT_CLIENT_ID,
      AUTH0_MGMT_CLIENT_SECRET: process.env.AUTH0_MGMT_CLIENT_SECRET ? 'present' : 'missing',
      VITE_AUTH0_DOMAIN: process.env.VITE_AUTH0_DOMAIN,
      VITE_AUTH0_CLIENT_ID: process.env.VITE_AUTH0_CLIENT_ID,
      allEnvKeys: Object.keys(process.env).filter(key => key.includes('AUTH0'))
    })
  };
};
