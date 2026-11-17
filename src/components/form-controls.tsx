"use client";

import { cn } from "cn";
import { CheckIcon, ChevronsUpDownIcon, FileUpIcon, XIcon } from "lucide-react";
import { startTransition, useId, useRef, useState } from "react";
import { NumericFormat } from "react-number-format";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Submit handler that keeps what was typed when the server sends the form back.
 *
 * React clears a form's fields once its action finishes, even when the server
 * returned an error, so people had to type everything again (and the receipt
 * form lost its file while still showing the file name). Running the same
 * action from onSubmit skips that reset; pending states work as before.
 * Use with `action` still set on the form, so it also works before JavaScript
 * loads: <form action={action} onSubmit={keepValues(action)}>.
 */
export const keepValues = (action: (data: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
  startTransition(() => action(data));
};

/** Label, hint, control and error in one consistent block. */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={Boolean(error) || undefined} className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint && !error && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError id={`${htmlFor}-error`}>{error}</FieldError>}
    </Field>
  );
}

/** aria-invalid and aria-describedby for a control whose field has an error. */
export const invalid = (name: string, error?: string) =>
  error ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};

export interface ComboOption {
  value: string;
  label: string;
  /** Shown before the label, e.g. a flag. */
  prefix?: string;
  /** Extra words the search should match. */
  keywords?: string[];
  hint?: string;
}

/**
 * Searchable select (Radix popover + cmdk). Submits through a hidden input,
 * so it works inside plain server-action forms.
 */
export function Combobox({
  id,
  name,
  options,
  value: controlled,
  defaultValue = "",
  onChange,
  placeholder,
  searchPlaceholder = "Search…",
  empty = "No match.",
  error,
}: {
  id: string;
  name: string;
  options: ComboOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  empty?: string;
  error?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            {...invalid(name, error)}
            className={cn(
              "flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-input bg-white px-3.5 text-left text-base outline-none transition-colors",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            )}
          >
            {selected ? (
              <span className="flex min-w-0 items-center gap-2">
                {selected.prefix && <span aria-hidden="true">{selected.prefix}</span>}
                <span className="truncate">{selected.label}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent id={listId} className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{empty}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.keywords?.join(" ") ?? ""}`}
                    onSelect={() => {
                      setOwn(o.value);
                      onChange?.(o.value);
                      setOpen(false);
                    }}
                    className="py-2"
                  >
                    {o.prefix && <span aria-hidden="true">{o.prefix}</span>}
                    <span className="flex-1">
                      {o.label}
                      {o.hint && <span className="block text-[0.8rem] text-muted-foreground">{o.hint}</span>}
                    </span>
                    <CheckIcon className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

/**
 * Amount in a currency: symbol prefix, thousands separators as you type, and
 * a plain number submitted under `name`.
 */
export function MoneyInput({
  id,
  name,
  symbol,
  currency,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  error,
  disabled,
}: {
  id: string;
  name: string;
  symbol: string;
  currency?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (raw: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const raw = value ?? own;
  return (
    <InputGroup data-disabled={disabled || undefined}>
      <InputGroupAddon className="font-medium text-ink-2">{symbol}</InputGroupAddon>
      <NumericFormat
        id={id}
        data-slot="input-group-control"
        inputMode="numeric"
        thousandSeparator=","
        decimalScale={0}
        allowNegative={false}
        value={raw}
        onValueChange={(v) => {
          setOwn(v.value);
          onValueChange?.(v.value);
        }}
        placeholder={placeholder}
        disabled={disabled}
        {...invalid(name, error)}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground"
      />
      {currency && symbol !== currency && <InputGroupAddon align="inline-end" className="label-mono text-ink-3">{currency}</InputGroupAddon>}
      <input type="hidden" name={name} value={raw} />
    </InputGroup>
  );
}

/** Drag-and-drop or click-to-choose file field, for receipts. */
export function FileDrop({
  name,
  accept,
  maxMb,
  hint,
}: {
  name: string;
  accept: string;
  maxMb: number;
  hint: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <input
        ref={input}
        id={id}
        name={name}
        type="file"
        accept={accept}
        required
        className="sr-only"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line-2 bg-white px-4 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <FileUpIcon className="size-5 shrink-0 text-indigo" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{file.name}</span>
              <span className="text-[0.85rem] text-ink-3">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </span>
          </span>
          <button
            type="button"
            className="rounded-lg p-1.5 text-ink-3 hover:bg-paper-2 hover:text-ink"
            aria-label="Remove file"
            onClick={() => {
              setFile(null);
              if (input.current) input.current.value = "";
            }}
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f && input.current) {
              const dt = new DataTransfer();
              dt.items.add(f);
              input.current.files = dt.files;
              setFile(f);
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
            over ? "border-indigo bg-sand" : "border-line-2 bg-white hover:border-ink-3",
          )}
        >
          <FileUpIcon className="size-6 text-ink-3" />
          <span className="font-medium">Drop the file here, or click to choose</span>
          <span className="text-[0.85rem] text-ink-3">
            {hint} · up to {maxMb} MB
          </span>
        </label>
      )}
    </div>
  );
}
