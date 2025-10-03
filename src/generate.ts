/**
 * Codegen script: load service.proto and emit JS definitions and TS types.
 * Uses @grpc/proto-loader + @grpc/grpc-js dynamic loading for runtime,
 * and creates hand-written TypeScript interfaces for strongly-typed clients.
 */
import path from 'node:path';
import fs from 'node:fs';

const PROTO_FILE = path.resolve(__dirname, '..', 'service.proto');
const OUT_DIR = path.resolve(__dirname, 'generated');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(OUT_DIR);
  // We rely on runtime loading rather than static codegen.
  // Provide index.ts to export typed client constructors.
  const indexTs = `export * from './types';\n`;
  fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), indexTs);
}

main();