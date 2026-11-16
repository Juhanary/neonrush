// npm run level:report [-- <track-id>]: prints tracks bar by bar on the beat grid (see tests/report.test.ts).
import { spawnSync } from 'node:child_process';
const id = process.argv[2];
const r = spawnSync('npx', ['vitest', 'run', 'tests/report.test.ts'], { env: { ...process.env, REPORT: '1', ...(id ? { LEVEL: id } : {}) }, encoding: 'utf8' });
process.stdout.write(r.stdout.split('\n').filter((l) => /^(===|    )/.test(l)).join('\n') + '\n');
process.exit(r.status ?? 1);
