import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  title: string
  // Called when the player backs out: Escape, or whatever button the actions give them.
  onClose(): void
  children: ReactNode
  // The buttons along the bottom. The safe one goes first.
  actions: ReactNode
}

// A modal for the few moments that should stop the player: deleting a nation, ending a
// day with papers still on the desk. The browser's own dialog element does the focus
// trap, the backdrop and Escape.
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {open && (
        <div className="dialog__sheet">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <div className="dialog__body stack">{children}</div>
          <div className="dialog__actions row">{actions}</div>
        </div>
      )}
    </dialog>
  )
}
