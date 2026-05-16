import { useCallback, useEffect, useRef, useState } from "react";

export type KdfCarouselMode = "peek" | "center";

export interface UseKdfCarouselOptions {
  itemCount: number;
  /** Enable slow auto-scroll when 2+ items */
  autoScroll?: boolean;
  autoSpeed?: number;
  resumeMs?: number;
  loopCopies?: 2 | 3;
}

export function useKdfCarousel({
  itemCount,
  autoScroll = true,
  autoSpeed = 16,
  resumeMs = 4000,
  loopCopies = 3,
}: UseKdfCarouselOptions) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const setWidthRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmatic = useRef(false);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, pointerId: -1 });

  const canLoop = itemCount > 1;
  const copies = itemCount <= 1 ? 1 : loopCopies;

  const pause = useCallback(() => {
    setPaused(true);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      drag.current.active = false;
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

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !autoScroll || !canLoop || paused || drag.current.active) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const setW = setWidthRef.current;
      if (setW > 0 && !drag.current.active) {
        programmatic.current = true;
        el.scrollLeft += autoSpeed * dt;
        if (el.scrollLeft >= setW * 2.02) el.scrollLeft -= setW;
        else if (el.scrollLeft < setW * 0.98) el.scrollLeft += setW;
        requestAnimationFrame(() => {
          programmatic.current = false;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, autoSpeed, canLoop, paused, itemCount]);

  const onUserInteract = useCallback(() => {
    if (programmatic.current) return;
    pause();
    scheduleResume();
  }, [pause, scheduleResume]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const el = scrollerRef.current;
      if (!el) return;
      pause();
      drag.current = {
        active: true,
        startX: e.clientX,
        startScroll: el.scrollLeft,
        pointerId: e.pointerId,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [pause],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || drag.current.pointerId !== e.pointerId) return;
    const el = scrollerRef.current;
    if (!el) return;
    e.preventDefault();
    const dx = e.clientX - drag.current.startX;
    el.scrollLeft = drag.current.startScroll - dx;
  }, []);

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current.active || drag.current.pointerId !== e.pointerId) return;
      drag.current.active = false;
      try {
        scrollerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      scheduleResume();
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
      const step = Math.max(200, el.clientWidth * 0.82);
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

  return {
    scrollerRef,
    paused,
    measure,
    scrollBy,
    scrollerClassName: `kdf-carousel-scroller${paused ? " is-manual" : " is-auto"}`,
    scrollerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onTouchStart: pause,
      onTouchEnd: scheduleResume,
      onScroll: onUserInteract,
      onWheel,
      style: { touchAction: "pan-x" as const },
    },
  };
}
