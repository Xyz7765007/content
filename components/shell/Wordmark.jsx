import Link from "next/link";
import Huesy from "../huesy/Huesy";

/**
 * The mark is Huesy itself, small and still, beside the name in the display
 * serif. One version for the site and the app.
 */
export default function Wordmark({ href = "/", compact = false, label = "Huesy home" }) {
  return (
    <Link href={href} className="group inline-flex min-h-11 shrink-0 items-center gap-2 pointer-coarse:min-w-11" aria-label={label}>
      <Huesy size={26} track={false} still className="transition-transform duration-300 group-hover:-rotate-6" />
      {!compact ? (
        <span className="font-display whitespace-nowrap text-[19px] tracking-[-0.01em] text-ink">Huesy</span>
      ) : null}
    </Link>
  );
}
