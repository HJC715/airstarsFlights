export function animateMoney(el, from, to, format) {
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  function tick(now) {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - start) / 400);
    el.textContent = format(
      Math.round(from + (to - from) * (1 - (1 - p) ** 3)),
    );
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
