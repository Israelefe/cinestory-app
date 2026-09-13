import { useEffect, useRef } from 'react';
export function useDialogFocus(open, containerRef, onClose, triggerRef) {
 const closeRef = useRef(onClose);
 closeRef.current = onClose;
 useEffect(() => {
  if (!open) return;
  const previous = triggerRef?.current || document.activeElement;
  const oldOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
  const frame = requestAnimationFrame(() => (containerRef.current?.querySelector(selector) || containerRef.current)?.focus());
  const onKey = (event) => {
   if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
   if (event.key !== 'Tab') return;
   const items = [...(containerRef.current?.querySelectorAll(selector) || [])].filter(el => el.getClientRects().length);
   if (!items.length) { event.preventDefault(); return; }
   const first = items[0]; const last = items[items.length - 1];
   if (event.shiftKey && (document.activeElement === first || !containerRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
   else if (!event.shiftKey && (document.activeElement === last || !containerRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  return () => { cancelAnimationFrame(frame); document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
 }, [open, containerRef, triggerRef]);
}
