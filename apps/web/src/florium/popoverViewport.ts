export const VIEWPORT_GUTTER = 16;
export const DROPDOWN_OFFSET = 8;
const SCROLL_DURATION_MS = 240;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function isScrollable(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  return /(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight + 1;
}

function findScrollTarget(anchorEl?: HTMLElement | null) {
  let current = anchorEl?.parentElement ?? null;
  while (current) {
    if (isScrollable(current)) return current;
    current = current.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

function animateScrollTop(target: HTMLElement | Element, deltaY: number) {
  if (Math.abs(deltaY) < 1) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isRoot = target === document.documentElement || target === document.body || target === document.scrollingElement;
  const scroller = isRoot ? (document.scrollingElement ?? document.documentElement) : (target as HTMLElement);
  const startTop = scroller.scrollTop;
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const targetTop = Math.min(Math.max(0, startTop + deltaY), maxTop);
  const distance = targetTop - startTop;

  if (Math.abs(distance) < 1) return;

  if (prefersReducedMotion) {
    scroller.scrollTop = targetTop;
    return;
  }

  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / SCROLL_DURATION_MS);
    scroller.scrollTop = startTop + distance * easeOutCubic(progress);
    if (progress < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

export function scrollDownToFullyReveal(rect: DOMRect, anchorEl?: HTMLElement | null) {
  const target = findScrollTarget(anchorEl);
  const isRoot = target === document.documentElement || target === document.body || target === document.scrollingElement;
  const viewportBottom = isRoot
    ? window.innerHeight - VIEWPORT_GUTTER
    : (target as HTMLElement).getBoundingClientRect().bottom - VIEWPORT_GUTTER;
  const bottomOverflow = rect.bottom - viewportBottom;

  if (bottomOverflow > 0) {
    animateScrollTop(target, bottomOverflow);
  }
}
