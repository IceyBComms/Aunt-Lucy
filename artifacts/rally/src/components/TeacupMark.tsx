type TeacupMarkProps = {
  className?: string;
  title?: string;
};

// The Aunt Lucy teacup mark — a terracotta cup with a forest-green rising steam.
// This inlines brand/aunt-lucy-mark.svg (full colour); the hex values are the
// brand constants (terracotta #C4614A, forest #2D5016) carried by the artwork
// itself, so the mark stays on-brand wherever it sits. Sizing comes from the
// caller via className. Use the mark alone — the "Aunt Lucy" wordmark is set in
// the site's own serif beside it, not the lockup SVG (which needs a font the
// site doesn't load).
export function TeacupMark({ className, title = "Aunt Lucy" }: TeacupMarkProps) {
  return (
    <svg
      viewBox="0 0 112 104"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g
        fill="none"
        stroke="#C4614A"
        strokeWidth="3.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M50 32 q6 -5 0 -11 q-6 -5 0 -11" stroke="#2D5016" />
        <path d="M61 32 q6 -5 0 -11 q-6 -5 0 -11" stroke="#2D5016" />
        <path d="M28 45 Q55 37 82 45" />
        <path d="M28 45 C28 69 41 81 55 81 C69 81 82 69 82 45" />
        <path d="M82 50 C98 47 98 67 82 64" />
        <path d="M32 85 Q55 91 78 85" />
        <path d="M24 89 Q55 98 86 89" />
      </g>
    </svg>
  );
}

export default TeacupMark;
