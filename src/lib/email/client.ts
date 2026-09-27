import { Resend } from 'resend'
import nodemailer, { type Transporter } from 'nodemailer'
import { requestLinkForRole } from '@/lib/links'
import { roleLabel as labelForRole } from '@/lib/roles'

interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

const DEFAULT_FROM = process.env.EMAIL_FROM || 'ProcureFlow <notifications@procureflow.internal>'

// Resend client (lazy)
let resendClient: Resend | null = null
function getResendClient(): Resend | null {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

// Nodemailer SMTP transport (lazy)
let smtpTransport: Transporter | null = null
function getSmtpTransport(): Transporter | null {
  if (!smtpTransport && process.env.SMTP_HOST) {
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || '',
      },
      // A wrong host silently hangs the request otherwise — fail fast instead.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }
  return smtpTransport
}

/**
 * Universal email dispatcher:
 * 1. Checks RESEND_API_KEY first.
 * 2. Falls back to SMTP_HOST / nodemailer.
 * 3. In dev mode without credentials, logs to console safely.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; id?: string; error?: string; mocked?: boolean }> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to]
  const resend = getResendClient()
  // Remember why a configured provider refused, so the caller is not told the
  // send was mocked when it actually failed.
  let lastError: string | null = null

  // 1. Try Resend if configured
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: DEFAULT_FROM,
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      })

      if (error) {
        console.error('Resend email error:', error)
        lastError = error.message ?? 'Resend rejected the message'
        // Fall through to SMTP if available
      } else {
        return { success: true, id: data?.id }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Resend delivery failed:', msg)
      lastError = msg
    }
  }

  // 2. Try SMTP if configured
  const smtp = getSmtpTransport()
  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from: DEFAULT_FROM,
        to: recipients.join(', '),
        subject: options.subject,
        html: options.html,
        text: options.text,
      })
      return { success: true, id: info.messageId }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('SMTP delivery failed:', msg)
      return { success: false, error: msg }
    }
  }

  // 3. A provider was configured but refused — report that, do not pretend.
  if (lastError) {
    return { success: false, error: lastError }
  }

  // 4. Fallback: Log email in dev
  console.log('📧 [Email Mock Delivery - No Resend/SMTP Configured]')
  console.log(`   To: ${recipients.join(', ')}`)
  console.log(`   Subject: ${options.subject}`)
  return { success: true, id: 'mock-local-id', mocked: true }
}

/**
 * Template: Notification for new requisition submitted
 */
export async function sendRequisitionAlertEmail({
  recipientEmail,
  recipientName,
  requestId,
  purpose,
  requesterName,
  estimatedAmount,
  roleName,
}: {
  recipientEmail: string
  recipientName: string
  requestId: string
  purpose: string
  requesterName: string
  estimatedAmount?: number | null
  roleName: string
}) {
  // `roleName` is the recipient's role, so the CTA must resolve against it —
  // a Project Lead sent to the engineer-only area would just be bounced.
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}${requestLinkForRole(roleName, requestId)}`
  const amountFormatted =
    estimatedAmount != null
      ? new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(estimatedAmount)
      : 'N/A'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <h2 style="color: #0f172a; margin-bottom: 8px;">ProcureFlow Requisition Review</h2>
      <p style="color: #64748b; font-size: 14px;">Action Required for: <strong>${labelForRole(roleName)}</strong></p>
      <p style="color: #334155; font-size: 14px;">Hello ${recipientName || 'there'},</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px;"><strong>Requisition:</strong> ${purpose}</p>
        <p style="margin: 0 0 8px;"><strong>Requested By:</strong> ${requesterName}</p>
        <p style="margin: 0;"><strong>Estimated Amount:</strong> ${amountFormatted}</p>
      </div>
      <p style="margin-top: 24px;">
        <a href="${reviewUrl}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">View Requisition</a>
      </p>
    </div>
  `
  return sendEmail({
    to: recipientEmail,
    subject: `[ProcureFlow] Action Required: Requisition "${purpose}"`,
    html,
  })
}

/**
 * Template: weekly bundle of requisitions awaiting a Project Lead's review.
 *
 * Leads still get an instant in-app notification per requisition; this is
 * the once-a-week email so their inbox gets one message instead of one per
 * submission. See `getLeadDigestSettings` for the schedule.
 */
export async function sendLeadDigestEmail({
  recipientEmail,
  recipientName,
  items,
  queueUrl,
}: {
  recipientEmail: string
  recipientName: string
  items: Array<{
    requestId: string
    purpose: string
    requesterName: string
    projectName?: string | null
    amount?: number | null
    createdAt: string
  }>
  queueUrl: string
}) {
  const ghs = (n?: number | null) =>
    n == null ? '—' : new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(n)

  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">${item.purpose}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569;">${item.requesterName}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569;">${item.projectName || '—'}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; text-align: right;">${ghs(item.amount)}</td>
        </tr>`
    )
    .join('')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <h2 style="color: #0f172a; margin-bottom: 8px;">ProcureFlow Weekly Digest</h2>
      <p style="color: #334155; font-size: 14px;">Hello ${recipientName || 'there'},</p>
      <p style="color: #64748b; font-size: 14px;">
        ${items.length} requisition${items.length === 1 ? '' : 's'} ${items.length === 1 ? 'is' : 'are'} waiting on your review.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b;">Requisition</th>
            <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b;">Requester</th>
            <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b;">Site</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; text-transform: uppercase; color: #64748b;">Est. amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top: 24px;">
        <a href="${queueUrl}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Review requisitions</a>
      </p>
    </div>
  `
  return sendEmail({
    to: recipientEmail,
    subject: `[ProcureFlow] Weekly digest: ${items.length} requisition${items.length === 1 ? '' : 's'} awaiting your review`,
    html,
  })
}

