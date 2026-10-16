import { useMutation } from "@tanstack/react-query";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { api } from "../../api/client";
import type { Role, UsageToday } from "../../api/types";
import { Badge, Button, ErrorState, Modal, ProgressBar, TextField, type Tone } from "../../components/ui";
import { fadeUp } from "../../motion/variants";
import { useAuth } from "./useAuth";

export const ROLE: Record<Role, [Tone, string]> = {
  admin: ["violet", "Admin"],
  analyst: ["sky", "Analyst"],
  demo: ["amber", "Demo"],
};

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** "42 / 150 AI calls today" with a bar that turns amber near the limit and red at it. */
export function UsageMeter({ usage, compact = false }: { usage: UsageToday; compact?: boolean }) {
  const share = usage.limit ? usage.calls / usage.limit : 1;
  const color = share >= 1 ? "var(--risk-high)" : share >= 0.8 ? "var(--risk-mid)" : "var(--risk-low)";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{compact ? "AI calls today" : "AI calls used today"}</span>
        <span className="tabular-nums text-strong">{usage.calls.toLocaleString()} / {usage.limit.toLocaleString()}</span>
      </div>
      <ProgressBar value={share} color={color} />
      {!compact && (
        <p className="mt-1 text-[11px] text-subtle">
          {usage.remaining > 0 ? `${usage.remaining.toLocaleString()} left · resets at midnight UTC` : "Limit reached · resets at midnight UTC"}
        </p>
      )}
    </div>
  );
}

/** Name, email, role, usage and the account actions. Used in the header menu and the mobile drawer. */
export function AccountDetails({ onAction }: { onAction?: () => void }) {
  const { me, signOut } = useAuth();
  const [tone, roleLabel] = ROLE[me.role];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amd/15 text-xs font-semibold text-amd-fg">{initials(me.name)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-strong">{me.name}</p>
          <p className="truncate text-xs text-muted">{me.email}</p>
        </div>
        <span className="ml-auto"><Badge tone={tone}>{roleLabel}</Badge></span>
      </div>
      <UsageMeter usage={me.usage} />
      <div className="flex gap-2">
        {me.role !== "demo" && (
          <Button variant="ghost" className="flex-1 py-1.5 text-xs" onClick={() => { onAction?.(); setPasswordDialog(true); }}>
            <KeyRound size={14} strokeWidth={2} /> Password
          </Button>
        )}
        <Button variant="ghost" className="flex-1 py-1.5 text-xs" onClick={() => { onAction?.(); void signOut(); }}>
          <LogOut size={14} strokeWidth={2} /> Sign out
        </Button>
      </div>
    </div>
  );
}

/** Header button with the user's initials; opens the account panel. */
export function UserMenu() {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[role=dialog]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-sm text-fg transition-colors hover:bg-hover">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-amd/15 text-[11px] font-semibold text-amd-fg">{initials(me.name)}</span>
        <span className="max-w-36 truncate">{me.name}</span>
        <ChevronDown size={14} strokeWidth={2} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" exit="exit" role="dialog" aria-label="Your account"
            className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-line bg-panel p-4 shadow-xl">
            <AccountDetails onAction={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// The password dialog lives at the app shell (<PasswordDialog />), outside the menu and the mobile drawer:
// they close when it opens, and their animated containers would break its fixed positioning.
let passwordOpen = false;
const passwordListeners = new Set<() => void>();
function setPasswordDialog(open: boolean) {
  passwordOpen = open;
  passwordListeners.forEach((l) => l());
}

export function PasswordDialog() {
  const open = useSyncExternalStore((l) => { passwordListeners.add(l); return () => passwordListeners.delete(l); }, () => passwordOpen);
  return <ChangePassword open={open} onClose={() => setPasswordDialog(false)} />;
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent(""); setNext(""); setRepeat("");
    },
  });
  const mismatch = repeat.length > 0 && repeat !== next;
  const close = () => {
    change.reset();
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mismatch && !change.isPending) change.mutate();
  };

  return (
    <Modal open={open} onClose={close} label="Change password" className="sm:max-w-sm">
      <div className="overflow-y-auto p-5">
        <h2 className="text-base font-semibold text-strong">Change password</h2>
        {change.isSuccess ? (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-soft">Done. You stay signed in here; other devices will need to sign in again.</p>
            <Button onClick={close} className="w-full">Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <TextField label="Current password" type="password" autoComplete="current-password" required autoFocus
              value={current} onChange={(e) => setCurrent(e.target.value)} />
            <TextField label="New password" type="password" autoComplete="new-password" required minLength={8}
              hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
            <TextField label="Repeat new password" type="password" autoComplete="new-password" required
              hint={mismatch ? "The passwords don't match." : undefined} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            {change.error && <ErrorState error={change.error} />}
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" onClick={close} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={mismatch || change.isPending} className="flex-1">Change password</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
