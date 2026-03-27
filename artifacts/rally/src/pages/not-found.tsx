import { Heart } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      <div
        className="mb-6 flex items-center justify-center w-16 h-16 rounded-full"
        style={{ backgroundColor: "hsl(var(--muted) / 0.2)" }}
      >
        <Heart className="w-7 h-7" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>

      <h1
        className="text-3xl font-bold mb-3 font-serif"
        style={{ color: "hsl(var(--foreground))" }}
      >
        Page not found
      </h1>

      <p
        className="text-base max-w-xs leading-relaxed"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        This page doesn&apos;t exist or has been removed. If someone shared a link with you, please double-check it.
      </p>
    </div>
  );
}
