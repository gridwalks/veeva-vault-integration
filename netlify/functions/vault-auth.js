export async function getSessionId() {
  const startTime = Date.now();
  const domain = process.env.VAULT_DOMAIN;
  const v = process.env.VAULT_API_VERSION;

  console.log('Attempting Veeva authentication...', {
    domain,
    apiVersion: v,
    username: process.env.VAULT_USERNAME ? `${process.env.VAULT_USERNAME.substring(0, 3)}***` : 'undefined'
  });

  try {
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
    const duration = Date.now() - startTime;

    if (!res.ok || data.responseStatus !== "SUCCESS") {
      console.error('Veeva authentication failed:', {
        status: res.status,
        statusText: res.statusText,
        responseStatus: data.responseStatus,
        responseDetails: data.responseDetails,
        errors: data.errors,
        duration: `${duration}ms`,
        domain,
        apiVersion: v
      });
      throw new Error(`Auth failed: ${JSON.stringify(data)}`);
    }

    const sessionId = data.sessionId || data.session_id || data.sessionid || data.session;
    console.log(`Veeva authentication successful in ${duration}ms:`, {
      sessionId: sessionId ? `${sessionId.substring(0, 10)}***` : 'undefined',
      domain,
      apiVersion: v
    });

    return sessionId;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Veeva authentication error:', {
      message: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      domain,
      apiVersion: v
    });
    throw error;
  }
}
