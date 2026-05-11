import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-PK", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-PK", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    trial: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    suspended: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    cancelled: "bg-red-500/20 text-red-400 border border-red-500/30",
    pending: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
  };
  return map[status] ?? "bg-slate-500/20 text-slate-400 border border-slate-500/30";
}

export function tierColor(tier: string): string {
  const map: Record<string, string> = {
    starter: "bg-slate-500/20 text-slate-300",
    business: "bg-indigo-500/20 text-indigo-300",
    enterprise: "bg-amber-500/20 text-amber-300",
    custom: "bg-purple-500/20 text-purple-300",
  };
  return map[tier] ?? "bg-slate-500/20 text-slate-300";
}

export function industryIcon(industry: string): string {
  const map: Record<string, string> = {
    grocery: "🛒", fashion: "👗", electronics: "📱", pharmacy: "💊",
    food: "🍔", beauty: "💄", sports: "⚽", furniture: "🛋️", books: "📚", other: "🏪",
  };
  return map[industry] ?? "🏪";
}
