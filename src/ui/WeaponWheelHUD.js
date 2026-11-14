// GTA V-Style 8-Wedge Radial Weapon Wheel HUD (Hold TAB, Move Mouse or Scroll Wheel, Release TAB to Equip)

export const WHEEL_SLOTS = [
  {
    index: 0,
    id: 'hk_usp',
    name: 'HK USP',
    angleDeg: -90, // 12:00 Top
    isRare: false,
    alwaysUnlocked: false,
  },
  {
    index: 1,
    id: 'pistol',
    name: 'DESERT EAGLE',
    angleDeg: -45, // 1:30 Top-Right
    isRare: false,
    alwaysUnlocked: false,
  },
  {
    index: 2,
    id: 'hk_mp5',
    name: 'HK MP5',
    angleDeg: 0, // 3:00 Right
    isRare: false,
    alwaysUnlocked: false,
  },
  {
    index: 3,
    id: 'shotgun',
    name: 'REMINGTON 870',
    angleDeg: 45, // 4:30 Bottom-Right
    isRare: false,
    alwaysUnlocked: false,
  },
  {
    index: 4,
    id: 'unarmed',
    name: 'DESARMADO',
    angleDeg: 90, // 6:00 Bottom
    isRare: false,
    alwaysUnlocked: true,
  },
  {
    index: 5,
    id: 'colt_peacemaker',
    name: 'COLT PEACEMAKER',
    angleDeg: 135, // 7:30 Bottom-Left
    isRare: true,
    alwaysUnlocked: false,
  },
  {
    index: 6,
    id: 'glock_flamengo',
    name: 'GLOCK P. 30 FLAMENGO',
    angleDeg: 180, // 9:00 Left
    isRare: true,
    alwaysUnlocked: false,
  },
  {
    index: 7,
    id: 'akms_gold',
    name: 'AKMS GOLD',
    angleDeg: -135, // 10:30 Top-Left
    isRare: true,
    alwaysUnlocked: false,
  },
];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function createAnnularSectorPath(cx, cy, rIn, rOut, startDeg, endDeg) {
  const p1 = polarToCartesian(cx, cy, rOut, startDeg);
  const p2 = polarToCartesian(cx, cy, rOut, endDeg);
  const p3 = polarToCartesian(cx, cy, rIn, endDeg);
  const p4 = polarToCartesian(cx, cy, rIn, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? '0' : '1';
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * High-Detail GTA V-Style side-profile firearm illustrations centered at (0, 0)
 * for each of the 8 equipment slots (all sharing a uniform metallic silver/gunmetal/slate palette).
 */
function getSlotWeaponSilhouetteSVG(slotId) {
  const fillGrad = 'url(#ww-metal-grad)';
  const frameFill = '#475569';
  const subFill = '#94a3b8';
  const darkFill = '#1e293b';
  const deepCut = '#090d14';

  switch (slotId) {
    case 'hk_usp':
      // 1. HK USP (Wedge 0 — Top): Squared German tactical slide, angled rear serrations,
      // front accessory rail with notch, raised 3-dot sights, oversized angled HK trigger guard,
      // exposed hammer spur, textured polymer grip, and flared mag floorplate.
      return `
        <g transform="scale(1.16)" stroke="#090d14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <!-- Exposed Bobbed Hammer Spur -->
          <path d="M -29 -13 L -36 -17 L -34 -10 L -27 -8 Z" fill="${subFill}" />
          <!-- Polymer Lower Frame, Beavertail, Accessory Rail & Textured Ergonomic Grip -->
          <path d="M -30 -6 L 29 -6 L 29 -1 L 23 -1 L 23 -3 L 20 -3 L 20 -1 L 11 -1 L 9 9 L -3 9 L -8 26 L -24 26 L -18 4 L -24 0 L -31 -2 Z" fill="${frameFill}" />
          <!-- Oversized Angled HK Trigger Guard Cutout & Curved Trigger -->
          <path d="M -4 -1 L 8 -1 L 6 6.5 L -3 6.5 Z" fill="${deepCut}" stroke="none" />
          <path d="M -4 -1 L 8 -1 L 6 6.5 L -3 6.5 Z" fill="none" stroke="#090d14" stroke-width="1.8" />
          <path d="M 2 -1 Q 4.5 2.5 1 5.2" fill="none" stroke="#e2e8f0" stroke-width="2.0" />
          <!-- Squared German Tactical Slide -->
          <path d="M -31 -17 L 29 -17 L 30 -14 L 30 -6 L -31 -6 Z" fill="${fillGrad}" />
          <!-- Protruding Threaded/Crowned Barrel Tip -->
          <rect x="30" y="-14.5" width="3.5" height="5.5" rx="0.8" fill="${subFill}" />
          <!-- Raised 3-Dot White Combat Iron Sights (Rear Notch + Front Blade) -->
          <path d="M -29 -20.5 L -22 -20.5 L -21 -17 L -30 -17 Z" fill="${darkFill}" stroke-width="1.6" />
          <circle cx="-25.5" cy="-18.7" r="1.0" fill="#e2e8f0" stroke="none" />
          <path d="M 24 -20.5 L 28 -20.5 L 28.5 -17 L 23 -17 Z" fill="${darkFill}" stroke-width="1.6" />
          <circle cx="26" cy="-18.7" r="1.0" fill="#e2e8f0" stroke="none" />
          <!-- Stepped HK Ejection Port Cutout -->
          <path d="M -4 -17 L 9 -17 L 9 -11.5 L -4 -11.5 Z" fill="${darkFill}" stroke-width="1.6" />
          <!-- Angled Rear Slide Serrations -->
          <line x1="-25" y1="-14.5" x2="-26.5" y2="-8" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-21.5" y1="-14.5" x2="-23" y2="-8" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-18" y1="-14.5" x2="-19.5" y2="-8" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-14.5" y1="-14.5" x2="-16" y2="-8" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-11" y1="-14.5" x2="-12.5" y2="-8" stroke="${darkFill}" stroke-width="1.7" />
          <!-- Slide Stop & Frame Safety Lever -->
          <rect x="-15" y="-5" width="8" height="2.4" rx="0.8" fill="${darkFill}" stroke-width="1.2" />
          <!-- Textured Stippled Grip Panel & Flared Magazine Baseplate -->
          <path d="M -16 4 L -7 4 L -11 22 L -20 22 Z" fill="${darkFill}" stroke-width="1.5" />
          <line x1="-16" y1="8" x2="-9" y2="8" stroke="#475569" stroke-width="1.1" />
          <line x1="-17" y1="13" x2="-10" y2="13" stroke="#475569" stroke-width="1.1" />
          <line x1="-18" y1="18" x2="-11" y2="18" stroke="#475569" stroke-width="1.1" />
          <path d="M -26 26 L -6 26 L -5 29.5 L -27 29.5 Z" fill="${darkFill}" stroke-width="1.8" />
        </g>
      `;

    case 'pistol':
      // 2. DESERT EAGLE (Wedge 1 — Top-Right): Massive long triangular/hexagonal .50 AE barrel profile,
      // top Picatinny rail notches, deep barrel flute, thick rear slide with serrations, wide grip frame.
      return `
        <g transform="scale(1.06)" stroke="#090d14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <!-- Large Combat Hammer Spur -->
          <path d="M -34 -14 L -42 -19 L -40 -11 L -32 -9 Z" fill="${subFill}" />
          <!-- Heavy Steel Lower Frame, Beavertail & Wide .50 AE Grip -->
          <path d="M -35 -5 L 34 -5 L 33 -1 L 12 -1 L 9 9 L -3 9 L -9 29 L -26 29 L -19 4 L -27 0 L -36 -2 Z" fill="${frameFill}" />
          <!-- Trigger Guard Cutout & Curved Trigger -->
          <path d="M -4 -1 L 8 -1 L 6 7 L -4 7 Z" fill="${deepCut}" stroke="none" />
          <path d="M -4 -1 L 8 -1 L 6 7 L -4 7 Z" fill="none" stroke="#090d14" stroke-width="1.8" />
          <path d="M 2 -1 Q 5 3 1 5.8" fill="none" stroke="#e2e8f0" stroke-width="2.0" />
          <!-- Massive Triangular/Hexagonal .50 AE Barrel & Rear Slide Bridge -->
          <path d="M -35 -18 L 37 -18 L 40 -13 L 38 -5 L -35 -5 Z" fill="${fillGrad}" />
          <!-- Top Weaver/Picatinny Barrel Rib Notches -->
          <rect x="4" y="-19.5" width="4" height="1.8" fill="${darkFill}" stroke-width="1.1" />
          <rect x="12" y="-19.5" width="4" height="1.8" fill="${darkFill}" stroke-width="1.1" />
          <rect x="20" y="-19.5" width="4" height="1.8" fill="${darkFill}" stroke-width="1.1" />
          <rect x="28" y="-19.5" width="4" height="1.8" fill="${darkFill}" stroke-width="1.1" />
          <!-- Combat Sights -->
          <path d="M -33 -21.5 L -26 -21.5 L -25 -18 L -34 -18 Z M 32 -21.5 L 37 -21.5 L 37.5 -18 L 31 -18 Z" fill="${darkFill}" stroke-width="1.5" />
          <!-- Signature Desert Eagle Side Barrel Flute & Open Ejection Cutout -->
          <path d="M -8 -16 L 6 -16 L 4 -10 L -8 -10 Z" fill="${darkFill}" stroke-width="1.5" />
          <rect x="10" y="-13.5" width="21" height="4.8" rx="1.5" fill="${darkFill}" stroke-width="1.6" />
          <!-- Rear Slide Serrations & Safety -->
          <line x1="-29" y1="-15" x2="-30.5" y2="-7.5" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-25.5" y1="-15" x2="-27" y2="-7.5" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-22" y1="-15" x2="-23.5" y2="-7.5" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-18.5" y1="-15" x2="-20" y2="-7.5" stroke="${darkFill}" stroke-width="1.7" />
          <line x1="-15" y1="-15" x2="-16.5" y2="-7.5" stroke="${darkFill}" stroke-width="1.7" />
          <!-- Wraparound Rubber Grip Insert & Heavy .50 AE Baseplate -->
          <path d="M -18 4 L -7 4 L -12 25 L -23 25 Z" fill="${darkFill}" stroke-width="1.6" />
          <line x1="-18" y1="9" x2="-9" y2="9" stroke="#475569" stroke-width="1.2" />
          <line x1="-19.5" y1="14" x2="-10.5" y2="14" stroke="#475569" stroke-width="1.2" />
          <line x1="-21" y1="19" x2="-12" y2="19" stroke="#475569" stroke-width="1.2" />
          <path d="M -28 29 L -7 29 L -6 32.5 L -29 32.5 Z" fill="${subFill}" stroke-width="1.8" />
        </g>
      `;

    case 'hk_mp5':
      // 3. HK MP5 (Wedge 2 — Right): Hooded ring front sight, ribbed tapered handguard,
      // upper receiver claw-mount rail, curved 30-round 9mm banana magazine, angled pistol grip,
      // and collapsible/fixed stock.
      return `
        <g transform="scale(0.92)" stroke="#090d14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <!-- Collapsible A3 Stock Buttpad & Twin Horizontal Steel Stock Rails -->
          <path d="M -54 -13 L -47 -13 L -47 9 L -53 12 L -56 10 Z" fill="${darkFill}" />
          <rect x="-47" y="-7.5" width="18" height="3.6" fill="${subFill}" stroke-width="1.6" />
          <rect x="-32" y="-14" width="5" height="15" rx="1" fill="${darkFill}" stroke-width="1.8" />
          <!-- Curved 30-Round 9mm Steel Banana Magazine -->
          <path d="M -1 1 L 9 1 C 12 14 17 25 24 34 L 15 37 C 7 27 2 15 -1 1 Z" fill="${subFill}" />
          <line x1="4" y1="7" x2="17" y2="31" stroke="${darkFill}" stroke-width="1.4" />
          <!-- Lower Receiver, SEF Trigger Housing & Angled Pistol Grip -->
          <path d="M -29 0 L 10 0 L 9 5 L -4 5 L -6 11 L -15 11 L -20 26 L -30 25 L -25 5 L -29 3 Z" fill="${frameFill}" />
          <path d="M -14 3 L -6 3 L -7 9 L -15 9 Z" fill="${deepCut}" stroke="none" />
          <path d="M -14 3 L -6 3 L -7 9 L -15 9 Z" fill="none" stroke="#090d14" stroke-width="1.7" />
          <path d="M -9 3 Q -8 6 -11 8" fill="none" stroke="#e2e8f0" stroke-width="1.8" />
          <!-- SEF Selector Switch Detail -->
          <circle cx="-22" cy="3" r="1.8" fill="${subFill}" stroke="#090d14" stroke-width="1.1" />
          <!-- Upper Receiver with Claw-Mount Bosses & Fluted Channel -->
          <path d="M -29 -15 L 14 -15 L 14 1 L -29 1 Z" fill="${fillGrad}" />
          <rect x="-22" y="-17.5" width="18" height="2.5" rx="0.6" fill="${subFill}" stroke-width="1.5" />
          <rect x="-4" y="-11" width="11" height="4.2" rx="1" fill="${darkFill}" stroke-width="1.5" />
          <line x1="-25" y1="-7" x2="-8" y2="-7" stroke="${darkFill}" stroke-width="1.6" />
          <!-- Rear Drum Diopter Sight -->
          <rect x="-28" y="-20" width="5" height="5" rx="1" fill="${darkFill}" stroke-width="1.6" />
          <!-- Tapered Ribbed Tropical Handguard -->
          <path d="M 12 -13 L 37 -12 L 35 -1 L 12 1 Z" fill="${darkFill}" stroke-width="2.0" />
          <line x1="17" y1="-11" x2="17" y2="-1" stroke="#475569" stroke-width="1.4" />
          <line x1="22" y1="-11" x2="22" y2="-1.5" stroke="#475569" stroke-width="1.4" />
          <line x1="27" y1="-10.5" x2="27" y2="-2" stroke="#475569" stroke-width="1.4" />
          <line x1="32" y1="-10.5" x2="32" y2="-2.5" stroke="#475569" stroke-width="1.4" />
          <!-- Iconic Hooded Ring Front Sight Tower & Tri-Lug Muzzle -->
          <path d="M 35 -21 L 41 -21 L 42 -11 L 35 -11 Z" fill="${subFill}" stroke-width="1.8" />
          <circle cx="38.5" cy="-17.5" r="2.1" fill="${deepCut}" stroke="#090d14" stroke-width="1.3" />
          <rect x="36" y="-10.5" width="14" height="4.5" rx="1" fill="${fillGrad}" stroke-width="1.8" />
          <rect x="49" y="-11.2" width="4" height="5.8" rx="0.8" fill="${subFill}" stroke-width="1.5" />
        </g>
      `;

    case 'shotgun':
      // 4. REMINGTON 870 (Wedge 3 — Bottom-Right): Long pump-action shotgun with top barrel +
      // lower tubular magazine, horizontal grooved fore-end pump handle, solid receiver with
      // ejection port, and full shoulder stock with recoil pad.
      return `
        <g transform="scale(0.88)" stroke="#090d14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <!-- Full Contoured Shoulder Stock, Pistol-Grip Wrist & Rubber Recoil Pad -->
          <path d="M -58 5 L -54 5 L -54 22 L -58 22 Z" fill="${darkFill}" />
          <path d="M -54 5 L -33 -3 L -24 -2 L -19 -11 L -15 -11 L -15 -1 L -22 3 L -28 3 L -34 10 L -54 22 Z" fill="${frameFill}" />
          <!-- Trigger Guard & Trigger -->
          <path d="M -18 -1 L -9 -1 L -10 5.5 L -17 5.5 Z" fill="${deepCut}" stroke="none" />
          <path d="M -18 -1 L -9 -1 L -10 5.5 L -17 5.5 Z" fill="none" stroke="#090d14" stroke-width="1.7" />
          <path d="M -13 -1 Q -12 2.5 -14 4.5" fill="none" stroke="#e2e8f0" stroke-width="1.6" />
          <!-- Solid Steel Remington 870 Receiver -->
          <path d="M -17 -14 L 11 -14 L 11 -1 L -17 -1 Z" fill="${fillGrad}" />
          <!-- Chromed Ejection Port & Bolt Carrier -->
          <rect x="-7" y="-11" width="12" height="4.2" rx="0.8" fill="#e2e8f0" stroke-width="1.5" />
          <!-- Long 12-Gauge Top Barrel & Front Bead Sight -->
          <rect x="11" y="-13.5" width="47" height="4.6" fill="${fillGrad}" />
          <path d="M 54 -16.5 L 57 -16.5 L 57.5 -13.5 L 53.5 -13.5 Z" fill="${subFill}" stroke-width="1.4" />
          <!-- Parallel Lower Tubular Magazine & Cap -->
          <rect x="11" y="-8.2" width="39" height="4.2" fill="${subFill}" />
          <rect x="50" y="-8.5" width="3.5" height="4.8" rx="0.6" fill="${darkFill}" stroke-width="1.4" />
          <!-- Distinct Horizontal Corncob-Grooved Pump Fore-End Handle -->
          <rect x="17" y="-9.8" width="24" height="8.5" rx="2" fill="${darkFill}" stroke-width="2.0" />
          <line x1="20.5" y1="-9.2" x2="20.5" y2="-1.8" stroke="#94a3b8" stroke-width="1.4" />
          <line x1="24" y1="-9.2" x2="24" y2="-1.8" stroke="#94a3b8" stroke-width="1.4" />
          <line x1="27.5" y1="-9.2" x2="27.5" y2="-1.8" stroke="#94a3b8" stroke-width="1.4" />
          <line x1="31" y1="-9.2" x2="31" y2="-1.8" stroke="#94a3b8" stroke-width="1.4" />
          <line x1="34.5" y1="-9.2" x2="34.5" y2="-1.8" stroke="#94a3b8" stroke-width="1.4" />
          <line x1="38" y1="-9.2" x2="38" y2="-1.8" stroke="#94a3b8" stroke-width="1.4" />
        </g>
      `;

    case 'unarmed':
      // 5. DESARMADO / PUNHOS (Wedge 4 — Bottom): GTA V Clenched Fist Icon
      return `
        <g transform="scale(1.02)" stroke="#090d14" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
          <!-- Palm & Wrist Base -->
          <path d="M -18 -4 C -22 -4 -24 8 -20 16 L -14 22 L 14 22 L 20 14 C 22 6 22 -6 18 -10 L -14 -10 Z" fill="url(#ww-metal-grad)" />
          <!-- 4 Curled Fingers -->
          <rect x="-18" y="-18" width="9" height="15" rx="4" fill="url(#ww-metal-grad)" />
          <rect x="-9" y="-20" width="9" height="16" rx="4" fill="url(#ww-metal-grad)" />
          <rect x="0" y="-19" width="9" height="15" rx="4" fill="url(#ww-metal-grad)" />
          <rect x="9" y="-16" width="9" height="14" rx="4" fill="url(#ww-metal-grad)" />
          <!-- Thumb tucked across front -->
          <path d="M -20 2 C -20 -4 -12 -6 -4 -5 L 8 -3 C 12 -2 12 5 7 6 L -12 7 C -17 7 -20 5 -20 2 Z" fill="#cbd5e1" />
          <!-- Palm crease line -->
          <line x1="-12" y1="12" x2="10" y2="12" stroke="#090d14" stroke-width="2.0" />
        </g>
      `;

    case 'colt_peacemaker':
      // 6. COLT PEACEMAKER (Wedge 5 — Bottom-Left — LENDÁRIA): Classic Western single-action revolver
      // with long cylindrical barrel + under-barrel ejector rod housing, 6-shot fluted cylinder
      // with oval notches, high cocked hammer spur, rounded trigger guard, flared western grip.
      return `
        <g transform="scale(1.04)" stroke="#090d14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <!-- High Cocked Cavalry Hammer Spur -->
          <path d="M -18 -13 L -28 -22 L -25 -12 L -17 -8 Z" fill="${subFill}" />
          <!-- Flared Western Bird's-Head / Plow-Handle Grip -->
          <path d="M -16 -2 C -21 6 -27 18 -32 27 C -27 31 -15 31 -11 26 C -9 16 -9 5 -7 -1 Z" fill="${frameFill}" />
          <circle cx="-19" cy="18" r="2.2" fill="${fillGrad}" stroke="#090d14" stroke-width="1.2" />
          <!-- Rounded Single-Action Trigger Guard & Curved Trigger -->
          <path d="M -9 0 C -10 9 3 9 2 0 Z" fill="${deepCut}" stroke="none" />
          <path d="M -9 0 C -10 9 3 9 2 0 Z" fill="none" stroke="#090d14" stroke-width="2.0" />
          <path d="M -3 0 Q -1 4.5 -4.5 6.5" fill="none" stroke="#e2e8f0" stroke-width="1.8" />
          <!-- Long Cylindrical .45 Barrel & Shark-Fin Front Sight -->
          <rect x="6" y="-16.5" width="38" height="5.2" rx="1" fill="${fillGrad}" />
          <path d="M 38 -21.5 C 40 -21.5 42.5 -19 43 -16.5 L 37.5 -16.5 Z" fill="${fillGrad}" stroke-width="1.6" />
          <!-- Under-Barrel Ejector Rod Housing & Crescent Button -->
          <rect x="6" y="-11.2" width="29" height="3.6" rx="1" fill="${subFill}" />
          <circle cx="35" cy="-9.4" r="2.1" fill="${fillGrad}" stroke-width="1.4" />
          <!-- Revolver Top-Strap Frame & Recoil Shield -->
          <path d="M -20 -17 L 8 -17 L 8 1 L -15 1 L -19 -6 Z" fill="${fillGrad}" />
          <!-- 6-Shot Fluted Cylinder with Horizontal Flutes & Oval Notches -->
          <rect x="-11" y="-14.5" width="17" height="13.5" rx="2" fill="${subFill}" stroke-width="2.0" />
          <rect x="-8.5" y="-12" width="10" height="3.0" rx="1.5" fill="${darkFill}" stroke-width="1.3" />
          <rect x="-8.5" y="-6.2" width="10" height="3.0" rx="1.5" fill="${darkFill}" stroke-width="1.3" />
          <ellipse cx="3" cy="-10.5" rx="1.5" ry="1.1" fill="${darkFill}" stroke="none" />
          <ellipse cx="3" cy="-4.7" rx="1.5" ry="1.1" fill="${darkFill}" stroke="none" />
        </g>
      `;

    case 'glock_flamengo':
      // 7. GLOCK P. 30 FLAMENGO (Wedge 6 — Left — LENDÁRIA): True side-profile silhouette of
      // glock_flamengo.glb — squared flat-top Glock slide with rear serrations & sights, angled
      // finger-grooved grip, and a thick cylindrical DRUM MAGAZINE viewed from the SIDE PROFILE
      // (wide vertical drum canister with horizontal facet bands & beveled front cover plate).
      return `
        <g transform="translate(2, -3.5) scale(1.02)" stroke="#090d14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <!-- Magazine Feed Neck Below Grip Base -->
          <path d="M -19.5 8 L -8 8 L -8 12.5 L -20 12.5 Z" fill="${darkFill}" stroke-width="1.8" />
          <!-- Side-Profile Cylindrical Drum Magazine Main Rear Canister Body -->
          <path d="M -20.5 11.5 C -22.2 17 -22.2 28.5 -20.2 34.5 L -9.2 34.5 L -9.2 11.5 Z" fill="${darkFill}" stroke-width="2.0" />
          <!-- Horizontal Cylindrical Facet Shading Bands on Drum Canister Wall -->
          <path d="M -21.2 16.5 L -9.5 16.5 L -9.5 21.5 L -21.4 21.5 Z" fill="${frameFill}" stroke="none" />
          <path d="M -21.2 26.2 L -9.5 26.2 L -9.5 30.2 L -20.8 30.2 Z" fill="#334155" stroke="none" />
          <line x1="-21.0" y1="16.5" x2="-9.5" y2="16.5" stroke="#090d14" stroke-width="1.2" />
          <line x1="-21.4" y1="21.5" x2="-9.5" y2="21.5" stroke="#090d14" stroke-width="1.2" />
          <line x1="-21.2" y1="26.2" x2="-9.5" y2="26.2" stroke="#090d14" stroke-width="1.2" />
          <line x1="-20.8" y1="30.2" x2="-9.5" y2="30.2" stroke="#090d14" stroke-width="1.2" />
          <!-- Side-Profile Beveled Conical Front Cover of Drum Magazine -->
          <path d="M -9.2 11.5 L -6.0 11.5 L -3.2 18.5 L -3.2 27.8 L -6.5 34.5 L -9.2 34.5 Z" fill="${subFill}" stroke-width="2.0" />
          <!-- Upper Front Drum Latch / Feed Window Detail -->
          <rect x="-8.8" y="12.8" width="2.8" height="3.2" rx="0.4" fill="${darkFill}" stroke-width="1.2" />
          <!-- Bottom Drum Base Lug Tab -->
          <path d="M -19.2 34.5 L -12.0 34.5 L -12.5 36.6 L -18.5 36.6 Z" fill="${darkFill}" stroke-width="1.6" />
          <!-- Glock Polymer Lower Frame, Under-Barrel Accessory Rail & Finger-Grooved Grip -->
          <path d="M -24 -12.5 L 25.5 -12.5 L 25.5 -8 L 19.5 -8 L 19.5 -9.8 L 17 -9.8 L 17 -8 L 9 -8 L 8.2 -0.5 L -2.5 -0.5 L -1.2 1.8 L -3.4 3.8 L -2.2 6.0 L -4.8 8.8 L -20.5 8.8 L -15 -6 L -21 -9 Z" fill="${frameFill}" />
          <!-- Squared Glock Trigger Guard Cutout & Safety Trigger -->
          <path d="M -2.2 -8 L 6.5 -8 L 5.6 -2.2 L -2.2 -2.2 Z" fill="${deepCut}" stroke="none" />
          <path d="M -2.2 -8 L 6.5 -8 L 5.6 -2.2 L -2.2 -2.2 Z" fill="none" stroke="#090d14" stroke-width="1.7" />
          <path d="M 2.5 -8 Q 4.2 -5.0 1.4 -3.0" fill="none" stroke="#e2e8f0" stroke-width="1.9" />
          <!-- Textured Grip Side Panel Insert -->
          <path d="M -14.5 -4.5 L -6.8 -4.5 L -9.5 6.5 L -17.5 6.5 Z" fill="${darkFill}" stroke-width="1.4" />
          <!-- Squared Flat-Top Glock Slide -->
          <rect x="-25" y="-23.5" width="51" height="11" rx="1.2" fill="${fillGrad}" />
          <!-- Glock Iron Sights & Rectangular Ejection Port -->
          <path d="M -23.5 -26.5 L -18.5 -26.5 L -18 -23.5 L -24 -23.5 Z M 21 -26.5 L 25 -26.5 L 25.5 -23.5 L 20.5 -23.5 Z" fill="${darkFill}" stroke-width="1.5" />
          <rect x="-4" y="-22.2" width="9.5" height="4.2" fill="${darkFill}" stroke-width="1.5" />
          <!-- Vertical Rear Glock Slide Serrations -->
          <line x1="-21" y1="-21" x2="-21" y2="-15" stroke="${darkFill}" stroke-width="1.6" />
          <line x1="-17.8" y1="-21" x2="-17.8" y2="-15" stroke="${darkFill}" stroke-width="1.6" />
          <line x1="-14.6" y1="-21" x2="-14.6" y2="-15" stroke="${darkFill}" stroke-width="1.6" />
          <line x1="-11.4" y1="-21" x2="-11.4" y2="-15" stroke="${darkFill}" stroke-width="1.6" />
        </g>
      `;

    case 'akms_gold':
      // 8. AKMS GOLD (Wedge 7 — Top-Left — LENDÁRIA): Unmistakable Kalashnikov silhouette with
      // angled front sight post + slanted muzzle brake, upper gas tube above barrel, ribbed
      // handguard, sharply curved 7.62x39 banana magazine, pistol grip, underfolding stock struts.
      return `
        <g transform="scale(0.88)" stroke="#090d14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <!-- Underfolding Skeletal Stock Struts & Shoulder Piece -->
          <path d="M -58 -8 L -52 -8 L -52 10 L -57 12 Z" fill="${subFill}" />
          <path d="M -52 -3 L -29 -5 L -29 -1.5 L -52 0.5 Z" fill="${fillGrad}" stroke-width="1.8" />
          <circle cx="-29" cy="-4" r="2.4" fill="${subFill}" stroke-width="1.5" />
          <!-- Sharply Curved 7.62x39 Ribbed Banana Magazine -->
          <path d="M -3 -1 L 9 -1 C 13 13 21 24 31 32 L 20 37 C 9 28 0 15 -3 -1 Z" fill="${subFill}" />
          <path d="M 3 5 C 7 15 13 23 21 30" fill="none" stroke="${frameFill}" stroke-width="1.6" />
          <path d="M 6 4 C 10 14 16 22 24 29" fill="none" stroke="#090d14" stroke-width="1.3" />
          <!-- Angled Kalashnikov Pistol Grip & Trigger Guard -->
          <path d="M -23 -1 L -13 -1 L -19 20 L -29 19 Z" fill="${frameFill}" />
          <path d="M -13 -1 L -4 -1 L -5 6 L -13 6 Z" fill="${deepCut}" stroke="none" />
          <path d="M -13 -1 L -4 -1 L -5 6 L -13 6 Z" fill="none" stroke="#090d14" stroke-width="1.7" />
          <path d="M -8 -1 Q -6.5 2.5 -9.5 4.8" fill="none" stroke="#e2e8f0" stroke-width="1.7" />
          <!-- Stamped AK Receiver & Ribbed Top Dust Cover -->
          <path d="M -31 -14 L 5 -14 L 6 -1 L -29 -1 Z" fill="${fillGrad}" />
          <path d="M -30 -14 C -20 -16.5 -6 -16 4 -14 Z" fill="${subFill}" stroke-width="1.6" />
          <!-- AK Receiver Dimple & Long Safety Selector Lever -->
          <rect x="-6" y="-6.5" width="7" height="2.6" rx="1.2" fill="${frameFill}" stroke-width="1.2" />
          <line x1="-22" y1="-7" x2="-6" y2="-8.5" stroke="#090d14" stroke-width="2.0" />
          <!-- Rear Tangent Sight Block -->
          <rect x="2" y="-17.5" width="6" height="3.5" rx="0.6" fill="${subFill}" stroke-width="1.5" />
          <!-- Upper Gas Tube & Ribbed Lower Handguard with Vent Slots -->
          <rect x="6" y="-15.5" width="20" height="4.2" rx="1" fill="${subFill}" stroke-width="1.8" />
          <path d="M 6 -11 L 28 -11 L 27 -2 L 6 -1 Z" fill="${frameFill}" stroke-width="1.9" />
          <rect x="12" y="-11.5" width="5" height="2.2" rx="0.8" fill="${deepCut}" stroke="none" />
          <rect x="19" y="-11.5" width="5" height="2.2" rx="0.8" fill="${deepCut}" stroke="none" />
          <!-- 45-Degree AK Gas Block -->
          <path d="M 26 -15.5 L 31 -15.5 L 33 -10 L 26 -10 Z" fill="${fillGrad}" stroke-width="1.7" />
          <!-- Long 7.62 Barrel & Under-Barrel Cleaning Rod -->
          <rect x="27" y="-10" width="27" height="3.8" fill="${fillGrad}" stroke-width="1.8" />
          <line x1="27" y1="-5.2" x2="51" y2="-5.2" stroke="${subFill}" stroke-width="1.5" />
          <!-- Iconic Triangular AK Front Sight Tower & Slanted Muzzle Brake -->
          <path d="M 44 -21.5 L 49 -21.5 L 51 -10 L 43 -10 Z" fill="${fillGrad}" stroke-width="1.8" />
          <circle cx="47" cy="-18" r="1.4" fill="${deepCut}" stroke="none" />
          <path d="M 54 -10.2 L 60 -11.2 L 58 -5.8 L 54 -6.0 Z" fill="${subFill}" stroke-width="1.7" />
        </g>
      `;

    default:
      return '';
  }
}

export class WeaponWheelHUD {
  constructor(weaponSystem, soundManager) {
    this.weaponSystem = weaponSystem;
    this.sound = soundManager;

    this.isOpen = false;
    this.cursorX = 0;
    this.cursorY = 0;
    this.maxRadius = 140;
    this.deadzoneRadius = 26;
    this.hoveredIndex = 4; // Default to Bottom (Desarmado / Punhos)
    this._lastWheelTime = 0;

    this.overlayEl = null;
    this.cursorDotEl = null;
    this.centerNameEl = null;
    this.centerAmmoEl = null;
    this.rareBadgeEl = null;
    this.wedgeEls = [];
    this.arcEls = [];
    this.iconGroupEls = [];

    this._buildDOM();
    if (typeof window !== 'undefined') {
      window.isWeaponWheelOpen = false;
      window.__rocWeaponWheel = this;
    }
  }

  _buildDOM() {
    let overlay = document.getElementById('hud-weapon-wheel');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'hud-weapon-wheel';
      const hudRoot = document.getElementById('hud') || document.body;
      hudRoot.appendChild(overlay);
    }
    this.overlayEl = overlay;

    const cx = 250;
    const cy = 250;
    const rIn = 112;
    const rOut = 216;
    const rArcIn = 210;
    const rArcOut = 221;
    const rIcon = 164;
    const halfSpan = 22.5;
    const gapDeg = 0.9;

    let wedgesSvg = '';
    let arcsSvg = '';
    let dividersSvg = '';
    let iconsSvg = '';

    for (let i = 0; i < WHEEL_SLOTS.length; i++) {
      const slot = WHEEL_SLOTS[i];
      const startDeg = slot.angleDeg - halfSpan + gapDeg;
      const endDeg = slot.angleDeg + halfSpan - gapDeg;

      const sectorPath = createAnnularSectorPath(cx, cy, rIn, rOut, startDeg, endDeg);
      const arcPath = createAnnularSectorPath(cx, cy, rArcIn, rArcOut, startDeg, endDeg);

      wedgesSvg += `<path id="ww-wedge-${i}" class="ww-wedge" data-index="${i}" d="${sectorPath}" fill="rgba(15, 20, 28, 0.58)" />`;
      arcsSvg += `<path id="ww-arc-${i}" class="ww-arc" data-index="${i}" d="${arcPath}" fill="transparent" />`;

      // Dark radial gap divider line at start boundary
      const boundaryDeg = slot.angleDeg - halfSpan;
      const pIn = polarToCartesian(cx, cy, rIn, boundaryDeg);
      const pOut = polarToCartesian(cx, cy, rArcOut, boundaryDeg);
      dividersSvg += `<line x1="${pIn.x.toFixed(2)}" y1="${pIn.y.toFixed(2)}" x2="${pOut.x.toFixed(2)}" y2="${pOut.y.toFixed(2)}" stroke="rgba(4, 7, 12, 0.92)" stroke-width="4.2" />`;

      // Weapon silhouette icon positioned at midpoint of wedge
      const iconPos = polarToCartesian(cx, cy, rIcon, slot.angleDeg);
      const silhouette = getSlotWeaponSilhouetteSVG(slot.id);
      iconsSvg += `
        <g id="ww-icon-${i}" class="ww-icon-group" transform="translate(${iconPos.x.toFixed(2)}, ${iconPos.y.toFixed(2)})" style="opacity: 0;">
          ${silhouette}
        </g>
      `;
    }

    overlay.innerHTML = `
      <div class="ww-wheel-wrapper">
        <svg class="ww-svg-ring" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ww-metal-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#e2e8f0" />
              <stop offset="50%" stop-color="#cbd5e1" />
              <stop offset="100%" stop-color="#94a3b8" />
            </linearGradient>
            <filter id="ww-cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#38bdf8" flood-opacity="0.85" />
            </filter>
          </defs>

          <!-- Outer & Inner Dark Framing Rings -->
          <circle cx="250" cy="250" r="${rArcOut}" fill="none" stroke="rgba(4, 7, 12, 0.90)" stroke-width="4" />
          <circle cx="250" cy="250" r="${rIn}" fill="rgba(6, 10, 16, 0.42)" stroke="rgba(4, 7, 12, 0.90)" stroke-width="4" />

          <!-- 8 Radial Wedge Sectors -->
          <g class="ww-wedges-layer">${wedgesSvg}</g>

          <!-- Dark Radial Gap Dividers -->
          <g class="ww-dividers-layer">${dividersSvg}</g>

          <!-- Outer Rim Highlight Arcs -->
          <g class="ww-arcs-layer">${arcsSvg}</g>

          <!-- Custom SVG Weapon Silhouettes -->
          <g class="ww-icons-layer">${iconsSvg}</g>
        </svg>

        <!-- Center Circle Info Display (Badge + Weapon Name + Ammo Counter) -->
        <div class="ww-center-info">
          <div id="ww-rare-badge" class="ww-rare-badge" style="display: none;">★ LENDÁRIA</div>
          <div id="ww-center-name" class="ww-center-name">DESARMADO</div>
          <div id="ww-center-ammo" class="ww-center-ammo" style="display: none;"></div>
        </div>

        <!-- Subtle Virtual Radial Cursor Indicator -->
        <div id="ww-cursor-dot" class="ww-cursor-dot"></div>
      </div>
    `;

    this.cursorDotEl = overlay.querySelector('#ww-cursor-dot');
    this.centerNameEl = overlay.querySelector('#ww-center-name');
    this.centerAmmoEl = overlay.querySelector('#ww-center-ammo');
    this.rareBadgeEl = overlay.querySelector('#ww-rare-badge');

    this.wedgeEls = [];
    this.arcEls = [];
    this.iconGroupEls = [];
    for (let i = 0; i < WHEEL_SLOTS.length; i++) {
      this.wedgeEls.push(overlay.querySelector(`#ww-wedge-${i}`));
      this.arcEls.push(overlay.querySelector(`#ww-arc-${i}`));
      this.iconGroupEls.push(overlay.querySelector(`#ww-icon-${i}`));
    }
  }

  _getEquippedIndex() {
    if (!this.weaponSystem || this.weaponSystem.isUnarmed) {
      return 4; // Unarmed (Bottom 6:00)
    }
    const activeId = this.weaponSystem.currentWeapon;
    const found = WHEEL_SLOTS.findIndex((s) => s.id === activeId);
    return found !== -1 ? found : 4;
  }

  _isSlotUnlocked(slot) {
    if (slot.alwaysUnlocked || slot.id === 'unarmed') return true;
    if (!this.weaponSystem) return false;
    return this.weaponSystem.isWeaponUnlocked(slot.id);
  }

  /**
   * Finds the next unlocked wedge index around the 8-wedge circle in `stepDir` (+1 clockwise, -1 counter-clockwise).
   */
  _findNextUnlockedIndex(startIndex, stepDir) {
    const len = WHEEL_SLOTS.length;
    const dir = stepDir >= 0 ? 1 : -1;
    for (let step = 1; step <= len; step++) {
      const candidateIdx = (startIndex + dir * step + len * 2) % len;
      if (this._isSlotUnlocked(WHEEL_SLOTS[candidateIdx])) {
        return candidateIdx;
      }
    }
    return startIndex;
  }

  /**
   * Cycles unlocked slots via Mouse Scroll Wheel:
   * - deltaY < 0 (Scroll Forward): Next unlocked slot to the right / clockwise (+1)
   * - deltaY > 0 (Scroll Backward): Next unlocked slot to the left / counter-clockwise (-1)
   * Includes a 70ms debounce so fast scroll wheels step cleanly one weapon at a time.
   */
  handleWheel(deltaY) {
    if (!deltaY || deltaY === 0) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastWheelTime < 70) return false;
    this._lastWheelTime = now;

    const stepDir = deltaY < 0 ? 1 : -1;

    if (this.isOpen) {
      const nextIdx = this._findNextUnlockedIndex(this.hoveredIndex, stepDir);
      if (nextIdx !== this.hoveredIndex) {
        this.hoveredIndex = nextIdx;
        const slot = WHEEL_SLOTS[nextIdx];
        if (slot) {
          const rad = (slot.angleDeg * Math.PI) / 180;
          this.cursorX = Math.cos(rad) * 84;
          this.cursorY = Math.sin(rad) * 84;
          this._updateCursorVisual();
        }
        if (this.sound && typeof this.sound.playWheelHoverTick === 'function') {
          this.sound.playWheelHoverTick(!!(slot && slot.isRare));
        }
        this.refreshVisuals();
        return true;
      }
      return false;
    }

    // Wheel is closed (normal gameplay): immediately equip the next unlocked clockwise/counter-clockwise slot
    const currentIdx = this._getEquippedIndex();
    const nextIdx = this._findNextUnlockedIndex(currentIdx, stepDir);
    if (nextIdx !== currentIdx) {
      const nextSlot = WHEEL_SLOTS[nextIdx];
      if (nextSlot && this.weaponSystem) {
        this.hoveredIndex = nextIdx;
        this.weaponSystem.selectWheelSlot(nextSlot.id);
        this.refreshVisuals();
        return true;
      }
    }
    return false;
  }

  /**
   * Opens the GTA V Radial Weapon Wheel when TAB is pressed down.
   */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    window.isWeaponWheelOpen = true;

    const equippedIdx = this._getEquippedIndex();
    this.hoveredIndex = equippedIdx;
    this.cursorX = 0;
    this.cursorY = 0;

    this._updateCursorVisual();
    this.refreshVisuals();

    if (this.overlayEl) {
      this.overlayEl.classList.add('is-open');
    }
  }

  /**
   * Closes the Radial Weapon Wheel on TAB release and equips the hovered unlocked slot if changed.
   */
  close(applySelection = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    window.isWeaponWheelOpen = false;

    if (this.overlayEl) {
      this.overlayEl.classList.remove('is-open');
    }

    if (!applySelection || !this.weaponSystem) return;

    const hoveredSlot = WHEEL_SLOTS[this.hoveredIndex];
    if (!hoveredSlot) return;

    // Locked slots cannot be equipped on release
    if (!this._isSlotUnlocked(hoveredSlot)) return;

    const equippedIdx = this._getEquippedIndex();
    if (this.hoveredIndex !== equippedIdx) {
      this.weaponSystem.selectWheelSlot(hoveredSlot.id);
    }
  }

  /**
   * Processes mousemove deltas while PointerLock remains active and TAB is held.
   */
  handleMouseMove(movementX, movementY) {
    if (!this.isOpen) return;

    this.cursorX += movementX * 0.65;
    this.cursorY += movementY * 0.65;

    const dist = Math.hypot(this.cursorX, this.cursorY);
    if (dist > this.maxRadius) {
      const scale = this.maxRadius / dist;
      this.cursorX *= scale;
      this.cursorY *= scale;
    }

    this._updateCursorVisual();

    if (dist > this.deadzoneRadius) {
      // atan2(y, x) where Top (0, -1) is -90 deg -> maps to Wedge 0, clockwise 0..7
      const rawDeg = (Math.atan2(this.cursorY, this.cursorX) * 180) / Math.PI;
      const degFromTop = (rawDeg + 90 + 360) % 360;
      const newIndex = Math.floor(((degFromTop + 22.5) % 360) / 45);

      if (newIndex !== this.hoveredIndex) {
        this.hoveredIndex = newIndex;
        const slot = WHEEL_SLOTS[newIndex];
        if (this.sound && typeof this.sound.playWheelHoverTick === 'function') {
          this.sound.playWheelHoverTick(!!(slot && slot.isRare));
        }
        this.refreshVisuals();
      }
    }
  }

  _updateCursorVisual() {
    if (!this.cursorDotEl) return;
    this.cursorDotEl.style.transform = `translate(calc(-50% + ${this.cursorX.toFixed(1)}px), calc(-50% + ${this.cursorY.toFixed(1)}px))`;
  }

  refreshVisuals() {
    const equippedIdx = this._getEquippedIndex();

    for (let i = 0; i < WHEEL_SLOTS.length; i++) {
      const slot = WHEEL_SLOTS[i];
      const unlocked = this._isSlotUnlocked(slot);
      const isHovered = i === this.hoveredIndex;
      const isEquipped = i === equippedIdx;

      const wedgeEl = this.wedgeEls[i];
      const arcEl = this.arcEls[i];
      const iconEl = this.iconGroupEls[i];

      if (iconEl) {
        if (!unlocked) {
          iconEl.style.opacity = '0';
        } else {
          iconEl.style.opacity = isHovered ? '1' : (isEquipped ? '0.95' : '0.84');
          const scale = isHovered ? 1.08 : 1.0;
          const pos = polarToCartesian(250, 250, 164, slot.angleDeg);
          iconEl.setAttribute('transform', `translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) scale(${scale})`);
        }
      }

      if (wedgeEl) {
        if (!unlocked) {
          wedgeEl.setAttribute('fill', isHovered ? 'rgba(22, 30, 42, 0.72)' : 'rgba(15, 20, 28, 0.58)');
        } else if (isHovered) {
          wedgeEl.setAttribute('fill', 'rgba(56, 189, 248, 0.24)');
        } else if (isEquipped) {
          wedgeEl.setAttribute('fill', 'rgba(56, 189, 248, 0.13)');
        } else {
          wedgeEl.setAttribute('fill', 'rgba(20, 28, 40, 0.68)');
        }
      }

      if (arcEl) {
        if (isHovered && unlocked) {
          arcEl.setAttribute('fill', '#38bdf8');
          arcEl.setAttribute('filter', 'url(#ww-cyan-glow)');
        } else if (isHovered && !unlocked) {
          arcEl.setAttribute('fill', 'rgba(148, 163, 184, 0.38)');
          arcEl.removeAttribute('filter');
        } else if (isEquipped && unlocked) {
          arcEl.setAttribute('fill', 'rgba(56, 189, 248, 0.55)');
          arcEl.removeAttribute('filter');
        } else {
          arcEl.setAttribute('fill', 'transparent');
          arcEl.removeAttribute('filter');
        }
      }
    }

    // Update Center Circle Readout (Clean Weapon Name + Ammo Counter Only)
    const hoveredSlot = WHEEL_SLOTS[this.hoveredIndex];
    if (!hoveredSlot) return;
    const isUnlocked = this._isSlotUnlocked(hoveredSlot);

    if (!isUnlocked) {
      if (this.rareBadgeEl) this.rareBadgeEl.style.display = 'none';
      if (this.centerNameEl) {
        this.centerNameEl.textContent = 'SLOT BLOQUEADO';
        this.centerNameEl.classList.remove('is-rare');
        this.centerNameEl.classList.add('is-locked');
      }
      if (this.centerAmmoEl) {
        this.centerAmmoEl.style.display = 'none';
        this.centerAmmoEl.textContent = '';
      }
      return;
    }

    if (this.rareBadgeEl) {
      this.rareBadgeEl.style.display = hoveredSlot.isRare ? 'inline-flex' : 'none';
    }

    if (this.centerNameEl) {
      this.centerNameEl.textContent = hoveredSlot.name;
      this.centerNameEl.classList.remove('is-rare', 'is-locked');
    }

    if (hoveredSlot.id === 'unarmed') {
      if (this.centerAmmoEl) {
        this.centerAmmoEl.style.display = 'none';
        this.centerAmmoEl.textContent = '';
      }
    } else {
      const wData = this.weaponSystem && this.weaponSystem.weapons
        ? this.weaponSystem.weapons[hoveredSlot.id]
        : null;
      const curAmmo = wData ? wData.currentAmmo : 0;
      const isInfinite = !!(wData && wData.infiniteReserve) || hoveredSlot.id === 'hk_usp';
      const resDisplay = isInfinite ? '∞' : (wData ? (wData.reserveAmmo ?? 0) : 0);
      if (this.centerAmmoEl) {
        this.centerAmmoEl.style.display = 'block';
        this.centerAmmoEl.textContent = `${curAmmo} / ${resDisplay}`;
      }
    }
  }
}
