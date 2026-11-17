"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * Pasted text often carries a space or line break at either end (copied from a
 * terminal, an email, or a page where the text sits after a label). In a
 * one-line field that's never wanted, and in an email or access code it breaks
 * sign-in, so it's dropped. Typing a space yourself is unaffected.
 */
function pasteTrimmed(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData("text/plain")
  const trimmed = text.trim()
  if (trimmed === text) return
  e.preventDefault()
  const input = e.currentTarget
  // insertText keeps undo working and fires the normal input event, so React
  // state and form validation see the change like any other paste.
  if (!document.execCommand?.("insertText", false, trimmed)) {
    input.setRangeText(trimmed, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function Input({ className, type, onPaste, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      onPaste={(e) => {
        onPaste?.(e)
        if (!e.defaultPrevented) pasteTrimmed(e)
      }}
      className={cn(
        "h-12 w-full min-w-0 rounded-xl border border-input bg-white px-3.5 py-2 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
