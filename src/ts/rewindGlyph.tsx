/** The ◀◀ rewind mark — an SVG because the character's shape and baseline
 * vary wildly across platform fonts. Inherits `currentColor`. */
export function RewindGlyph({ class: className }: { class?: string }) {
  return (
    <svg
      class={className}
      viewBox="0 0 22 14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1v12L1 7z" />
      <path d="M21 1v12l-9-6z" />
    </svg>
  );
}
