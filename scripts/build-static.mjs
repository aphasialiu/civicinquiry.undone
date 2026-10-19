// 靜態部署建置：不含搜尋面板（沒有代理就不顯示一定會失敗的按鈕）。輸出到 dist-static。
import { spawnSync } from 'node:child_process';
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npm', ['run', 'content']);
run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build', '--outDir', 'dist-static', '--emptyOutDir'], { VITE_SEARCH_ENABLED: 'false' });
