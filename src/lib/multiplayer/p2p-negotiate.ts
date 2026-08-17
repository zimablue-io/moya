import {
	defaultIceServers,
	FAST_POLL_MS,
	type P2PHost,
	type PeerSlot,
	SIGNAL_RETRY_DELAYS_MS,
	type SignalKind,
} from "./p2p-def"

export function connectTo(host: P2PHost, peerId: string, name: string, initiator: boolean): PeerSlot | null {
	if (host.closed) return null
	const pc = new RTCPeerConnection({
		iceServers: host.opts.iceServers ?? defaultIceServers(),
	})
	const slot: PeerSlot = {
		pc,
		makingOffer: false,
		ignoreOffer: false,
		pendingCandidates: [],
		lastProgressAt: Date.now(),
		recoveryAttempts: 0,
		info: {
			id: peerId,
			name,
			connectionState: pc.connectionState,
			candidateType: null,
			rttMs: null,
		},
	}
	host.peers.set(peerId, slot)

	pc.onicecandidate = (e) => {
		if (e.candidate) void sendSignal(host, peerId, "ice", e.candidate.toJSON())
	}
	pc.onconnectionstatechange = () => {
		slot.info.connectionState = pc.connectionState
		if (pc.connectionState === "connecting" || pc.connectionState === "connected") {
			slot.lastProgressAt = Date.now()
		}
		if (pc.connectionState === "connected") {
			slot.recoveryAttempts = 0
			slot.terminal = false
			void readCandidateType(host, slot)
		}
		host.emitPeers()
		if (pc.connectionState === "failed") {
			// Refires negotiationneeded → a fresh offer through signaling, so a
			// lost offer or dead path cannot wedge the pair (glare-safe).
			pc.restartIce()
		}
		if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
			host.schedulePoll(FAST_POLL_MS)
		}
	}
	pc.onnegotiationneeded = async () => {
		try {
			slot.makingOffer = true
			await pc.setLocalDescription()
			await sendSignal(host, peerId, "offer", pc.localDescription!.toJSON())
		} catch {
			// A failed offer is retried on the next negotiationneeded.
		} finally {
			slot.makingOffer = false
		}
	}
	pc.ondatachannel = (e) => attachChannel(host, slot, e.channel)

	if (initiator) {
		// Creating the channels triggers negotiationneeded → the offer.
		attachChannel(host, slot, pc.createDataChannel("state", { ordered: false, maxRetransmits: 0 }))
		attachChannel(host, slot, pc.createDataChannel("reliable", { ordered: true }))
	}
	return slot
}

export function attachChannel(host: P2PHost, slot: PeerSlot, channel: RTCDataChannel): void {
	if (channel.label === "state") slot.state = channel
	else slot.reliable = channel
	channel.onopen = () => {
		slot.lastProgressAt = Date.now()
	}
	channel.onmessage = (e) => {
		let msg: { t: string; d?: unknown }
		try {
			msg = JSON.parse(e.data as string) as { t: string; d?: unknown }
		} catch {
			return
		}
		if (msg.t === "ping") {
			if (slot.state?.readyState === "open") {
				slot.state.send(JSON.stringify({ t: "pong" }))
			}
		} else if (msg.t === "pong") {
			if (slot.pingSentAt) {
				slot.info.rttMs = Math.round(performance.now() - slot.pingSentAt)
				slot.pingSentAt = undefined
				host.emitPeers()
			}
		} else {
			host.opts.onMessage?.(slot.info.id, msg.d, channel.label === "state" ? "state" : "reliable")
		}
	}
}

export async function flushPendingCandidates(host: P2PHost, slot: PeerSlot): Promise<void> {
	while (slot.pendingCandidates.length > 0) {
		const candidate = slot.pendingCandidates.shift()!
		try {
			await slot.pc.addIceCandidate(candidate)
		} catch (err) {
			if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err)
		}
		if (host.closed) return
	}
}

