/** Pulse "NEW" pill for sidebar / nav — set `accent` for custom brand color (hex). */
export function NavNewBadge({ accent }: { accent?: string }) {
  return (
    <span className="relative ml-auto inline-flex shrink-0 items-center justify-center overflow-visible">
      <span
        className="absolute inset-0 rounded-md opacity-35 blur-[2px] animate-ping"
        style={{ backgroundColor: accent ?? "hsl(270 90% 60%)" }}
        aria-hidden
      />
      <span
        className="relative rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-[0_0_12px_-2px_rgba(139,92,246,0.8)]"
        style={{
          background: accent
            ? accent
            : "linear-gradient(135deg, hsl(270 85% 58%) 0%, hsl(310 80% 52%) 100%)",
        }}
      >
        New
      </span>
    </span>
  );
}
