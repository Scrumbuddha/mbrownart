import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatCents } from "@/lib/money";
import { isOriginalPurchasable } from "@/lib/paintings/queries";
import { paintingBySlug, siteSettings } from "../../data";
import { Lightbox } from "@/app/_components/Lightbox";
import { BuyBox, type BuyOption } from "./BuyBox";

export const revalidate = 0;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await paintingBySlug((await params).slug);
  return p ? { title: p.title, description: p.description || undefined } : {};
}

export default async function PaintingPage({ params }: Params) {
  const p = await paintingBySlug((await params).slug);
  if (!p) notFound();
  const settings = await siteSettings();

  const options: BuyOption[] = [];
  if (p.originalStatus === "sold") {
    options.push({ item: "original", label: "Original (one of a kind)", price: "Sold", disabled: true });
  } else if (isOriginalPurchasable(p, new Date())) {
    options.push({ item: "original", label: "Original (one of a kind)", price: formatCents(p.originalPriceCents as number), disabled: false });
  }
  if (p.printEnabled && p.printSize && p.printPriceCents != null) {
    options.push({ item: "print", label: `Print, ${p.printSize}`, price: formatCents(p.printPriceCents), disabled: false });
  }
  const forSale = options.some((o) => !o.disabled);

  return (
    <main className="site-main">
      <div className="painting">
        <div className="painting-art">
          <Lightbox
            src={p.imageUrl}
            largeSrc={p.imageLargeUrl}
            width={p.imageWidth}
            height={p.imageHeight}
            alt={p.title}
            sizes="(max-width: 767px) calc(100vw - 32px), 640px"
          />
        </div>
        <div className="painting-info">
          <h1>{p.title}</h1>
          <p className="painting-meta">{p.medium} · {p.size} · {p.year}</p>
          {p.description ? <p className="painting-desc">{p.description}</p> : null}
          {forSale ? (
            <>
              <BuyBox paintingId={p.id} options={options} />
              <p className="buy-note">
                {formatCents(settings.shippingCents)} flat shipping within the US. You&apos;ll get an email when it ships.
              </p>
              {settings.taxEnabled ? (
                <p className="buy-note">Florida orders include sales tax, added at checkout.</p>
              ) : null}
            </>
          ) : p.originalStatus === "sold" ? (
            <p className="sold">Sold</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
