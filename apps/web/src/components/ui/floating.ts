import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Positioning for portalled overlays (Tooltip, DropdownMenu): fixed, flipped, clamped. */

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';

export interface FloatingOptions {
  side?: Side;
  align?: Align;
  /** Gap between trigger and overlay, px. */
  offset?: number;
  /** Minimum distance from the viewport edge, px. */
  padding?: number;
}

interface Size {
  width: number;
  height: number;
}

interface Placement {
  top: number;
  left: number;
  side: Side;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function place(trigger: DOMRect, floating: Size, side: Side, align: Align, offset: number) {
  let top = 0;
  let left = 0;
  if (side === 'top' || side === 'bottom') {
    top = side === 'top' ? trigger.top - floating.height - offset : trigger.bottom + offset;
    if (align === 'start') left = trigger.left;
    else if (align === 'end') left = trigger.right - floating.width;
    else left = trigger.left + trigger.width / 2 - floating.width / 2;
  } else {
    left = side === 'left' ? trigger.left - floating.width - offset : trigger.right + offset;
    if (align === 'start') top = trigger.top;
    else if (align === 'end') top = trigger.bottom - floating.height;
    else top = trigger.top + trigger.height / 2 - floating.height / 2;
  }
  return { top, left };
}

function fits(pos: { top: number; left: number }, floating: Size, padding: number): boolean {
  return (
    pos.top >= padding &&
    pos.left >= padding &&
    pos.top + floating.height <= window.innerHeight - padding &&
    pos.left + floating.width <= window.innerWidth - padding
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function computePosition(
  trigger: DOMRect,
  floating: Size,
  { side = 'bottom', align = 'center', offset = 6, padding = 8 }: FloatingOptions = {},
): Placement {
  let chosen = side;
  let pos = place(trigger, floating, side, align, offset);
  if (!fits(pos, floating, padding)) {
    const flipped = place(trigger, floating, OPPOSITE[side], align, offset);
    if (fits(flipped, floating, padding)) {
      chosen = OPPOSITE[side];
      pos = flipped;
    }
  }
  return {
    side: chosen,
    top: clamp(pos.top, padding, window.innerHeight - floating.height - padding),
    left: clamp(pos.left, padding, window.innerWidth - floating.width - padding),
  };
}

/**
 * Fixed-position style for an overlay anchored to `triggerRef`, recomputed on open, scroll and
 * resize. Hidden until measured, so it never flashes at (0, 0).
 */
export function useFloatingPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  { side = 'bottom', align = 'center', offset = 6, padding = 8 }: FloatingOptions = {},
): { style: CSSProperties; side: Side } {
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      const floating = floatingRef.current;
      if (!trigger || !floating) return;
      const rect = floating.getBoundingClientRect();
      setPlacement(
        computePosition(
          trigger.getBoundingClientRect(),
          { width: rect.width, height: rect.height },
          { side, align, offset, padding },
        ),
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, triggerRef, floatingRef, side, align, offset, padding]);

  const style: CSSProperties = placement
    ? { position: 'fixed', top: placement.top, left: placement.left }
    : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };
  return { style, side: placement?.side ?? side };
}
