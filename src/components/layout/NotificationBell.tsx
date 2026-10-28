'use client'

import { useState, useEffect } from 'react'
import { Bell, Check, Clock, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import type { Notification } from '@/lib/types'

/** "Today", "Yesterday", or a plain date — the label a notification's day groups under. */
function dayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

/** Notifications already arrive newest-first from the API; this only buckets them by day. */
function groupByDay(notifications: Notification[]): Array<{ label: string; items: Notification[] }> {
  const groups: Array<{ label: string; items: Notification[] }> = []
  for (const n of notifications) {
    const label = dayLabel(n.created_at)
    const current = groups[groups.length - 1]
    if (current && current.label === label) {
      current.items.push(n)
    } else {
      groups.push({ label, items: [n] })
    }
  }
  return groups
}

const POLL_MS = 60_000
/**
 * Stop polling after this long without a click, key, scroll or focus.
 * Kept just past the stage digest's 10-minute quiet period, so a reviewer's
 * own last polls send their batch without waiting for the cron.
 */
const IDLE_AFTER_MS = 12 * 60_000

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let isMounted = true
    let interval: ReturnType<typeof setInterval> | null = null

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications')
        if (res.ok && isMounted) {
          const json = await res.json()
          setNotifications(json.data || [])
        }
      } catch {
        // ignore
      }
    }

    // Each poll wakes the database, which then stays billable for ~5 minutes.
    // A tab left open on a desk overnight would keep it awake until morning,
    // so polling also stops once nobody has touched the page for a while.
    let lastActivity = Date.now()
    const poll = () => {
      if (Date.now() - lastActivity > IDLE_AFTER_MS) {
        stopPolling()
        return
      }
      fetchNotifications()
    }
    const startPolling = () => {
      if (interval) return
      interval = setInterval(poll, POLL_MS)
    }
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    // A backgrounded tab has no business hitting the API every minute for hours
    // on end — pause entirely while hidden, and catch up the moment it's
    // visible again instead of waiting out whatever was left of the interval.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastActivity = Date.now()
        fetchNotifications()
        startPolling()
      } else {
        stopPolling()
      }
    }

    // Back from idle: catch up at once, then resume the regular poll.
    const handleActivity = () => {
      const wasIdle = !interval && document.visibilityState === 'visible'
      lastActivity = Date.now()
      if (wasIdle) {
        fetchNotifications()
        startPolling()
      }
    }
    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'focus'] as const

    fetchNotifications()
    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', handleVisibility)
    for (const e of activityEvents) window.addEventListener(e, handleActivity, { passive: true })

    return () => {
      isMounted = false
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
      for (const e of activityEvents) window.removeEventListener(e, handleActivity)
    }
  }, [])

  const markAsRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch {
      // ignore
    }
  }

  const clearAll = async () => {
    const previous = notifications
    setNotifications([])
    try {
      await fetch('/api/notifications', { method: 'DELETE' })
    } catch {
      // Restore so a network failure doesn't quietly lose the list.
      setNotifications(previous)
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const getIcon = (type: string) => {
    switch (type) {
      case 'approval':
        return <Clock size={14} className="text-amber-500" />
      case 'reminder':
        return <AlertTriangle size={14} className="text-orange-500" />
      case 'success':
        return <CheckCircle size={14} className="text-emerald-500" />
      default:
        return <Info size={14} className="text-blue-500" />
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Notifications & Reminders"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-x-4 top-20 z-50 max-h-[75vh] overflow-hidden rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl animate-in fade-in zoom-in-95 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-none sm:w-96">
            <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Notifications & Alerts</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                groupByDay(notifications).map((group) => (
                  <div key={group.label}>
                    <p className="sticky top-0 bg-card/95 backdrop-blur-md px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="divide-y divide-border/50">
                      {group.items.map((n) => (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 p-3.5 transition-colors hover:bg-muted/40 ${
                            !n.is_read ? 'bg-primary/5' : ''
                          }`}
                        >
                          <span className="mt-0.5 shrink-0 rounded-lg p-1.5 bg-muted">
                            {getIcon(n.type)}
                          </span>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate text-xs font-semibold text-foreground">
                                {n.title}
                              </p>
                              {!n.is_read && (
                                <button
                                  onClick={() => markAsRead(n.id)}
                                  className="text-[10px] text-muted-foreground hover:text-primary shrink-0"
                                  title="Mark as read"
                                >
                                  <Check size={12} />
                                </button>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                              {n.message}
                            </p>
                            {n.link && (
                              <Link
                                href={n.link}
                                onClick={() => {
                                  markAsRead(n.id)
                                  setIsOpen(false)
                                }}
                                className="mt-1.5 inline-block text-[11px] font-medium text-primary hover:underline"
                              >
                                View Details &rarr;
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
