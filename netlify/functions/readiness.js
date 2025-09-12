import { getSessionId } from "./vault-auth.js";

export const handler = async () => {
  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;

    const sessionId = await getSessionId();

    const limitsRes = await fetch(`https://${domain}/api/${v}/limits`, {
      headers: { Authorization: sessionId, Accept: "application/json" },
    });
    const limits = await limitsRes.json();
    const limitsOk = limitsRes.ok && limits?.responseStatus === "SUCCESS";

    const whoRes = await fetch(`https://${domain}/api/${v}/objects/users/me`, {
      headers: { Authorization: sessionId, Accept: "application/json" },
    });
    const who = await whoRes.json();
    const whoOk = whoRes.ok && who?.responseStatus === "SUCCESS";

    const ok = limitsOk && whoOk;

    return {
      statusCode: ok ? 200 : 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok,
        checks: {
          limits: { ok: limitsOk, raw: limits },
          whoami: { ok: whoOk, raw: who },
        },
        user:
          whoOk
            ? (who?.user || who?.data || null)
            : null,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
