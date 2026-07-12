'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Pencil, Trash2, Loader2 } from 'lucide-react'

interface RequestActionsProps {
  requestId: string
  canEdit: boolean
  canDelete: boolean
}

export default function RequestActions({ requestId, canEdit, canDelete }: RequestActionsProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this request? This action cannot be undone.')) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/requests/${requestId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/minta/requests')
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete request.')
      }
    } catch {
      alert('Network error. Failed to delete.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {canEdit && (
        <Link href={`/minta/requests/${requestId}/edit`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Pencil size="13" />
            Edit
          </Button>
        </Link>
      )}
      {canDelete && (
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 size="13" className="animate-spin" /> : <Trash2 size="13" />}
          Delete
        </Button>
      )}
    </div>
  )
}
