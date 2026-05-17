import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

export function GoogleSearchPreview({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");

  if (!title && !description) return null;

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Google search preview
        </p>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setMode("desktop")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${mode === "desktop" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
          >
            <Monitor className="h-3 w-3" /> Desktop
          </button>
          <button
            type="button"
            onClick={() => setMode("mobile")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${mode === "mobile" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
          >
            <Smartphone className="h-3 w-3" /> Mobile
          </button>
        </div>
      </div>
      <div className={`rounded-lg bg-white p-3 shadow-sm ring-1 ring-black/[0.04] ${mode === "mobile" ? "max-w-[360px]" : "max-w-xl"}`}>
        <p className={`font-medium text-[#1a0dab] ${mode === "mobile" ? "text-base leading-snug line-clamp-2" : "text-xl line-clamp-1"}`}>
          {title || "Page title"}
        </p>
        <p className="text-xs text-[#006621] mt-0.5 truncate">{url}</p>
        <p className={`text-[#4d5156] mt-1 ${mode === "mobile" ? "text-sm line-clamp-3" : "text-sm line-clamp-2"}`}>
          {description || "Meta description will appear here."}
        </p>
      </div>
    </div>
  );
}