/**
 * Template: Reminder for pending approval or action
 */
export async function sendActionReminderEmail({
  recipientEmail,
  recipientName,
  title,
  message,
  linkUrl,
  dueDate,
}: {
  recipientEmail: string
  recipientName: string
  title: string
  message: string
  linkUrl: string
  dueDate?: string
}) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <div style="display: inline-block; padding: 4px 8px; background: #fef3c7; color: #b45309; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 12px;">Reminder</div>
      <h2 style="color: #0f172a; margin: 0 0 12px;">${title}</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">Hello ${recipientName || 'there'},</p>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">${message}</p>
      ${dueDate ? `<p style="color: #dc2626; font-size: 14px; font-weight: 500;">Due: ${new Date(dueDate).toLocaleString()}</p>` : ''}
      <p style="margin-top: 24px;">
        <a href="${linkUrl}" style="background-color: #0f172a; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Take Action Now</a>
      </p>
    </div>
  `
  return sendEmail({
    to: recipientEmail,
    subject: `[Reminder] ${title}`,
    html,
  })
}

/** Escape user-supplied values before they go into an HTML email body. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Template: invitation for an admin-created account.
 *
 * The profile row exists with the role and project assignments already set, but
 * the person still creates their own sign-in credentials. They MUST sign up
 * with this exact email address — that is what links them to the waiting row
 * (see `provisionUser` in `lib/auth/server.ts`).
 */
export async function sendUserInviteEmail({
  recipientEmail,
  recipientName,
  roleLabel,
  projectNames = [],
  invitedByName,
}: {
  recipientEmail: string
  recipientName?: string | null
  roleLabel: string
  projectNames?: string[]
  invitedByName?: string | null
}) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const signupUrl = `${appUrl}/auth/signup`
  const greeting = recipientName?.trim() ? esc(recipientName.trim().split(' ')[0]) : 'there'
  const invitedBy = invitedByName?.trim() ? ` by ${esc(invitedByName.trim())}` : ''
  const projects = projectNames.filter(Boolean).map(esc)

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <h2 style="color: #0f172a; margin: 0 0 8px;">You have been added to ProcureFlow</h2>
      <p style="color: #64748b; font-size: 14px; margin: 0 0 20px;">An account was set up for you${invitedBy}.</p>

      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello ${greeting},</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        Your ProcureFlow profile is ready. You choose your own password — just complete the sign-up
        below using <strong>this exact email address</strong>, and your access will be waiting for you.
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Sign in with:</strong> ${esc(recipientEmail)}</p>
        <p style="margin: 0${projects.length ? '; margin-bottom: 8px' : ''}; font-size: 14px;"><strong>Your role:</strong> ${esc(roleLabel)}</p>
        ${projects.length ? `<p style="margin: 8px 0 0; font-size: 14px;"><strong>Project sites:</strong> ${projects.join(', ')}</p>` : ''}
      </div>

      <ol style="color: #475569; font-size: 14px; line-height: 1.7; padding-left: 20px; margin: 0 0 24px;">
        <li>Open the sign-up page using the button below.</li>
        <li>Enter <strong>${esc(recipientEmail)}</strong> — a different address will not find your profile.</li>
        <li>Pick a password you have not used elsewhere, then sign in.</li>
      </ol>

      <p style="margin: 0 0 24px;">
        <a href="${signupUrl}" style="background-color: #2563eb; color: #ffffff; padding: 11px 22px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Create your password</a>
      </p>

      <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        If the button does not work, paste this link into your browser:<br />
        <span style="color: #64748b;">${signupUrl}</span><br /><br />
        Were you not expecting this? You can ignore this email — no account is active until you set a password.
      </p>
    </div>
  `

  const text = [
    `You have been added to ProcureFlow${invitedByName ? ` by ${invitedByName}` : ''}.`,
    '',
    `Sign in with: ${recipientEmail}`,
    `Your role: ${roleLabel}`,
    projectNames.length ? `Project sites: ${projectNames.join(', ')}` : '',
    '',
    `Create your password here: ${signupUrl}`,
    '',
    'Use that exact email address when signing up — a different address will not find your profile.',
  ]
    .filter(Boolean)
    .join('\n')

  return sendEmail({
    to: recipientEmail,
    subject: 'Your ProcureFlow account is ready — set your password',
    html,
    text,
  })
}
