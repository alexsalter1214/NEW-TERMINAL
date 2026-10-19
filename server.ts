import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleHumanityProxyRequest } from './src/server/proxyHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Route Humanity proxy requests
app.use(async (req, res, next) => {
  const handled = await handleHumanityProxyRequest(req, res);
  if (!handled) {
    next();
  }
});

// Serve static frontend build
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Coverage Credits server listening on port ${port}`);
});
