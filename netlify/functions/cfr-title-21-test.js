const API_BASE_URL = 'https://www.ecfr.gov/api';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(body)
  };
}

export const handler = async (event) => {
  console.log('=== CFR Title 21 TEST handler invoked ===', {
    method: event.httpMethod,
    path: event.path,
    query: event.queryStringParameters,
    timestamp: new Date().toISOString()
  });

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return createResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Simple test - just return a static response
    const testUrl = `${API_BASE_URL}/versioner/v1/full/2024-01-01/title-21.xml`;
    console.log('Test URL:', testUrl);
    
    return createResponse(200, {
      success: true,
      retrievedAt: new Date().toISOString(),
      title: '21',
      totalPackages: 1,
      packages: [{
        packageId: 'title-21',
        title: 'CFR Title 21 - Food and Drugs',
        collectionCode: 'CFR',
        lastModified: new Date().toISOString(),
        dateIssued: '2024-01-01',
        packageLink: 'https://www.ecfr.gov/title-21',
        detailsLink: 'https://www.ecfr.gov/title-21',
        granuleCount: null
      }],
      testUrl: testUrl
    });
  } catch (error) {
    console.error('CFR Title 21 TEST handler error', {
      message: error.message,
      stack: error.stack
    });

    return createResponse(500, {
      success: false,
      error: error.message,
      code: 'CFR_TEST_ERROR'
    });
  }
};
