import { useEffect, useRef } from 'react';

/**
 * Returns a ref to attach to a dropdown/popover's wrapper element (the
 * element containing both the toggle button and the open panel). Calls
 * `onOutside` on any mousedown outside that wrapper while `active` is true.
 */
export function useClickOutside<T extends HTMLElement>(onOutside: () => void, active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [active, onOutside]);

  return ref;
}
