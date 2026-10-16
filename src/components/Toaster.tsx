import { useEffect, useState } from 'react'

export interface Toast {
  id: number
  message: string
  kind: 'error' | 'success' | 'info'
}

type Listener = (toasts: Toast[]) => void

let current: Toast[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener(current)
}

export function dismissToast(id: number) {
  current = current.filter(toast => toast.id !== id)
  emit()
}

export function showToast(message: string, kind: Toast['kind'] = 'error') {
  const toast: Toast = { id: nextId++, message, kind }
  current = [...current, toast]
  emit()
  // Errors linger longer because they usually need to be read and acted on.
  setTimeout(() => dismissToast(toast.id), kind === 'error' ? 5000 : 2600)
}

export function Toaster() {
  const [items, setItems] = useState(current)

  useEffect(() => {
    listeners.add(setItems)
    return () => {
      listeners.delete(setItems)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map(toast => (
        <div
          key={toast.id}
          className={'toast toast-' + toast.kind}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
