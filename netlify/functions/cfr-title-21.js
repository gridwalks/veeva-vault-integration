const API_BASE_URL = 'https://www.ecfr.gov/api';
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
// Using a more recent default date to avoid potential API issues with very old dates.
// Format: yyyy-MM-ddTHH:mm:ssZ (exactly as required by govinfo.gov API)
const DEFAULT_LAST_MODIFIED_START = '2020-01-01T00:00:00Z';

function isTitle21Package(pkg) {
  if (!pkg) {
    return false;
  }

  const titleText = (pkg.title || '').toString().toLowerCase();
  const packageId = (pkg.packageId || '').toString().toLowerCase();

  return (
    titleText.includes(`title ${TITLE_NUMBER}`) ||
    titleText.includes('food and drugs') ||
    packageId.includes(`title${TITLE_NUMBER}`)
  );
}

function getApiKey() {
  return process.env.GPO_API_KEY || process.env.API_GOVINFO_KEY;
}

function ensureApiKey() {
  return getApiKey();
}

function buildUrl(path, apiKey, params = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  
  // eCFR API doesn't require API key, but keep for backward compatibility
  if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  }

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

function buildGovInfoDetailsUrl({ packageId, granuleId = null }) {
  if (!packageId) {
    return null;
  }

  if (granuleId) {
    return `https://www.govinfo.gov/app/details/${packageId}/${granuleId}`;
  }

  return `https://www.govinfo.gov/app/details/${packageId}`;
}

function buildGovInfoPdfUrl({ packageId, granuleId = null }) {
  if (!packageId || !granuleId) {
    return null;
  }

  return `https://www.govinfo.gov/content/pkg/${packageId}/pdf/${granuleId}.pdf`;
}

function mapGranule(granule, packageId) {
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
    detailsLink:
      granule.detailsLink ||
      granule.granuleLink ||
      links.details ||
      buildGovInfoDetailsUrl({ packageId, granuleId: granule.granuleId }),
    pdfLink:
      granule.pdfLink ||
      download.pdf ||
      links.pdf ||
      buildGovInfoPdfUrl({ packageId, granuleId: granule.granuleId }),
    htmlLink: granule.htmlLink || download.html || links.html || null,
    xmlLink: granule.xmlLink || download.xml || links.xml || null,
    txtLink: granule.txtLink || download.txt || download.text || links.txt || links.text || null
  };
}

async function fetchTitlePackages(apiKey) {
  const path = `/search/v1/results`;
  let offset = 0;
  let totalCount = null;
  let rawPackageCount = 0;
  let filteredOutCount = 0;
  const packages = [];

  while (true) {
    const url = buildUrl(path, apiKey, {
      title: TITLE_NUMBER,
      per_page: PACKAGE_PAGE_SIZE,
      page: Math.floor(offset / PACKAGE_PAGE_SIZE) + 1
    });

    console.log('CFR API request URL:', url.toString());
    console.log('URL search params:', Object.fromEntries(url.searchParams.entries()));

    const data = await fetchJson(url, apiKey);
    const pagePackages = data.results || [];
    const title21Packages = pagePackages; // eCFR API already filters by title

    rawPackageCount += pagePackages.length;
    filteredOutCount += pagePackages.length - title21Packages.length;

    packages.push(
      ...title21Packages.map(pkg => ({
        packageId: pkg.document_id || pkg.id || null,
        title: pkg.hierarchy_headings ? pkg.hierarchy_headings.join(' > ') : pkg.title || null,
        collectionCode: 'CFR',
        lastModified: pkg.last_updated || pkg.lastModified || null,
        dateIssued: pkg.effective_date || pkg.dateIssued || null,
        packageLink: pkg.url || null,
        detailsLink: pkg.url || buildGovInfoDetailsUrl({ packageId: pkg.document_id }),
        granuleCount: null // eCFR API doesn't provide granule count
      }))
    );

    totalCount = data.meta?.total_count ?? totalCount ?? rawPackageCount;

    if (!pagePackages.length) {
      break;
    }

    if (totalCount !== null && rawPackageCount >= totalCount) {
      break;
    }

    offset += PACKAGE_PAGE_SIZE;
  }

  return {
    title: TITLE_NUMBER,
    totalPackages: packages.length,
    totalPackagesBeforeFilter: rawPackageCount,
    filteredOutCount,
    expectedTotal: totalCount ?? rawPackageCount,
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

  // Format as yyyy-MM-ddTHH:mm:ssZ (exactly as required by govinfo.gov API)
  // Remove milliseconds and ensure proper format
  const isoString = date.toISOString();
  return isoString.replace(/\.\d{3}Z$/, 'Z');
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
    const pageGranules = (data.granules || [])
      .map(granule => mapGranule(granule, packageId))
      .filter(Boolean);

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
  console.log('=== CFR Title 21 handler invoked (updated) ===', {
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
    const apiKey = ensureApiKey(); // Optional for eCFR API
    const packageId = event.queryStringParameters?.packageId;
    // eCFR API doesn't use lastModifiedStart parameter

    if (packageId) {
      console.log('Fetching granules for package', { packageId });
      const details = await fetchPackageGranules(apiKey, packageId);
      return createResponse(200, {
        success: true,
        retrievedAt: new Date().toISOString(),
        ...details
      });
    }

    console.log('Fetching CFR Title 21 package list');
    console.log('API Key present:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    const summary = await fetchTitlePackages(apiKey);
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
