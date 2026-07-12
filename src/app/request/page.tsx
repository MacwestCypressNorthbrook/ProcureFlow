'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'

// ==========================================
// CUSTOM MINIMALIST GEOMETRIC ICONS
// ==========================================
const Icons = {
  Send: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
    </svg>
  ),
  Attachment: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32a1.5 1.5 0 11-2.122-2.121L16.71 5.96" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  Add: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  Magicpen: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l5.096-.813a2 2 0 001.037-.532l5.12-5.12a2 2 0 00-.001-2.828l-2.828-2.828a2 2 0 00-2.828 0l-5.12 5.12a2 2 0 00-.532 1.037zM3 12h5M3 16h3M3 8h7" />
    </svg>
  ),
  Message: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
  DocumentText: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  InfoCircle: () => (
    <svg className="w-4 h-4 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  VerifiedCheck: () => (
    <svg className="w-12 h-12 text-slate-900 dark:text-slate-100" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
};

// ==========================================
// CUSTOM MINIMALIST UI COMPONENTS
// ==========================================


const getFileIcon = (file: File) => {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) {
    return (
      <span className="text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded border border-red-200/40">PDF</span>
    )
  }
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) {
    return (
      <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200/40">XLS</span>
    )
  }
  if (name.endsWith('.doc') || name.endsWith('.docx')) {
    return (
      <span className="text-[10px] font-black text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200/40">DOC</span>
    )
  }
  return (
    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32a1.5 1.5 0 11-2.122-2.121L16.71 5.96" />
    </svg>
  )
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm'
}

const Button = ({ children, type = 'button', variant = 'default', className = '', size = 'default', ...props }: ButtonProps) => {
  const baseStyle = "inline-flex items-center justify-center font-medium text-xs tracking-wider transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none rounded";
  const variants = {
    default: "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-950",
    outline: "border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300",
    ghost: "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900"
  };
  const padding = size === 'sm' ? "px-2 py-1 text-[10px]" : "px-3.5 py-2";
  return (
    <button type={type} className={`${baseStyle} ${variants[variant]} ${padding} ${className}`} {...props}>
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', ...props }, ref) => (
  <input
    ref={ref}
    className={`w-full bg-transparent border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-slate-900 dark:focus:border-slate-100 focus:outline-none transition-colors rounded ${className}`}
    {...props}
  />
));
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = ({ className = '', ...props }: TextareaProps) => (
  <textarea
    className={`w-full bg-transparent border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-slate-900 dark:focus:border-slate-100 focus:outline-none transition-colors rounded ${className}`}
    {...props}
  />
);

interface RequisitionItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
  remarks: string
}

interface AttachedFileItem {
  id: string
  file: File
  previewUrl: string | null
}

