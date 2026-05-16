import { useEffect, useState } from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export interface PremiumCountdownProps {
  endAt: string;
  /** Show days column when > 0 */
  showDays?: boolean;
  className?: string;
  onClick?: () => void;
}

export function PremiumCountdown({ endAt, showDays = false, className = "", onClick }: PremiumCountdownProps) {
  const calc = () => {
    const diff = Math.max(0, Math.floor((new Date(endAt).getTime() - Date.now()) / 1000));
    return {
      d: Math.floor(diff / 86400),
      h: Math.floor((diff % 86400) / 3600),
      m: Math.floor((diff % 3600) / 60),
      s: diff % 60,
      done: diff === 0,
    };
  };
  const [t, setT] = useState(calc);

  useEffect(() => {
    if (t.done) return;
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, [endAt, t.done]);

  if (t.done) {
    return (
      <p className={`text-[10px] font-bold uppercase tracking-wider text-amber-100/90 ${className}`}>
        Ending soon
      </p>
    );
  }

  const units: { label: string; value: number }[] = [];
  if (showDays && t.d > 0) units.push({ label: "Days", value: t.d });
  units.push(
    { label: "Hrs", value: t.h },
    { label: "Min", value: t.m },
    { label: "Sec", value: t.s },
  );

  const inner = (
    <div className={`kdf-countdown-glass ${className}`} aria-live="polite">
      {units.map((u, i) => (
        <span key={u.label} className="flex items-center">
          <span className="kdf-countdown-unit">
            <span className="kdf-countdown-digit">{pad2(u.value)}</span>
            <span className="kdf-countdown-label">{u.label}</span>
          </span>
          {i < units.length - 1 && <span className="kdf-countdown-sep" aria-hidden>:</span>}
        </span>
      ))}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left">
        {inner}
      </button>
    );
  }
  return inner;
}
