/** The reward object (brief: the gem appears at block found and on win cards, nowhere else). */
export function Gem({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <polygon points="32,4 56,22 46,58 18,58 8,22" fill="var(--ember)" opacity="0.9" />
      <polygon points="32,4 56,22 32,30" fill="#F7C46A" />
      <polygon points="8,22 32,30 32,4" fill="#C9821B" />
      <polygon points="32,30 56,22 46,58" fill="#E39A2E" />
      <polygon points="8,22 18,58 32,30" fill="#B87315" />
      <polygon points="32,30 46,58 18,58" fill="#D98F24" />
      <polyline points="8,22 32,30 56,22" stroke="var(--signal)" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
