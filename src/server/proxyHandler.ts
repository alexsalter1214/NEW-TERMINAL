import type { IncomingMessage, ServerResponse } from 'http';

// In-memory token storage (never logged or exposed)
let storedAccessToken: string | null = null;

const HUMANITY_BASE_URL = 'https://www.humanity.com/api/v2';

// Helper for fetch with 1 retry on 429
async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  let response = await fetch(url, options);
  if (response.status === 429) {
    // Wait 1.5 seconds and retry once
    await new Promise((r) => setTimeout(r, 1500));
    response = await fetch(url, options);
  }
  return response;
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export async function handleHumanityProxyRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/humanity')) {
    return false;
  }

  try {
    // 1. Connection status
    if (pathname === '/api/humanity/status' && req.method === 'GET') {
      sendJson(res, 200, {
        connected: Boolean(storedAccessToken)
      });
      return true;
    }

    // 2. Connect token
    if (pathname === '/api/humanity/connect' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const token = typeof body.token === 'string' ? body.token.trim() : '';

      if (!token) {
        sendJson(res, 400, { success: false, error: 'Access token is required' });
        return true;
      }

      // Test token with /employees
      try {
        const testRes = await fetchWithRetry(`${HUMANITY_BASE_URL}/employees?access_token=${encodeURIComponent(token)}`);
        
        if (testRes.status === 401) {
          sendJson(res, 401, { success: false, error: '401: Token invalid or expired' });
          return true;
        }
        if (testRes.status === 403) {
          sendJson(res, 403, { success: false, error: '403: Permission denied' });
          return true;
        }
        if (testRes.status === 429) {
          sendJson(res, 429, { success: false, error: '429: Rate limit exceeded. Try again shortly.' });
          return true;
        }
        if (!testRes.ok) {
          sendJson(res, testRes.status, { success: false, error: `Humanity returned error status ${testRes.status}` });
          return true;
        }

        // Successfully verified
        storedAccessToken = token;
        sendJson(res, 200, { success: true, message: 'Connected to Humanity' });
        return true;
      } catch (err: any) {
        sendJson(res, 502, { success: false, error: `Network error connecting to Humanity API: ${err.message || 'Failed to fetch'}` });
        return true;
      }
    }

    // 3. Disconnect
    if (pathname === '/api/humanity/disconnect' && req.method === 'POST') {
      storedAccessToken = null;
      sendJson(res, 200, { success: true, message: 'Disconnected' });
      return true;
    }

    // Guard: all subsequent endpoints require connected token
    if (!storedAccessToken) {
      sendJson(res, 401, { success: false, error: 'Not connected. Please connect in Settings.' });
      return true;
    }

    // 4. GET /employees
    if (pathname === '/api/humanity/employees' && req.method === 'GET') {
      const apiRes = await fetchWithRetry(`${HUMANITY_BASE_URL}/employees?access_token=${encodeURIComponent(storedAccessToken)}`);
      if (apiRes.status === 401) {
        storedAccessToken = null;
        sendJson(res, 401, { success: false, error: '401: Token invalid or expired' });
        return true;
      }
      if (apiRes.status === 403) {
        sendJson(res, 403, { success: false, error: '403: Permission denied' });
        return true;
      }
      if (apiRes.status === 429) {
        sendJson(res, 429, { success: false, error: '429: Rate limit exceeded' });
        return true;
      }

      const json = await apiRes.json();
      sendJson(res, 200, json);
      return true;
    }

    // 5. GET /shifts
    if (pathname === '/api/humanity/shifts' && req.method === 'GET') {
      const startDate = url.searchParams.get('start_date') || '';
      const endDate = url.searchParams.get('end_date') || '';

      let humanityUrl = `${HUMANITY_BASE_URL}/shifts?access_token=${encodeURIComponent(storedAccessToken)}`;
      if (startDate) humanityUrl += `&start_date=${encodeURIComponent(startDate)}`;
      if (endDate) humanityUrl += `&end_date=${encodeURIComponent(endDate)}`;

      const apiRes = await fetchWithRetry(humanityUrl);
      if (apiRes.status === 401) {
        storedAccessToken = null;
        sendJson(res, 401, { success: false, error: '401: Token invalid or expired' });
        return true;
      }
      if (apiRes.status === 403) {
        sendJson(res, 403, { success: false, error: '403: Permission denied' });
        return true;
      }
      if (apiRes.status === 429) {
        sendJson(res, 429, { success: false, error: '429: Rate limit exceeded' });
        return true;
      }

      const json = await apiRes.json();
      sendJson(res, 200, json);
      return true;
    }

    // 6. PUT /shifts/:id
    const putShiftMatch = pathname.match(/^\/api\/humanity\/shifts\/([^/]+)$/);
    if (putShiftMatch && req.method === 'PUT') {
      const shiftId = putShiftMatch[1];
      const body = await parseJsonBody(req);
      const notes = body.notes || '';

      const apiRes = await fetchWithRetry(
        `${HUMANITY_BASE_URL}/shifts/${encodeURIComponent(shiftId)}?access_token=${encodeURIComponent(storedAccessToken)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ notes })
        }
      );

      if (apiRes.status === 401) {
        storedAccessToken = null;
        sendJson(res, 401, { success: false, error: '401: Token invalid or expired' });
        return true;
      }
      if (apiRes.status === 403) {
        sendJson(res, 403, { success: false, error: '403: Permission denied' });
        return true;
      }
      if (apiRes.status === 429) {
        sendJson(res, 429, { success: false, error: '429: Rate limit exceeded' });
        return true;
      }

      if (!apiRes.ok) {
        sendJson(res, apiRes.status, { success: false, error: `Humanity update failed (HTTP ${apiRes.status})` });
        return true;
      }

      const json = await apiRes.json();
      sendJson(res, 200, { success: true, data: json });
      return true;
    }

    sendJson(res, 404, { success: false, error: 'Not found' });
    return true;
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: `Internal proxy error: ${err.message || 'Unknown'}` });
    return true;
  }
}
