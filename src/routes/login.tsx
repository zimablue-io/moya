import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client"
import { APP_NAME } from "@/lib/brand"

export const Route = createFileRoute("/login")({ component: Login })

function Login() {
	return (
		<main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
			<div className="w-full max-w-sm space-y-6">
				<div>
					<p className="type-display text-4xl">{APP_NAME}</p>
					<p className="mt-2 text-sm text-muted-foreground">
						One assistant. Sign in is optional — memory stays on this device either way.
					</p>
				</div>
				{authEnabled ? (
					<div className="space-y-2">
						{GROK_PROVIDERS.map((p) => (
							<Button
								key={p.providerId}
								type="button"
								variant="outline"
								className="w-full"
								onClick={() => signIn(p.providerId, { callbackURL: "/" })}
							>
								Continue with {p.label}
							</Button>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">Sign-in is disabled.</p>
				)}
				<a
					href="/"
					className="block text-center text-sm text-muted-foreground outline-none ring-inset hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					Back
				</a>
			</div>
		</main>
	)
}
