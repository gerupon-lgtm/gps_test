$defs = @(
  @{ File='enemy_slime.svg'; Kind='slime'; Body='#6ee7b7'; Accent='#10b981'; Eye='#1f2937'; Cheek='#fda4af' },
  @{ File='enemy_golem.svg'; Kind='golem'; Body='#cbd5e1'; Accent='#94a3b8'; Eye='#334155'; Cheek='#fecaca' },
  @{ File='enemy_bat.svg'; Kind='bat'; Body='#a78bfa'; Accent='#7c3aed'; Eye='#1f2937'; Cheek='#f9a8d4' },
  @{ File='enemy_skeleton.svg'; Kind='skeleton'; Body='#f8fafc'; Accent='#cbd5e1'; Eye='#0f172a'; Cheek='#fdba74' },
  @{ File='enemy_ghost.svg'; Kind='ghost'; Body='#e0f2fe'; Accent='#7dd3fc'; Eye='#1e293b'; Cheek='#c4b5fd' },
  @{ File='enemy_orc.svg'; Kind='orc'; Body='#86efac'; Accent='#65a30d'; Eye='#14532d'; Cheek='#fdba74' },
  @{ File='enemy_mushroom.svg'; Kind='mushroom'; Body='#fde68a'; Accent='#ef4444'; Eye='#1f2937'; Cheek='#fda4af' },
  @{ File='enemy_dragon.svg'; Kind='dragon'; Body='#67e8f9'; Accent='#0ea5e9'; Eye='#082f49'; Cheek='#f9a8d4' },
  @{ File='enemy_crab.svg'; Kind='crab'; Body='#fb7185'; Accent='#ef4444'; Eye='#1f2937'; Cheek='#fdba74' },
  @{ File='enemy_devil.svg'; Kind='devil'; Body='#fda4af'; Accent='#e11d48'; Eye='#4c0519'; Cheek='#fdba74' },
  @{ File='enemy_chick_peep.svg'; Kind='chick'; Body='#fde047'; Accent='#f59e0b'; Eye='#1f2937'; Cheek='#fca5a5' },
  @{ File='enemy_chick_puff.svg'; Kind='chick'; Body='#fef08a'; Accent='#fbbf24'; Eye='#1f2937'; Cheek='#fdba74' },
  @{ File='enemy_hen_kokko.svg'; Kind='hen'; Body='#f8fafc'; Accent='#ef4444'; Eye='#1f2937'; Cheek='#fdba74' },
  @{ File='enemy_rooster_dawn.svg'; Kind='hen'; Body='#fef3c7'; Accent='#dc2626'; Eye='#1f2937'; Cheek='#fb7185' },
  @{ File='enemy_kappa_sara.svg'; Kind='kappa'; Body='#86efac'; Accent='#22c55e'; Eye='#14532d'; Cheek='#fdba74' },
  @{ File='enemy_kappa_mint.svg'; Kind='kappa'; Body='#bbf7d0'; Accent='#16a34a'; Eye='#14532d'; Cheek='#fca5a5' },
  @{ File='enemy_bunny_mochi.svg'; Kind='bunny'; Body='#f5d0fe'; Accent='#d946ef'; Eye='#1f2937'; Cheek='#f9a8d4' },
  @{ File='enemy_cat_maron.svg'; Kind='cat'; Body='#fdba74'; Accent='#ea580c'; Eye='#1f2937'; Cheek='#fecdd3' },
  @{ File='enemy_frog_pico.svg'; Kind='frog'; Body='#a3e635'; Accent='#65a30d'; Eye='#14532d'; Cheek='#fda4af' },
  @{ File='enemy_penguin_toto.svg'; Kind='penguin'; Body='#dbeafe'; Accent='#1d4ed8'; Eye='#0f172a'; Cheek='#fca5a5' },
  @{ File='enemy_lamb_fuwa.svg'; Kind='lamb'; Body='#f8fafc'; Accent='#e5e7eb'; Eye='#374151'; Cheek='#f9a8d4' },
  @{ File='enemy_fox_kon.svg'; Kind='fox'; Body='#fdba74'; Accent='#f97316'; Eye='#431407'; Cheek='#fecaca' },
  @{ File='enemy_turtle_noko.svg'; Kind='turtle'; Body='#86efac'; Accent='#0f766e'; Eye='#14532d'; Cheek='#fdba74' },
  @{ File='enemy_jelly_lulu.svg'; Kind='jelly'; Body='#c4b5fd'; Accent='#8b5cf6'; Eye='#312e81'; Cheek='#f9a8d4' },
  @{ File='enemy_owl_hoko.svg'; Kind='owl'; Body='#d6d3d1'; Accent='#92400e'; Eye='#1f2937'; Cheek='#fdba74' }
)

