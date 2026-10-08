export function Skyline() {
  return (
    <svg viewBox="0 0 540 210" className="skyline" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x2="0" y2="1">
          <stop stopColor="#f0d2a0" />
          <stop offset="1" stopColor="#f8ead0" />
        </linearGradient>
        <linearGradient id="water" x2="0" y2="1">
          <stop stopColor="#70998b" />
          <stop offset="1" stopColor="#b8c9ae" />
        </linearGradient>
      </defs>
      <rect width="540" height="210" fill="url(#sky)" />
      <circle cx="400" cy="60" r="33" fill="#fff4d2" />
      <path
        d="M0 143L42 111 65 121 98 98 132 113 170 106 194 119 220 113 253 125 290 108 332 124 376 111 417 127 451 117 487 134 540 115V210H0Z"
        fill="#c6b99a"
      />
      <path
        d="M0 158L25 142 49 149 49 130 75 130 75 144 93 138 118 145 145 132 185 152 214 145 244 155 282 143 309 152 331 143 360 147 395 135 432 153 462 143 498 151 540 134V210H0Z"
        fill="#a6aa88"
      />
      <g fill="#7e8b72">
        <path d="M70 160V111H88V94L98 79 108 94V111H126V160Z" />
        <path d="M85 111Q98 91 111 111Z" />
        <path d="M91 83V57L98 42 105 57V83Z" />
        <path d="M88 59H108V64H88Z" />
        <path d="M222 163V132H308V163Z" />
        <path d="M229 132Q265 91 301 132Z" />
        <path d="M244 114Q265 85 286 114Z" />
        <path d="M261 98V84H268V98Z" />
        <path d="M213 163V99H220V163Z" />
        <path d="M211 100L216.5 79 222 100Z" />
        <path d="M310 163V99H317V163Z" />
        <path d="M308 100L313.5 79 319 100Z" />
        <path d="M203 163V117H209V163Z" />
        <path d="M201 118L206 98 211 118Z" />
        <path d="M321 163V117H327V163Z" />
        <path d="M319 118L324 98 329 118Z" />
        <path d="M354 157V140H379V157Z" />
        <path d="M380 157V135H408V157Z" />
        <path d="M411 157V143H447V157Z" />
      </g>
      <path
        d="M0 166Q95 154 177 165T352 160T540 162V210H0Z"
        fill="url(#water)"
      />
      <g fill="none" stroke="#e0e4c7" strokeWidth="1.4" opacity=".6">
        <path d="M32 185H105M185 180H251M311 193H401M412 175H469M105 200H180" />
      </g>
      <path d="M391 182H444L435 193H403Z" fill="#f8eed7" />
      <path d="M404 177H431V182H404Z" fill="#e8dac0" />
      <path d="M410 171H427V177H410Z" fill="#647f71" />
      <g fill="none" stroke="#879077" strokeWidth="1.5" strokeLinecap="round">
        <path d="M154 53q5-6 10 0q5-6 10 0M180 69q4-5 8 0q4-5 8 0M342 37q4-5 8 0q4-5 8 0" />
      </g>
    </svg>
  );
}
