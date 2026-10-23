import Image from "next/image";
import Link from "next/link";
import type { Painting } from "@/lib/db/schema";
import { formatCents } from "@/lib/money";
import { galleryCaption } from "@/lib/paintings/caption";

/** Matches the grid breakpoints in globals.css: 1 column below 560px, 2 below 900px, else 3. */
const SIZES = "(max-width: 559px) calc(100vw - 32px), (max-width: 899px) calc(50vw - 26px), (max-width: 1200px) calc(33vw - 32px), 380px";

type Props = {
  paintings: Painting[];
  /** "prints" captions each tile with its print size and price instead of the original's status. */
  variant?: "gallery" | "prints";
};

function Caption({ p, variant }: { p: Painting; variant: "gallery" | "prints" }) {
  if (variant === "prints") {
    const print = p.printEnabled && p.printPriceCents != null
      ? [p.printSize ? `Print ${p.printSize}` : "Print", formatCents(p.printPriceCents)]
      : [];
    return <>{print.map((t) => <span key={t}> · {t}</span>)}</>;
  }
  const { price, sold } = galleryCaption(p);
  return (
    <>
      {sold ? <> · <span className="sold">Sold</span></> : null}
      {price ? <> · <span>{price}</span></> : null}
    </>
  );
}

export function GalleryGrid({ paintings, variant = "gallery" }: Props) {
  return (
    <ul className="gallery">
      {paintings.map((p, i) => (
        <li key={p.id}>
          <Link href={`/paintings/${p.slug}`} className="tile">
            <Image
              src={p.imageUrl}
              alt={p.title}
              width={p.imageWidth}
              height={p.imageHeight}
              sizes={SIZES}
              priority={i < 3}
            />
            <div className="tile-cap">
              <span className="tile-title">{p.title}</span>
              <Caption p={p} variant={variant} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
