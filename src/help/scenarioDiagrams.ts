function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stepCardFrame(x: number, w: number, stepNum: number, label: string, accent: string, inner: string): string {
  const cx = x + w / 2;
  return `
    <g>
      <rect x="${x}" y="12" width="${w}" height="176" rx="10" fill="#12161D" stroke="#252B36" stroke-width="1"/>
      <rect x="${x + 1}" y="148" width="${w - 2}" height="39" rx="0" fill="#161B23"/>
      <path d="M${x} 148 H${x + w}" stroke="#232934" stroke-width="1"/>
      <rect x="${x + 10}" y="20" width="22" height="16" rx="4" fill="#1C222D" stroke="${accent}" stroke-opacity="0.45" stroke-width="1"/>
      <text x="${x + 21}" y="31.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="600" fill="${accent}">${stepNum}</text>
      ${inner}
      <text x="${cx}" y="171" text-anchor="middle" font-family="system-ui, -apple-system, 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans Arabic', sans-serif" font-size="11.5" font-weight="600" fill="#E6ECF4">${esc(label)}</text>
    </g>
  `;
}

function flowArrows(color = '#475469'): string {
  const xs = [208, 442, 676];
  return xs
    .map(
      (x) => `
      <g>
        <line x1="${x + 2}" y1="98" x2="${x + 24}" y2="98" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M${x + 20} 92.5 L${x + 27} 98 L${x + 20} 103.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`
    )
    .join('');
}

