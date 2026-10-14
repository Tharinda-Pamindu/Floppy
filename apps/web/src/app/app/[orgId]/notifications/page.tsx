"use client";

import type { DeadlineLead, MeResponse, NotificationPreferences } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Lock, Mail, MessageSquareText, Phone, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, errorMessage, useApi } from "@/lib/api";
import { keys, useMe } from "@/lib/queries";

type Channel = "inApp" | "email" | "sms";
const CHANNELS: { key: Channel; label: string; Icon: typeof Mail }[] = [
  { key: "inApp", label: "In-app", Icon: BellRing },
  { key: "email", label: "Email", Icon: Mail },
  { key: "sms", label: "SMS", Icon: MessageSquareText },
];

export default function NotificationSettings() {
  return (
    <>
      <PageHeader title="Notifications" description="Choose how Floppy reaches you. Account and security messages always arrive." />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Contact />
        <Preferences />
      </div>
    </>
  );
}

function Contact() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [lead, setLead] = useState<DeadlineLead>("1d");
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  }, []);

  useEffect(() => {
    if (me.data) {
      setPhone(me.data.settings.phone ?? "");
      setTimezone(me.data.settings.timezone);
      setLead(me.data.settings.deadlineLead);
    }
  }, [me.data]);

  const save = useMutation({
    mutationFn: () => api<MeResponse>("/me/settings", { method: "PATCH", json: { phone: phone.trim() || null, timezone, deadlineLead: lead } }),
    onSuccess: (m) => { queryClient.setQueryData(keys.me, m); toast.ok("Saved."); },
  });
  const test = useMutation({
    mutationFn: () => api<{ channels: Record<Channel, boolean> }>("/me/notifications/test", { method: "POST" }),
    onSuccess: (r) => toast.ok(`Test sent: in-app, email${r.channels.sms ? " and SMS" : " (add a phone number for SMS)"}.`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me.isLoading) return <PageLoader />;
  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="label-card space-y-4 p-4">
        <h2 className="font-display text-lg font-bold">Delivery</h2>
        <Field label="Email" htmlFor="ns-email" hint="Change it in your account settings (avatar menu).">
          <Input id="ns-email" value={me.data?.email ?? ""} disabled />
        </Field>
        <Field label={<span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone for SMS</span>} htmlFor="ns-phone" hint="International format, e.g. +94771234567. Leave empty for no SMS." error={save.error instanceof ApiError && save.error.field === "phone" ? save.error.message : null}>
          <Input id="ns-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94771234567" autoComplete="tel" />
        </Field>
        <Field label="Time zone" htmlFor="ns-tz" hint="Monday and Friday reminders arrive at 09:00 and 16:00 your time.">
          <div className="flex gap-2">
            <Select id="ns-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </Select>
            <Button type="button" variant="outline" onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}>Detect</Button>
          </div>
        </Field>
        <Field label="Remind me about task deadlines" htmlFor="ns-lead">
          <Select id="ns-lead" value={lead} onChange={(e) => setLead(e.target.value as DeadlineLead)}>
            <option value="1h">1 hour before</option>
            <option value="1d">1 day before</option>
            <option value="3d">3 days before</option>
          </Select>
        </Field>
        <FormError message={save.error && !(save.error instanceof ApiError && save.error.field === "phone") ? errorMessage(save.error) : null} />
        <Button type="submit" loading={save.isPending}>Save</Button>
      </form>
      <div className="label-card-flat space-y-2 p-4">
        <h2 className="font-display font-bold">Check it works</h2>
        <p className="text-sm text-ink-soft">Sends a test to the bell, your email and (if you saved a phone number) SMS.</p>
        <Button variant="outline" onClick={() => test.mutate()} loading={test.isPending}><Send className="h-4 w-4" />Send me a test</Button>
      </div>
    </div>
  );
}

function Preferences() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ["notification-prefs"], queryFn: () => api<NotificationPreferences>("/me/notifications/preferences"), retry: false });
  const update = useMutation({
    mutationFn: (input: { workflowId?: string; channels: Partial<Record<Channel, boolean>> }) =>
      api<NotificationPreferences>("/me/notifications/preferences", { method: "PATCH", json: input }),
    onSuccess: (p) => queryClient.setQueryData(["notification-prefs"], p),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (prefs.isLoading) return <PageLoader />;
  if (prefs.error instanceof ApiError && prefs.error.code === "NOTIFICATIONS_UNAVAILABLE") {
    return <EmptyState icon={<BellRing className="h-6 w-6" />} title="Notifications aren't set up yet">{prefs.error.message} See the README to connect Novu.</EmptyState>;
  }
  if (prefs.error || !prefs.data) return <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />;
  const p = prefs.data;

  return (
    <div className="space-y-6">
      <section className="label-card p-4">
        <h2 className="font-display text-lg font-bold">Channels</h2>
        <p className="mb-3 text-sm text-ink-soft">Turning a channel off here turns it off for everything that isn&apos;t critical.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {CHANNELS.map(({ key, label, Icon }) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl border-2 border-rule-soft px-3 py-2.5">
              <span className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" />{label}</span>
              <Switch label={`${label} notifications`} checked={p.global[key]} onCheckedChange={(v) => update.mutate({ channels: { [key]: v } })} />
            </label>
          ))}
        </div>
      </section>

      <section className="label-card-flat overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b-2 border-rule bg-surface-2 text-left font-mono text-[11px] tracking-wider uppercase">
              <th className="px-4 py-2.5">Notification</th>
              {CHANNELS.map((c) => <th key={c.key} className="px-3 py-2.5 text-center">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {p.workflows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Workflows appear here after they&apos;re synced to Novu (see README).</td></tr>
            )}
            {p.workflows.map((w) => (
              <tr key={w.workflowId} className="border-b border-rule-soft last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {w.name} {w.critical && <Badge className="ml-1"><Lock className="h-3 w-3" />Always on</Badge>}
                </td>
                {CHANNELS.map(({ key, label }) => (
                  <td key={key} className="px-3 py-2.5 text-center">
                    {w.channels[key] === undefined ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="inline-flex">
                        <Switch label={`${w.name}: ${label}`} checked={!!w.channels[key] && p.global[key]} disabled={w.critical || !p.global[key]} onCheckedChange={(v) => update.mutate({ workflowId: w.workflowId, channels: { [key]: v } })} />
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
