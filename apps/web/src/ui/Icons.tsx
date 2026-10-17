// The sidebar's pictures. Drawn here, in one stroke weight, so they belong to this game and
// to nobody else's.

export type IconName =
  | 'desk'
  | 'nation'
  | 'record'
  | 'settings'
  | 'nations'
  | 'found'
  | 'import'
  | 'sandbox'
  | 'admin'
  | 'gov'

const PATHS: Record<IconName, string> = {
  // A despatch box with its lid up.
  desk: 'M3 10h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM5 10l2-5h10l2 5M9 14h6',
  // A flag on a pole.
  nation: 'M5 21V3M5 4h12l-2.5 4L17 12H5',
  // An open ledger.
  record: 'M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zm0 0v14',
  // A seal with a ribbon.
  settings: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8.5 14l-1.5 7 5-2.5 5 2.5-1.5-7',
  // A globe.
  nations: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  // A foundation stone with a mark on it.
  found: 'M4 20h16M6 20V10h12v10M9 15h6M12 4v6M9 7h6',
  // A sheet arriving in a tray.
  import: 'M12 3v10M8 9l4 4 4-4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  // A sand pail and spade.
  sandbox: 'M5 9h10l-1.5 11h-7zM5 9c0-2 2-3 5-3s5 1 5 3M17 3l3 3-5 5M15 9l2 2',
  // A portico: a pediment on four columns.
  gov: 'M3 9l9-5 9 5zM5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18',
  // A padlock.
  admin: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5',
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
