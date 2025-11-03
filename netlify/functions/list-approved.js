import { getSessionId } from "./vault-auth.js";

export const handler = async (event) => {
  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const q = new URL(event.rawUrl).searchParams;

    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);
    const pageOffset = Number(q.get("offset") || 0);

    
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, subtype__v, type__v
      FROM document_versions
        WHERE status__v = STEADYSTATE() AND
        (subtype__v = 'Standard Operating Procedure' OR 
         subtype__v = 'Work Instruction' OR 
         subtype__v = 'Policy')
    `;

    
    
    if (nameLike) vql += ` AND name__v CONTAINS '${nameLike.replace(/'/g, "''")}' `;
    vql += " ORDER BY document_number__v, major_version_number__v DESC, minor_version_number__v DESC ";

    const sessionId = await getSessionId();
    const body = new URLSearchParams({ q: vql });

    const res = await fetch(`https://${domain}/api/${v}/query`, {
      method: "POST",
      headers: {
        "Authorization": sessionId,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-VaultAPI-DescribeQuery": "true",
        "X-VaultAPI-PageOffset": String(pageOffset),
        "X-VaultAPI-PageSize": String(limit),
      },
      body,
    });

    const data = await res.json();
    if (!res.ok || (data.responseStatus !== "SUCCESS" && data.responseStatus !== "WARNING")) {
      return { statusCode: res.status || 500, body: JSON.stringify(data) };
    }

    // Process results to get only the latest steady-state version per document
    // Since we ordered by document_number__v, major DESC, minor DESC, we can deduplicate
    const seenDocuments = new Map();
    const allVersions = (data.data || []).map(d => ({
      id: d.id,
      number: d.document_number__v,
      name: d.name__v,
      status: d.status__v,
      major: d.major_version_number__v,
      minor: d.minor_version_number__v,
      type: d.type__v,
      subtype: d.subtype__v,
    }));

    // Keep only the latest version of each document (first occurrence due to ordering)
    const latestVersions = [];
    for (const doc of allVersions) {
      if (!seenDocuments.has(doc.number)) {
        seenDocuments.set(doc.number, true);
        latestVersions.push(doc);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: latestVersions.length,
        pageOffset: data.responseDetails?.pageoffset ?? 0,
        pageSize: data.responseDetails?.pagesize ?? limit,
        items: latestVersions,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
