import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { ADMIN_NAV_SEARCH } from "@/config/adminNavSearch";

const OPEN_EVENT = "kdf-admin-command-palette";

export function openAdminCommandPalette() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search admin pages…" />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>No matching page.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {ADMIN_NAV_SEARCH.map((item) => (
            <CommandItem
              key={item.href + item.label}
              value={`${item.label} ${item.href} ${item.keywords ?? ""}`}
              onSelect={() => {
                setLocation(item.href);
                setOpen(false);
              }}
            >
              <span className="truncate">{item.label}</span>
              <CommandShortcut className="font-mono text-[10px] opacity-60 max-w-[140px] truncate">
                {item.href}
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
