import { useEffect, useRef, useState } from "react"
import { Field } from "@/components/settings-field"
import { ModelTab } from "@/components/settings-model"
import { SourcesPanel } from "@/components/settings-sources"
import { DataTab, ToolsTab } from "@/components/settings-tools"
import { VoiceTab } from "@/components/settings-voice"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { authEnabled } from "@/lib/auth/client"
import { UserButton } from "@/lib/auth/gates"
import type { SettingsTab } from "@/lib/environment/types"
import { speech } from "@/lib/speech"
import { useApp } from "@/lib/store"

export function SettingsDialog() {
	const dialog = useApp((s) => s.dialog)
	const openDialog = useApp((s) => s.openDialog)
	const settings = useApp((s) => s.settings)
	const patch = useApp((s) => s.patchSettings)
	const settingsTab = useApp((s) => s.settingsTab)
	const setSettingsTab = useApp((s) => s.setSettingsTab)
	const focusField = useApp((s) => s.focusField)
	const sources = useApp((s) => s.sources)
	const attachSource = useApp((s) => s.attachSource)
	const connectSource = useApp((s) => s.connectSource)
	const removeSource = useApp((s) => s.removeSource)
	const syncSource = useApp((s) => s.syncSource)
	const setPresence = useApp((s) => s.setPresence)
	const voiceMode = useApp((s) => s.voiceMode)

	const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
	const [previewing, setPreviewing] = useState(false)
	const previewingRef = useRef(false)
	const previewGen = useRef(0)

	useEffect(() => {
		const load = () => setVoices(speech.listVoices())
		load()
		window.speechSynthesis?.addEventListener("voiceschanged", load)
		return () => window.speechSynthesis?.removeEventListener("voiceschanged", load)
	}, [])

	useEffect(() => {
		if (dialog !== "settings" || !focusField) return
		const root = document.querySelector(`[data-field="${CSS.escape(focusField)}"]`)
		const el = root instanceof HTMLElement ? (root.querySelector("input, textarea, select") ?? root) : null
		if (el instanceof HTMLElement && settingsTab) {
			el.focus()
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select()
		}
	}, [dialog, focusField, settingsTab])

	useEffect(() => {
		if (dialog === "settings") return
		if (!previewingRef.current) return
		previewGen.current += 1
		speech.stopSpeak()
		previewingRef.current = false
		setPreviewing(false)
		setPresence({ presence: voiceMode ? "listening" : "idle" })
	}, [dialog, setPresence, voiceMode])

	const playVoicePreview = (override?: { voiceURI?: string; rate?: number; pitch?: number }) => {
		if (!speech.ttsSupported) return
		const gen = ++previewGen.current
		previewingRef.current = true
		setPreviewing(true)
		setPresence({ presence: "speaking" })
		speech.previewVoice({
			voiceURI: override?.voiceURI ?? settings.voiceURI,
			rate: override?.rate ?? settings.rate,
			pitch: override?.pitch ?? settings.pitch,
			onEnd: () => {
				if (previewGen.current !== gen) return
				previewingRef.current = false
				setPreviewing(false)
			},
		})
	}

	const stopVoicePreview = () => {
		if (!previewingRef.current) return
		previewGen.current += 1
		speech.stopSpeak()
		previewingRef.current = false
		setPreviewing(false)
		setPresence({ presence: voiceMode ? "listening" : "idle" })
	}

	return (
		<Dialog open={dialog === "settings"} onOpenChange={(o) => openDialog(o ? "settings" : null)}>
			<DialogContent className="grid-rows-[auto_1fr] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>Name, voice, and which model talks.</DialogDescription>
				</DialogHeader>
				<Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as SettingsTab)} className="min-h-0">
					<TabsList>
						<TabsTrigger value="general">General</TabsTrigger>
						<TabsTrigger value="voice">Voice</TabsTrigger>
						<TabsTrigger value="model">Model</TabsTrigger>
						<TabsTrigger value="tools">Tools</TabsTrigger>
						<TabsTrigger value="sources">Sources</TabsTrigger>
						<TabsTrigger value="data">Data</TabsTrigger>
					</TabsList>
					<ScrollArea className="h-[min(52dvh,28rem)] pr-2">
						<TabsContent value="general" className="space-y-4">
							<Field label="Assistant name" field="agentName">
								<Input value={settings.agentName} onChange={(e) => patch({ agentName: e.target.value })} />
							</Field>
							<Field label="What to call you" field="userName">
								<Input value={settings.userName} onChange={(e) => patch({ userName: e.target.value })} />
							</Field>
							<Field label="Standing brief" field="brief">
								<Textarea
									value={settings.brief}
									onChange={(e) => patch({ brief: e.target.value })}
									placeholder="How you work, what to watch, what not to do."
								/>
							</Field>
							{authEnabled ? (
								<div className="rounded-xl bg-surface-2 p-3">
									<p className="mb-2 text-xs text-muted-foreground">Account</p>
									<UserButton />
								</div>
							) : null}
						</TabsContent>
						<TabsContent value="voice">
							<VoiceTab
								voices={voices}
								previewing={previewing}
								onPreview={playVoicePreview}
								onStop={stopVoicePreview}
							/>
						</TabsContent>
						<TabsContent value="model">
							<ModelTab />
						</TabsContent>
						<TabsContent value="tools">
							<ToolsTab />
						</TabsContent>
						<TabsContent value="sources">
							<SourcesPanel
								sources={sources ?? []}
								onAttach={attachSource}
								onConnect={connectSource}
								onRemove={removeSource}
								onSync={syncSource}
							/>
						</TabsContent>
						<TabsContent value="data">
							<DataTab />
						</TabsContent>
					</ScrollArea>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}
