export function animateMoney(el, from, to, format) {
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || from === to) {
    el.textContent = format(to);
    el.dataset.numericAmount = to;
    return;
  }
  const start = performance.now();
  el.textContent = format(from);
  el.dataset.numericAmount = from;
  function tick(now) {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - start) / 300);
    const amount = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
    el.textContent = format(amount);
    el.dataset.numericAmount = amount;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
