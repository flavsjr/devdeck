// Marca do DevDeck: duas cartas empilhadas (o "deck") com um prompt de terminal na carta da frente.
// Cores só por tokens (styles/tokens.css).

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="DevDeck">
      <rect x="7.5" y="2.5" width="13" height="15" rx="3" fill="none" stroke="var(--accent-line)" strokeWidth="1.5" />
      <rect x="3.5" y="6" width="13.5" height="15.5" rx="3" fill="var(--accent)" />
      <path d="M7.5 11.25 10 13.75 7.5 16.25" fill="none" stroke="var(--on-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 16.5h2.75" fill="none" stroke="var(--on-accent)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
