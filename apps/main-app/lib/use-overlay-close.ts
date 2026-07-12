import { useRef } from 'react';

/**
 * Click-to-close handlers for a modal-overlay backdrop. A plain
 * `onClick={onClose}` on the overlay closes the modal whenever a mouse
 * text-selection that starts inside the modal is dragged past its edge and
 * released over the backdrop — the resulting `click` event's target is the
 * backdrop, even though the drag began on modal content. Requiring the
 * `mousedown` to ALSO have started on the backdrop itself fixes that.
 */
export function useOverlayClose(onClose: () => void) {
  const downOnSelf = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnSelf.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (downOnSelf.current && e.target === e.currentTarget) onClose();
    },
  };
}
