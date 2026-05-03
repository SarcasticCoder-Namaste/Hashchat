import { useCallback, useEffect, useRef, useState } from "react";

interface UseInViewOptions {
  rootMargin?: string;
  threshold?: number | number[];
  once?: boolean;
}

/**
 * Observes whether an element is intersecting the viewport (accounting for
 * intermediate clipping ancestors). Returns a ref callback to attach to the
 * element and a boolean indicating visibility.
 *
 * If `once` is true, the element stays "in view" after first becoming visible
 * and the observer disconnects.
 */
export function useInView<T extends Element>({
  rootMargin = "200px",
  threshold = 0,
  once = false,
}: UseInViewOptions = {}): [(node: T | null) => void, boolean] {
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const inViewRef = useRef(false);

  const setRef = useCallback(
    (node: T | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!node) return;
      if (typeof IntersectionObserver === "undefined") {
        if (!inViewRef.current) {
          inViewRef.current = true;
          setInView(true);
        }
        return;
      }
      const obs = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          if (entry.isIntersecting) {
            if (!inViewRef.current) {
              inViewRef.current = true;
              setInView(true);
            }
            if (once) {
              obs.disconnect();
              observerRef.current = null;
            }
          } else if (!once) {
            if (inViewRef.current) {
              inViewRef.current = false;
              setInView(false);
            }
          }
        },
        { rootMargin, threshold },
      );
      obs.observe(node);
      observerRef.current = obs;
    },
    [rootMargin, threshold, once],
  );

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  return [setRef, inView];
}