export default function RequestPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Requisition Form State
  const [companyLogo, setCompanyLogo] = useState('Macwest')
  const [docTitle, setDocTitle] = useState('REQUISITION FORM')
  const [docNo, setDocNo] = useState('MACWL-IMS-A-RF-001')
  const [version, setVersion] = useState('1.0')
  const [page, setPage] = useState('Page 1 of 1')

  const [reqName, setReqName] = useState('')
  const [department, setDepartment] = useState('Operations')
  const [project, setProject] = useState('')
  const [date, setDate] = useState('')

  const [items, setItems] = useState<RequisitionItem[]>([
    { description: '', quantity: 1, unitPrice: 0, amount: 0, remarks: '' }
  ])

  const [requestedBy, setRequestedBy] = useState('')
  const [headOfDept, setHeadOfDept] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [paidBy, setPaidBy] = useState('')

  const [generalNotes, setGeneralNotes] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([])
  const [guestEmail, setGuestEmail] = useState('')

  // Set today's date on initial load
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setDate(today)
  }, [])

  // Auto-fill Requested By when name changes
  useEffect(() => {
    setRequestedBy(reqName)
  }, [reqName])

  // Recalculate amount for an item
  const updateItem = (index: number, fields: Partial<RequisitionItem>) => {
    const newItems = [...items]
    const updatedItem = { ...newItems[index], ...fields }
    
    const qty = updatedItem.quantity || 0
    const price = updatedItem.unitPrice || 0
    updatedItem.amount = qty * price
    
    newItems[index] = updatedItem
    setItems(newItems)
  }

  const addItemRow = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0, amount: 0, remarks: '' }])
  }

  const removeItemRow = (index: number) => {
    if (items.length === 1) {
      setItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0, remarks: '' }])
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  const grandTotal = items.reduce((sum, item) => sum + (item.amount || 0), 0)

  const loadBernardWiafeSample = () => {
    setCompanyLogo('Macwest')
    setDocTitle('REQUISITION FORM')
    setDocNo('MACWL-IMS-A-RF-001')
    setVersion('1.0')
    setPage('Page 1 of 1')
    setReqName('Bernard Wiafe')
    setDepartment('Operations')
    setProject('')
    setDate('2026-06-12')
    setItems([
      { 
        description: 'Payment of service rendered by Adenta Municipal Assembly office', 
        quantity: 1, 
        unitPrice: 5000, 
        amount: 5000, 
        remarks: '' 
      }
    ])
    setRequestedBy('Bernard Wiafe')
    setHeadOfDept('')
    setApprovedBy('____________________')
    setPaidBy('____________________')
    setGeneralNotes('')
    setAttachedFiles([])
  }

  const clearForm = () => {
    setCompanyLogo('Macwest')
    setDocTitle('REQUISITION FORM')
    setDocNo('MACWL-IMS-A-RF-001')
    setVersion('1.0')
    setPage('Page 1 of 1')
    setReqName('')
    setDepartment('Operations')
    setProject('')
    setDate(new Date().toISOString().split('T')[0])
    setItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0, remarks: '' }])
    setRequestedBy('')
    setHeadOfDept('')
    setApprovedBy('')
    setPaidBy('')
    setGeneralNotes('')
    attachedFiles.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
    })
    setAttachedFiles([])
    setGuestEmail('')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles: AttachedFileItem[] = Array.from(e.target.files).map(file => {
        const fileNameLower = file.name.toLowerCase()
        const isImage = file.type.startsWith('image/') || 
                        fileNameLower.endsWith('.png') || 
                        fileNameLower.endsWith('.jpg') || 
                        fileNameLower.endsWith('.jpeg') || 
                        fileNameLower.endsWith('.gif') || 
                        fileNameLower.endsWith('.webp')
        const previewUrl = isImage ? URL.createObjectURL(file) : null
        return {
          id: Math.random().toString(36).substring(2, 9),
          file,
          previewUrl
        }
      })
      setAttachedFiles(prev => [...prev, ...newFiles])
    }
  }

  const removeAttachment = (id: string) => {
    setAttachedFiles(prev => {
      const target = prev.find(f => f.id === id)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter(f => f.id !== id)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    
    if (!reqName.trim()) {
      setErrorMsg('Please enter a Requester Name.')
      return
    }

    if (items.some(item => !item.description.trim())) {
      setErrorMsg('All items must have a description.')
      return
    }

    setIsSubmitting(true)

    // Construct the structured JSON payload to store in description
    const richData = {
      type: 'rich_requisition',
      header: {
        companyLogo,
        docTitle,
        docNo,
        version,
        page
      },
      details: {
        name: reqName,
        department,
        project,
        date
      },
      items,
      signatures: {
        requestedBy,
        headOfDept,
        approvedBy,
        paidBy
      },
      generalNotes,
      attachedFiles: attachedFiles.map(af => ({
        name: af.file.name,
        size: af.file.size,
        type: af.file.type
      }))
    }

    // Determine the summary purpose for the database row
    const firstItemDesc = items[0]?.description || ''
    const generatedPurpose = firstItemDesc.length > 50 
      ? `${firstItemDesc.substring(0, 50)}...`
      : firstItemDesc || `Requisition from ${reqName}`

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: generatedPurpose,
          description: JSON.stringify(richData),
          estimated_quantity: 1,
          estimated_unit_rate: grandTotal,
          guest_name: reqName,
          guest_email: guestEmail || null,
        }),
      })

      if (res.ok) {
        setIsSubmitted(true)
      } else {
        const errorData = await res.json()
        setErrorMsg(errorData.error || 'Failed to submit request. Please try again.')
      }
    } catch (err) {
      setErrorMsg('Network error. Failed to submit request.')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const depts = ['Operations', 'Finance', 'Administration', 'HR', 'IT', 'Marketing', 'Sales']

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col justify-between">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center space-y-6 py-12">
            <div className="flex justify-center">
              <Icons.VerifiedCheck />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Requisition Submitted</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                Your request has been filed and routed for inspection. No manual follow-ups are required.
              </p>
            </div>
            <div className="border border-slate-100 dark:border-slate-900 p-4 rounded text-left text-xs text-slate-500 space-y-2 bg-slate-50/50 dark:bg-slate-900/30">
              <div><strong>Requester:</strong> {reqName}</div>
              <div><strong>Total Amount:</strong> GHS {grandTotal.toLocaleString()}</div>
              <div><strong>Routing Track:</strong> Pending Approval Gate</div>
              {attachedFiles.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2">
                  <div className="font-semibold text-slate-600 dark:text-slate-400 mb-1 text-[10px]">Attached Files ({attachedFiles.length}):</div>
                  <div className="grid grid-cols-2 gap-2">
                    {attachedFiles.map(af => (
                      <div key={af.id} className="flex items-center gap-1.5 truncate bg-white dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-900">
                        {af.previewUrl ? (
                          <img src={af.previewUrl} className="w-5 h-5 object-cover rounded" />
                        ) : (
                          <div className="w-5 h-5 flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-450 rounded">
                            {getFileIcon(af.file)}
                          </div>
                        )}
                        <span className="truncate text-[10px] text-slate-700 dark:text-slate-300" title={af.file.name}>{af.file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button onClick={() => { setIsSubmitted(false); clearForm(); }} className="flex-1">
                Create New
              </Button>
              <Link href="/" className="flex-1">
                <Button variant="outline" className="w-full">
                  Go to Home
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-12 font-sans antialiased">
      <Header />
      
      <main className="mx-auto max-w-4xl px-4 py-8">
        
        {/* Simple Control Header Panel */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200/60 dark:border-slate-900">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              New Requisition
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Create and route structured procurement requests directly into the approval workflow.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button 
                type="button" 
                variant="ghost"
              >
                Back to Home
              </Button>
            </Link>
            <Button 
              type="button" 
              variant="outline" 
              onClick={loadBernardWiafeSample}
              className="gap-1.5"
            >
              <Icons.Magicpen />
              Use Template
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              onClick={clearForm}
            >
              Clear
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex items-center gap-2 bg-white dark:bg-slate-900">
            <Icons.InfoCircle />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Requisition Flat Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          
          <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-900 rounded-lg p-6 md:p-8 space-y-8">
            
            {/* Meta Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-150 dark:border-slate-900/50">
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company</span>
                  <select
                    value={companyLogo}
                    onChange={(e) => setCompanyLogo(e.target.value)}
                    className="h-8 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 text-xs font-semibold focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 cursor-pointer"
                  >
                    <option value="Macwest">Macwest</option>
                    <option value="Cypress Energy">Cypress Energy</option>
                    <option value="Northbrook">Northbrook</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document Title</span>
                  <Input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g. REQUISITION"
                    className="h-8 font-bold border border-slate-200 dark:border-slate-800 px-2 uppercase max-w-xs"
                    required
                  />
                </div>
              </div>

              {/* Document References Grid */}
              <div className="grid grid-cols-3 gap-4 text-[10px] font-mono text-slate-500 max-w-sm w-full bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded border border-slate-100 dark:border-slate-900/50">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">Doc No.</span>
                  <input
                    value={docNo}
                    onChange={(e) => setDocNo(e.target.value)}
                    className="font-medium text-slate-800 dark:text-slate-200 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">Version</span>
                  <input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="font-medium text-slate-800 dark:text-slate-200 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">Ref.</span>
                  <input
                    value={page}
                    onChange={(e) => setPage(e.target.value)}
                    className="font-medium text-slate-800 dark:text-slate-200 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>

            </div>

            {/* Request Basic Details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-900">
                <Icons.DocumentText />
                <span>Requisition Context</span>
              </h3>
              
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                {/* Requester Name */}
                <div className="space-y-1 flex flex-col w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Requester Name</label>
                  <Input
                    placeholder="e.g. Bernard Wiafe"
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    required
                  />
                </div>

                {/* Department */}
                <div className="space-y-1 flex flex-col w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
                  <select
                    id="dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-8 bg-transparent border border-slate-200 dark:border-slate-800 focus:border-slate-900 dark:focus:border-slate-100 focus:ring-0 text-xs font-semibold px-2 focus:outline-none cursor-pointer rounded"
                  >
                    {depts.map(d => (
                      <option key={d} value={d} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200">{d}</option>
                    ))}
                    <option value="Custom" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200">Custom...</option>
                  </select>
                  {department === 'Custom' && (
                    <Input
                      placeholder="Enter custom department"
                      className="mt-2"
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  )}
                </div>

                {/* Date */}
                <div className="space-y-1 flex flex-col w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="font-mono"
                    required
                  />
                </div>

                {/* Project Account */}
                <div className="space-y-1 flex flex-col w-full sm:col-span-2 md:col-span-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project / Cost Center</label>
                  <Input
                    placeholder="e.g. Adenta Assembly Project / MACWL-OPS-2026"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Requisition Line Items Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-900">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Items List
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItemRow}
                  className="gap-1 text-[10px]"
                >
                  <Icons.Add />
                  Add Line Item
                </Button>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-900 rounded">
                <table className="min-w-full text-slate-850 dark:text-slate-250 border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-900">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">No.</th>
                      <th className="px-3 py-2 text-left min-w-[240px]">Description</th>
                      <th className="px-3 py-2 text-center w-16">Qty</th>
                      <th className="px-3 py-2 text-right w-28">Unit Price</th>
                      <th className="px-3 py-2 text-right w-28">Total</th>
                      <th className="px-3 py-2 text-left">Remarks</th>
                      <th className="px-3 py-2 text-center w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-900 text-xs">
                    {items.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                        
                        <td className="px-3 py-2 text-center font-bold text-slate-400 text-[11px]">
                          {index + 1}
                        </td>
                        
                        <td className="px-1.5 py-1">
                          <input
                            placeholder="Enter description..."
                            value={item.description}
                            onChange={(e) => updateItem(index, { description: e.target.value })}
                            className="w-full bg-transparent p-1 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-900 font-medium text-xs rounded text-slate-800 dark:text-slate-200"
                            required
                          />
                        </td>
                        
                        <td className="px-1.5 py-1">
                          <input
                            type="number"
                            min="1"
                            placeholder="1"
                            value={item.quantity || ''}
                            onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                            className="w-full bg-transparent p-1 text-center font-mono focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-900 text-xs rounded text-slate-800 dark:text-slate-200"
                            required
                          />
                        </td>
                        
                        <td className="px-1.5 py-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            value={item.unitPrice || ''}
                            onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })}
                            className="w-full bg-transparent p-1 text-right font-mono focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-900 text-xs rounded text-slate-800 dark:text-slate-200"
                            required
                          />
                        </td>
                        
                        <td className="px-3 py-2 text-right font-bold text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                          {new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(item.amount || 0)}
                        </td>
                        
                        <td className="px-1.5 py-1">
                          <input
                            placeholder="Remarks..."
                            value={item.remarks}
                            onChange={(e) => updateItem(index, { remarks: e.target.value })}
                            className="w-full bg-transparent p-1 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-900 text-xs rounded text-slate-500"
                          />
                        </td>
                        
                        <td className="px-1.5 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeItemRow(index)}
                            disabled={items.length === 1 && !item.description}
                            className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 disabled:opacity-30"
                          >
                            <Icons.Trash />
                          </button>
                        </td>
                      </tr>
                    ))}
                    
                    <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                      <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-widest text-[9px] font-bold text-slate-400">
                        Total Amount
                      </td>
                      <td className="px-3 py-3 text-right text-slate-900 dark:text-slate-100 text-sm font-extrabold font-mono">
                        {new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(grandTotal)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* General Explanations & Supporting Document Attachment */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Additional Explanations (Optional)</label>
                <Textarea
                  placeholder="Brief justification or context for audit records..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supporting Documents / Attachments</label>
                
                {/* Upload zone */}
                <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded p-4 h-[76px] flex flex-col justify-center items-center relative hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors cursor-pointer">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Icons.Attachment />
                    <span>Click to add Invoice, Quote, or Receipts (Multiple allowed)</span>
                  </div>
                </div>

                {/* Previews grid */}
                {attachedFiles.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
                    {attachedFiles.map((af) => (
                      <div 
                        key={af.id} 
                        className="relative group border border-slate-200 dark:border-slate-800 rounded p-2 bg-slate-50 dark:bg-slate-900/30 flex flex-col items-center justify-between text-center space-y-1.5 h-24"
                      >
                        {af.previewUrl ? (
                          <div className="w-full h-11 rounded overflow-hidden flex items-center justify-center bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
                            <img src={af.previewUrl} alt={af.file.name} className="object-cover w-full h-full" />
                          </div>
                        ) : (
                          <div className="w-full h-11 rounded flex items-center justify-center bg-slate-150 dark:bg-slate-950/60 text-slate-400 border border-slate-100 dark:border-slate-905">
                            {getFileIcon(af.file)}
                          </div>
                        )}
                        <div className="w-full text-[9px] text-slate-650 dark:text-slate-350 truncate px-1">
                          <span className="font-semibold block truncate" title={af.file.name}>{af.file.name}</span>
                          <span className="text-slate-400">({(af.file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeAttachment(af.id); }}
                          className="absolute -top-1.5 -right-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-slate-800 dark:hover:bg-slate-250 transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove file"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Signature Columns */}
            <div className="pt-6 border-t border-slate-150 dark:border-slate-900 space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Sign-off Matrix
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                
                {/* Requested By */}
                <div className="space-y-2 text-center flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Requested By</span>
                  <input
                    placeholder="Signature Name"
                    value={requestedBy}
                    onChange={(e) => setRequestedBy(e.target.value)}
                    className="h-7 text-xs text-center font-bold bg-transparent border-b border-slate-200 dark:border-slate-850 focus:outline-none focus:border-slate-800 w-full"
                  />
                  <span className="text-[9px] text-slate-400 block tracking-wider uppercase text-[8px]">Employee</span>
                </div>

                {/* Head of Dept */}
                <div className="space-y-2 text-center flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Department Head</span>
                  <input
                    placeholder="HOD Signature"
                    value={headOfDept}
                    onChange={(e) => setHeadOfDept(e.target.value)}
                    className="h-7 text-xs text-center font-bold bg-transparent border-b border-slate-200 dark:border-slate-850 focus:outline-none focus:border-slate-800 w-full"
                  />
                  <span className="text-[9px] text-slate-400 block tracking-wider uppercase text-[8px]">HOD Sign-off</span>
                </div>

                {/* Approved By */}
                <div className="space-y-2 text-center flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Approved By</span>
                  <input
                    placeholder="Executive Signature"
                    value={approvedBy}
                    onChange={(e) => setApprovedBy(e.target.value)}
                    className="h-7 text-xs text-center font-bold bg-transparent border-b border-slate-200 dark:border-slate-850 focus:outline-none focus:border-slate-800 w-full"
                  />
                  <span className="text-[9px] text-slate-400 block tracking-wider uppercase text-[8px]">C-Level Review</span>
                </div>

                {/* Paid By */}
                <div className="space-y-2 text-center flex flex-col items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Paid By</span>
                  <input
                    placeholder="Disburser Signature"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="h-7 text-xs text-center font-bold bg-transparent border-b border-slate-200 dark:border-slate-850 focus:outline-none focus:border-slate-800 w-full"
                  />
                  <span className="text-[9px] text-slate-400 block tracking-wider uppercase text-[8px]">Finance</span>
                </div>

              </div>
            </div>

          </div>

          {/* Submit Action Block */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-900 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-xs font-bold flex items-center gap-1.5 text-slate-900 dark:text-white">
                <Icons.Message />
                <span>Status Notifications</span>
              </h3>
              <p className="text-[11px] text-slate-400 leading-normal">
                Submit your email below to receive real-time stage logs directly as the requisition runs through the approval track.
              </p>
              <Input
                type="email"
                placeholder="username@company.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="h-7 max-w-xs"
              />
            </div>

            <div className="shrink-0">
              <Button 
                type="submit"
                disabled={isSubmitting}
                className="w-full md:w-auto h-10 px-6 font-semibold"
              >
                {isSubmitting ? (
                  <>Submitting...</>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Icons.Send /> Submit Requisition
                  </span>
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
