import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// errorText renders an unknown thrown value (bindings reject with anything)
// as the message a toast or dialog can show.
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
