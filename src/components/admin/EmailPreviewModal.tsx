'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Smartphone,
  Monitor,
  Send,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  DollarSign,
  Copy,
  Check,
  Mail,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import type { WorkflowEventType } from '@/lib/email/templates/workflow-email'

interface EmailPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  currentUserEmail?: string | null
}

const TEMPLATES: Array<{
  id: WorkflowEventType
  label: string
  icon: any
  badgeBg: string
  badgeText: string
  description: string
}> = [
  {
    id: 'po_approved',
    label: 'PO Approved',
    icon: CheckCircle2,
    badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    badgeText: 'Emerald Theme',
    description: 'Sent when Cost Control clears the PO and routes it to Finance for payment.',
  },
  {
    id: 'po_sent_back',
    label: 'PO Sent Back',
    icon: RotateCcw,
    badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    badgeText: 'Amber Theme',
    description: 'Sent when an order requires revisions, prominently quoting reviewer feedback.',
  },
  {
    id: 'payment_complete',
    label: 'Payment Complete',
    icon: DollarSign,
    badgeBg: 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400',
    badgeText: 'Teal Theme',
    description: 'Sent when Finance disburses funds and closes the requisition cycle.',
  },
  {
    id: 'converted',
    label: 'Converted to PO',
    icon: FileText,
    badgeBg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
    badgeText: 'Indigo Theme',
    description: 'Sent to the requester when Admin generates the official Purchase Order.',
  },
]

export default function EmailPreviewModal({
  isOpen,
  onClose,
  currentUserEmail,
}: EmailPreviewModalProps) {
  const [selectedType, setSelectedType] = useState<WorkflowEventType>('po_approved')
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [format, setFormat] = useState<'html' | 'text'>('html')
  const [isLoading, setIsLoading] = useState(true)
  const [htmlContent, setHtmlContent] = useState('')
  const [textContent, setTextContent] = useState('')
  const [subject, setSubject] = useState('')
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchPreview = async (type: WorkflowEventType) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/emails/preview?type=${type}`)
      if (res.ok) {
        const json = await res.json()
        setHtmlContent(json.data.html)
        setTextContent(json.data.text)
        setSubject(json.data.subject)
      }
    } catch (err) {
      console.error('Failed to load email preview:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchPreview(selectedType)
      setTestResult(null)
    }
  }, [isOpen, selectedType])

  const handleSendTest = async () => {
    setIsSendingTest(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: selectedType }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.mocked
            ? `Logged mock test email for ${data.recipient || currentUserEmail} (No SMTP configured)`
            : `Test email dispatched successfully to ${data.recipient || currentUserEmail}! Check your inbox.`,
        })
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to dispatch test email',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setTestResult({ success: false, message: msg })
    } finally {
      setIsSendingTest(false)
    }
  }

  const handleCopyText = () => {
    navigator.clipboard.writeText(format === 'html' ? htmlContent : textContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  const activeTemplate = TEMPLATES.find((t) => t.id === selectedType) || TEMPLATES[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative flex flex-col h-[92vh] w-full max-w-5xl rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Mail size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Email Template Studio</h2>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Tailored to Requisition
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                High-end transactional notifications with responsive layouts, line items, and audit context.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSendTest}
              disabled={isSendingTest}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
              title="Send a real test email to your logged-in email"
            >
              {isSendingTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              <span>{isSendingTest ? 'Sending...' : 'Send Test to My Email'}</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Template Selector Bar */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-5 py-2.5 overflow-x-auto">
          {TEMPLATES.map((tmpl) => {
            const Icon = tmpl.icon
            const isSelected = selectedType === tmpl.id
            return (
              <button
                key={tmpl.id}
                onClick={() => setSelectedType(tmpl.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-card text-foreground shadow-sm border border-border/90 ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
              >
                <Icon size={14} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                <span>{tmpl.label}</span>
              </button>
            )
          })}
        </div>

        {/* Toolbar & Subject Line */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-2.5 bg-muted/10 text-xs">
          {/* Subject Line Display */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider shrink-0">
              Subject:
            </span>
            <span className="truncate rounded-md bg-muted px-2.5 py-1 text-xs font-mono font-medium text-foreground border border-border/60">
              {subject || 'Loading subject...'}
            </span>
          </div>

          {/* Viewport and Mode Switchers */}
          <div className="flex items-center gap-3 shrink-0">
            {/* HTML vs Text Toggle */}
            <div className="flex rounded-lg border border-border/80 bg-muted/50 p-0.5">
              <button
                onClick={() => setFormat('html')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  format === 'html' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                HTML Preview
              </button>
              <button
                onClick={() => setFormat('text')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  format === 'text' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Plaintext
              </button>
            </div>

            {/* Desktop vs Mobile Toggle */}
            {format === 'html' && (
              <div className="flex rounded-lg border border-border/80 bg-muted/50 p-0.5">
                <button
                  onClick={() => setViewport('desktop')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    viewport === 'desktop'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Desktop (600px)"
                >
                  <Monitor size={13} />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => setViewport('mobile')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    viewport === 'mobile'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Mobile (375px)"
                >
                  <Smartphone size={13} />
                  <span>Mobile</span>
                </button>
              </div>
            )}

            {/* Copy Button */}
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1 rounded-lg border border-border/80 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              title="Copy code to clipboard"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Test Alert Banner if any */}
        {testResult && (
          <div
            className={`flex items-center justify-between px-5 py-2.5 text-xs font-medium ${
              testResult.success
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-b border-rose-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{testResult.message}</span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          </div>
        )}

        {/* Main Preview Area */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 overflow-y-auto flex items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-xs font-medium">Generating email preview...</p>
            </div>
          ) : format === 'html' ? (
            <div
              className={`transition-all duration-300 mx-auto rounded-2xl shadow-xl overflow-hidden bg-white ${
                viewport === 'mobile'
                  ? 'w-[375px] max-w-full ring-8 ring-slate-800'
                  : 'w-[640px] max-w-full'
              }`}
            >
              <iframe
                title="Email Preview"
                srcDoc={htmlContent}
                className="w-full border-none h-[650px] overflow-y-auto bg-slate-50"
              />
            </div>
          ) : (
            <div className="w-full max-w-2xl rounded-xl border border-border/80 bg-card p-5 font-mono text-xs leading-relaxed text-foreground shadow-lg overflow-x-auto whitespace-pre-wrap">
              {textContent}
            </div>
          )}
        </div>

        {/* Bottom Context Info Footer */}
        <div className="flex flex-wrap items-center justify-between border-t border-border/80 px-5 py-3 bg-muted/30 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-semibold text-foreground">{activeTemplate.label}:</span>
            <span>{activeTemplate.description}</span>
          </div>

          <div className="text-[11px] text-muted-foreground">
            Compatible with Gmail, Apple Mail, Outlook & Mobile Email Clients
          </div>
        </div>
      </div>
    </div>
  )
}
