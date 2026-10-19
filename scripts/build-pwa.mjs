// 靜態部署建置：PWA 版（註冊 Service Worker，可離線閱讀）。輸出到 dist-pwa。
import { spawnSync } from 'node:child_process';
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npm', ['run', 'content']);
run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build', '--outDir', 'dist-pwa', '--emptyOutDir'], { VITE_PWA: 'true' });
