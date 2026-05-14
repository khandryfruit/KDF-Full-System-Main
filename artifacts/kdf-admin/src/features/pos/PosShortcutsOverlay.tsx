import { AnimatePresence, motion } from "framer-motion";
import { Keyboard } from "lucide-react";

const ROWS: { keys: string; action: string }[] = [
  { keys: "F1", action: "Focus product search" },
  { keys: "F2", action: "Change quantity (selected row)" },
  { keys: "F3", action: "Focus customer search / attach" },
  { keys: "Shift + F3", action: "Item discount (when a row is selected)" },
  { keys: "F4", action: "Remove selected line" },
  { keys: "F5", action: "Open payment / save bill (if cart not empty)" },
  { keys: "F6", action: "Change unit" },
  { keys: "F7", action: "Hold sale — saves to Holds, clears cart, new bill #" },
  { keys: "F8", action: "Additional charges" },
  { keys: "F9", action: "Bill discount %" },
  { keys: "F10", action: "Suspend — same as F7 (hold)" },
  { keys: "F11", action: "Toggle fullscreen" },
  { keys: "F12", action: "Remarks / notes" },
  { keys: "Ctrl + Enter", action: "Open save / payment modal" },
  { keys: "Ctrl + S", action: "Save draft (also auto-saves)" },
  { keys: "Ctrl + P / ⌘ + P", action: "Save & print (same as save modal)" },
  { keys: "Ctrl + N / ⌘ + N", action: "Clear cart & reset bill" },
  { keys: "? or Shift + /", action: "This shortcuts panel (not in text fields)" },
  { keys: "⌘ + ?", action: "Shortcuts from any text field" },
  { keys: "Esc", action: "Close modals, help, or search dropdown" },
  { keys: "↑ / ↓", action: "Navigate cart or search results" },
  { keys: "Enter (search)", action: "Add highlighted product to cart" },
];

export function PosShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pos-help"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-label="Keyboard shortcuts"
            className="relative max-h-[min(88vh,720px)] w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-2xl shadow-indigo-950/50"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="flex items-start gap-3 border-b border-white/10 bg-white/5 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/30 ring-1 ring-indigo-400/40">
                <Keyboard className="h-5 w-5 text-indigo-100" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">POS shortcuts</h2>
                <p className="text-sm text-indigo-100/80">KDF NUTS Admin — press Esc to close</p>
              </div>
            </div>
            <div className="max-h-[min(60vh,520px)] overflow-y-auto px-3 py-3 sm:px-5">
              <ul className="space-y-1.5">
                {ROWS.map((row) => (
                  <li
                    key={row.keys}
                    className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5 odd:bg-white/[0.04] sm:flex-row sm:items-center sm:gap-4"
                  >
                    <kbd className="shrink-0 rounded-lg border border-white/15 bg-black/25 px-2.5 py-1 text-xs font-semibold tracking-wide text-indigo-100 shadow-inner sm:min-w-[10.5rem]">
                      {row.keys}
                    </kbd>
                    <span className="text-sm leading-snug text-slate-100/95">{row.action}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-white/10 bg-black/20 px-5 py-3 text-center text-xs text-indigo-200/70">
              Draft auto-saves locally. F7 / F10 store up to 20 held bills — use Holds to resume.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
