import { getSessionId } from "./vault-auth.js";

export const handler = async (event) => {
  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;

    const { docId, major, minor } = Object.fromEntries(
      new URL(event.rawUrl).searchParams
    );

    if (!docId) return { statusCode: 400, body: "docId is required" };

    const sessionId = await getSessionId();

    const path = (major && minor)
      ? `/api/${v}/objects/documents/${docId}/versions/${major}/${minor}/file`
      : `/api/${v}/objects/documents/${docId}/file`;

    const res = await fetch(`https://${domain}${path}`, {
      headers: { "Authorization": sessionId }
    });

    if (!res.ok) {
      const t = await res.text();
      return { statusCode: res.status, body: t };
    }

    const headers = {
      "Content-Type": res.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") || `attachment; filename="download"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    };

    const arrayBuffer = await res.arrayBuffer();
    return {
      statusCode: 200,
      headers,
      body: Buffer.from(arrayBuffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};
