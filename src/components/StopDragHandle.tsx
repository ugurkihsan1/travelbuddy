import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useTranslation, useLanguage, translatePlace } from '../lib/i18n';
import { GripVertical } from 'lucide-react';

type Props = {
  placeId: string;
  onDrop: (fromId: string, toId: string) => void;
};

/** Pointer reordering complements the accessible Move up / Move down controls. */
export function StopDragHandle({ placeId, onDrop }: Props) {
  const t=useTranslation(); const language=useLanguage();
  const descriptionId = useId();
  const element = useRef<HTMLButtonElement>(null);
  const pointer = useRef<number | null>(null);
  const pointerPosition = useRef<{ y: number } | null>(null);
  const scrollContainer = useRef<HTMLElement | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const previousFrame = useRef(0);
  const [dragging, setDragging] = useState(false);

  function stopScrolling() {
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null; previousFrame.current = 0; pointerPosition.current = null;
  }

  function scrollAtEdge(time: number) {
    scrollFrame.current = null;
    const position = pointerPosition.current;
    if (pointer.current === null || !position) return;
    const container = scrollContainer.current;
    const bounds = container?.getBoundingClientRect();
    const top = bounds?.top ?? 0;
    const bottom = bounds?.bottom ?? window.innerHeight;
    const edge = Math.min(120, (bottom - top) / 3);
    const direction = position.y < top + edge ? -Math.min(1, (top + edge - position.y) / edge)
      : position.y > bottom - edge ? Math.min(1, (position.y - bottom + edge) / edge) : 0;
    if (!direction) { previousFrame.current = 0; return; }
    const elapsed = previousFrame.current ? Math.min(32, time - previousFrame.current) : 16;
    previousFrame.current = time;
    // Scroll while capture keeps the finger on the handle, so offscreen stops
    // remain reachable even when a single mobile card fills the viewport.
    const distance = direction * 24 * elapsed / 16;
    if (container) container.scrollBy({ top: distance, behavior: 'instant' });
    else window.scrollBy({ top: distance, behavior: 'instant' });
    scrollFrame.current = window.requestAnimationFrame(scrollAtEdge);
  }

  function trackPosition(y: number) {
    pointerPosition.current = { y };
    if (scrollFrame.current === null) scrollFrame.current = window.requestAnimationFrame(scrollAtEdge);
  }

  function release(button: HTMLButtonElement) {
    const pointerId = pointer.current;
    pointer.current = null;
    stopScrolling(); scrollContainer.current = null;
    if (pointerId !== null && button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
  }

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || pointer.current !== null) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = event.pointerId;
      scrollContainer.current = null;
      for (let parent = event.currentTarget.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(window.getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
          scrollContainer.current = parent; break;
        }
      }
      trackPosition(event.clientY);
      setDragging(true);
    } catch {
      // The separate Move up / Move down buttons remain available.
      pointer.current = null;
    }
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (pointer.current !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-place-id]');
    const targetId = target?.dataset.placeId;
    release(event.currentTarget); setDragging(false);
    if (targetId && targetId !== placeId) onDrop(placeId, targetId);
  }

  function cancel(event: PointerEvent<HTMLButtonElement>) {
    if (pointer.current !== event.pointerId) return;
    release(event.currentTarget); setDragging(false);
  }

  useEffect(() => () => {
    stopScrolling();
    const button = element.current;
    if (button) release(button);
    else pointer.current = null;
  }, []);

  return <button ref={element} type="button" className="stop-drag-handle"
    aria-label={`${t('Drag to reorder')}: ${translatePlace(placeId,language)}`}
    aria-describedby={descriptionId} title={t("Drag to reorder")}
    style={{ touchAction: 'none', userSelect: 'none', cursor: dragging ? 'grabbing' : 'grab',
      minWidth: 40, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      opacity: dragging ? 0.7 : 1 }}
    onPointerDown={begin} onPointerMove={event => { if (pointer.current === event.pointerId) { event.preventDefault(); trackPosition(event.clientY); } }} onPointerUp={finish} onPointerCancel={cancel}
    onLostPointerCapture={event => { if (pointer.current === event.pointerId) { pointer.current = null; stopScrolling(); scrollContainer.current = null; setDragging(false); } }}
    onKeyDown={event => { if (event.key === 'Escape' && pointer.current !== null) { event.preventDefault(); release(event.currentTarget); setDragging(false); } }}>
    <GripVertical size={18} aria-hidden="true"/>
    <span id={descriptionId} style={{ position: 'absolute', width: 1, height: 1, margin: -1,
      padding: 0, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
      {t("Drag onto another stop. Press Escape to cancel. For keyboard reordering, open Edit stop and use Move up or Move down.")}
    </span>
  </button>;
}