function Get-BodyMarkup($kind, $body, $accent) {
  switch ($kind) {
    'slime' { return @"
    <path d="M72 40 C108 40 134 62 134 100 C134 136 108 156 72 156 C36 156 10 136 10 100 C10 66 34 40 72 40 Z" fill="$body"/>
    <path d="M34 116 C46 128 56 132 72 132 C88 132 98 128 110 116" fill="none" stroke="$accent" stroke-width="10" stroke-linecap="round"/>
"@ }
    'golem' { return @"
    <rect x="24" y="42" width="96" height="96" rx="28" fill="$body"/>
    <rect x="38" y="28" width="24" height="24" rx="8" fill="$accent" opacity="0.8"/>
    <rect x="84" y="22" width="28" height="28" rx="10" fill="$accent" opacity="0.75"/>
"@ }
    'bat' { return @"
    <ellipse cx="72" cy="98" rx="34" ry="38" fill="$body"/>
    <path d="M42 88 C18 54 8 62 8 92 C18 90 28 96 38 106" fill="$accent"/>
    <path d="M102 88 C126 54 136 62 136 92 C126 90 116 96 106 106" fill="$accent"/>
"@ }
    'skeleton' { return @"
    <circle cx="72" cy="82" r="38" fill="$body"/>
    <rect x="42" y="116" width="60" height="28" rx="14" fill="$body"/>
"@ }
    'ghost' { return @"
    <path d="M32 60 C32 38 50 24 72 24 C94 24 112 38 112 60 L112 126 C104 118 96 118 88 126 C80 118 72 118 64 126 C56 118 48 118 40 126 L32 126 Z" fill="$body"/>
    <path d="M46 54 C58 44 66 40 82 42" fill="none" stroke="$accent" stroke-width="8" stroke-linecap="round"/>
"@ }
    'orc' { return @"
    <circle cx="72" cy="88" r="40" fill="$body"/>
    <ellipse cx="72" cy="122" rx="26" ry="18" fill="$accent" opacity="0.35"/>
"@ }
    'mushroom' { return @"
    <path d="M20 82 C20 48 48 30 72 30 C98 30 124 48 124 82 Z" fill="$accent"/>
    <rect x="48" y="80" width="48" height="52" rx="22" fill="$body"/>
    <circle cx="50" cy="62" r="8" fill="#fff"/><circle cx="72" cy="50" r="7" fill="#fff"/><circle cx="94" cy="62" r="8" fill="#fff"/>
"@ }
    'dragon' { return @"
    <path d="M30 120 C20 74 44 42 84 42 C108 42 124 58 124 82 C124 122 94 148 58 148 Z" fill="$body"/>
    <path d="M92 44 L112 22 L114 48 Z" fill="$accent"/><path d="M54 48 L42 26 L68 40 Z" fill="$accent"/>
"@ }
    'crab' { return @"
    <ellipse cx="72" cy="100" rx="40" ry="32" fill="$body"/>
    <path d="M36 92 L14 74 L18 108 L36 104" fill="$accent"/>
    <path d="M108 92 L130 74 L126 108 L108 104" fill="$accent"/>
"@ }
    'devil' { return @"
    <circle cx="72" cy="92" r="40" fill="$body"/>
    <path d="M48 58 L40 30 L58 48 Z" fill="$accent"/><path d="M96 58 L104 30 L86 48 Z" fill="$accent"/>
"@ }
    'chick' { return @"
    <circle cx="72" cy="92" r="42" fill="$body"/>
    <ellipse cx="72" cy="136" rx="20" ry="12" fill="$body"/>
    <path d="M64 58 L72 42 L80 58 Z" fill="$accent"/>
"@ }
    'hen' { return @"
    <ellipse cx="72" cy="96" rx="42" ry="38" fill="$body"/>
    <circle cx="96" cy="78" r="16" fill="$body"/>
    <path d="M88 56 C92 42 102 42 108 56 C104 50 96 48 88 56 Z" fill="$accent"/>
"@ }
    'kappa' { return @"
    <circle cx="72" cy="92" r="40" fill="$body"/>
    <ellipse cx="72" cy="48" rx="22" ry="12" fill="#a16207"/><ellipse cx="72" cy="48" rx="14" ry="8" fill="#7dd3fc"/>
"@ }
    'bunny' { return @"
    <circle cx="72" cy="98" r="38" fill="$body"/>
    <ellipse cx="52" cy="42" rx="12" ry="28" fill="$body"/><ellipse cx="92" cy="42" rx="12" ry="28" fill="$body"/>
    <ellipse cx="52" cy="44" rx="5" ry="18" fill="$accent" opacity="0.5"/><ellipse cx="92" cy="44" rx="5" ry="18" fill="$accent" opacity="0.5"/>
"@ }
    'cat' { return @"
    <circle cx="72" cy="96" r="40" fill="$body"/>
    <path d="M42 62 L52 34 L66 60 Z" fill="$accent"/><path d="M102 62 L92 34 L78 60 Z" fill="$accent"/>
"@ }
    'frog' { return @"
    <ellipse cx="72" cy="104" rx="42" ry="34" fill="$body"/>
    <circle cx="52" cy="64" r="12" fill="$body"/><circle cx="92" cy="64" r="12" fill="$body"/>
"@ }
    'penguin' { return @"
    <ellipse cx="72" cy="96" rx="38" ry="46" fill="$accent"/><ellipse cx="72" cy="104" rx="24" ry="30" fill="$body"/>
"@ }
    'lamb' { return @"
    <circle cx="72" cy="96" r="40" fill="$body"/>
    <circle cx="48" cy="72" r="14" fill="$body"/><circle cx="96" cy="72" r="14" fill="$body"/><circle cx="72" cy="62" r="16" fill="$body"/>
"@ }
    'fox' { return @"
    <circle cx="72" cy="96" r="38" fill="$body"/>
    <path d="M40 70 L54 36 L66 66 Z" fill="$accent"/><path d="M104 70 L90 36 L78 66 Z" fill="$accent"/>
"@ }
    'turtle' { return @"
    <ellipse cx="72" cy="102" rx="44" ry="34" fill="$body"/>
    <ellipse cx="72" cy="102" rx="28" ry="22" fill="$accent"/>
"@ }
    'jelly' { return @"
    <path d="M34 70 C34 46 52 32 72 32 C92 32 110 46 110 70 C110 92 96 106 96 126 C90 122 84 122 78 126 C72 122 66 122 60 126 C54 122 48 122 42 126 C42 106 34 92 34 70 Z" fill="$body"/>
"@ }
    'owl' { return @"
    <ellipse cx="72" cy="96" rx="40" ry="42" fill="$body"/>
    <path d="M52 56 L72 42 L92 56" fill="none" stroke="$accent" stroke-width="8" stroke-linecap="round"/>
"@ }
  }
}

foreach ($def in $defs) {
  $bodyMarkup = Get-BodyMarkup $def.Kind $def.Body $def.Accent
  $svg = @"
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
$bodyMarkup
    <ellipse cx="56" cy="92" rx="7" ry="9" fill="$($def.Eye)"/>
    <ellipse cx="88" cy="92" rx="7" ry="9" fill="$($def.Eye)"/>
    <circle cx="58" cy="88" r="2" fill="#fff"/>
    <circle cx="90" cy="88" r="2" fill="#fff"/>
    <ellipse cx="50" cy="108" rx="8" ry="5" fill="$($def.Cheek)" opacity="0.75"/>
    <ellipse cx="94" cy="108" rx="8" ry="5" fill="$($def.Cheek)" opacity="0.75"/>
    <path d="M64 112 Q72 118 80 112" fill="none" stroke="$($def.Eye)" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg>
"@
  Set-Content -Path (Join-Path $PSScriptRoot "..\\assets\\$($def.File)") -Value $svg -Encoding utf8
}
