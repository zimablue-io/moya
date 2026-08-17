/**
 * Full-mesh WebRTC rooms: one RTCPeerConnection per remote peer, signaled
 * through /api/rtc (see signaling.server.ts), game data flowing directly
 * browser-to-browser afterwards. Client-authoritative by construction — see
 * the multiplayer-p2p skill for when NOT to use this.
 *
 * Negotiation follows the "perfect negotiation" pattern: on a glare (both
 * sides offering at once) the polite peer — the lexicographically smaller id —
 * rolls back and accepts, so pairs converge without wedging.
 */

import {
	FAST_POLL_MS,
	IDLE_POLL_MS,
	MAX_RECOVERY_ATTEMPTS,
	type P2PHost,
	type P2PRoomOptions,
	type PeerInfo,
	type PeerSlot,
	PING_INTERVAL_MS,
	type RtcPollResponse,
	STALL_MS,
} from "./p2p-def"
import { connectTo, onSignal } from "./p2p-negotiate"

export type {
	P2PRoomOptions,
	PeerInfo,
	PeerRow,
	RtcPollResponse,
	SignalKind,
	SignalRow,
} from "./p2p-def"
export { defaultIceServers } from "./p2p-def"

export class P2PRoom {
	private readonly opts: P2PRoomOptions
	private readonly peers = new Map<string, PeerSlot>()
	/** Per-remote-peer signal delivery chains (order-preserving). */
	private readonly signalQueues = new Map<string, Promise<void>>()
	private cursor = 0
	private pollTimer: ReturnType<typeof setTimeout> | null = null
	private pingTimer: ReturnType<typeof setInterval> | null = null
	private closed = false
	private everPolled = false
	private lastPeersFingerprint = ""

	constructor(opts: P2PRoomOptions) {
		this.opts = opts
	}

