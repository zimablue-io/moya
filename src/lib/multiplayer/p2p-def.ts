export type SignalKind = "offer" | "answer" | "ice"

/**
 * Wire contract between this client and the signaling relay the app provides
 * at /api/rtc (see the multiplayer-p2p skill for a reference implementation).
 * The client only needs these shapes — the relay's storage is the app's choice.
 */
export interface PeerRow {
	id: string
	name: string
}
export interface SignalRow {
	id: number
	from: string
	kind: SignalKind
	payload: unknown
}
export interface RtcPollResponse {
	peers: PeerRow[]
	signals: SignalRow[]
}

export interface PeerInfo {
	id: string
	name: string
	connectionState: RTCPeerConnectionState
	/** Selected local ICE candidate type: host | srflx | prflx | relay. */
	candidateType: string | null
	/** Data-channel ping RTT (ms), measured every 2s once connected. */
	rttMs: number | null
}

export interface P2PRoomOptions {
	room: string
	selfId: string
	name?: string
	/** Defaults to VITE_STUN_URLS (comma-separated) or Google public STUN. */
	iceServers?: RTCIceServer[]
	onPeersChanged?: (peers: PeerInfo[]) => void
	/** Fires for both the unreliable "state" and reliable "reliable" channels. */
	onMessage?: (from: string, data: unknown, channel: "state" | "reliable") => void
	/** Fires once, on the first successful signaling poll (registration). */
	onConnected?: () => void
}

export interface PeerSlot {
	pc: RTCPeerConnection
	state?: RTCDataChannel
	reliable?: RTCDataChannel
	makingOffer: boolean
	ignoreOffer: boolean
	/** ICE candidates that arrived before the remote description (buffered). */
	pendingCandidates: RTCIceCandidateInit[]
	/** Last time this pair made observable progress toward connected. */
	lastProgressAt: number
	/** Watchdog recreations (dialer) / stall windows (receiver) so far. */
	recoveryAttempts: number
	/** Gave up after MAX_RECOVERY_ATTEMPTS — excluded from fast-poll pressure. */
	terminal?: boolean
	/** One-shot: pc was already recreated to absorb a failing remote offer. */
	recreatedForOffer?: boolean
	info: PeerInfo
	pingSentAt?: number
}

export const FAST_POLL_MS = 400
export const IDLE_POLL_MS = 2000
export const PING_INTERVAL_MS = 2000
export const STALL_MS = 10_000
export const MAX_RECOVERY_ATTEMPTS = 3
export const SIGNAL_RETRY_DELAYS_MS = [250, 750]

export function defaultIceServers(): RTCIceServer[] {
	const urls = (import.meta.env.VITE_STUN_URLS as string | undefined)
		?.split(",")
		.map((u) => u.trim())
		.filter(Boolean)
	// Two independent providers: ICE queries all of them in parallel during
	// gathering, so either one being unreachable costs nothing.
	return [
		{
			urls: urls?.length ? urls : ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"],
		},
	]
}

export type P2PHost = {
	opts: P2PRoomOptions
	peers: Map<string, PeerSlot>
	signalQueues: Map<string, Promise<void>>
	closed: boolean
	schedulePoll(delay: number): void
	emitPeers(): void
}
