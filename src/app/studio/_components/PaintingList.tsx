"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveAction, reorderAction } from "../paintings/actions";

export type StudioPainting = {
  id: string;
  title: string;
  imageUrl: string;
  originalStatus: "for_sale" | "sold" | "not_for_sale";
  visible: boolean;
  inCheckout: boolean;
};

const STATUS_LABEL = { for_sale: "For sale", sold: "Sold", not_for_sale: "Not for sale" } as const;

const badge = (color: string, bg: string) => ({
  fontSize: 12, padding: "2px 8px", borderRadius: 10, color, background: bg, whiteSpace: "nowrap" as const,
});

const arrowBtn = {
  width: 44, height: 44, fontSize: 18, lineHeight: 1, border: "1px solid #ccc", borderRadius: 4,
  background: "#fff", color: "#333", cursor: "pointer", fontFamily: "inherit",
} as const;

export function PaintingList({ items }: { items: StudioPainting[] }) {
  const [list, setList] = useState(items);
  const [prevItems, setPrevItems] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server sends a fresh list (after an up/down button).
  if (items !== prevItems) {
    setPrevItems(items);
    setList(items);
  }

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = list.filter((p) => p.id !== dragId);
    const at = next.findIndex((p) => p.id === targetId);
    const moved = list.find((p) => p.id === dragId)!;
    const from = list.indexOf(moved);
    const to = list.findIndex((p) => p.id === targetId);
    next.splice(from < to ? at + 1 : at, 0, moved);
    setList(next);
    setDragId(null);
    startTransition(() => reorderAction(next.map((p) => p.id)));
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {list.map((p, i) => (
        <li
          key={p.id}
          draggable
          onDragStart={() => setDragId(p.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => drop(p.id)}
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
            borderBottom: "1px solid #eee", opacity: dragId === p.id ? 0.4 : 1,
          }}
        >
          <Link href={`/studio/paintings/${p.id}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, color: "#222", textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.imageUrl}
              alt=""
              width={64}
              height={64}
              draggable={false}
              style={{ width: 64, height: 64, objectFit: "contain", background: "#f6f6f6", flex: "none" }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.title}
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                <span style={p.originalStatus === "sold" ? badge("#b04a3a", "#f6e9e6") : badge("#333", "#f0f0f0")}>
                  {STATUS_LABEL[p.originalStatus]}
                </span>
                {!p.visible && <span style={badge("#777", "#f0f0f0")}>Hidden</span>}
                {p.inCheckout && <span style={badge("#333", "#fff3d6")}>In checkout</span>}
              </span>
            </span>
          </Link>
          <div style={{ display: "flex", gap: 6, flex: "none" }}>
            <form action={moveAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="direction" value="up" />
              <button type="submit" disabled={i === 0} aria-label={`Move ${p.title} up`} style={{ ...arrowBtn, opacity: i === 0 ? 0.35 : 1 }}>
                &uarr;
              </button>
            </form>
            <form action={moveAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="direction" value="down" />
              <button type="submit" disabled={i === list.length - 1} aria-label={`Move ${p.title} down`} style={{ ...arrowBtn, opacity: i === list.length - 1 ? 0.35 : 1 }}>
                &darr;
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
