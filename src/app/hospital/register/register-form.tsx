"use client";

import { useActionState, useState } from "react";
import { Combobox, FormField, invalid, keepValues } from "@/components/form-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { COUNTRIES, countryByCode, flag } from "@/lib/countries";
import { registerHospital, type RegisterState } from "./actions";

const countryOptions = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.name,
  prefix: flag(c.code),
  keywords: [c.code, c.currency],
  hint: `Bills in ${c.currency}`,
}));

export function RegisterForm({ initial, resubmit = false }: { initial?: Record<string, string>; resubmit?: boolean }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerHospital, { values: initial });
  const e = state.errors ?? {};
  const v = state.values ?? {};
  const [country, setCountry] = useState(v.country ?? "");
  const c = countryByCode(country);

  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-10 space-y-10" noValidate>
      {state.message && (
        <p role="alert" className="rounded-[16px] bg-clay-soft px-4 py-3 text-[0.95rem]">{state.message}</p>
      )}

      <fieldset className="space-y-5">
        <legend className="text-[1.35rem]">The hospital</legend>
        <FormField label="Registered name" htmlFor="name" error={e.name} hint="As it appears on the facility licence.">
          <Input id="name" name="name" defaultValue={v.name} autoComplete="organization" {...invalid("name", e.name)} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Country"
            htmlFor="country"
            error={e.country}
            hint={c ? `Campaigns will be priced in ${c.currency}.` : "Sets the currency your campaigns are priced in."}
          >
            <Combobox
              id="country"
              name="country"
              options={countryOptions}
              value={country}
              onChange={setCountry}
              placeholder="Choose a country"
              searchPlaceholder="Search countries…"
              error={e.country}
            />
          </FormField>
          <FormField label="State, region or province" htmlFor="state" error={e.state}>
            <Input id="state" name="state" defaultValue={v.state} autoComplete="address-level1" {...invalid("state", e.state)} />
          </FormField>
          <FormField label="City or town" htmlFor="city" error={e.city}>
            <Input id="city" name="city" defaultValue={v.city} autoComplete="address-level2" {...invalid("city", e.city)} />
          </FormField>
          <FormField label="Street address" htmlFor="address" error={e.address}>
            <Input id="address" name="address" defaultValue={v.address} autoComplete="street-address" {...invalid("address", e.address)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.35rem]">Proof it&apos;s a licensed facility</legend>
        <p className="-mt-2 text-[0.95rem] text-ink-2">
          Ireti checks these against public records before families can choose your hospital.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Licence or registration number" htmlFor="registrationNumber" error={e.registrationNumber}>
            <Input id="registrationNumber" name="registrationNumber" defaultValue={v.registrationNumber} {...invalid("registrationNumber", e.registrationNumber)} />
          </FormField>
          <FormField label="Issued by" htmlFor="registrationAuthority" error={e.registrationAuthority} hint="e.g. the State Ministry of Health or national medical council.">
            <Input id="registrationAuthority" name="registrationAuthority" defaultValue={v.registrationAuthority} {...invalid("registrationAuthority", e.registrationAuthority)} />
          </FormField>
          <FormField label="Main phone number" htmlFor="phone" error={e.phone} hint="The switchboard, so we can call to confirm.">
            <InputGroup>
              {c && <InputGroupAddon className="font-medium text-ink-2">{c.dial}</InputGroupAddon>}
              <InputGroupInput id="phone" name="phone" type="tel" defaultValue={v.phone} autoComplete="tel" {...invalid("phone", e.phone)} />
            </InputGroup>
          </FormField>
          <FormField label="Website (optional)" htmlFor="website" error={e.website}>
            <Input id="website" name="website" type="url" placeholder="https://" defaultValue={v.website} autoComplete="url" {...invalid("website", e.website)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.35rem]">You, in the billing office</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Your name" htmlFor="contactName" error={e.contactName}>
            <Input id="contactName" name="contactName" defaultValue={v.contactName} autoComplete="name" {...invalid("contactName", e.contactName)} />
          </FormField>
          <FormField label="Your role" htmlFor="role" error={e.role}>
            <Input id="role" name="role" placeholder="e.g. Head of billing" defaultValue={v.role} autoComplete="organization-title" {...invalid("role", e.role)} />
          </FormField>
          <FormField label="Work email" htmlFor="email" error={e.email} hint="Use the hospital's domain if it has one; it speeds up the check.">
            <Input id="email" name="email" type="email" defaultValue={v.email} autoComplete="email" {...invalid("email", e.email)} />
          </FormField>
          <div className="hidden sm:block" />
          <FormField label={resubmit ? "New access code (optional)" : "Choose an access code"} htmlFor="accessCode" error={e.accessCode} hint={resubmit ? "Leave blank to keep your current code." : "At least 10 characters. You sign in with your email and this code."}>
            <PasswordInput id="accessCode" name="accessCode" autoComplete="new-password" {...invalid("accessCode", e.accessCode)} />
          </FormField>
          <FormField label="Repeat the access code" htmlFor="accessCodeConfirm" error={e.accessCodeConfirm}>
            <PasswordInput id="accessCodeConfirm" name="accessCodeConfirm" autoComplete="new-password" {...invalid("accessCodeConfirm", e.accessCodeConfirm)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.35rem]">Where withdrawals are paid</legend>
        <FormField
          label="Lightning address"
          htmlFor="lightningAddress"
          error={e.lightningAddress}
          hint="Your hospital's own wallet (e.g. Blink, Alby, Strike). Withdrawals go only here, and Ireti checks it before the first one. Bank payouts in local currency are coming."
        >
          <Input id="lightningAddress" name="lightningAddress" placeholder="billing@yourwallet.com" defaultValue={v.lightningAddress} autoCapitalize="none" spellCheck={false} {...invalid("lightningAddress", e.lightningAddress)} />
        </FormField>
      </fieldset>

      <div className="border-t border-line pt-8">
        <label className="flex items-start gap-3 text-[0.95rem]">
          <Checkbox name="authorised" value="on" className="mt-0.5" defaultChecked={v.authorised === "on"} {...invalid("authorised", e.authorised)} />
          <span>
            I work in this hospital&apos;s billing or finance office and can confirm patients&apos; bills on its behalf.
          </span>
        </label>
        {e.authorised && <p id="authorised-error" className="mt-1.5 text-[0.88rem] text-clay">{e.authorised}</p>}
      </div>

      <button type="submit" disabled={pending} className="btn btn-secondary w-full sm:w-auto">
        {resubmit ? (pending ? "Sending…" : "Resubmit for review") : pending ? "Registering…" : "Register for review"}
      </button>
    </form>
  );
}
