import { useEffect } from 'react'

/** Keep keyboard reading within the open modal and restore the invoking button. */
export function useExampleReader(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')
    const controls = () => Array.from(modal?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]') ?? [])
    controls()[0]?.focus()
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key !== 'Tab') return
      const items = controls(), first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handle)
    return () => { document.removeEventListener('keydown', handle); previous?.focus() }
  }, [open, close])
}
