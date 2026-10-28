/**
 * Option Chain Trading Platform - Universal Full-Stack Server Entrypoint
 * Compliant with AI Studio deployment specifications ("dev": "tsx server.ts", "start": "node server.ts").
 */

import path from 'path';
import fs from 'fs';

const distServerPath = path.join(process.cwd(), 'dist', 'server.cjs');
const isDev = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development' || !fs.existsSync(distServerPath);

if (!isDev && fs.existsSync(distServerPath)) {
  await import('./dist/server.cjs' as any);
} else {
  if (fs.existsSync(path.join(process.cwd(), 'serverApp.ts'))) {
    await import('./serverApp.ts');
  } else {
    await import('./serverApp.js');
  }
}

