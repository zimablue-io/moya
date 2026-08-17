export type ScheduledSource = {
	start: (when: number) => void
	stop: () => void
	disconnect?: () => void
}

type SourceWithEnded = ScheduledSource & {
	onended: ((ev: Event) => void) | null
}

/** Queues PCM chunks on a clock. Flush must stop every source or old audio overlaps the next reply. */
export class ScheduledAudioQueue {
	nextPlay = 0
	playing = false
	playStartedAt: number | null = null
	queuedMs = 0
	private sources = new Set<ScheduledSource>()

	get liveCount() {
		return this.sources.size
	}

	schedule(src: ScheduledSource, durationSec: number, now: number) {
		if (this.nextPlay < now) this.nextPlay = now
		if (this.playStartedAt == null) this.playStartedAt = this.nextPlay
		src.start(this.nextPlay)
		this.nextPlay += durationSec
		this.queuedMs += durationSec * 1000
		this.playing = true
		this.sources.add(src)
		;(src as SourceWithEnded).onended = () => {
			this.sources.delete(src)
			if (this.sources.size === 0) this.playing = false
		}
	}

	flush() {
		for (const src of this.sources) {
			try {
				src.stop()
			} catch {
				/* already stopped */
			}
			try {
				src.disconnect?.()
			} catch {
				/* ignore */
			}
		}
		this.sources.clear()
		this.nextPlay = 0
		this.playing = false
		this.playStartedAt = null
		this.queuedMs = 0
	}
}
