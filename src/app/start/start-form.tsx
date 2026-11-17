"use client";

import { cn } from "cn";
import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Combobox, FormField, invalid, MoneyInput, keepValues } from "@/components/form-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { currencySymbol, formatMoney } from "@/lib/format";
import { startCampaign, type StartState } from "./actions";

interface HospitalOption {
  id: string;
  name: string;
  place: string;
  flag: string;
  currency: string;
  minGoal: number;
}

const DURATIONS = [
  ["14", "2 weeks"],
  ["30", "30 days"],
  ["60", "60 days"],
] as const;

export function StartForm({ hospitals, emailEnabled }: { hospitals: HospitalOption[]; emailEnabled: boolean }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startCampaign, { ok: false });
  const v = (!state.ok && state.values) || {};
  const [hospitalId, setHospitalId] = useState(v.hospitalId ?? "");
  const [days, setDays] = useState(v.days ?? "30");
  const [story, setStory] = useState(v.story ?? "");

  if (state.ok) return <Submitted state={state} emailEnabled={emailEnabled} />;

  const e = state.errors ?? {};
  const h = hospitals.find((x) => x.id === hospitalId);

  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-10 space-y-10" noValidate>
      {state.message && (
        <p role="alert" className="rounded-[16px] bg-clay-soft px-4 py-3 text-[0.95rem]">{state.message}</p>
      )}
      <fieldset className="space-y-5">
        <legend className="text-[1.35rem]">About you</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Your name" htmlFor="campaignerName" error={e.campaignerName}>
            <Input id="campaignerName" name="campaignerName" defaultValue={v.campaignerName} autoComplete="name" {...invalid("campaignerName", e.campaignerName)} />
          </FormField>
          <FormField label="Your email" htmlFor="campaignerEmail" error={e.campaignerEmail} hint="Never shown publicly.">
            <Input id="campaignerEmail" name="campaignerEmail" type="email" defaultValue={v.campaignerEmail} autoComplete="email" {...invalid("campaignerEmail", e.campaignerEmail)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.35rem]">The bill</legend>
        <FormField label="Hospital" htmlFor="hospitalId" error={e.hospitalId}>
          <Combobox
            id="hospitalId"
            name="hospitalId"
            value={hospitalId}
            onChange={setHospitalId}
            placeholder="Choose a partner hospital"
            searchPlaceholder="Search by hospital, city or country…"
            empty="No partner hospital matches. Ask the billing office to register."
            error={e.hospitalId}
            options={hospitals.map((x) => ({ value: x.id, label: x.name, prefix: x.flag, hint: x.place, keywords: [x.place] }))}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Bill or invoice number" htmlFor="billReference" hint="As printed on the hospital's bill." error={e.billReference}>
            <Input id="billReference" name="billReference" defaultValue={v.billReference} {...invalid("billReference", e.billReference)} />
          </FormField>
          <FormField
            label="Amount needed"
            htmlFor="goalAmount"
            error={e.goalAmount}
            hint={h ? `The total on the bill, in ${h.currency}. At least ${formatMoney(h.minGoal, h.currency)}.` : "Choose the hospital first: the amount is in its currency."}
          >
            <MoneyInput
              id="goalAmount"
              name="goalAmount"
              symbol={h ? currencySymbol(h.currency) : "—"}
              currency={h?.currency}
              defaultValue={v.goalAmount}
              disabled={!h}
              error={e.goalAmount}
            />
          </FormField>
        </div>
        <div>
          <p className="text-[0.95rem] font-medium">How long should it run?</p>
          <input type="hidden" name="days" value={days} />
          <RadioGroup value={days} onValueChange={setDays} className="mt-2 grid grid-cols-3 gap-2" aria-label="Campaign length">
            {DURATIONS.map(([val, label]) => (
              <label
                key={val}
                className={cn(
                  "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-white text-[0.95rem] font-medium transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/15",
                  days === val ? "border-indigo ring-1 ring-indigo" : "border-line-2 hover:border-ink-3",
                )}
              >
                <RadioGroupItem value={val} className="sr-only" />
                {label}
              </label>
            ))}
          </RadioGroup>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.35rem]">The story</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name to show" htmlFor="patientDisplayName" hint="First name or a nickname." error={e.patientDisplayName}>
            <Input id="patientDisplayName" name="patientDisplayName" defaultValue={v.patientDisplayName} {...invalid("patientDisplayName", e.patientDisplayName)} />
          </FormField>
          <FormField label="Campaign title" htmlFor="title" hint="e.g. Help Amara get heart surgery" error={e.title}>
            <Input id="title" name="title" defaultValue={v.title} maxLength={90} {...invalid("title", e.title)} />
          </FormField>
        </div>
        <FormField
          label="Tell donors what's happening"
          htmlFor="story"
          error={e.story}
          hint={
            <span className="flex justify-between gap-4">
              <span>Who they are, what care they need, and why now. Keep private medical details private.</span>
              <span className={cn("shrink-0 tabular-nums", story.trim().length < 80 && "text-gold")}>{story.length}/4000</span>
            </span>
          }
        >
          <Textarea id="story" name="story" className="min-h-44" maxLength={4000} value={story} onChange={(ev) => setStory(ev.target.value)} {...invalid("story", e.story)} />
        </FormField>
      </fieldset>

      <div className="border-t border-line pt-8">
        <label className="flex items-start gap-3 text-[0.95rem]">
          <Checkbox name="consent" value="on" className="mt-0.5" defaultChecked={v.consent === "on"} {...invalid("consent", e.consent)} />
          <span>
            The patient (or their parent or guardian) has agreed to this campaign and to the story
            above being public.
          </span>
        </label>
        {e.consent && <p id="consent-error" className="mt-1.5 text-[0.88rem] text-clay">{e.consent}</p>}
      </div>

      <button type="submit" disabled={pending} className="btn btn-secondary w-full sm:w-auto">
        {pending ? "Sending…" : "Send to the hospital for checking"}
      </button>
    </form>
  );
}

