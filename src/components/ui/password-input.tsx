"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import * as React from "react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"

/** A password field with an eye button to show or hide what was typed. */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = React.useState(false)
  return (
    <div className="relative">
      <Input
        type={shown ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-12", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={props.id}
        title={shown ? "Hide" : "Show"}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-3 transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/15"
      >
        {shown ? <EyeOffIcon className="size-5" aria-hidden /> : <EyeIcon className="size-5" aria-hidden />}
      </button>
    </div>
  )
}

export { PasswordInput }