export async function onSignal(
	host: P2PHost,
	from: string,
	kind: SignalKind,
	payload: unknown,
	roster: Set<string>,
): Promise<void> {
	if (host.closed) return
	let slot = host.peers.get(from)
	if (!slot) {
		// New peers dial us in the same poll that adds them to the roster.
		// Signals outlive membership, so drop senders the roster doesn't vouch for.
		if (!roster.has(from)) return
		const created = connectTo(host, from, "", false)
		if (!created) return
		slot = created
	}
	const polite = host.opts.selfId < from

	try {
		if (kind === "offer" || kind === "answer") {
			const description = payload as RTCSessionDescriptionInit
			const collision = kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable")
			slot.ignoreOffer = !polite && collision
			if (slot.ignoreOffer) return
			try {
				await slot.pc.setRemoteDescription(description) // implicit rollback when polite
			} catch (err) {
				// A pc resumed from suspend can be unable to take any new remote
				// offer (stale DTLS fingerprint). Rebuild the pair once and apply
				// the same offer to the fresh pc before giving up.
				if (kind !== "offer" || slot.recreatedForOffer) throw err
				const attempts = slot.recoveryAttempts
				const name = slot.info.name
				slot.pc.close()
				host.peers.delete(from)
				const fresh = connectTo(host, from, name, false)
				if (!fresh) return
				fresh.recoveryAttempts = attempts
				fresh.recreatedForOffer = true
				slot = fresh
				await slot.pc.setRemoteDescription(description)
			}
			if (host.closed) return
			await flushPendingCandidates(host, slot)
			if (host.closed) return
			if (kind === "offer") {
				await slot.pc.setLocalDescription()
				if (host.closed) return
				await sendSignal(host, from, "answer", slot.pc.localDescription!.toJSON())
			}
		} else if (kind === "ice") {
			const candidate = payload as RTCIceCandidateInit
			if (!slot.pc.remoteDescription) {
				// Candidate raced ahead of its SDP — hold it until the description
				// lands (flushed after every successful setRemoteDescription).
				slot.pendingCandidates.push(candidate)
				return
			}
			try {
				await slot.pc.addIceCandidate(candidate)
			} catch (err) {
				// The enclosing catch would swallow a rethrow; log the real signal.
				if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err)
			}
		}
	} catch {
		// Negotiation errors resolve on the next offer cycle; state is visible
		// to the app via connectionState.
	}
}

/**
 * Signals are serialized per remote peer (a candidate must never overtake
 * its SDP into the DB) and retried on failure with short backoff.
 */
export function sendSignal(host: P2PHost, to: string, kind: SignalKind, payload: unknown): Promise<void> {
	const prev = host.signalQueues.get(to) ?? Promise.resolve()
	const next = prev.then(() => postSignal(host, to, kind, payload))
	host.signalQueues.set(
		to,
		next.catch(() => {}),
	)
	return next
}

export async function postSignal(host: P2PHost, to: string, kind: SignalKind, payload: unknown): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		if (host.closed) return
		try {
			const res = await fetch("/api/rtc", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					op: "signal",
					room: host.opts.room,
					from: host.opts.selfId,
					to,
					kind,
					payload,
				}),
			})
			if (res.ok) return
			throw new Error(`signal POST failed: ${res.status}`)
		} catch (err) {
			if (attempt >= SIGNAL_RETRY_DELAYS_MS.length) {
				// Delivery gave up; the pair converges on the next offer cycle (or
				// the watchdog rebuilds it). Logged once so failures are visible.
				console.warn(`[p2p] signal ${kind} to ${to} failed after retries`, err)
				return
			}
			await new Promise((r) => setTimeout(r, SIGNAL_RETRY_DELAYS_MS[attempt]))
		}
	}
}

export async function readCandidateType(host: P2PHost, slot: PeerSlot): Promise<void> {
	// relay = TURN (none configured by default); srflx/host = direct path.
	try {
		const stats = await slot.pc.getStats()
		let selected: RTCIceCandidatePairStats | undefined
		stats.forEach((s) => {
			if (s.type === "candidate-pair" && (s as RTCIceCandidatePairStats).nominated) {
				selected = s as RTCIceCandidatePairStats
			}
		})
		const localId = selected?.localCandidateId
		if (localId) {
			const local = stats.get(localId) as { candidateType?: string } | undefined
			slot.info.candidateType = local?.candidateType ?? null
			host.emitPeers()
		}
	} catch {
		// getStats is best-effort diagnostics only.
	}
}