function renderScenario01(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="34" y="44" width="146" height="86" rx="8" fill="#0D1015" stroke="#333C4B" stroke-dasharray="4 3" stroke-width="1.2"/>
    <rect x="89" y="57" width="36" height="28" rx="6" fill="#1C222C" stroke="#F59E0B" stroke-opacity="0.55"/>
    <polygon points="103,65 103,77 113,71" fill="#FBBF24"/>
    <text x="107" y="104" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10.5" font-weight="600" fill="#CBD5E1">MP4 / MOV / WebM</text>
    <text x="107" y="119" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#6E7C91">Local 100%</text>
  `;
  const c2 = `
    <rect x="262" y="42" width="158" height="58" rx="6" fill="#0B0E13" stroke="#2A313E"/>
    <polygon points="334,62 334,80 350,71" fill="#E2E8F0" opacity="0.85"/>
    <text x="272" y="56" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FBBF24">00:02:15.40</text>
    <rect x="262" y="109" width="158" height="8" rx="4" fill="#1D232E"/>
    <rect x="262" y="109" width="84" height="8" rx="4" fill="#F59E0B" opacity="0.35"/>
    <rect x="284" y="104" width="3.5" height="18" rx="1.5" fill="#FBBF24"/>
    <rect x="344" y="102" width="4" height="22" rx="1.5" fill="#F59E0B"/>
    <rect x="388" y="104" width="3.5" height="18" rx="1.5" fill="#FBBF24"/>
    <rect x="380" y="46" width="32" height="20" rx="4" fill="#F59E0B"/>
    <text x="396" y="59.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="#0D0F12">M</text>
    <text x="295" y="136" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#8C99AD">J · K · L   ← / →</text>
  `;
  const c3 = `
    <rect x="494" y="45" width="162" height="26" rx="5" fill="#0D1015" stroke="#2A3240"/>
    <text x="504" y="61.5" font-family="'JetBrains Mono', monospace" font-size="10.5" fill="#FBBF24">00:00</text>
    <text x="546" y="61.5" font-family="system-ui, sans-serif" font-size="10.5" fill="#E2E8F0">Intro</text>
    <rect x="494" y="78" width="162" height="26" rx="5" fill="#18202C" stroke="#38BDF8" stroke-width="1.2"/>
    <text x="504" y="94.5" font-family="'JetBrains Mono', monospace" font-size="10.5" fill="#FBBF24">02:15</text>
    <text x="546" y="94.5" font-family="system-ui, sans-serif" font-size="10.5" fill="#F8FAFC">Main Topic</text>
    <rect x="608" y="85" width="1.5" height="12" fill="#38BDF8"/>
    <rect x="494" y="111" width="162" height="24" rx="5" fill="#0D1015" stroke="#252C38"/>
    <text x="504" y="126.5" font-family="'JetBrains Mono', monospace" font-size="10.5" fill="#FBBF24">06:40</text>
    <text x="546" y="126.5" font-family="system-ui, sans-serif" font-size="10.5" fill="#94A0B2">Summary</text>
  `;
  const c4 = `
    <rect x="728" y="43" width="166" height="68" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="60" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">00:00 Intro</text>
    <text x="738" y="77" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">02:15 Main Topic</text>
    <text x="738" y="94" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">06:40 Summary</text>
    <rect x="728" y="118" width="84" height="22" rx="5" fill="#10B981"/>
    <text x="770" y="132.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#07130F">COPY</text>
    <rect x="818" y="118" width="76" height="22" rx="5" fill="#1B222D" stroke="#334052"/>
    <text x="856" y="132.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#CBD5E1">.txt</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#F59E0B', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#F59E0B', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#38BDF8', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario02(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="28" y="44" width="158" height="92" rx="6" fill="#0B0E13" stroke="#2A313E"/>
    <text x="40" y="62" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">A  Opening</text>
    <text x="40" y="80" font-family="'JetBrains Mono', monospace" font-size="10" fill="#94A0B2">B  Demo Part 1</text>
    <text x="40" y="98" font-family="'JetBrains Mono', monospace" font-size="10" fill="#94A0B2">C  Demo Part 2</text>
    <text x="40" y="116" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">D  Wrap-up</text>
    <text x="40" y="130" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#647082">(titles only)</text>
  `;
  const c2 = `
    <rect x="260" y="43" width="162" height="21" rx="4" fill="#171C24" stroke="#F59E0B" stroke-opacity="0.5"/>
    <text x="269" y="57" font-family="'JetBrains Mono', monospace" font-size="10" fill="#FBBF24">00:00  A</text>
    <rect x="260" y="68" width="162" height="21" rx="4" fill="#132230" stroke="#38BDF8" stroke-width="1.2"/>
    <text x="269" y="82" font-family="'JetBrains Mono', monospace" font-size="10" fill="#38BDF8">--:--  B  ◀</text>
    <rect x="260" y="93" width="162" height="21" rx="4" fill="#0D1015" stroke="#262D3A" stroke-dasharray="3 2"/>
    <text x="269" y="107" font-family="'JetBrains Mono', monospace" font-size="10" fill="#647082">--:--  C</text>
    <rect x="260" y="118" width="162" height="21" rx="4" fill="#171C24" stroke="#F59E0B" stroke-opacity="0.5"/>
    <text x="269" y="132" font-family="'JetBrains Mono', monospace" font-size="10" fill="#FBBF24">12:40  D</text>
  `;
  const c3 = `
    <text x="494" y="54" font-family="'JetBrains Mono', monospace" font-size="9" fill="#6E7C91">FULL  00:00 ── 60:00</text>
    <rect x="494" y="60" width="162" height="7" rx="3.5" fill="#1C222D"/>
    <rect x="494" y="60" width="44" height="7" rx="3.5" fill="#38BDF8" opacity="0.75"/>
    <path d="M494 69 L494 84 M538 69 L656 84" stroke="#38BDF8" stroke-opacity="0.45" stroke-dasharray="3 2"/>
    <rect x="494" y="84" width="162" height="32" rx="6" fill="#0F1C28" stroke="#38BDF8" stroke-width="1.2"/>
    <text x="502" y="96" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#7DD3FC">ZOOM  A 00:00 ━━━ D 12:40</text>
    <rect x="502" y="102" width="146" height="7" rx="3.5" fill="#1B2A38"/>
    <rect x="502" y="102" width="66" height="7" rx="3.5" fill="#38BDF8"/>
    <circle cx="568" cy="105.5" r="5" fill="#F8FAFC" stroke="#38BDF8" stroke-width="2"/>
    <rect x="524" y="122" width="102" height="18" rx="4" fill="#F59E0B"/>
    <text x="575" y="134" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="700" fill="#0D0F12">SET 04:18 → B</text>
  `;
  const c4 = `
    <rect x="728" y="43" width="166" height="94" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="61" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">00:00  A Opening</text>
    <text x="738" y="79" font-family="'JetBrains Mono', monospace" font-size="10" fill="#38BDF8">04:18  B Demo 1</text>
    <text x="738" y="97" font-family="'JetBrains Mono', monospace" font-size="10" fill="#38BDF8">08:50  C Demo 2</text>
    <text x="738" y="115" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">12:40  D Wrap-up</text>
    <text x="738" y="130" font-family="'JetBrains Mono', monospace" font-size="9" fill="#34D399">✓ Ready to export</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#94A0B2', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#F59E0B', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#38BDF8', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario03(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="26" y="48" width="162" height="32" rx="6" fill="#0B0E13" stroke="#F59E0B" stroke-opacity="0.6"/>
    <rect x="34" y="56" width="22" height="16" rx="4" fill="#EF4444"/>
    <polygon points="43,60 43,68 49,64" fill="#FFFFFF"/>
    <text x="63" y="67.5" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">youtu.be/dQw4…</text>
    <rect x="46" y="92" width="122" height="24" rx="5" fill="#1A202B" stroke="#2F3847"/>
    <text x="107" y="107.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">Read-only · No API Key</text>
  `;
  const c2 = `
    <rect x="260" y="44" width="162" height="90" rx="6" fill="#0B0E13" stroke="#2B3442"/>
    <text x="270" y="61" font-family="'JetBrains Mono', monospace" font-size="9" fill="#6E7C91">DESCRIPTION AUTO-PARSE</text>
    <line x1="270" y1="68" x2="412" y2="68" stroke="#222834"/>
    <text x="270" y="84" font-family="'JetBrains Mono', monospace" font-size="10" fill="#FBBF24">0:00</text>
    <text x="304" y="84" font-family="system-ui, sans-serif" font-size="10" fill="#E2E8F0">Intro</text>
    <text x="270" y="103" font-family="'JetBrains Mono', monospace" font-size="10" fill="#FBBF24">3:10</text>
    <text x="304" y="103" font-family="system-ui, sans-serif" font-size="10" fill="#E2E8F0">Review</text>
    <text x="270" y="122" font-family="'JetBrains Mono', monospace" font-size="10" fill="#FBBF24">8:45</text>
    <text x="304" y="122" font-family="system-ui, sans-serif" font-size="10" fill="#E2E8F0">Ending</text>
  `;
  const c3 = `
    <rect x="494" y="45" width="162" height="44" rx="6" fill="#0E131B" stroke="#38BDF8" stroke-opacity="0.6"/>
    <text x="504" y="63" font-family="'JetBrains Mono', monospace" font-size="10" fill="#6E7C91" text-decoration="line-through">03:10</text>
    <text x="546" y="63" font-family="'JetBrains Mono', monospace" font-size="10" fill="#38BDF8">→ 03:12</text>
    <text x="504" y="80" font-family="system-ui, sans-serif" font-size="10" fill="#F8FAFC">Hands-on Review</text>
    <rect x="494" y="99" width="46" height="22" rx="4" fill="#1C222D" stroke="#313A4A"/>
    <text x="517" y="113.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#CBD5E1">-1s</text>
    <rect x="546" y="99" width="46" height="22" rx="4" fill="#1C222D" stroke="#313A4A"/>
    <text x="569" y="113.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#CBD5E1">+1s</text>
    <rect x="598" y="99" width="58" height="22" rx="4" fill="#F59E0B"/>
    <text x="627" y="113.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="700" fill="#0D0F12">UPDATE</text>
  `;
  const c4 = `
    <rect x="728" y="44" width="166" height="66" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="62" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">00:00 Intro</text>
    <text x="738" y="80" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">03:12 Hands-on Review</text>
    <text x="738" y="98" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">08:45 Ending</text>
    <rect x="728" y="117" width="166" height="22" rx="5" fill="#10B981"/>
    <text x="811" y="131.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#07130F">COPY → YT STUDIO</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#F59E0B', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#F59E0B', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#38BDF8', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario04(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="26" y="46" width="162" height="44" rx="6" fill="#0B0E13" stroke="#2B3442"/>
    <text x="107" y="66" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="14" font-weight="700" fill="#F8FAFC">11:37:06</text>
    <text x="107" y="81" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#7D899B">40 GB · 1.2M frames</text>
    <rect x="26" y="100" width="162" height="10" rx="5" fill="#1D232E"/>
    <rect x="26" y="100" width="60" height="10" rx="5" fill="#F59E0B"/>
    <text x="107" y="128" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FBBF24">3s → Edit + BG Scan</text>
  `;
  const c2 = `
    <rect x="256" y="42" width="170" height="96" rx="6" fill="#0B0E13" stroke="#2C3544"/>
    <rect x="257" y="43" width="38" height="94" fill="#151A22"/>
    <line x1="295" y1="42" x2="295" y2="138" stroke="#2D3646"/>
    <rect x="261" y="52" width="30" height="22" rx="4" fill="#F59E0B"/>
    <text x="276" y="66" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="700" fill="#0D0F12">T→A</text>
    <rect x="261" y="79" width="30" height="22" rx="4" fill="#162836" stroke="#38BDF8"/>
    <text x="276" y="93" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#7DD3FC">10s↻</text>
    <rect x="261" y="106" width="30" height="20" rx="4" fill="#1C222D" stroke="#333C4B"/>
    <text x="276" y="119" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#CBD5E1">≡</text>
    <rect x="295" y="43" width="130" height="16" fill="#1A202B"/>
    <text x="303" y="54" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#94A0B2">#   A(Time)   B(Title)</text>
    <line x1="295" y1="59" x2="425" y2="59" stroke="#2A3240"/>
    <text x="302" y="74" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#CBD5E1">46  02:54:07  Boss 1</text>
    <rect x="296" y="80" width="128" height="18" fill="#132533" stroke="#38BDF8" stroke-width="0.9"/>
    <text x="302" y="92" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#F8FAFC">47  02:55:26  Quest 7</text>
    <text x="302" y="110" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#94A0B2">48  --:--:--  Next…</text>
    <text x="302" y="128" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#CBD5E1">49  02:56:19  Cutscene</text>
  `;
  const c3 = `
    <rect x="494" y="44" width="162" height="58" rx="6" fill="#0B0E13" stroke="#283546"/>
    <path d="M532 73 A19 19 0 1 1 551 92" fill="none" stroke="#38BDF8" stroke-width="2.2" stroke-linecap="round"/>
    <polygon points="551,86 551,97 542,92" fill="#38BDF8"/>
    <text x="551" y="77" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="#7DD3FC">10s</text>
    <text x="612" y="68" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">AUTO LOOP</text>
    <text x="612" y="84" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#7D899B">Row Sync</text>
    <rect x="514" y="111" width="122" height="24" rx="5" fill="#1A222E" stroke="#38BDF8" stroke-opacity="0.55"/>
    <text x="575" y="126.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="600" fill="#E2E8F0">Ctrl + Enter</text>
  `;
  const c4 = `
    <rect x="728" y="44" width="166" height="62" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="63" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">199 Chapters</text>
    <text x="738" y="80" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#CBD5E1">00:00:00  Start</text>
    <text x="738" y="96" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#CBD5E1">02:55:26  Quest 7</text>
    <rect x="728" y="114" width="166" height="24" rx="5" fill="#10B981"/>
    <text x="811" y="129.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#07130F">APPLY &amp; EXPORT</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#F59E0B', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#34D399', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#38BDF8', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario05(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="28" y="46" width="158" height="44" rx="6" fill="#0B0E13" stroke="#253445"/>
    <polyline points="36,78 52,75 62,56 72,77 96,74 112,53 122,78 148,74 162,60 176,77" fill="none" stroke="#38BDF8" stroke-width="1.8" stroke-linejoin="round"/>
    <text x="107" y="110" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#7DD3FC">Visual + Audio Cuts</text>
    <text x="107" y="126" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#6E7C91">Background Scan</text>
  `;
  const c2 = `
    <text x="260" y="54" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#FBBF24">USER MARKERS</text>
    <rect x="260" y="59" width="162" height="18" rx="4" fill="#161B23" stroke="#2A313E"/>
    <rect x="268" y="61" width="4" height="14" rx="1" fill="#F59E0B"/>
    <rect x="358" y="61" width="4" height="14" rx="1" fill="#F59E0B"/>
    <text x="260" y="96" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#38BDF8">SCENE REFERENCE (SEPARATE)</text>
    <rect x="260" y="101" width="162" height="18" rx="4" fill="#0F1C26" stroke="#23394A"/>
    <rect x="278" y="104" width="2.5" height="12" fill="#38BDF8"/>
    <rect x="302" y="104" width="2.5" height="12" fill="#38BDF8"/>
    <rect x="326" y="104" width="2.5" height="12" fill="#38BDF8"/>
    <rect x="358" y="104" width="2.5" height="12" fill="#38BDF8"/>
    <rect x="382" y="104" width="2.5" height="12" fill="#38BDF8"/>
    <rect x="404" y="104" width="2.5" height="12" fill="#38BDF8"/>
    <text x="341" y="135" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#7D899B">2 Isolated Axes</text>
  `;
  const c3 = `
    <rect x="494" y="98" width="162" height="18" rx="4" fill="#0F1C26" stroke="#23394A"/>
    <rect x="530" y="100" width="3" height="14" fill="#38BDF8"/>
    <rect x="572" y="100" width="4" height="14" fill="#38BDF8"/>
    <rect x="614" y="100" width="3" height="14" fill="#38BDF8"/>
    <path d="M574 96 L574 72" stroke="#FBBF24" stroke-width="2" stroke-dasharray="3 2"/>
    <polygon points="569,75 579,75 574,67" fill="#FBBF24"/>
    <rect x="494" y="45" width="162" height="20" rx="4" fill="#181E27" stroke="#F59E0B" stroke-opacity="0.6"/>
    <rect x="572" y="47" width="4" height="16" rx="1" fill="#F59E0B"/>
    <rect x="604" y="74" width="34" height="19" rx="4" fill="#F59E0B"/>
    <text x="621" y="87" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#0D0F12">[M]</text>
    <text x="575" y="133" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#CBD5E1">Promote Only Needed Cuts</text>
  `;
  const c4 = `
    <rect x="728" y="44" width="166" height="66" rx="6" fill="#0B0E13" stroke="#253430"/>
    <circle cx="742" cy="61" r="4" fill="#F59E0B"/>
    <text x="752" y="64" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">00:00 Chapter 1</text>
    <circle cx="742" cy="80" r="4" fill="#F59E0B"/>
    <text x="752" y="83" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">05:22 Chapter 2</text>
    <circle cx="742" cy="99" r="4" fill="#F59E0B"/>
    <text x="752" y="102" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">11:04 Chapter 3</text>
    <text x="811" y="130" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#34D399">✓ Zero Cyan Noise</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#38BDF8', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#38BDF8', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#F59E0B', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario06(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="28" y="44" width="158" height="88" rx="6" fill="#0B1310" stroke="#1E4A39"/>
    <rect x="29" y="45" width="156" height="18" fill="#132B22"/>
    <text x="40" y="57.5" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="600" fill="#34D399">2-Col Table (TSV / CSV)</text>
    <line x1="88" y1="63" x2="88" y2="132" stroke="#1E3C31"/>
    <line x1="28" y1="86" x2="186" y2="86" stroke="#1E3C31"/>
    <line x1="28" y1="109" x2="186" y2="109" stroke="#1E3C31"/>
    <text x="38" y="78" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">00:00</text>
    <text x="96" y="78" font-family="system-ui, sans-serif" font-size="9.5" fill="#E2E8F0">Opening</text>
    <text x="38" y="101" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">04:12</text>
    <text x="96" y="101" font-family="system-ui, sans-serif" font-size="9.5" fill="#E2E8F0">Q&amp;A</text>
    <text x="38" y="124" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">TSV / CSV</text>
  `;
  const c2 = `
    <rect x="272" y="48" width="138" height="32" rx="6" fill="#1A222E" stroke="#38BDF8"/>
    <text x="341" y="68" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11.5" font-weight="700" fill="#7DD3FC">Ctrl + V</text>
    <path d="M341 82 L341 102" stroke="#38BDF8" stroke-width="1.6"/>
    <polygon points="336,99 346,99 341,106" fill="#38BDF8"/>
    <rect x="260" y="108" width="162" height="28" rx="5" fill="#0B0E13" stroke="#2D3646"/>
    <text x="341" y="125.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#CBD5E1">Auto TSV / CSV / Spaces</text>
  `;
  const c3 = `
    <rect x="490" y="44" width="170" height="90" rx="6" fill="#0B0E13" stroke="#2D3646"/>
    <rect x="491" y="45" width="46" height="18" fill="#2A2315"/>
    <rect x="537" y="45" width="66" height="18" fill="#132533"/>
    <rect x="603" y="45" width="56" height="18" fill="#1B2029"/>
    <text x="514" y="57" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="600" fill="#FBBF24">A</text>
    <text x="570" y="57" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="600" fill="#7DD3FC">B</text>
    <text x="631" y="57" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#8C99AD">C Memo</text>
    <line x1="603" y1="45" x2="603" y2="134" stroke="#475469" stroke-dasharray="3 2"/>
    <text x="498" y="79" font-family="'JetBrains Mono', monospace" font-size="9" fill="#FBBF24">00:00</text>
    <text x="543" y="79" font-family="system-ui, sans-serif" font-size="9" fill="#E2E8F0">Opening</text>
    <text x="609" y="79" font-family="system-ui, sans-serif" font-size="8.5" fill="#6E7C91">check</text>
    <text x="498" y="100" font-family="'JetBrains Mono', monospace" font-size="9" fill="#FBBF24">04:12</text>
    <text x="543" y="100" font-family="system-ui, sans-serif" font-size="9" fill="#E2E8F0">Q&amp;A</text>
    <text x="609" y="100" font-family="system-ui, sans-serif" font-size="8.5" fill="#6E7C91">cut?</text>
    <text x="631" y="124" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="8" fill="#6E7C91">Scratchpad</text>
  `;
  const c4 = `
    <rect x="728" y="44" width="166" height="68" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="61" font-family="'JetBrains Mono', monospace" font-size="9" fill="#34D399">EXPORT A + B ONLY</text>
    <text x="738" y="80" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">00:00 Opening</text>
    <text x="738" y="98" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">04:12 Q&amp;A</text>
    <text x="811" y="130" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#7D899B">Col C+ excluded safely</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#34D399', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#38BDF8', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#F59E0B', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario07(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="26" y="44" width="162" height="22" rx="4" fill="#0D1015" stroke="#2A313E"/>
    <text x="35" y="58.5" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">00:00  A</text>
    <rect x="26" y="71" width="162" height="24" rx="4" fill="#2A1618" stroke="#F87171"/>
    <text x="35" y="86.5" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FCA5A5">01:30  C  (shifted!)</text>
    <rect x="26" y="100" width="162" height="22" rx="4" fill="#0D1015" stroke="#2A313E"/>
    <text x="35" y="114.5" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">03:00  D</text>
    <text x="107" y="136" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#F87171">Missing B</text>
  `;
  const c2 = `
    <rect x="260" y="45" width="70" height="24" rx="5" fill="#F59E0B"/>
    <text x="295" y="60.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#0D0F12">+ INSERT</text>
    <rect x="338" y="45" width="84" height="24" rx="5" fill="#162836" stroke="#38BDF8"/>
    <text x="380" y="60.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="600" fill="#7DD3FC">↓ SHIFT</text>
    <rect x="260" y="78" width="162" height="54" rx="6" fill="#0B0E13" stroke="#2B3442"/>
    <text x="270" y="95" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FBBF24">01:30  [new B]</text>
    <path d="M388 92 L388 122" stroke="#38BDF8" stroke-width="1.8"/>
    <polygon points="383,118 393,118 388,125" fill="#38BDF8"/>
    <text x="270" y="113" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#7DD3FC">03:00  C  (shifted ↓)</text>
    <text x="270" y="127" font-family="'JetBrains Mono', monospace" font-size="9" fill="#94A0B2">04:40  D</text>
  `;
  const c3 = `
    <rect x="492" y="45" width="26" height="86" rx="4" fill="#161C26" stroke="#2D3646"/>
    <text x="505" y="66" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">1</text>
    <rect x="494" y="74" width="22" height="20" rx="3" fill="#38BDF8"/>
    <text x="505" y="88" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="700" fill="#0D0F12">2</text>
    <text x="505" y="114" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">3</text>
    <rect x="526" y="48" width="130" height="82" rx="6" fill="#181E28" stroke="#38BDF8" stroke-opacity="0.7"/>
    <text x="536" y="67" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">↑ Insert Above</text>
    <line x1="534" y1="75" x2="648" y2="75" stroke="#262F3E"/>
    <text x="536" y="92" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">↓ Insert Below</text>
    <line x1="534" y1="100" x2="648" y2="100" stroke="#262F3E"/>
    <text x="536" y="117" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FCA5A5">× Delete / D&amp;D</text>
  `;
  const c4 = `
    <rect x="728" y="44" width="166" height="90" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="63" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">00:00  A  ✓</text>
    <text x="738" y="82" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">01:30  B  ✓</text>
    <text x="738" y="101" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">03:00  C  ✓</text>
    <text x="738" y="120" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">04:40  D  ✓</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#F87171', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#F59E0B', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#38BDF8', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario08(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="26" y="45" width="162" height="88" rx="6" fill="#0B0E13" stroke="#2B3442"/>
    <rect x="36" y="54" width="20" height="14" rx="3" fill="#EF4444"/>
    <polygon points="44,57.5 44,64.5 49,61" fill="#FFFFFF"/>
    <text x="63" y="64.5" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#CBD5E1">Original v1</text>
    <text x="36" y="86" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">00:00  Part 1</text>
    <text x="36" y="104" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">05:40  Part 2</text>
    <text x="36" y="122" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#94A0B2">12:15  Outro</text>
  `;
  const c2 = `
    <rect x="260" y="46" width="68" height="36" rx="5" fill="#181D26" stroke="#313A4A"/>
    <text x="294" y="68" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#7D899B">YT v1</text>
    <path d="M333 64 L350 64" stroke="#F59E0B" stroke-width="2"/>
    <polygon points="347,59 354,64 347,69" fill="#F59E0B"/>
    <rect x="356" y="46" width="66" height="36" rx="5" fill="#1C241E" stroke="#34D399"/>
    <text x="389" y="68" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="600" fill="#34D399">cut_v2</text>
    <rect x="260" y="94" width="162" height="36" rx="5" fill="#0B0E13" stroke="#2D3646"/>
    <text x="341" y="110" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#E2E8F0">Titles Preserved</text>
    <text x="341" y="124" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#7D899B">Part 1 · Part 2 · Outro</text>
  `;
  const c3 = `
    <rect x="494" y="45" width="162" height="88" rx="6" fill="#0B0E13" stroke="#2D3646"/>
    <rect x="502" y="54" width="52" height="22" rx="4" fill="#F59E0B"/>
    <text x="528" y="68.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="700" fill="#0D0F12">T → A</text>
    <text x="562" y="68.5" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FBBF24">00:00</text>
    <text x="606" y="68.5" font-family="system-ui, sans-serif" font-size="9.5" fill="#E2E8F0">Part 1</text>
    <text x="504" y="96" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#6E7C91">05:40 →</text>
    <text x="556" y="96" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#38BDF8">04:15</text>
    <text x="600" y="96" font-family="system-ui, sans-serif" font-size="9.5" fill="#E2E8F0">Part 2</text>
    <text x="504" y="118" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#6E7C91">12:15 →</text>
    <text x="556" y="118" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#38BDF8">09:30</text>
    <text x="600" y="118" font-family="system-ui, sans-serif" font-size="9.5" fill="#E2E8F0">Outro</text>
  `;
  const c4 = `
    <rect x="728" y="44" width="166" height="90" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="62" font-family="'JetBrains Mono', monospace" font-size="9" fill="#34D399">NEW TIMESTAMPS (v2)</text>
    <text x="738" y="82" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">00:00  Part 1</text>
    <text x="738" y="101" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">04:15  Part 2</text>
    <text x="738" y="120" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">09:30  Outro</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#F59E0B', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#38BDF8', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#F59E0B', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario09(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="26" y="54" width="162" height="44" rx="7" fill="#1A202B" stroke="#F59E0B" stroke-width="1.3"/>
    <path d="M52 70 L55 76 L61 78 L55 80 L52 86 L49 80 L43 78 L49 76 Z" fill="#FBBF24"/>
    <text x="116" y="80" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10.5" font-weight="600" fill="#F8FAFC">SAMPLE 15s</text>
    <text x="107" y="118" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#7D899B">No file needed</text>
  `;
  const c2 = `
    <rect x="260" y="48" width="30" height="46" rx="4" fill="#1E293B" stroke="#38BDF8"/>
    <rect x="293" y="48" width="30" height="46" rx="4" fill="#2A2116" stroke="#F59E0B"/>
    <rect x="326" y="48" width="30" height="46" rx="4" fill="#142923" stroke="#34D399"/>
    <rect x="359" y="48" width="30" height="46" rx="4" fill="#261D2F" stroke="#A78BFA"/>
    <rect x="392" y="48" width="30" height="46" rx="4" fill="#2D1B1E" stroke="#FB7185"/>
    <text x="275" y="75" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#7DD3FC">01</text>
    <text x="308" y="75" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FBBF24">02</text>
    <text x="341" y="75" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#34D399">03</text>
    <text x="374" y="75" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#C4B5FD">04</text>
    <text x="407" y="75" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FDA4AF">05</text>
    <text x="341" y="116" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">15s · 5 Canvas Scenes</text>
    <text x="341" y="131" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="#7D899B">30 fps WebM in Browser</text>
  `;
  const c3 = `
    <rect x="494" y="46" width="76" height="36" rx="5" fill="#181D26" stroke="#F59E0B" stroke-opacity="0.6"/>
    <text x="532" y="68" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#FBBF24">[M] Mark</text>
    <rect x="578" y="46" width="78" height="36" rx="5" fill="#14232E" stroke="#38BDF8" stroke-opacity="0.6"/>
    <text x="617" y="68" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#7DD3FC">Zoom Bar</text>
    <rect x="494" y="92" width="162" height="36" rx="5" fill="#132520" stroke="#34D399" stroke-opacity="0.6"/>
    <text x="575" y="114" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">Spreadsheet + 10s Loop</text>
  `;
  const c4 = `
    <rect x="728" y="45" width="166" height="88" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="64" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">00:00 Scene 01</text>
    <text x="738" y="83" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">00:03 Scene 02</text>
    <text x="738" y="102" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">00:06 Scene 03</text>
    <text x="738" y="121" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#7DD3FC">✓ Ready for real video</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#F59E0B', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#38BDF8', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#34D399', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

function renderScenario10(steps: readonly [string, string, string, string]): string {
  const c1 = `
    <rect x="26" y="44" width="162" height="38" rx="5" fill="#161C26" stroke="#313B4C"/>
    <text x="107" y="59" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#FBBF24">0:00 | 00:00 | 00:00:00</text>
    <text x="107" y="74" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="600" fill="#7DD3FC">or [Titles Only]</text>
    <rect x="26" y="90" width="162" height="44" rx="5" fill="#0B0E13" stroke="#253445"/>
    <text x="36" y="106" font-family="system-ui, sans-serif" font-size="9.5" fill="#E2E8F0">オープニング</text>
    <text x="36" y="121" font-family="system-ui, sans-serif" font-size="9.5" fill="#E2E8F0">本編スタート / まとめ</text>
  `;
  const c2 = `
    <rect x="260" y="45" width="162" height="88" rx="6" fill="#0B0E13" stroke="#2C3646"/>
    <text x="341" y="63" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="700" fill="#7DD3FC">TRANSLATE TITLES</text>
    <text x="274" y="83" font-family="system-ui, sans-serif" font-size="9.5" fill="#94A0B2">オープニング  →</text>
    <text x="360" y="83" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#34D399">Intro</text>
    <text x="274" y="101" font-family="system-ui, sans-serif" font-size="9.5" fill="#94A0B2">本編スタート  →</text>
    <text x="360" y="101" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#34D399">Main</text>
    <text x="274" y="119" font-family="system-ui, sans-serif" font-size="9.5" fill="#94A0B2">まとめ        →</text>
    <text x="360" y="119" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#34D399">Outro</text>
  `;
  const c3 = `
    <rect x="494" y="45" width="162" height="50" rx="6" fill="#0B0E13" stroke="#38BDF8" stroke-opacity="0.6"/>
    <text x="504" y="62" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FBBF24">00:00</text>
    <text x="544" y="62" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#34D399">Intro  (kept)</text>
    <text x="504" y="80" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#FBBF24">02:15</text>
    <text x="544" y="80" font-family="'JetBrains Mono', monospace" font-size="9.5" fill="#34D399">Main   (kept)</text>
    <rect x="494" y="103" width="162" height="30" rx="5" fill="#0E1C17" stroke="#255442"/>
    <text x="575" y="121.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" fill="#34D399">✓ 0:00 · ≥3 · ≥10s · 11 Langs</text>
  `;
  const c4 = `
    <rect x="728" y="44" width="166" height="62" rx="6" fill="#0B0E13" stroke="#253430"/>
    <text x="738" y="62" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">00:00 Intro</text>
    <text x="738" y="80" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">02:15 Main</text>
    <text x="738" y="98" font-family="'JetBrains Mono', monospace" font-size="10" fill="#E2E8F0">05:30 Outro</text>
    <rect x="728" y="114" width="84" height="22" rx="5" fill="#10B981"/>
    <text x="770" y="128.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#07130F">COPY</text>
    <rect x="818" y="114" width="76" height="22" rx="5" fill="#1B222D" stroke="#334052"/>
    <text x="856" y="128.5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#CBD5E1">.txt</text>
  `;
  return (
    flowArrows() +
    stepCardFrame(10, 194, 1, steps[0], '#F59E0B', c1) +
    stepCardFrame(244, 194, 2, steps[1], '#38BDF8', c2) +
    stepCardFrame(478, 194, 3, steps[2], '#34D399', c3) +
    stepCardFrame(712, 198, 4, steps[3], '#34D399', c4)
  );
}

const RENDERERS: Readonly<Record<string, (steps: readonly [string, string, string, string]) => string>> = {
  '01': renderScenario01,
  '02': renderScenario02,
  '03': renderScenario03,
  '04': renderScenario04,
  '05': renderScenario05,
  '06': renderScenario06,
  '07': renderScenario07,
  '08': renderScenario08,
  '09': renderScenario09,
  '10': renderScenario10,
};

export function renderScenarioDiagramSvg(
  scenarioId: string,
  steps: readonly [string, string, string, string],
  ariaLabel: string
): string {
  const renderer = RENDERERS[scenarioId] ?? renderScenario01;
  return `<svg class="diagram-svg" viewBox="0 0 920 200" width="920" height="200" role="img" aria-label="${esc(ariaLabel)}" xmlns="http://www.w3.org/2000/svg">${renderer(steps)}</svg>`;
}
