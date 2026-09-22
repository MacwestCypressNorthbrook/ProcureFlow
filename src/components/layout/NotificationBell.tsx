'use client'

import { useState, useEffect } from 'react'
import { Bell, Check, Clock, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import type { Notification } from '@/lib/types'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let isMounted = true
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

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 20000)
    return () => {
      isMounted = false
      clearInterval(interval)
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
          <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Notifications & Alerts</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {unreadCount} unread
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto divide-y divide-border/50">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => (
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
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
