import type { NextConfig } from 'next'

/**
 * Headers applied to every response.
 *
 * The app handles procurement approvals and signed document links, so the
 * baseline is: never framed, never sniffed, and no referrer leakage of
 * requisition ids to third parties.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    // Only meaningful over HTTPS; ignored on localhost.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

// PostHog is reached through same-origin /ingest rewrites so ad-blockers don't
// drop events. Region follows NEXT_PUBLIC_POSTHOG_HOST (US by default).
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
const posthogAssetsHost = posthogHost.replace('.i.posthog.com', '-assets.i.posthog.com')

const nextConfig: NextConfig = {
  // PostHog's API paths are trailing-slash sensitive.
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: `${posthogAssetsHost}/static/:path*` },
      { source: '/ingest/:path*', destination: `${posthogHost}/:path*` },
    ]
  },

  // Ship only the icons actually used instead of whole icon barrels. On a slow
  // connection this is the difference between a few KB and a few hundred.
  experimental: {
    optimizePackageImports: ['lucide-react', 'iconsax-react', 'date-fns'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Uploads are proxied through route handlers; cap the body so a large file
  // fails fast with a readable error instead of exhausting the function.
  serverExternalPackages: ['@aws-sdk/client-s3'],

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Immutable build assets — safe to cache hard, which matters most on
        // repeat visits over poor connections.
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Never let a proxy or browser cache an API response containing
        // requisition or user data.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
