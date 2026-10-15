import { useCallback, useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_PX = 48;
const AUTO_SCROLL_MS = 700;   // how long our own smooth scroll may take

/**
 * Keeps a scroll container pinned to the bottom while the reader is there.
 * If they scroll up to read, it stops following and `atBottom` turns false
 * (show a "Jump to latest" button). `trigger` = anything that changes when content grows.
 * Scroll events caused by our own smooth scrolling are ignored, so the button never flickers.
 */
export function useAutoScroll<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T>(null);
  const following = useRef(true);
  const autoUntil = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    following.current = true;
    setAtBottom(true);
    autoUntil.current = performance.now() + (smooth ? AUTO_SCROLL_MS : 50);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (!near && performance.now() < autoUntil.current) return;     // mid auto-scroll: not the reader
    following.current = near;
    setAtBottom(near);
  }, []);

  useEffect(() => {
    if (following.current) scrollToBottom();
  }, [trigger, scrollToBottom]);

  return { ref, atBottom, onScroll, scrollToBottom };
}
