'use client'

import { Children, cloneElement, isValidElement, useId } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/* Shared building blocks for the admin management panels. Kept local to the
   admin area so its forms stay consistent without touching the app-wide kit. */

/** Centred modal on desktop, bottom sheet on phones. Built on the app Dialog
 *  primitive, which traps and restores focus, closes on Escape and locks scroll. */
export function AdminModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogPortal>
        <DialogOverlay className="z-[60] bg-black/50 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Popup
          className={cn(
            'fixed right-0 bottom-0 left-0 z-[60] flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 sm:right-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-h-[86vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-base leading-normal font-semibold text-foreground">{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-0.5 text-sm text-muted-foreground">{description}</DialogDescription>
              )}
            </div>
            <DialogClose
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X size={18} aria-hidden />
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

export const adminInputClass =
  'h-11 w-full rounded-lg border border-input bg-card px-3.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:h-10 sm:text-sm'

const LABELLABLE = new Set(['input', 'select', 'textarea'])

/**
 * Label + control. When the only child is an input/select/textarea it is
 * given an id (its own, or a generated one) and the label points at it, so
 * every field is programmatically labelled without each panel minting ids.
 * Anything else (e.g. a checkbox group) gets a plain caption instead.
 */
export function AdminField({
  label,
  required,
  hint,
  htmlFor,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  const autoId = useId()
  let controlId = htmlFor
  let content = children
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null
  if (!controlId && isValidElement<{ id?: string }>(only) && typeof only.type === 'string' && LABELLABLE.has(only.type)) {
    controlId = only.props.id ?? autoId
    content = cloneElement(only, { id: controlId })
  }

  const captionClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground'
  const caption = (
    <>
      {label}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </>
  )

  return (
    <div>
      {controlId ? (
        <label htmlFor={controlId} className={captionClass}>
          {caption}
        </label>
      ) : (
        <p className={captionClass}>{caption}</p>
      )}
      {content}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function AdminButton({
  children,
  variant = 'default',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'danger'
}) {
  const variants = {
    default: 'bg-primary text-primary-foreground hover:opacity-90',
    outline: 'border border-input bg-card text-foreground hover:bg-muted',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    danger: 'bg-destructive text-destructive-foreground hover:opacity-90',
  }
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-opacity disabled:opacity-60 sm:h-10 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function AdminError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
      {message}
    </p>
  )
}

/** Confirmation step for destructive actions, so a delete is never one tap. */
export function ConfirmPanel({
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-foreground">{message}</p>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <AdminButton type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </AdminButton>
        <AdminButton type="button" variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </AdminButton>
      </div>
    </div>
  )
}
