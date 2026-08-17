import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { APP_NAME } from "@/lib/brand"
import { useApp } from "@/lib/store"
import { uid } from "@/lib/utils"

export function ToolsTab() {
	const mcpServers = useApp((s) => s.mcpServers)
	const addMcp = useApp((s) => s.addMcp)
	const removeMcp = useApp((s) => s.removeMcp)
	const toggleMcp = useApp((s) => s.toggleMcp)
	const testMcp = useApp((s) => s.testMcp)
	const [mcpName, setMcpName] = useState("")
	const [mcpUrl, setMcpUrl] = useState("")
	const [mcpAuth, setMcpAuth] = useState("")

	return (
		<div className="space-y-4">
			<p className="text-xs text-muted">
				One assistant. Tools come from MCP servers your projects already expose. If a capability is missing, that is a
				gap in that project.
			</p>
			<div className="grid gap-2 sm:grid-cols-2">
				<Input placeholder="Name" value={mcpName} onChange={(e) => setMcpName(e.target.value)} />
				<Input placeholder="https://host/mcp" value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} />
				<Input
					className="sm:col-span-2"
					placeholder="Authorization header (optional)"
					value={mcpAuth}
					onChange={(e) => setMcpAuth(e.target.value)}
				/>
			</div>
			<Button
				variant="outline"
				disabled={!mcpName.trim() || !mcpUrl.trim()}
				onClick={() => {
					addMcp({
						id: uid("mcp"),
						name: mcpName.trim(),
						url: mcpUrl.trim(),
						authHeader: mcpAuth.trim(),
						enabled: true,
					})
					setMcpName("")
					setMcpUrl("")
					setMcpAuth("")
				}}
			>
				Add server
			</Button>
			<ul className="flex flex-col gap-2">
				{mcpServers.length === 0 ? (
					<li className="text-sm text-muted">
						No servers yet. Built-in tools still work: memory, boards, time, inbox, visuals.
					</li>
				) : (
					mcpServers.map((s) => (
						<li key={s.id} className="rounded-xl bg-surface-2 p-3">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-medium text-fg">{s.name}</p>
									<p className="text-xs break-all text-muted">{s.url}</p>
									<p className="mt-1 text-xs text-subtle">
										{(s.tools ?? []).length} tools
										{s.lastError ? ` · ${s.lastError}` : s.lastOkAt ? " · connected" : ""}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Switch checked={s.enabled} onCheckedChange={() => toggleMcp(s.id)} />
									<Button size="sm" variant="outline" onClick={() => void testMcp(s.id)}>
										Test
									</Button>
									<Button size="sm" variant="ghost" onClick={() => removeMcp(s.id)}>
										Remove
									</Button>
								</div>
							</div>
						</li>
					))
				)}
			</ul>
		</div>
	)
}

export function DataTab() {
	const wipe = useApp((s) => s.wipe)
	const exportJson = useApp((s) => s.exportJson)
	const importJson = useApp((s) => s.importJson)

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted">
				Transcripts, memory, boards, and keys live in a SQL database on this device. Nothing is stored on a {APP_NAME}{" "}
				server.
			</p>
			<p className="text-xs text-muted">
				Export is a private backup of this device, including API keys and MCP headers. Keep the file to yourself.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					onClick={() => {
						const blob = new Blob([exportJson()], { type: "application/json" })
						const url = URL.createObjectURL(blob)
						const a = document.createElement("a")
						a.href = url
						a.download = "moya-local.json"
						a.click()
						URL.revokeObjectURL(url)
					}}
				>
					Export
				</Button>
				<Button
					variant="outline"
					onClick={() => {
						const input = document.createElement("input")
						input.type = "file"
						input.accept = "application/json"
						input.onchange = async () => {
							const file = input.files?.[0]
							if (!file) return
							importJson(await file.text())
						}
						input.click()
					}}
				>
					Import
				</Button>
				<Button
					variant="danger"
					onClick={() => {
						if (!window.confirm("Wipe this device? Transcripts, memory, boards, and keys will be deleted.")) {
							return
						}
						void wipe()
					}}
				>
					Wipe this device
				</Button>
			</div>
		</div>
	)
}
