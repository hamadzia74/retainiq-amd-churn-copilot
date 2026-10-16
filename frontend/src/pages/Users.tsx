import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { queryKeys, usersQuery } from "../api/queries";
import type { NewUser, Role, UserRow, UserUpdate } from "../api/types";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Modal, PageHeader, SelectField, TextField } from "../components/ui";
import { initials, ROLE, UsageMeter, useAuth } from "../features/auth";
import { ago, generatePassword } from "../lib/format";
import { rowVariants } from "../motion/variants";

/** Admins only: invite people, set roles, deactivate accounts, reset passwords, see today's AI usage. */
export default function Users() {
  const { me, isAdmin } = useAuth();
  const { data: users, error, isLoading } = useQuery({ ...usersQuery(), enabled: isAdmin });
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Users" />
        <EmptyState>Only admins can manage users. Ask an admin if you need access for someone.</EmptyState>
      </>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Users">
          Invite people to RetainIQ and decide what they can do. Analysts use everything except enrichment;
          admins also run enrichment and manage users. Each person has a daily allowance of AI calls.
        </PageHeader>
        <Button onClick={() => setInviting(true)}><UserPlus size={15} strokeWidth={2} /> Invite user</Button>
      </div>

      <Card padded={false}>
        {isLoading && <div className="px-5"><Loading what="Loading users" /></div>}
        {error && <div className="p-4"><ErrorState error={error} /></div>}
        {users && (
          <ul className="divide-y divide-line">
            {users.map((u, i) => (
              <motion.li key={u.id} custom={i} variants={rowVariants} initial="hidden" animate="show">
                <UserItem user={u} self={u.id === me.id} onResetPassword={() => setResetting(u)} />
              </motion.li>
            ))}
          </ul>
        )}
      </Card>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}

function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: number; update: UserUpdate }) => api.updateUser(id, update),
    onSuccess: (row) => qc.setQueryData<UserRow[]>(queryKeys.users, (rows) => rows?.map((r) => (r.id === row.id ? row : r))),
  });
}

function UserItem({ user: u, self, onResetPassword }: { user: UserRow; self: boolean; onResetPassword: () => void }) {
  const update = useUpdateUser();
  const busy = update.isPending;
  const [tone, roleLabel] = ROLE[u.role];
  return (
    <div className={`flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center ${u.is_active ? "" : "opacity-60"}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amd/15 text-xs font-semibold text-amd-fg">{initials(u.name)}</span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-strong">
            <span className="truncate">{u.name}</span>
            {self && <span className="text-xs font-normal text-muted">(you)</span>}
            {!u.is_active && <Badge tone="slate">Deactivated</Badge>}
          </p>
          <p className="truncate text-xs text-muted">{u.email} · last sign-in {ago(u.last_login_at)}</p>
        </div>
      </div>

      <div className="w-full lg:w-48"><UsageMeter usage={u.usage} compact /></div>

      <div className="flex flex-wrap items-center gap-2">
        {self ? (
          <Badge tone={tone}>{roleLabel}</Badge>
        ) : (
          <select aria-label={`Role for ${u.name}`} value={u.role} disabled={busy}
            onChange={(e) => update.mutate({ id: u.id, update: { role: e.target.value as Role } })}
            className="rounded-lg border border-line bg-field px-2 py-1.5 text-xs text-strong focus:border-amd/60 focus:outline-none max-md:min-h-11">
            {(Object.keys(ROLE) as Role[]).map((r) => <option key={r} value={r}>{ROLE[r][1]}</option>)}
          </select>
        )}
        <Button variant="ghost" className="py-1.5 text-xs" onClick={onResetPassword} disabled={busy}>
          <KeyRound size={13} strokeWidth={2} /> Password
        </Button>
        {!self && (
          <Button variant="ghost" className="py-1.5 text-xs" disabled={busy}
            onClick={() => update.mutate({ id: u.id, update: { is_active: !u.is_active } })}>
            {u.is_active ? "Deactivate" : "Activate"}
          </Button>
        )}
      </div>
      {update.error && <p role="alert" className="text-xs text-error-fg lg:basis-full">{update.error.message}</p>}
    </div>
  );
}

/** Shows sign-in details once, with a copy button, so the admin can pass them on privately. */
function Credentials({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `RetainIQ sign-in\nEmail: ${email}\nPassword: ${password}`;
  return (
    <div className="space-y-3">
      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-sunken p-3 text-xs text-strong">{text}</pre>
      <Button variant="ghost" className="w-full" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true))}>
        {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />} {copied ? "Copied" : "Copy sign-in details"}
      </Button>
      <p className="text-[11px] text-subtle">Share these privately. They can change the password after signing in.</p>
    </div>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const blank: NewUser = { email: "", name: "", password: generatePassword(), role: "analyst" };
  const [form, setForm] = useState<NewUser>(blank);
  const create = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: (row) => qc.setQueryData<UserRow[]>(queryKeys.users, (rows) => [...(rows ?? []), row]),
  });
  const close = () => {
    onClose();
    create.reset();
    setForm({ ...blank, password: generatePassword() });
  };
  const set = (patch: Partial<NewUser>) => setForm((f) => ({ ...f, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!create.isPending) create.mutate();
  };

  return (
    <Modal open={open} onClose={close} label="Invite user" className="sm:max-w-md">
      <div className="overflow-y-auto p-5">
        <h2 className="text-base font-semibold text-strong">{create.isSuccess ? "Account created" : "Invite user"}</h2>
        {create.isSuccess ? (
          <div className="mt-4 space-y-3">
            <Credentials email={create.data.email} password={form.password} />
            <Button onClick={close} className="w-full">Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <TextField label="Name" required maxLength={80} autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} />
            <TextField label="Email" type="email" required maxLength={254} value={form.email} onChange={(e) => set({ email: e.target.value })} />
            <SelectField label="Role" value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
              <option value="analyst">Analyst - everything except enrichment</option>
              <option value="admin">Admin - also enrichment and users</option>
              <option value="demo">Demo - like an analyst, smaller AI allowance</option>
            </SelectField>
            <TextField label="Temporary password" required minLength={8} maxLength={200} autoComplete="new-password"
              value={form.password} onChange={(e) => set({ password: e.target.value })}
              action={<button type="button" onClick={() => set({ password: generatePassword() })} className="text-xs font-medium text-amd-fg hover:underline">Generate</button>} />
            {create.error && <ErrorState error={create.error} />}
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" onClick={close} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={create.isPending} className="flex-1">Create account</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword);
  const update = useUpdateUser();
  const close = () => {
    onClose();
    update.reset();
    setPassword(generatePassword());
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (user && !update.isPending) update.mutate({ id: user.id, update: { password } });
  };

  return (
    <Modal open={!!user} onClose={close} label="Set a new password" className="sm:max-w-md">
      <div className="overflow-y-auto p-5">
        <h2 className="text-base font-semibold text-strong">New password for {user?.name}</h2>
        {update.isSuccess && user ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-soft">Their other sessions are signed out.</p>
            <Credentials email={user.email} password={password} />
            <Button onClick={close} className="w-full">Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <TextField label="New password" required minLength={8} maxLength={200} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              hint="They'll be signed out everywhere and use this to sign in."
              action={<button type="button" onClick={() => setPassword(generatePassword())} className="text-xs font-medium text-amd-fg hover:underline">Generate</button>} />
            {update.error && <ErrorState error={update.error} />}
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" onClick={close} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={update.isPending} className="flex-1">Set password</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
