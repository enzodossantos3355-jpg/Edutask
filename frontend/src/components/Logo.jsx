/**
 * Edutask logo - neo-brutalist style
 * Stylized "E" formed by stacked book pages with a checkmark accent.
 */
export default function Logo({ size = 40, withText = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Edutask"
      >
        {/* Offset shadow square (neo-brutalist) */}
        <rect x="6" y="9" width="50" height="50" rx="10" fill="#0A0A0A" />
        {/* Foreground tile */}
        <rect x="3" y="6" width="50" height="50" rx="10" fill="#38BDF8" stroke="#0A0A0A" strokeWidth="3" />
        {/* Stylized "E" - three horizontal pages of a book */}
        <rect x="14" y="14" width="26" height="6" rx="2" fill="#FFFFFF" stroke="#0A0A0A" strokeWidth="2.5" />
        <rect x="14" y="25" width="20" height="6" rx="2" fill="#FBBF24" stroke="#0A0A0A" strokeWidth="2.5" />
        <rect x="14" y="36" width="26" height="6" rx="2" fill="#FFFFFF" stroke="#0A0A0A" strokeWidth="2.5" />
        {/* Checkmark accent */}
        <path
          d="M40 38 L46 44 L56 30"
          stroke="#0A0A0A"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M40 38 L46 44 L56 30"
          stroke="#10B981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {withText && (
        <span className="font-heading font-black text-2xl tracking-tight">
          Edu<span className="text-sky-500">task</span>
        </span>
      )}
    </div>
  );
}
