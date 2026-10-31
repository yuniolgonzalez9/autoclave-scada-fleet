import { useEffect, useRef } from 'react';

const MIN_DISTANCE = 60;
const MAX_DURATION = 700;
const IGNORED_TARGETS = 'input[type="range"], canvas, [contenteditable="true"], [data-no-swipe]';

function insideHorizontalScroller(node, root) {
  for (let el = node; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
  }
  return false;
}

// Horizontal finger swipe on `ref`. Handlers return false when there is nothing
// to move to, so an outer swipe area can take the gesture instead.
export function useSwipe(ref, { onSwipeLeft, onSwipeRight, enabled = true }) {
  const handlers = useRef({ onSwipeLeft, onSwipeRight });
  useEffect(() => {
    handlers.current = { onSwipeLeft, onSwipeRight };
  }, [onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    let start = null;

    const onStart = (e) => {
      start = null;
      if (e.touches.length !== 1) return;
      const target = e.target;
      if (target === document.activeElement && target.matches?.('input, textarea, select')) return;
        if (target.closest?.(IGNORED_TARGETS) || insideHorizontalScroller(target, el)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    };

    const onEnd = (e) => {
      const s = start;
      start = null;
      if (!s || e.swipeHandled) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - s.x;
      const dy = touch.clientY - s.y;
      if (Date.now() - s.time > MAX_DURATION) return;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (window.getSelection?.()?.toString()) return;
      const handler = dx < 0 ? handlers.current.onSwipeLeft : handlers.current.onSwipeRight;
      if (handler && handler() !== false) e.swipeHandled = true;
    };

    const onCancel = () => { start = null; };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [ref, enabled]);
}

export function stepThrough(list, current, delta, onChange) {
  const index = list.indexOf(current);
  const next = list[index + delta];
  if (index === -1 || next === undefined) return false;
  onChange(next);
  return true;
}
