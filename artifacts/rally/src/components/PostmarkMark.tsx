import { useId } from "react";

// The Aunt Lucy postmark — Concept 2A from the brand assets sheet. A stamp-style
// mark: two terracotta rings, "AUNT LUCY" / "AUSTRALIA" curved between them, side
// dots, and the serif italic "AL" monogram in forest green. Colours are the brand
// constants (terracotta #C4614A, forest #2D5016) rather than theme tokens, so the
// mark stays on-brand wherever it sits. For small sizes (favicons) use the
// simplified two-ring mark in public/favicon.svg instead — the microtext is not
// legible below ~40px.
type PostmarkMarkProps = {
  className?: string;
  title?: string;
};

export function PostmarkMark({ className, title = "Aunt Lucy" }: PostmarkMarkProps) {
  // Unique per instance so multiple marks on one page don't share <defs> ids.
  const uid = useId();
  const topId = `${uid}-top`;
  const bottomId = `${uid}-bottom`;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        {/* Upper arc renders text across the top; lower arc across the bottom. */}
        <path id={topId} d="M 11.5,50 A 38.5,38.5 0 0 1 88.5,50" fill="none" />
        <path id={bottomId} d="M 11.5,50 A 38.5,38.5 0 0 0 88.5,50" fill="none" />
      </defs>

      <circle cx="50" cy="50" r="46.5" fill="none" stroke="#C4614A" strokeWidth="3" />
      <circle cx="50" cy="50" r="30.5" fill="none" stroke="#C4614A" strokeWidth="1.6" />

      <g
        fill="#C4614A"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="9"
        fontWeight="500"
        letterSpacing="1.5"
      >
        <text textAnchor="middle">
          <textPath href={`#${topId}`} startOffset="50%">
            AUNT LUCY
          </textPath>
        </text>
        <text textAnchor="middle">
          <textPath href={`#${bottomId}`} startOffset="50%">
            AUSTRALIA
          </textPath>
        </text>
      </g>

      <circle cx="11.5" cy="50" r="1.2" fill="#C4614A" />
      <circle cx="88.5" cy="50" r="1.2" fill="#C4614A" />

      <text
        x="50"
        y="60"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="26"
        fill="#2D5016"
      >
        AL
      </text>
    </svg>
  );
}

export default PostmarkMark;
