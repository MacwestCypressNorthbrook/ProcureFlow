'use client'

import { useEffect, useRef } from 'react'
import posthog from 'posthog-js'
import { useSession } from '@/lib/auth/client'

/**
 * Ties analytics to the signed-in user by internal id only — no email or name —
 * and resets on sign-out so the next person on a shared machine starts clean.
 */
export default function PostHogIdentify() {
  const { data } = useSession()
  const userId = data?.user?.id
  const identified = useRef(false)

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    if (userId) {
      posthog.identify(userId)
      identified.current = true
    } else if (identified.current) {
      posthog.reset()
      identified.current = false
    }
  }, [userId])

  return null
}
