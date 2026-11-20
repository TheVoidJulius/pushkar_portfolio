"use client";

import { Reorder, useDragControls } from "motion/react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Drag-to-reorder list (mouse/touch via the grip handle) with up/down
 * buttons for keyboard and screen-reader users.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  onCommit,
  render,
  label,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  /** Called when a drag ends or a move button is pressed: persist the order. */
  onCommit: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
  label: (item: T) => string;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onReorder(next);
    onCommit(next);
  };
  return (
    <Reorder.Group axis="y" values={items} onReorder={onReorder} className="space-y-2.5">
      {items.map((item, i) => (
        <Row
          key={item.id}
          item={item}
          onDragEnd={() => onCommit(items)}
          up={i > 0 ? () => move(i, -1) : undefined}
          down={i < items.length - 1 ? () => move(i, 1) : undefined}
          name={label(item)}
        >
          {render(item, i)}
        </Row>
      ))}
    </Reorder.Group>
  );
}

function Row<T>({
  item,
  children,
  onDragEnd,
  up,
  down,
  name,
}: {
  item: T;
  children: ReactNode;
  onDragEnd: () => void;
  up?: () => void;
  down?: () => void;
  name: string;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative flex items-center gap-2 rounded-2xl border border-line bg-surface p-2.5 pr-3 shadow-[var(--shadow-sm)]"
      whileDrag={{ scale: 1.02, boxShadow: "var(--shadow-lg)", zIndex: 10 }}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Drag to reorder ${name}`}
        className="grid h-12 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-3 hover:bg-surface-2 active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex flex-col">
        <button type="button" onClick={up} disabled={!up} aria-label={`Move ${name} up`} className="grid size-6 place-items-center rounded text-ink-3 hover:text-ink disabled:opacity-25">
          <ArrowUp className="size-3.5" />
        </button>
        <button type="button" onClick={down} disabled={!down} aria-label={`Move ${name} down`} className="grid size-6 place-items-center rounded text-ink-3 hover:text-ink disabled:opacity-25">
          <ArrowDown className="size-3.5" />
        </button>
      </div>
    </Reorder.Item>
  );
}
