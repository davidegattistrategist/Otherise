/** Icone a tratto (stile coerente, 24×24). */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconToday = (p: P) => <Base {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /></Base>;
export const IconCalendar = (p: P) => <Base {...p}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></Base>;
export const IconChart = (p: P) => <Base {...p}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 3 5-6" /></Base>;
export const IconUser = (p: P) => <Base {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Base>;
export const IconUsers = (p: P) => <Base {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 15c2 .7 3.2 2.3 3.8 5" /></Base>;
export const IconBook = (p: P) => <Base {...p}><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" /><path d="M9 9h6" /></Base>;
export const IconWallet = (p: P) => <Base {...p}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18" /><path d="M16 14.5h2" /></Base>;
export const IconSettings = (p: P) => <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></Base>;
export const IconBell = (p: P) => <Base {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Base>;
export const IconArrowRight = (p: P) => <Base {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Base>;
export const IconArrowLeft = (p: P) => <Base {...p}><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></Base>;
export const IconCheck = (p: P) => <Base {...p}><path d="m5 12 5 5 9-10" /></Base>;
export const IconPlus = (p: P) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>;
export const IconPlay = ({ size = 20, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M8 5v14l11-7z" /></svg>
);
export const IconSparkle = (p: P) => <Base {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Base>;
export const IconTemplate = (p: P) => <Base {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 9h16M9 9v11" /></Base>;
export const IconTrash = (p: P) => <Base {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Base>;
export const IconCopy = (p: P) => <Base {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Base>;
export const IconUp = (p: P) => <Base {...p}><path d="m6 15 6-6 6 6" /></Base>;
export const IconDown = (p: P) => <Base {...p}><path d="m6 9 6 6 6-6" /></Base>;
export const IconUpload = (p: P) => <Base {...p}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Base>;
export const IconLogout = (p: P) => <Base {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="m10 16-4-4 4-4" /><path d="M6 12h10" /></Base>;
export const IconMic = (p: P) => <Base {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Base>;
export const IconX = (p: P) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>;
export const IconMail = (p: P) => <Base {...p}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></Base>;
export const IconPosture = (p: P) => <Base {...p}><circle cx="12" cy="4.5" r="2" /><path d="M12 7v7M8 10h8M12 14l-3 7M12 14l3 7" /></Base>;
export const IconNote = (p: P) => <Base {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></Base>;
export const IconRuler = (p: P) => <Base {...p}><rect x="3" y="8" width="18" height="8" rx="2" /><path d="M7 8v3M11 8v4M15 8v3M19 8v4" /></Base>;
