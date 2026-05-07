export type Priority = "low" | "medium" | "high" | "critical";

/** SLA window in hours — order must be delivered within this time */
export const SLA_HOURS = 12;

export type PriorityInfo = {
  priority: Priority;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  elapsedMs: number;
  remainingMs: number;
  overdue: boolean;
  deadlineMs: number;
};

const PRIORITY_COLORS: Record<Priority, { color: string; bgColor: string; textColor: string; label: string }> = {
  low:      { color: "#22c55e", bgColor: "#dcfce7", textColor: "#15803d", label: "LOW" },
  medium:   { color: "#f59e0b", bgColor: "#fef3c7", textColor: "#b45309", label: "MEDIUM" },
  high:     { color: "#ef4444", bgColor: "#fee2e2", textColor: "#b91c1c", label: "HIGH" },
  critical: { color: "#dc2626", bgColor: "#7f1d1d", textColor: "#fca5a5", label: "CRITICAL" },
};

export function getPriorityInfo(assignedAt: string | null | undefined): PriorityInfo {
  const now = Date.now();

  if (!assignedAt) {
    const p = "low";
    return {
      priority: p,
      ...PRIORITY_COLORS[p],
      elapsedMs: 0,
      remainingMs: SLA_HOURS * 3_600_000,
      overdue: false,
      deadlineMs: now + SLA_HOURS * 3_600_000,
    };
  }

  const assignedMs = new Date(assignedAt).getTime();
  const deadlineMs = assignedMs + SLA_HOURS * 3_600_000;
  const elapsedMs = now - assignedMs;
  const remainingMs = deadlineMs - now;
  const overdue = remainingMs < 0;
  const elapsedHours = elapsedMs / 3_600_000;

  let priority: Priority;
  if (elapsedHours >= SLA_HOURS) priority = "critical";
  else if (elapsedHours >= 8) priority = "high";
  else if (elapsedHours >= 4) priority = "medium";
  else priority = "low";

  return {
    priority,
    ...PRIORITY_COLORS[priority],
    elapsedMs,
    remainingMs,
    overdue,
    deadlineMs,
  };
}

export function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function sortByPriority(deliveries: any[]): any[] {
  const order: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...deliveries].sort((a, b) => {
    // Skip terminal statuses — put them last
    const aTerminal = ["delivered", "failed", "returned"].includes(a.status);
    const bTerminal = ["delivered", "failed", "returned"].includes(b.status);
    if (aTerminal && !bTerminal) return 1;
    if (!aTerminal && bTerminal) return -1;
    if (aTerminal && bTerminal) return 0;

    const ap = getPriorityInfo(a.assigned_at);
    const bp = getPriorityInfo(b.assigned_at);
    const diff = order[ap.priority] - order[bp.priority];
    if (diff !== 0) return diff;
    // Same priority → sort by remaining time (less remaining first)
    return ap.remainingMs - bp.remainingMs;
  });
}