	/**
	 * The first poll IS the join: it registers this peer and returns the
	 * roster. A failed first poll (cold DB, offline tab) must not strand the
	 * room: the loop and timers start regardless and the next poll retries.
	 */
	async join(): Promise<void> {
		try {
			await this.pollOnce()
		} catch {
			// First poll can fail transiently; the scheduled loop below retries.
		}
		if (this.closed) return
		this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS)
		this.pingTimer = setInterval(() => {
			this.pingAll()
			this.watchdog()
		}, PING_INTERVAL_MS)
	}

	close(): void {
		this.closed = true
		if (this.pollTimer) clearTimeout(this.pollTimer)
		if (this.pingTimer) clearInterval(this.pingTimer)
		for (const slot of this.peers.values()) slot.pc.close()
		this.peers.clear()
		// Leaving the roster is the teardown broadcast: everyone's next poll
		// drops this peer and closes their side of the pair.
		void fetch("/api/rtc", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ op: "leave", room: this.opts.room, peer: this.opts.selfId }),
			keepalive: true,
		}).catch(() => {})
	}

	/** Send on the unreliable game-state channel (drops stale packets). */
	broadcast(data: unknown): void {
		const wire = JSON.stringify({ t: "d", d: data })
		for (const slot of this.peers.values()) {
			if (slot.state?.readyState === "open") slot.state.send(wire)
		}
	}

	/** Send reliably (ordered) to one peer, or to all when peerId is omitted. */
	send(data: unknown, peerId?: string): void {
		const wire = JSON.stringify({ t: "d", d: data })
		const targets = peerId ? [this.peers.get(peerId)] : [...this.peers.values()]
		for (const slot of targets) {
			if (slot?.reliable?.readyState === "open") slot.reliable.send(wire)
		}
	}

	peerList(): PeerInfo[] {
		return [...this.peers.values()].map((s) => ({ ...s.info }))
	}

	private asHost(): P2PHost {
		const room = this
		return {
			get opts() {
				return room.opts
			},
			get peers() {
				return room.peers
			},
			get signalQueues() {
				return room.signalQueues
			},
			get closed() {
				return room.closed
			},
			schedulePoll: (delay) => room.schedulePoll(delay),
			emitPeers: () => room.emitPeers(),
		}
	}

	private schedulePoll(delay: number): void {
		if (this.closed) return
		if (this.pollTimer) clearTimeout(this.pollTimer)
		this.pollTimer = setTimeout(() => void this.poll(), delay)
	}

	private anyPairConnecting(): boolean {
		for (const s of this.peers.values()) {
			// Terminal pairs (NAT-blocked after all recovery attempts) must not pin
			// the session at the 400ms fast-poll rate.
			if (s.terminal) continue
			if (s.info.connectionState !== "connected") return true
		}
		return false
	}

	private async pollOnce(): Promise<void> {
		const params = new URLSearchParams({
			room: this.opts.room,
			peer: this.opts.selfId,
			name: this.opts.name ?? "",
			since: String(this.cursor),
		})
		const res = await fetch(`/api/rtc?${params}`)
		if (this.closed) return
		if (!res.ok) throw new Error(`signaling poll failed: ${res.status}`)
		const body = (await res.json()) as RtcPollResponse
		if (this.closed) return
		if (!this.everPolled) {
			this.everPolled = true
			this.opts.onConnected?.()
		}
		this.reconcileRoster(body.peers)
		const roster = new Set(body.peers.map((p) => p.id))
		for (const sig of body.signals) {
			this.cursor = Math.max(this.cursor, sig.id)
			await onSignal(this.asHost(), sig.from, sig.kind, sig.payload, roster)
			if (this.closed) return
		}
	}

	private async poll(): Promise<void> {
		if (this.closed) return
		try {
			await this.pollOnce()
		} catch {
			// Transient poll failures are expected (tab sleep, deploy roll); retry.
		}
		this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS)
	}

	private reconcileRoster(peers: { id: string; name: string }[]): void {
		const alive = new Set(peers.map((p) => p.id))
		for (const p of peers) {
			if (p.id === this.opts.selfId) continue
			const existing = this.peers.get(p.id)
			if (existing) {
				existing.info.name = p.name
			} else {
				// Exactly one side dials each pair; the other waits for the offer.
				connectTo(this.asHost(), p.id, p.name, this.opts.selfId > p.id)
			}
		}
		for (const [id, slot] of this.peers) {
			if (!alive.has(id)) {
				slot.pc.close()
				this.peers.delete(id)
			}
		}
		this.emitPeers()
	}

	private pingAll(): void {
		const wire = JSON.stringify({ t: "ping" })
		for (const slot of this.peers.values()) {
			if (slot.state?.readyState !== "open") continue
			const stale = slot.pingSentAt !== undefined && performance.now() - slot.pingSentAt > 2 * PING_INTERVAL_MS
			if (slot.pingSentAt === undefined || stale) {
				// A lost pong must not freeze rttMs forever: expire and re-ping.
				slot.pingSentAt = performance.now()
				slot.state.send(wire)
			}
		}
	}

	/**
	 * Stuck-pair recovery, piggybacked on the ping interval. A pair that has
	 * made no progress for STALL_MS gets rebuilt by the dialer with a FRESH
	 * RTCPeerConnection (new DTLS identity — fixes the suspend/resume
	 * fingerprint wedge). After MAX_RECOVERY_ATTEMPTS the pair is terminal:
	 * visible to the app as its last connectionState, ignored by fast-poll.
	 */
	private watchdog(): void {
		if (this.closed) return
		const now = Date.now()
		for (const [peerId, slot] of this.peers) {
			// pc.close() and some suspend/resume wedges never fire
			// connectionstatechange — read the LIVE state so a silently-dead pc
			// still trips the stall timer instead of hiding behind a cached
			// "connected". Only live progress states refresh the stall clock.
			const live = slot.pc.connectionState
			if (live !== slot.info.connectionState) {
				slot.info.connectionState = live
				if (live === "connecting" || live === "connected") slot.lastProgressAt = now
				this.emitPeers()
			}
			if (slot.terminal || live === "connected") continue
			if (now - slot.lastProgressAt <= STALL_MS) continue
			if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
				slot.terminal = true
				this.emitPeers()
				continue
			}
			slot.recoveryAttempts += 1
			slot.lastProgressAt = now // re-arm the stall window
			if (this.opts.selfId > peerId) {
				// We are the dialer: rebuild the pair from scratch.
				const { name } = slot.info
				const attempts = slot.recoveryAttempts
				slot.pc.close()
				this.peers.delete(peerId)
				const fresh = connectTo(this.asHost(), peerId, name, true)
				if (fresh) fresh.recoveryAttempts = attempts
				this.schedulePoll(FAST_POLL_MS)
			}
			// Receiver side: count the stall window and wait for the dialer's
			// fresh offer (onSignal absorbs it, recreating our pc if needed).
		}
	}

	private emitPeers(): void {
		// Only notify when something observable actually changed — React state
		// setters otherwise re-render consumers on every poll/ping.
		const list = this.peerList()
		const fingerprint = JSON.stringify(list.map((p) => [p.id, p.name, p.connectionState, p.candidateType, p.rttMs]))
		if (fingerprint === this.lastPeersFingerprint) return
		this.lastPeersFingerprint = fingerprint
		this.opts.onPeersChanged?.(list)
	}
}
