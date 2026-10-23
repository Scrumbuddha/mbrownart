"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  largeSrc: string;
  width: number;
  height: number;
  alt: string;
  sizes: string;
};

/** The painting at its own aspect ratio; clicking it opens the large version full screen. */
export function Lightbox({ src, largeSrc, width, height, alt, sizes }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const button = trigger.current;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    close.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={trigger} type="button" className="art-button" onClick={() => setOpen(true)} aria-label={`View ${alt} full screen`}>
        <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority />
      </button>
      {open ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}>
          <button ref={close} type="button" className="lightbox-close" aria-label="Close">×</button>
          <Image src={largeSrc} alt={alt} width={width} height={height} sizes="100vw" />
        </div>
      ) : null}
    </>
  );
}
