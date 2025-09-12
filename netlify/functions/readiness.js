// netlify/functions/readiness.js
import { getSessionId } from "./vault-auth.js";

function pickDisplayName(u = {}) {
  // Try common fields from Vault users API and custom profiles
  return (
    u.name || u.username || u.full_name__v || u.user_name__v ||
    u.fullName || u.first_name__v && u.last_name__v && `${u.first_name__v} ${u.last_name__v}` ||
    u.email || u.email__v || u.id || "Authenticated user"
  );
}

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

    const user = whoOk ? (who?.user || who?.data || who) : null;
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
        user,
        displayName: user ? pickDisplayName(user) : null,
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
