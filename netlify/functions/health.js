import { getSessionId } from "./vault-auth.js";

export const handler = async () => {
  try {
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;

    const sessionId = await getSessionId();
    const res = await fetch(`https://${domain}/api/${v}/limits`, {
      headers: { Authorization: sessionId, Accept: "application/json" },
    });

    const data = await res.json();
    const ok = res.ok && data?.responseStatus === "SUCCESS";

    return {
      statusCode: ok ? 200 : res.status || 500,
      headers: { 
        "Content-Type": "application/json",
        "X-Frame-Options": "DENY"
      },
      body: JSON.stringify({
        ok,
        message: ok ? "Vault reachable and session valid" : data?.responseMessage || "Failed",
        details: data,
      }),
    };
  } catch (err) {
    return { 
      statusCode: 500, 
      headers: { 
        "Content-Type": "application/json",
        "X-Frame-Options": "DENY"
      },
      body: JSON.stringify({ ok: false, error: err.message }) 
    };
  }
};
