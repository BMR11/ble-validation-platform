import type { ReactNode } from 'react';

type IconProps = { spin?: boolean };

function Svg({ children, spin }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={spin ? 'icon-spin' : undefined}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconUp() {
  return (
    <Svg>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </Svg>
  );
}

export function IconDown() {
  return (
    <Svg>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </Svg>
  );
}

export function IconRemove() {
  return (
    <Svg>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </Svg>
  );
}

export function IconSave() {
  return (
    <Svg>
      <path d="M5 4h11l3 3v13H5V4z" />
      <path d="M8 4v5h7" />
      <path d="M8 20v-6h8v6" />
    </Svg>
  );
}

export function IconCancel() {
  return (
    <Svg>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  );
}

export function IconSpinner() {
  return (
    <Svg spin>
      <path d="M12 4a8 8 0 1 1-8 8" />
    </Svg>
  );
}
