import { useEffect, useRef, useState } from 'react';

/** Reveals `fullText` progressively over ~1s whenever it changes, for a lightweight "streaming" feel. */
export function useTypewriter(fullText: string): string {
  const [shown, setShown] = useState(fullText);
  const prevText = useRef(fullText);

  useEffect(() => {
    if (fullText === prevText.current) return;
    prevText.current = fullText;
    if (!fullText) {
      setShown('');
      return;
    }
    setShown('');
    let i = 0;
    const step = Math.max(1, Math.round(fullText.length / 60));
    const id = setInterval(() => {
      i += step;
      setShown(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [fullText]);

  return shown;
}
