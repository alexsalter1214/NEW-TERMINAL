import type { IncomingMessage, ServerResponse } from 'http';
import { handleHumanityProxyRequest } from '../src/server/proxyHandler.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const handled = await handleHumanityProxyRequest(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }
}
