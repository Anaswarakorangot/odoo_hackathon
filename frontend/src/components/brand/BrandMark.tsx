interface BrandMarkProps {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
}

export default function BrandMark({ compact = false, showTagline = false, className = '' }: BrandMarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <img
        src="/logo_neoTorque.jpeg"
        alt="NEOTORQUE"
        className={compact ? 'h-10 w-10 rounded-xl bg-white object-contain' : 'h-12 w-12 rounded-xl bg-white object-contain'}
      />
      <div className="leading-none">
        <p
          className={compact ? 'text-base font-black uppercase tracking-[0.28em] text-white' : 'text-lg font-black uppercase tracking-[0.28em] text-white sm:text-xl'}
          style={{ fontFamily: 'Arial Narrow, Bahnschrift Condensed, Segoe UI, sans-serif' }}
        >
          NEOTORQUE
        </p>
        {showTagline ? <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-slate-400">Secure access portal</p> : null}
      </div>
    </div>
  );
}