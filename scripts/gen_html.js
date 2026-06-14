const fs = require('fs');
const path = require('path');

const ART_DIR = path.join(__dirname, '..', 'articles');

function readField(headerBlock, label) {
  const re = new RegExp(label + '\\s*[：:]\\s*(.+)');
  for (const line of headerBlock) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseFile(file) {
  const raw = fs.readFileSync(path.join(ART_DIR, file), 'utf8');
  const lines = raw.split(/\r?\n/);

  // header block: lines between first '====' and second '====='
  const eqIdx = [];
  lines.forEach((l, i) => { if (/^=+$/.test(l.trim())) eqIdx.push(i); });
  const header = lines.slice(eqIdx[0] + 1, eqIdx[1]);

  const data = {};
  data.id = readField(header, '記事ID');
  data.company = readField(header, '企業名');
  data.ticker = readField(header, 'ティッカー');
  data.lord = readField(header, '城主');
  data.castle = readField(header, '城');
  data.irUrl = readField(header, 'IR URL');
  data.reportUrl = readField(header, '決算書') || readField(header, '参考');

  // 決算概要 bullets: from "■ 最新決算概要" / "■ 最新業績概要" until "■ FIREスコア"
  const overviewLines = [];
  let inOverview = false;
  for (const l of lines) {
    if (/^■\s*最新(決算|業績)概要/.test(l.trim())) { inOverview = true; continue; }
    if (/^■\s*FIREスコア/.test(l.trim())) break;
    if (inOverview && l.trim().startsWith('・')) overviewLines.push(l.trim().replace(/^・/, ''));
  }
  data.overview = overviewLines.map(l => {
    const m = l.match(/^(.+?)\s*[：:]\s*(.+)$/);
    if (m) return { k: m[1].trim(), v: m[2].trim() };
    return { k: '', v: l };
  });

  // FIRE score
  let fireTotal = '', fireRank = '';
  const breakdown = [];
  let inFire = false;
  for (const l of lines) {
    const t = l.trim();
    if (/^■\s*FIREスコア/.test(t)) { inFire = true; continue; }
    if (inFire) {
      const m1 = t.match(/^総合\s*[：:]\s*(\d+)点\s*ランク\s*[：:]\s*(.+)$/);
      if (m1) { fireTotal = m1[1]; fireRank = m1[2].trim(); continue; }
      const m2 = t.match(/^(BS強度|CF安定性|PL収益性|成長性)\s*[：:]\s*(\d+)点\s*(.*)$/);
      if (m2) { breakdown.push({ k: m2[1], score: m2[2], note: m2[3].replace(/^[（(]|[）)]$/g, '') }); continue; }
      if (/^=+$/.test(t)) break;
    }
  }
  data.fireTotal = fireTotal;
  data.fireRank = fireRank;
  data.breakdown = breakdown;

  // 4コマ 台詞 lines (4 lines)
  const koma = [];
  for (const l of lines) {
    const m = l.trim().match(/^\[台詞\]\s*(.+)$/);
    if (m) koma.push(m[1]);
  }
  data.koma = koma;

  // 対話パート
  const dialogStart = lines.findIndex(l => l.includes('【城主と社長の対話形式パート】'));
  const expertStart = lines.findIndex(l => l.includes('【専門家による解説パート】'));
  let cast = '';
  const dialog = [];
  if (dialogStart !== -1 && expertStart !== -1) {
    let section = lines.slice(dialogStart, expertStart);
    const castLine = section.find(l => l.trim().startsWith('登場人物'));
    if (castLine) cast = castLine.replace(/^登場人物\s*[：:]\s*/, '').trim();
    let current = null;
    for (const l of section) {
      const t = l.trim();
      if (!t || /^=+$/.test(t) || /^─+$/.test(t) || t.startsWith('登場人物')) continue;
      const m = t.match(/^(\S+?)\s*「(.*)$/);
      if (m) {
        if (current) dialog.push(current);
        current = { speaker: m[1], text: m[2].replace(/」$/, '') };
      } else if (current) {
        current.text += t.replace(/」$/, '');
      }
    }
    if (current) dialog.push(current);
  }
  data.cast = cast;
  data.dialog = dialog;

  // 専門家による解説パート: PL/BS/CF/成長性/総評
  const expertSections = {};
  if (expertStart !== -1) {
    const section = lines.slice(expertStart);
    const markers = [
      ['pl', '▼ PL（兵糧）分析'],
      ['bs', '▼ BS（石垣）分析'],
      ['cf', '▼ CF（堀の水）分析'],
      ['growth', '▼ 成長性・リスク分析'],
      ['summary', '▼ FIREスコア総括'],
      ['review', '▼ 城代の総評'],
      ['cta', '▼ CTA'],
    ];
    for (let i = 0; i < markers.length; i++) {
      const [key, label] = markers[i];
      const startIdx = section.findIndex(l => l.includes(label));
      if (startIdx === -1) continue;
      let endIdx = section.length;
      for (let j = i + 1; j < markers.length; j++) {
        const idx = section.findIndex(l => l.includes(markers[j][1]));
        if (idx !== -1) { endIdx = idx; break; }
      }
      const body = section.slice(startIdx + 1, endIdx)
        .filter(l => !/^─+$/.test(l.trim()) && !/^=+$/.test(l.trim()));
      expertSections[key] = body;
    }
  }

  // PL/BS/CF/growth as paragraphs (keep blank-line separated paragraphs)
  function toParagraphs(arr) {
    const text = (arr || []).map(l => l.trim()).join('\n');
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  data.pl = toParagraphs(expertSections.pl).filter(p => !p.startsWith('FIREスコア'));
  data.bs = toParagraphs(expertSections.bs).filter(p => !p.startsWith('FIREスコア'));
  data.cf = toParagraphs(expertSections.cf).filter(p => !p.startsWith('FIREスコア'));
  data.growth = toParagraphs(expertSections.growth).filter(p => !p.startsWith('FIREスコア'));
  data.review = toParagraphs(expertSections.review);

  // CTA links
  const ctaLines = expertSections.cta || [];
  const ctaLinks = [];
  for (let i = 0; i < ctaLines.length; i++) {
    const m = ctaLines[i].trim().match(/^▶\s*(.+?)\s*→$/);
    if (m && ctaLines[i + 1]) {
      ctaLinks.push({ label: m[1].trim(), url: ctaLines[i + 1].trim() });
    }
  }
  data.ctaLinks = ctaLinks;

  // 免責事項
  const dIdx = lines.findIndex(l => l.includes('免責事項'));
  let disclaimer = '';
  if (dIdx !== -1) {
    const body = [];
    for (let i = dIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^=+$/.test(t)) break;
      if (t) body.push(t);
    }
    disclaimer = body.join('');
  }
  data.disclaimer = disclaimer;

  data.file = file;
  data.htmlFile = file.replace(/\.txt$/, '.html');
  return data;
}

function renderGrowth(paragraphs) {
  return paragraphs.map(p => {
    if (p.startsWith('【')) {
      const lines = p.split('\n');
      const title = lines[0];
      const items = lines.slice(1).filter(l => l.trim().startsWith('・'));
      return `<p class="sub-heading" style="margin-top:1.2rem;">${esc(title)}</p><ul>` +
        items.map(i => `<li>${esc(i.trim().replace(/^・/, ''))}</li>`).join('') + '</ul>';
    }
    return `<p>${esc(p.replace(/\n/g, ''))}</p>`;
  }).join('\n');
}

function render(data, prev, next) {
  const title = `${data.company}×${data.lord}「${data.castle}」FIREスコア${data.fireTotal}点・${data.fireRank}｜風雲！決算城`;
  const desc = `${data.company}の決算を${data.lord}が斬る。FIREスコア${data.fireTotal}点・${data.fireRank}。${data.castle}認定の根拠を城主と社長の対話形式で解説。`;

  const overviewRows = data.overview.map(o => `    <tr><td>${esc(o.k)}</td><td>${esc(o.v)}</td></tr>`).join('\n');

  const breakdownRows = data.breakdown.map(b => `    <tr><td>${esc(b.k)}</td><td>${esc(b.score)}点${b.note ? '（' + esc(b.note) + '）' : ''}</td></tr>`).join('\n');

  const komaList = data.koma.map((k, i) => `        <li>${esc(k)}</li>`).join('\n');

  const castParts = data.cast.split('×').map(s => s.trim());

  const dialogHtml = data.dialog.map(d =>
    `    <div class="dialog-line">\n      <span class="speaker">${esc(d.speaker)}</span>\n      <span class="line">「${esc(d.text)}」</span>\n    </div>`
  ).join('\n');

  const plHtml = data.pl.map(p => `  <p>${esc(p.replace(/\n/g, ''))}</p>`).join('\n');
  const bsHtml = data.bs.map(p => `  <p>${esc(p.replace(/\n/g, ''))}</p>`).join('\n');
  const cfHtml = data.cf.map(p => `  <p>${esc(p.replace(/\n/g, ''))}</p>`).join('\n');
  const growthHtml = renderGrowth(data.growth);
  const reviewHtml = data.review.map(p => `  <p>${esc(p.replace(/\n/g, ''))}</p>`).join('\n');

  const ctaButtons = data.ctaLinks.map((c, i) => {
    const cls = i === 0 ? 'btn btn-outline' : 'btn btn-primary';
    const rel = c.url.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
    return `    <a href="${esc(c.url)}"${rel} class="${cls}">▶ ${esc(c.label)}</a>`;
  }).join('\n');

  const navPrev = prev ? `    <a href="${prev.htmlFile}" class="nav-prev">\n      <span class="nav-label">◀ 前の記事</span>\n      <span class="nav-castle">${esc(prev.castle)}</span>\n      <span class="nav-company">${esc(prev.company)} × ${esc(prev.lord)}</span>\n    </a>` : '    <span class="nav-empty"></span>';
  const navNext = next ? `    <a href="${next.htmlFile}" class="nav-next">\n      <span class="nav-label">次の記事 ▶</span>\n      <span class="nav-castle">${esc(next.castle)}</span>\n      <span class="nav-company">${esc(next.company)} × ${esc(next.lord)}</span>\n    </a>` : '    <span class="nav-empty"></span>';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-VSZZMHJD2M"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-VSZZMHJD2M');
  </script>
  <link rel="stylesheet" href="../css/style.css">
  <style>
    .castle-banner{background:linear-gradient(135deg,#1a1200,#0d0d0d);border:1px solid var(--gold);border-radius:6px;padding:1.6em;text-align:center;margin:1.5em 0 2em;}
    .castle-banner .cb-castle{font-size:1.4em;color:var(--gold);font-weight:700;letter-spacing:.06em;}
    .castle-banner .cb-sub{font-size:.85em;color:#aaa;margin-top:.4em;}
    .article-nav{display:flex;justify-content:space-between;gap:1em;margin:2.5em 0 0;padding-top:1.5em;border-top:2px solid rgba(200,164,0,0.4);}
    .article-nav a{flex:1;padding:1.2em 1.4em;border:1px solid rgba(201,168,76,0.3);border-radius:4px;text-decoration:none;display:block;}
    .nav-prev{text-align:left;}.nav-next{text-align:right;}
    .nav-label{display:block;font-size:.72em;color:rgba(201,168,76,0.9);letter-spacing:.05em;margin-bottom:.4em;}
    .nav-castle{display:block;font-size:.95em;color:#f0ebe0;font-weight:600;line-height:1.4;}
    .nav-company{display:block;font-size:.8em;color:rgba(240,235,224,0.6);margin-top:.2em;}
    .nav-empty{flex:1;}
    .back-to-list{text-align:center;margin:1.5em 0 2em;}
    .back-to-list a{display:inline-block;padding:.7em 2.5em;border:1px solid #c8a400;border-radius:4px;color:#c8a96e;text-decoration:none;font-size:.9em;letter-spacing:.05em;}
    .back-to-list a:hover{background:#fdf7ee;}
    .data-note{font-size:.78em;color:#999;margin:.2em 0 .8em;text-align:right;}
    .data-note a{color:#c8a96e;}
    footer{text-align:center;padding:1.5em 0;font-size:.82em;color:#999;border-top:1px solid #eee;margin-top:2em;}
    ul{margin:0 0 1rem 1.4rem;line-height:1.9;}
  </style>
</head>
<body class="article-body">

<header>
  <div class="site-logo">
    <div class="site-title"><a href="../index.html">風雲！決算城</a></div>
    <div class="site-tagline">敵は経済にあり！</div>
  </div>
</header>

<div class="article-wrap">

  <div class="article-eyebrow">
    <span class="castle">${esc(data.castle)}</span>
    <span class="sep">|</span>
    <span class="company">${esc(data.company)}</span>
  </div>
  <h1 class="article-headline">${esc(data.castle)}　${esc(data.lord)}、${esc(data.company)}の決算を斬る</h1>
  <p class="article-deck">FIREスコア${esc(data.fireTotal)}点｜ランク：${esc(data.fireRank)}｜城主：${esc(data.lord)}</p>

  <div class="castle-banner">
    <div class="cb-castle">${esc(data.castle)}</div>
    <div class="cb-sub">城主：${esc(data.lord)}　|　FIREスコア ${esc(data.fireTotal)}点（${esc(data.fireRank)}）</div>
  </div>

  <h2 class="section-heading">最新決算概要</h2>
  <table class="data-table">
${overviewRows}
  </table>

  <h2 class="section-heading">FIREスコア（Final Insight Racing Evaluation）</h2>
  <table class="data-table">
    <tr><th>総合スコア</th><td>${esc(data.fireTotal)}点　ランク：${esc(data.fireRank)}</td></tr>
${breakdownRows}
  </table>

  <h2 class="section-heading">あらすじ4コマ</h2>
  <ol>
${komaList}
  </ol>

  <h2 class="section-heading">${esc(castParts[0] || data.lord)} × ${esc(castParts[1] || '')}の対話</h2>
  <p class="article-deck">登場人物：${esc(data.cast)}</p>
  <div class="dialog">
${dialogHtml}
  </div>

  <h2 class="section-heading">城代・財務アナリストの解説</h2>

  <p class="sub-heading">PL（兵糧）分析</p>
${plHtml}

  <p class="sub-heading">BS（石垣）分析</p>
${bsHtml}

  <p class="sub-heading">CF（堀の水）分析</p>
${cfHtml}

  <p class="sub-heading">成長性・リスク分析</p>
${growthHtml}

  <p class="sub-heading">城代の総評</p>
${reviewHtml}

  <div class="cta-block">
    <p>この城を自分で攻略する</p>
${ctaButtons}
  </div>

  <div class="disclaimer">
    ⚠️ ${esc(data.disclaimer)}
  </div>

  <nav class="article-nav">
${navPrev}
${navNext}
  </nav>

  <div class="back-to-list">
    <a href="../index.html">← 記事一覧に戻る</a>
  </div>

</div>

<script src="../js/main.js"></script>
<footer>
  &copy; 2026 風雲！決算城
</footer>

</body>
</html>
`;
}

const targetFiles = process.argv.slice(2);
const files = targetFiles.length ? targetFiles : fs.readdirSync(ART_DIR).filter(f => /^\d{3}_.*\.txt$/.test(f)).sort();

const allData = files.map(parseFile);

for (let i = 0; i < allData.length; i++) {
  const data = allData[i];
  const prev = i > 0 ? allData[i - 1] : null;
  const next = i < allData.length - 1 ? allData[i + 1] : null;
  const html = render(data, prev, next);
  fs.writeFileSync(path.join(ART_DIR, data.htmlFile), html, 'utf8');
  console.log('wrote', data.htmlFile, '| score:', data.fireTotal, '| dialog lines:', data.dialog.length, '| koma:', data.koma.length, '| cta:', data.ctaLinks.length);
}
