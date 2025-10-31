import { getSessionId } from "./vault-auth.js";

export const handler = async (event) => {
  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;

    const { docId, major, minor } = Object.fromEntries(
      new URL(event.rawUrl).searchParams
    );

    if (!docId) return { 
      statusCode: 400, 
      headers: { 
        "Content-Type": "application/json", 
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests"
      },
      body: JSON.stringify({ error: "docId is required" })
    };

    const sessionId = await getSessionId();

    const path = (major && minor)
      ? `/api/${v}/objects/documents/${docId}/versions/${major}/${minor}/file`
      : `/api/${v}/objects/documents/${docId}/file`;

    const res = await fetch(`https://${domain}${path}`, {
      headers: { "Authorization": sessionId }
    });

    if (!res.ok) {
      const t = await res.text();
      return { 
        statusCode: res.status, 
        headers: { 
        "Content-Type": "application/json", 
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests"
      },
        body: t 
      };
    }

    const headers = {
      "Content-Type": res.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") || `attachment; filename="download"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests"
    };

    const arrayBuffer = await res.arrayBuffer();
    return {
      statusCode: 200,
      headers,
      body: Buffer.from(arrayBuffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { 
      statusCode: 500, 
      headers: { 
        "Content-Type": "application/json", 
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests"
      },
      body: JSON.stringify({ error: e.message })
    };
  }
};
