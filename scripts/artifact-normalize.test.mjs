import assert from "node:assert/strict"
import { test } from "node:test"
import { normalizeArtifact } from "../src/lib/types.ts"

test("a diagram with only a title still has nodes and edges arrays", () => {
	const artifact = normalizeArtifact({ type: "diagram", title: "Flow" })
	assert.equal(artifact?.type, "diagram")
	assert.ok(Array.isArray(artifact.nodes))
	assert.equal(artifact.nodes.length, 0)
	assert.ok(Array.isArray(artifact.edges))
	assert.equal(artifact.edges.length, 0)
})

test("diagram nodes nested under graph are recovered", () => {
	const artifact = normalizeArtifact({
		type: "diagram",
		title: "Deps",
		graph: {
			nodes: [
				{ id: "a", label: "App" },
				{ id: "b", name: "API" },
			],
			edges: [{ source: "a", target: "b", label: "calls" }],
		},
	})
	assert.equal(artifact?.type, "diagram")
	assert.deepEqual(artifact.nodes, [
		{ id: "a", label: "App" },
		{ id: "b", label: "API" },
	])
	assert.deepEqual(artifact.edges, [{ from: "a", to: "b", label: "calls" }])
})

test("status and chart missing collections become empty arrays", () => {
	const status = normalizeArtifact({ type: "status", title: "Health" })
	assert.equal(status?.type, "status")
	assert.deepEqual(status.items, [])
	const chart = normalizeArtifact({ type: "chart", title: "Hours" })
	assert.equal(chart?.type, "chart")
	assert.deepEqual(chart.series, [])
})
