/** A status chip: tinted background, coloured text, and always a word, never colour alone. */
export default function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="chip"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {children}
    </span>
  );
}
