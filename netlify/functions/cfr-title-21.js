const API_BASE_URL = 'https://api.govinfo.gov';
const TITLE_NUMBER = '21';
const PACKAGE_PAGE_SIZE = 100;
// GovInfo API enforces a maximum granule page size of 100. Larger values
// (e.g. 200) trigger a 400 response, so we stay within the documented limit.
const GRANULE_PAGE_SIZE = 100;

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// The collections endpoint requires a lastModifiedStart filter in ISO 8601 format.
// Using an early default ensures we retrieve all historical packages without
// triggering the "Use proper date format" validation error.
const DEFAULT_LAST_MODIFIED_START = '1900-01-01T00:00:00Z';

function getApiKey() {
  return process.env.GPO_API_KEY || process.env.API_GOVINFO_KEY;
}

function ensureApiKey() {
  return getApiKey();
}

function buildUrl(path, apiKey, params = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  url.searchParams.set('api_key', apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function fetchJson(url, apiKey) {
  const start = Date.now();
  const response = await fetch(url.toString(), {
    headers: {
      'X-Api-Key': apiKey,
      'User-Agent': 'veeva-vault-integration/1.0 (+https://github.com/)' // informational header for API providers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Request failed with status ${response.status}`);
    error.statusCode = response.status;
    error.details = errorText;
    error.url = url.toString();
    throw error;
  }

  const duration = Date.now() - start;
  console.log('CFR API request completed', { url: url.toString(), duration });
  return response.json();
}

function mapGranule(granule) {
  if (!granule) {
    return null;
  }

  const download = granule.download || granule.downloads || {};
  const links = granule.links || {};

  return {
    granuleId: granule.granuleId || null,
    title: granule.title || null,
    granuleClass: granule.granuleClass || null,
    dateIssued: granule.dateIssued || granule.issueDate || null,
    detailsLink: granule.detailsLink || granule.granuleLink || links.details || null,
    pdfLink: granule.pdfLink || download.pdf || links.pdf || null,
    htmlLink: granule.htmlLink || download.html || links.html || null,
    xmlLink: granule.xmlLink || download.xml || links.xml || null,
    txtLink: granule.txtLink || download.txt || download.text || links.txt || links.text || null
  };
}

async function fetchTitlePackages(apiKey, { lastModifiedStart } = {}) {
  let offset = 0;
  let totalCount = null;
  const packages = [];

  while (true) {
    const url = buildUrl(`/collections/CFR/title/${TITLE_NUMBER}`, apiKey, {
      offset,
      pageSize: PACKAGE_PAGE_SIZE,
      lastModifiedStart
    });

    const data = await fetchJson(url, apiKey);
    const pagePackages = data.packages || [];

    packages.push(
      ...pagePackages.map(pkg => ({
        packageId: pkg.packageId || null,
        title: pkg.title || null,
        collectionCode: pkg.collectionCode || pkg.collection || null,
        lastModified: pkg.lastModified || null,
        dateIssued: pkg.dateIssued || null,
        packageLink: pkg.packageLink || null,
        detailsLink: pkg.detailsLink || null,
        granuleCount: pkg.granuleCount || null
      }))
    );

    totalCount = data.count ?? totalCount ?? packages.length;

    if (!pagePackages.length) {
      break;
    }

    if (packages.length >= totalCount) {
      break;
    }

    offset += PACKAGE_PAGE_SIZE;
  }

  return {
    title: TITLE_NUMBER,
    totalPackages: packages.length,
    expectedTotal: totalCount ?? packages.length,
    packages
  };
}

function formatGovInfoTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const error = new Error('Invalid fromDate parameter. Use an ISO 8601 string such as 2024-01-01T00:00:00Z.');
    error.code = 'INVALID_FROM_DATE';
    error.statusCode = 400;
    throw error;
  }

  const pad = (num) => String(num).padStart(2, '0');

  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
  ].join('T');
}

async function fetchPackageGranules(apiKey, packageId) {
  let offset = 0;
  let totalCount = null;
  const granules = [];

  while (true) {
    const url = buildUrl(`/packages/${packageId}/granules`, apiKey, {
      offset,
      pageSize: GRANULE_PAGE_SIZE
    });

    const data = await fetchJson(url, apiKey);
    const pageGranules = (data.granules || []).map(mapGranule).filter(Boolean);

    granules.push(...pageGranules);
    totalCount = data.count ?? totalCount ?? granules.length;

    if (!pageGranules.length) {
      break;
    }

    if (granules.length >= totalCount) {
      break;
    }

    offset += GRANULE_PAGE_SIZE;
  }

  return {
    packageId,
    totalGranules: totalCount ?? granules.length,
    granulesRetrieved: granules.length,
    granules
  };
}

function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(body)
  };
}

function missingApiKeyResponse() {
  return createResponse(200, {
    success: false,
    code: 'MISSING_API_KEY',
    error: 'The GovInfo API key is not configured.',
    details: 'Set the GPO_API_KEY environment variable (or API_GOVINFO_KEY) before using the CFR Title 21 integration.'
  });
}

export const handler = async (event) => {
  console.log('=== CFR Title 21 handler invoked ===', {
    method: event.httpMethod,
    path: event.path,
    query: event.queryStringParameters
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
    const apiKey = ensureApiKey();

    if (!apiKey) {
      console.warn('CFR Title 21 request received without API key configured');
      return missingApiKeyResponse();
    }
    const packageId = event.queryStringParameters?.packageId;
    const fromDateParam = event.queryStringParameters?.fromDate || event.queryStringParameters?.lastModifiedStart;
    const lastModifiedStart = fromDateParam
      ? formatGovInfoTimestamp(fromDateParam)
      : DEFAULT_LAST_MODIFIED_START;

    if (packageId) {
      console.log('Fetching granules for package', { packageId });
      const details = await fetchPackageGranules(apiKey, packageId);
      return createResponse(200, {
        success: true,
        retrievedAt: new Date().toISOString(),
        ...details
      });
    }

    console.log('Fetching CFR Title 21 package list', { lastModifiedStart });
    const summary = await fetchTitlePackages(apiKey, { lastModifiedStart });
    return createResponse(200, {
      success: true,
      retrievedAt: new Date().toISOString(),
      ...summary
    });
  } catch (error) {
    console.error('CFR Title 21 handler error', {
      message: error.message,
      statusCode: error.statusCode,
      url: error.url,
      details: error.details
    });

    const status = error.statusCode && Number.isInteger(error.statusCode)
      ? error.statusCode
      : 500;

    return createResponse(status, {
      success: false,
      error: error.message,
      code: error.code || 'CFR_API_ERROR',
      details: error.details || null
    });
  }
};
