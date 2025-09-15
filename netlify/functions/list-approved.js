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
      SELECT id, name__v, status__v, major_version_number__v, minor_version_number__v, type__v
      FROM documents
        WHERE status__v = STEADYSTATE() AND
        subtype__v = 'Standard Operating Procedure'
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
    if (!res.ok || data.responseStatus !== "SUCCESS") {
      return { statusCode: res.status || 500, body: JSON.stringify(data) };
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
          name: d.name__v,
          status: d.status__v,
          major: d.major_version_number__v,
          minor: d.minor_version_number__v,
          type: d.type__v,
        })),
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
