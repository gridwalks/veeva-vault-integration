import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";
import { isVeevaIntegrationEnabled } from "./settings-helper.js";

export const handler = async (event) => {
  try {
    // Check if Veeva integration is enabled
    const veevaEnabled = await isVeevaIntegrationEnabled();
    if (!veevaEnabled) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Veeva integration is disabled",
          message: "Veeva Vault integration has been disabled. Please contact an administrator.",
          total: 0,
          items: [],
          pageOffset: 0,
          pageSize: 0
        })
      };
    }
    
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const q = new URL(event.rawUrl).searchParams;

    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);
    const pageOffset = Number(q.get("offset") || 0);

    
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, subtype__v, type__v
      FROM documents
        WHERE status__v = 'Effective' AND
        (subtype__v = 'Standard Operating Procedure' OR 
         subtype__v = 'Work Instruction' OR 
         subtype__v = 'Policy')
    `;

    
    
    if (nameLike) vql += ` AND name__v CONTAINS '${nameLike.replace(/'/g, "''")}' `;
    vql += " ORDER BY name__v ";

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

    // Check which documents are indexed
    let indexedDocumentIds = new Set();
    try {
      await initDatabase();
      const pool = getPool();
      const veevaIds = (data.data || []).map(d => d.id).filter(Boolean);
      
      if (veevaIds.length > 0) {
        const placeholders = veevaIds.map((_, i) => `$${i + 1}`).join(',');
        const indexedQuery = `
          SELECT veeva_document_id 
          FROM Veeva_Doc_Chat_document_index 
          WHERE veeva_document_id IN (${placeholders})
        `;
        const indexedResult = await pool.query(indexedQuery, veevaIds);
        indexedDocumentIds = new Set(indexedResult.rows.map(row => row.veeva_document_id));
      }
    } catch (dbError) {
      console.error('Error checking indexed documents:', dbError);
      // Continue without indexed status if database check fails
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: data.responseDetails?.total ?? data?.total ?? 0,
        pageOffset: data.responseDetails?.pageoffset ?? 0,
        pageSize: data.responseDetails?.pagesize ?? limit,
        items: (data.data || []).map(d => ({
          id: d.id,
          number: d.document_number__v,
          name: d.name__v,
          status: d.status__v,
          major: d.major_version_number__v,
          minor: d.minor_version_number__v,
          type: d.type__v,
          subtype: d.subtype__v,
          indexed: indexedDocumentIds.has(d.id),
        })),
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
