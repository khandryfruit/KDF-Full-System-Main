import { useCallback, useEffect, useRef, useState } from "react";

export type KdfCarouselMode = "peek" | "center";

export interface UseKdfCarouselOptions {
  itemCount: number;
  /** Enable slow auto-scroll when 2+ items */
  autoScroll?: boolean;
  autoSpeed?: number;
  resumeMs?: number;
  loopCopies?: 1 | 2 | 3;
  /** Pause auto-scroll while pointer is over the carousel */
  pauseOnHover?: boolean;
}

export function useKdfCarousel({
  itemCount,
  autoScroll = true,
  autoSpeed = 12,
  resumeMs = 4000,
  loopCopies = 3,
  pauseOnHover = true,
}: UseKdfCarouselOptions) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const setWidthRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmatic = useRef(false);
  const drag = useRef({
    pointerId: -1,
    startX: 0,
    startScroll: 0,
    /** True once movement exceeds threshold — avoids eating button/link clicks */
    dragging: false,
  });
  const touch = useRef({
    startX: 0,
    startY: 0,
    startScroll: 0,
    axis: null as "x" | "y" | null,
  });

  const DRAG_THRESHOLD_PX = 8;

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest(
      "button, a, input, textarea, select, label, [role='button'], [data-carousel-tap]",
    );
  };

  const copies = itemCount <= 1 ? 1 : loopCopies;
  const canLoop = itemCount > 1 && copies > 1;

  const pause = useCallback(() => {
    setPaused(true);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      drag.current.dragging = false;
      drag.current.pointerId = -1;
      setPaused(false);
    }, resumeMs);
  }, [resumeMs]);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || itemCount === 0) return;
    setWidthRef.current = el.scrollWidth / copies;
    if (canLoop && setWidthRef.current > 0) {
      const mid = setWidthRef.current;
      if (el.scrollLeft < mid * 0.15 || el.scrollLeft > mid * 2.15) {
        programmatic.current = true;
        el.scrollLeft = mid;
        requestAnimationFrame(() => {
          programmatic.current = false;
        });
      }
    }
  }, [itemCount, copies, canLoop]);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, itemCount]);

  const normalizeLoop = useCallback((el: HTMLDivElement) => {
    const setW = setWidthRef.current;
    if (setW <= 0 || !canLoop) return;
    if (el.scrollLeft >= setW * 1.92) {
      el.scrollLeft -= setW;
    } else if (el.scrollLeft < setW * 0.08) {
      el.scrollLeft += setW;
    }
  }, [canLoop]);

  useEffect(() => {
    const el = scrollerRef.current;
    const autoOff = paused || hoverPaused || drag.current.dragging;
    if (!el || !autoScroll || !canLoop || autoOff) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      if (setWidthRef.current > 0 && !drag.current.dragging && !paused && !hoverPaused) {
        el.scrollLeft += autoSpeed * dt;
        normalizeLoop(el);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, autoSpeed, canLoop, paused, hoverPaused, itemCount, normalizeLoop]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;

      const el = scrollerRef.current;
      if (!el) return;

      pause();
      drag.current = {
        dragging: false,
        startX: e.clientX,
        startScroll: el.scrollLeft,
        pointerId: e.pointerId,
      };
    },
    [pause],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current.pointerId !== e.pointerId) return;
    const el = scrollerRef.current;
    if (!el) return;

    const dx = e.clientX - drag.current.startX;
    if (!drag.current.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.current.dragging = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    e.preventDefault();
    el.scrollLeft = drag.current.startScroll - dx;
  }, []);

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (drag.current.pointerId !== e.pointerId) return;

      const wasDrag = drag.current.dragging;
      drag.current.pointerId = -1;
      drag.current.dragging = false;

      try {
        scrollerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      if (wasDrag) scheduleResume();
      else setPaused(false);
    },
    [scheduleResume],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const el = scrollerRef.current;
      if (!el) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (Math.abs(delta) < 1) return;
      pause();
      el.scrollLeft += delta;
      scheduleResume();
    },
    [pause, scheduleResume],
  );

  const scrollBy = useCallback(
    (dir: "left" | "right") => {
      const el = scrollerRef.current;
      if (!el) return;
      pause();
      const slide = el.querySelector<HTMLElement>(".kdf-carousel-slide--peek, .kdf-carousel-slide--center");
      const gap = 12;
      const slideW = slide?.offsetWidth ?? 0;
      const step = slideW > 0 ? slideW + gap : Math.max(220, el.clientWidth * 0.75);
      el.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
      scheduleResume();
    },
    [pause, scheduleResume],
  );

  useEffect(
    () => () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
    },
    [],
  );

  /** Lock horizontal swipes inside the scroller so the page does not shift sideways */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (isInteractiveTarget(e.target)) return;
      if (e.touches.length !== 1) return;
      pause();
      const t = e.touches[0];
      touch.current = {
        startX: t.clientX,
        startY: t.clientY,
        startScroll: el.scrollLeft,
        axis: null,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - touch.current.startX;
      const dy = t.clientY - touch.current.startY;

      if (!touch.current.axis) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        touch.current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }

      if (touch.current.axis === "y") return;

      e.preventDefault();
      el.scrollLeft = touch.current.startScroll - dx;
    };

    const onTouchEnd = () => {
      touch.current.axis = null;
      scheduleResume();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [itemCount, pause, scheduleResume]);

  const rootProps = pauseOnHover
    ? {
        onMouseEnter: () => setHoverPaused(true),
        onMouseLeave: () => setHoverPaused(false),
        onFocusCapture: () => setHoverPaused(true),
        onBlurCapture: () => setHoverPaused(false),
      }
    : {};

  return {
    scrollerRef,
    paused: paused || hoverPaused,
    measure,
    scrollBy,
    rootProps,
    scrollerClassName: canLoop ? "kdf-carousel-scroller is-auto" : "kdf-carousel-scroller is-snap",
    scrollerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onWheel,
      style: { touchAction: "pan-x" as const },
    },
  };
}
