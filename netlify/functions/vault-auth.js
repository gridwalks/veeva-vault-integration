export async function getSessionId() {
  const domain = process.env.VAULT_DOMAIN;
  const v = process.env.VAULT_API_VERSION;

  const body = new URLSearchParams({
    username: process.env.VAULT_USERNAME,
    password: process.env.VAULT_PASSWORD,
  });

  const res = await fetch(`https://${domain}/api/${v}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body,
  });

  const data = await res.json();
  if (!res.ok || data.responseStatus !== "SUCCESS") {
    throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  }
  return data.sessionId || data.session_id || data.sessionid || data.session;
}
