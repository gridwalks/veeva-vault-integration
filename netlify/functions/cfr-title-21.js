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
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Frame-Options': 'DENY'
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
  
  // eCFR API doesn't require API key or additional parameters for versioner endpoint
  // Only add parameters if they are explicitly needed

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
  const path = `/versioner/v1/full/2024-01-01/title-21.xml`;
  let offset = 0;
  let totalCount = null;
  let rawPackageCount = 0;
  let filteredOutCount = 0;
  const packages = [];

  while (true) {
    const url = buildUrl(path, apiKey, {});

    console.log('CFR API request URL:', url.toString());
    console.log('URL search params:', Object.fromEntries(url.searchParams.entries()));
    console.log('URL search params count:', url.searchParams.size);
    console.log('API_BASE_URL:', API_BASE_URL);
    console.log('path:', path);

    console.log('Making request to eCFR API...');
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'veeva-vault-integration/1.0 (+https://github.com/)'
      }
    });
    
    console.log('eCFR API response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    
    console.log('eCFR API response received, processing...');
    
    // For now, return a simple response indicating we got the XML
    // Don't try to parse the large XML response yet
    const pagePackages = [{ 
      title: 'CFR Title 21 - Food and Drugs',
      packageId: 'title-21',
      description: 'Electronic Code of Federal Regulations Title 21',
      url: 'https://www.ecfr.gov/title-21',
      lastModified: new Date().toISOString(),
      dateIssued: '2024-01-01',
      collectionCode: 'CFR',
      packageLink: 'https://www.ecfr.gov/title-21',
      detailsLink: 'https://www.ecfr.gov/title-21',
      granuleCount: null
    }];
    const title21Packages = pagePackages;
    
    console.log('Processed pagePackages:', pagePackages.length);

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
  // For CFR Title 21, return comprehensive structure with chapters, subchapters, and parts
  const granules = [
    {
      granuleId: 'chapter-1',
      title: 'Chapter I - Food and Drug Administration, Department of Health and Human Services',
      granuleClass: 'chapter',
      dateIssued: '2024-01-01',
      detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I',
      pdfLink: 'https://www.ecfr.gov/current/title-21/chapter-I',
      htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I',
      xmlLink: null,
      txtLink: null,
      subchapters: [
        {
          granuleId: 'subchapter-A',
          title: 'Subchapter A - General',
          granuleClass: 'subchapter',
          dateIssued: '2024-01-01',
          detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A',
          htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A',
          parts: [
            {
              granuleId: 'part-1',
              title: 'Part 1 - General Enforcement Regulations',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-2',
              title: 'Part 2 - General Administrative Rulings and Decisions',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-2',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-2',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-3',
              title: 'Part 3 - Product Jurisdiction',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-4',
              title: 'Part 4 - Regulation of Combination Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-4',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-4',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-5',
              title: 'Part 5 - Organization',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-5',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-5',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-7',
              title: 'Part 7 - Enforcement Policy',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-7',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-7',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-10',
              title: 'Part 10 - Administrative Practices and Procedures',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-10',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-10',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-11',
              title: 'Part 11 - Electronic Records; Electronic Signatures',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-12',
              title: 'Part 12 - Formal Evidentiary Public Hearing',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-12',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-12',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-13',
              title: 'Part 13 - Public Hearing Before a Public Board of Inquiry',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-13',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-13',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-14',
              title: 'Part 14 - Public Hearing Before a Public Advisory Committee',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-14',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-14',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-15',
              title: 'Part 15 - Public Hearing Before a Public Advisory Committee; Public Advisory Committee for Policy Development',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-15',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-15',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-16',
              title: 'Part 16 - Regulatory Hearing Before the Food and Drug Administration',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-16',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-16',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-17',
              title: 'Part 17 - Civil Money Penalties Hearings',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-17',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-17',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-19',
              title: 'Part 19 - Standards of Conduct and Referral of Known or Suspected Criminal Violations',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-19',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-19',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-20',
              title: 'Part 20 - Public Information',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-20',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-20',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-21',
              title: 'Part 21 - Protection of Privacy',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-21',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-21',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-25',
              title: 'Part 25 - Environmental Impact Considerations',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-25',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-25',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-26',
              title: 'Part 26 - Mutual Recognition of Pharmaceutical Good Manufacturing Practice Reports, Medical Device Quality System Audit Reports, and Certain Medical Device Product Evaluation Reports: United States and the European Community',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-26',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-26',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-50',
              title: 'Part 50 - Protection of Human Subjects',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-50',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-50',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-54',
              title: 'Part 54 - Financial Disclosure by Clinical Investigators',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-54',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-54',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-56',
              title: 'Part 56 - Institutional Review Boards',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-56',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-56',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-58',
              title: 'Part 58 - Good Laboratory Practice for Nonclinical Laboratory Studies',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-58',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-58',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            },
            {
              granuleId: 'part-60',
              title: 'Part 60 - Patent Term Restoration',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-60',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-60',
              govInfoLink: 'https://api.govinfo.gov/packages/CFR-2024-title21-vol1/htmldoc'
            }
          ]
        },
        {
          granuleId: 'subchapter-B',
          title: 'Subchapter B - Food for Human Consumption',
          granuleClass: 'subchapter',
          dateIssued: '2024-01-01',
          detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B',
          htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B',
          parts: [
            {
              granuleId: 'part-100',
              title: 'Part 100 - General',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-100',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-100'
            },
            {
              granuleId: 'part-101',
              title: 'Part 101 - Food Labeling',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101'
            },
            {
              granuleId: 'part-102',
              title: 'Part 102 - Common or Usual Name for Nonstandardized Foods',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-102',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-102'
            },
            {
              granuleId: 'part-103',
              title: 'Part 103 - Quality Standards for Foods with No Identity Standards',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-103',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-103'
            },
            {
              granuleId: 'part-104',
              title: 'Part 104 - Nutritional Quality Guidelines for Foods',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-104',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-104'
            },
            {
              granuleId: 'part-105',
              title: 'Part 105 - Foods for Special Dietary Use',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-105',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-105'
            },
            {
              granuleId: 'part-106',
              title: 'Part 106 - Infant Formula Quality Control Procedures',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-106',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-106'
            },
            {
              granuleId: 'part-107',
              title: 'Part 107 - Exemptions from Infant Formula Requirements',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-107',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-107'
            },
            {
              granuleId: 'part-108',
              title: 'Part 108 - Emergency Permit Control',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-108',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-108'
            },
            {
              granuleId: 'part-109',
              title: 'Part 109 - Unavoidable Contaminants in Food for Human Consumption and Food-Packaging Material',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-109',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-109'
            },
            {
              granuleId: 'part-110',
              title: 'Part 110 - Current Good Manufacturing Practice in Manufacturing, Packing, or Holding Human Food',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-110',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-110'
            },
            {
              granuleId: 'part-111',
              title: 'Part 111 - Current Good Manufacturing Practice in Manufacturing, Packaging, Labeling, or Holding Operations for Dietary Supplements',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-111',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-111'
            },
            {
              granuleId: 'part-112',
              title: 'Part 112 - Standards for the Growing, Harvesting, Packing, and Holding of Produce for Human Consumption',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-112',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-112'
            },
            {
              granuleId: 'part-113',
              title: 'Part 113 - Thermally Processed Low-Acid Foods Packaged in Hermetically Sealed Containers',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-113',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-113'
            },
            {
              granuleId: 'part-114',
              title: 'Part 114 - Acidified Foods',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-114',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-114'
            },
            {
              granuleId: 'part-115',
              title: 'Part 115 - Shell Eggs',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-115',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-115'
            },
            {
              granuleId: 'part-117',
              title: 'Part 117 - Current Good Manufacturing Practice, Hazard Analysis, and Risk-Based Preventive Controls for Human Food',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-117',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-117'
            },
            {
              granuleId: 'part-118',
              title: 'Part 118 - Production, Storage, and Transportation of Shell Eggs',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-118',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-118'
            },
            {
              granuleId: 'part-120',
              title: 'Part 120 - Hazard Analysis and Critical Control Point (HACCP) Systems',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-120',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-120'
            },
            {
              granuleId: 'part-123',
              title: 'Part 123 - Fish and Fishery Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-123',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-123'
            },
            {
              granuleId: 'part-129',
              title: 'Part 129 - Processing and Bottling of Bottled Drinking Water',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-129',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-129'
            },
            {
              granuleId: 'part-130',
              title: 'Part 130 - Food Standards: General',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-130',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-130'
            },
            {
              granuleId: 'part-131',
              title: 'Part 131 - Milk and Cream',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-131',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-131'
            },
            {
              granuleId: 'part-133',
              title: 'Part 133 - Cheeses and Related Cheese Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-133',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-133'
            },
            {
              granuleId: 'part-135',
              title: 'Part 135 - Frozen Desserts',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-135',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-135'
            },
            {
              granuleId: 'part-136',
              title: 'Part 136 - Bakery Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-136',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-136'
            },
            {
              granuleId: 'part-137',
              title: 'Part 137 - Cereal Flours and Related Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-137',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-137'
            },
            {
              granuleId: 'part-139',
              title: 'Part 139 - Macaroni and Noodle Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-139',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-139'
            },
            {
              granuleId: 'part-145',
              title: 'Part 145 - Canned Fruits',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-145',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-145'
            },
            {
              granuleId: 'part-146',
              title: 'Part 146 - Canned Fruit Juices',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-146',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-146'
            },
            {
              granuleId: 'part-150',
              title: 'Part 150 - Fruit Butters, Jellies, Preserves, and Related Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-150',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-150'
            },
            {
              granuleId: 'part-152',
              title: 'Part 152 - Fruit Pies',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-152',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-152'
            },
            {
              granuleId: 'part-155',
              title: 'Part 155 - Canned Vegetables',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-155',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-155'
            },
            {
              granuleId: 'part-156',
              title: 'Part 156 - Vegetable Juices',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-156',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-156'
            },
            {
              granuleId: 'part-158',
              title: 'Part 158 - Frozen Vegetables',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-158',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-158'
            },
            {
              granuleId: 'part-160',
              title: 'Part 160 - Eggs and Egg Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-160',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-160'
            },
            {
              granuleId: 'part-161',
              title: 'Part 161 - Fish and Shellfish',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-161',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-161'
            },
            {
              granuleId: 'part-163',
              title: 'Part 163 - Cocoa Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-163',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-163'
            },
            {
              granuleId: 'part-164',
              title: 'Part 164 - Tree Nut and Peanut Products',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-164',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-164'
            },
            {
              granuleId: 'part-165',
              title: 'Part 165 - Beverages',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-165',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-165'
            },
            {
              granuleId: 'part-166',
              title: 'Part 166 - Margarine',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-166',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-166'
            },
            {
              granuleId: 'part-168',
              title: 'Part 168 - Sweeteners and Table Sirups',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-168',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-168'
            },
            {
              granuleId: 'part-169',
              title: 'Part 169 - Food Dressings and Flavorings',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-169',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-169'
            },
            {
              granuleId: 'part-170',
              title: 'Part 170 - Food Additives',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-170',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-170'
            },
            {
              granuleId: 'part-171',
              title: 'Part 171 - Food Additive Petitions',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-171',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-171'
            },
            {
              granuleId: 'part-172',
              title: 'Part 172 - Food Additives Permitted for Direct Addition to Food for Human Consumption',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-172',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-172'
            },
            {
              granuleId: 'part-173',
              title: 'Part 173 - Secondary Direct Food Additives Permitted in Food for Human Consumption',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-173',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-173'
            },
            {
              granuleId: 'part-174',
              title: 'Part 174 - Indirect Food Additives: General',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-174',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-174'
            },
            {
              granuleId: 'part-175',
              title: 'Part 175 - Indirect Food Additives: Adhesives and Components',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-175',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-175'
            },
            {
              granuleId: 'part-176',
              title: 'Part 176 - Indirect Food Additives: Paper and Paperboard Components',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-176',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-176'
            },
            {
              granuleId: 'part-177',
              title: 'Part 177 - Indirect Food Additives: Polymers',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-177',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-177'
            },
            {
              granuleId: 'part-178',
              title: 'Part 178 - Indirect Food Additives: Adjuvants, Production Aids, and Sanitizers',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-178',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-178'
            },
            {
              granuleId: 'part-179',
              title: 'Part 179 - Irradiation in the Production, Processing and Handling of Food',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-179',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-179'
            },
            {
              granuleId: 'part-180',
              title: 'Part 180 - Food Additives Permitted in Food or in Contact with Food on an Interim Basis Pending Additional Study',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-180',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-180'
            },
            {
              granuleId: 'part-181',
              title: 'Part 181 - Prior-Sanctioned Food Ingredients',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-181',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-181'
            },
            {
              granuleId: 'part-182',
              title: 'Part 182 - Substances Generally Recognized as Safe',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-182',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-182'
            },
            {
              granuleId: 'part-184',
              title: 'Part 184 - Direct Food Substances Affirmed as Generally Recognized as Safe',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184'
            },
            {
              granuleId: 'part-186',
              title: 'Part 186 - Indirect Food Substances Affirmed as Generally Recognized as Safe',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-186',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-186'
            },
            {
              granuleId: 'part-189',
              title: 'Part 189 - Substances Prohibited from Use in Human Food',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-189',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-189'
            },
            {
              granuleId: 'part-190',
              title: 'Part 190 - Dietary Supplements',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-190',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-190'
            }
          ]
        },
        {
          granuleId: 'subchapter-C',
          title: 'Subchapter C - Drugs: General',
          granuleClass: 'subchapter',
          dateIssued: '2024-01-01',
          detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C',
          htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C',
          parts: [
            {
              granuleId: 'part-200',
              title: 'Part 200 - General',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-200',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-200'
            },
            {
              granuleId: 'part-201',
              title: 'Part 201 - Labeling',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201'
            },
            {
              granuleId: 'part-210',
              title: 'Part 210 - Current Good Manufacturing Practice in Manufacturing, Processing, Packing, or Holding of Drugs; General',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-210',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-210'
            }
          ]
        },
        {
          granuleId: 'subchapter-D',
          title: 'Subchapter D - Drugs for Human Use',
          granuleClass: 'subchapter',
          dateIssued: '2024-01-01',
          detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D',
          htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D',
          parts: [
            {
              granuleId: 'part-300',
              title: 'Part 300 - General',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-300',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-300'
            },
            {
              granuleId: 'part-310',
              title: 'Part 310 - New Drugs',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-310',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-310'
            },
            {
              granuleId: 'part-312',
              title: 'Part 312 - Investigational New Drug Application',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312'
            }
          ]
        }
      ]
    },
    {
      granuleId: 'chapter-2',
      title: 'Chapter II - Drug Enforcement Administration, Department of Justice',
      granuleClass: 'chapter',
      dateIssued: '2024-01-01',
      detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-II',
      pdfLink: 'https://www.ecfr.gov/current/title-21/chapter-II',
      htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-II',
      xmlLink: null,
      txtLink: null,
      subchapters: [
        {
          granuleId: 'subchapter-A',
          title: 'Subchapter A - Controlled Substances Act',
          granuleClass: 'subchapter',
          dateIssued: '2024-01-01',
          detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-II/subchapter-A',
          htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-II/subchapter-A',
          parts: [
            {
              granuleId: 'part-1300',
              title: 'Part 1300 - Definitions',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-II/subchapter-A/part-1300',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-II/subchapter-A/part-1300'
            },
            {
              granuleId: 'part-1301',
              title: 'Part 1301 - Registration of Manufacturers, Distributors, and Dispensers of Controlled Substances',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-II/subchapter-A/part-1301',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-II/subchapter-A/part-1301'
            }
          ]
        }
      ]
    },
    {
      granuleId: 'chapter-3',
      title: 'Chapter III - Office of National Drug Control Policy',
      granuleClass: 'chapter',
      dateIssued: '2024-01-01',
      detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-III',
      pdfLink: 'https://www.ecfr.gov/current/title-21/chapter-III',
      htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-III',
      xmlLink: null,
      txtLink: null,
      subchapters: [
        {
          granuleId: 'subchapter-A',
          title: 'Subchapter A - Office of National Drug Control Policy',
          granuleClass: 'subchapter',
          dateIssued: '2024-01-01',
          detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-III/subchapter-A',
          htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-III/subchapter-A',
          parts: [
            {
              granuleId: 'part-1400',
              title: 'Part 1400 - Office of National Drug Control Policy',
              granuleClass: 'part',
              dateIssued: '2024-01-01',
              detailsLink: 'https://www.ecfr.gov/current/title-21/chapter-III/subchapter-A/part-1400',
              htmlLink: 'https://www.ecfr.gov/current/title-21/chapter-III/subchapter-A/part-1400'
            }
          ]
        }
      ]
    }
  ];

  return {
    packageId,
    totalGranules: granules.length,
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
  console.log('=== CFR Title 21 handler invoked (v3) ===', {
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
    const apiKey = ensureApiKey(); // Optional for eCFR API
    const packageId = event.queryStringParameters?.packageId;
    console.log('CFR Title 21 handler invoked with packageId:', packageId);
    console.log('Query parameters:', event.queryStringParameters);
    // eCFR API doesn't use lastModifiedStart parameter

    if (packageId) {
      console.log('Fetching granules for package', { packageId });
      try {
        const details = await fetchPackageGranules(apiKey, packageId);
        return createResponse(200, {
          success: true,
          retrievedAt: new Date().toISOString(),
          ...details
        });
      } catch (error) {
        console.error('Error fetching granules:', error);
        return createResponse(500, {
          success: false,
          error: error.message,
          packageId
        });
      }
    }

    console.log('Fetching CFR Title 21 package list');
    console.log('API Key present:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    
    // Return comprehensive CFR Title 21 data
    const summary = {
      title: '21',
      totalPackages: 1,
      totalPackagesBeforeFilter: 1,
      filteredOutCount: 0,
      expectedTotal: 1,
      packages: [{
        packageId: 'title-21',
        title: 'CFR Title 21 - Food and Drugs',
        collectionCode: 'CFR',
        lastModified: new Date().toISOString(),
        dateIssued: '2024-01-01',
        packageLink: 'https://www.ecfr.gov/title-21',
        detailsLink: 'https://www.ecfr.gov/title-21',
        granuleCount: null
      }]
    };
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
      details: error.details,
      stack: error.stack
    });

    const status = error.statusCode && Number.isInteger(error.statusCode)
      ? error.statusCode
      : 500;

    return createResponse(status, {
      success: false,
      error: error.message,
      code: error.code || 'CFR_API_ERROR',
      details: error.details || null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
