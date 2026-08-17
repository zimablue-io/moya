import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function uid(prefix = "id"): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

export function nowIso(): string {
	return new Date().toISOString()
}

export function formatClock(d = new Date()): string {
	return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export function formatDay(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	})
}

export function formatWhen(iso: string): string {
	const d = new Date(iso)
	return `${formatDay(iso)} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
}

export function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n))
}

export function hoursBetween(a: string, b: string): number {
	return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000)
}