function Submitted({ state, emailEnabled }: { state: Extract<StartState, { ok: true }>; emailEnabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const steps = [
    ["Submitted", "Just now"],
    ["Hospital checks the bill", `${state.hospitalName} billing office`],
    ["Live: share it", "Donations open"],
  ];
  return (
    <section className="mt-10 overflow-hidden rounded-[24px] bg-white">
      <div className="p-6 sm:p-8">
        <p className="label-mono text-ink-3">Step 1 of 3 done</p>
        <h2 className="mt-2 text-[1.9rem]">
          Sent to <span className="mark">{state.hospitalName}</span>
        </h2>
        <p className="mt-3 max-w-xl text-ink-2">
          Their billing office checks the bill for &ldquo;{state.title}&rdquo;. Once they confirm it, your
          campaign goes live and you can share it.
        </p>
        <ol className="mt-7 grid gap-3 sm:grid-cols-3">
          {steps.map(([t, s], i) => (
            <li key={t} className={cn("rounded-[16px] border p-4", i === 0 ? "border-indigo bg-indigo text-indigo-ink" : "border-line")}>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-[0.8rem]",
                  i === 0 ? "bg-sun text-ink" : "border border-line-2 font-mono text-ink-3",
                )}
              >
                {i === 0 ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <p className="mt-3 font-medium">{t}</p>
              <p className={cn("text-[0.85rem]", i === 0 ? "text-indigo-muted" : "text-ink-3")}>{s}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-line bg-paper p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
            <KeyRoundIcon className="size-4" />
          </span>
          <div>
            <p className="font-medium">Save your private family link now</p>
            <p className="mt-0.5 text-[0.92rem] text-ink-2">
              It&apos;s the only way back to your family page, where you follow every payment and confirm when
              money reaches the bill. Don&apos;t share it publicly.{" "}
              {emailEnabled
                ? `We've also emailed it to ${state.email}.`
                : "Email isn't switched on in this test version, so copy it before you leave this page."}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <code className="hash flex min-h-12 flex-1 items-center rounded-xl border border-line-2 bg-white px-3.5 py-2 text-ink">
            {state.familyUrl}
          </code>
          <button
            type="button"
            className="btn btn-ghost bg-white"
            onClick={async () => {
              await navigator.clipboard.writeText(state.familyUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            }}
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <Link href={state.familyUrl.replace(/^https?:\/\/[^/]+/, "")} className="btn btn-secondary mt-6">
          Open family page
        </Link>
      </div>
    </section>
  );
}
