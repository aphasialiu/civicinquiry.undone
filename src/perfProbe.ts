// 實機量測小工具：網址加上 ?perf=1 才啟用。只在畫面角落顯示數字、可複製，不上傳任何東西。
export function startPerfProbe(): void {
  if (!new URLSearchParams(window.location.search).has('perf')) return;
  let lcp = 0, cls = 0;
  const interactions: number[] = [];
  const box = document.createElement('div');
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', '效能量測（實機）');
  Object.assign(box.style, { position: 'fixed', right: '8px', bottom: '8px', zIndex: '99999', background: '#111', color: '#fff', font: '13px/1.4 monospace', padding: '8px', borderRadius: '8px', maxWidth: '88vw', whiteSpace: 'pre-wrap' });
  const pre = document.createElement('div');
  const btn = document.createElement('button');
  btn.textContent = '複製結果';
  Object.assign(btn.style, { marginTop: '6px', minHeight: '44px', minWidth: '44px', font: 'inherit' });
  box.append(pre, btn);

  const p95 = () => { if (!interactions.length) return 0; const s = [...interactions].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const text = () => [
    `LCP：${Math.round(lcp)} ms`,
    `CLS：${cls.toFixed(3)}`,
    `互動延遲 p95：${Math.round(p95())} ms（${interactions.length} 次，至少要操作 10 次以上才有意義）`,
    `裝置：${nav.userAgent}`,
    `螢幕：${screen.width}x${screen.height} @${window.devicePixelRatio}x；CPU 核心：${nav.hardwareConcurrency}；記憶體：${nav.deviceMemory ?? '未知'} GB`,
    `時間：${new Date().toISOString()}`,
  ].join('\n');
  const render = () => { pre.textContent = text(); };

  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = e.startTime; render(); }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ hadRecentInput: boolean; value: number }>) if (!e.hadRecentInput) cls += e.value; render(); }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration >= 16 && (e.name === 'click' || e.name === 'keydown' || e.name === 'pointerup')) interactions.push(e.duration); render(); }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  } catch { /* 瀏覽器不支援的項目會顯示 0 */ }
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text()); btn.textContent = '已複製'; } catch { btn.textContent = '無法自動複製，請截圖'; }
  });
  window.addEventListener('load', () => { document.body.append(box); render(); });
}
