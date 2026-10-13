import posthog from 'posthog-js'

// Runs in the browser before the app hydrates. Without a key (local dev, CI)
// analytics is simply off — nothing else in the app depends on it.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (key) {
  posthog.init(key, {
    // Same-origin proxy (see next.config.ts) so ad-blockers don't drop events.
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2025-05-24',
    // Requisitions carry supplier and pricing data: never record inputs,
    // and session replay stays off until it is turned on deliberately.
    disable_session_recording: true,
    session_recording: { maskAllInputs: true },
    // Only people we identify get profiles; anonymous visitors stay anonymous.
    person_profiles: 'identified_only',
  })
}
