// Scroll reveal: cards rise in and their charts fill as they come into view.
// Uses a data attribute (not a class) so React re-renders never undo it.
// Skipped entirely for people who prefer reduced motion.
const TARGETS = '.card, .status, .glance, .checkin-cta';

export function startReveal(root = document) {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  document.documentElement.classList.add('reveal-ready');

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.dataset.inview = '1';
      io.unobserve(e.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });

  const watch = (node) => {
    if (!(node instanceof Element)) return;
    const list = node.matches?.(TARGETS) ? [node] : [];
    list.push(...node.querySelectorAll(TARGETS));
    for (const el of list) if (!el.dataset.inview) io.observe(el);
  };
  watch(root.body || root);
  const mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(watch); });
  mo.observe(root.body || root, { childList: true, subtree: true });
  return () => { io.disconnect(); mo.disconnect(); };
}
