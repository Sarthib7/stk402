export function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <div className="mist mist-a" />
      <div className="mist mist-b" />
      <div className="cipher-grid" />
      <div className="note-plane">
        <svg viewBox="0 0 420 520" className="note-svg">
          <defs>
            <linearGradient id="noteFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1a7a5c" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#0c1620" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#3d6b8a" stopOpacity="0.14" />
            </linearGradient>
          </defs>
          <rect
            x="48"
            y="40"
            width="280"
            height="380"
            rx="18"
            fill="url(#noteFill)"
            stroke="#0c1620"
            strokeOpacity="0.18"
            strokeWidth="1.5"
          />
          <rect
            x="88"
            y="78"
            width="280"
            height="380"
            rx="18"
            fill="#f4f7f9"
            fillOpacity="0.55"
            stroke="#0c1620"
            strokeOpacity="0.12"
            strokeWidth="1.5"
          />
          <path
            d="M128 150h160M128 186h120M128 222h140M128 258h90"
            stroke="#0c1620"
            strokeOpacity="0.22"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="300" cy="340" r="28" fill="#2f9e7a" fillOpacity="0.85" />
          <path
            d="M288 340h24M300 328v24"
            stroke="#f4f7f9"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
