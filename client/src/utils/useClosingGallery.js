import { useCallback, useEffect, useState } from 'react';

// Scroll presentations finish when their closing section enters the viewport.
export function useClosingGallery(identity) {
  const [completion, setCompletion] = useState(null);
  const [target, setTarget] = useState(null);
  const closingRef = useCallback(element => setTarget(element ? { element, identity } : null), [identity]);
  useEffect(() => {
    if (!target || target.identity !== identity) return undefined;
    const { element } = target;
    const complete = () => setCompletion(identity);
    if (!('IntersectionObserver' in window)) {
      const check = () => {
        const bounds = element.getBoundingClientRect();
        if (bounds.top < window.innerHeight - 40 && bounds.bottom > 80) complete();
      };
      window.addEventListener('scroll', check, { passive: true });
      check();
      return () => window.removeEventListener('scroll', check);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        complete();
        observer.disconnect();
      }
    }, { threshold: .15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [identity, target]);
  return { galleryUnlocked: completion === identity, closingRef };
}
