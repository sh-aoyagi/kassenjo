(() => {
  // ── スクランブル用文字プール ──
  const POOL = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ── 1. テキストスクランブル ──
  function scramble(el) {
    const target = el.textContent.trim();
    if (!target) return;
    el.style.opacity = '1';
    let frame = 0;
    const revealPerFrame = 1.2;
    const totalFrames = Math.ceil(target.length / revealPerFrame) + 8;

    (function tick() {
      const done = Math.floor(frame * revealPerFrame);
      el.textContent = [...target].map((ch, i) => {
        if (/[\s　。、！？・「」【】（）]/.test(ch)) return ch;
        if (i < done) return ch;
        return POOL[Math.floor(Math.random() * POOL.length)];
      }).join('');
      frame++;
      if (frame <= totalFrames) requestAnimationFrame(tick);
      else el.textContent = target;
    })();
  }

  // ── 2. ワイプバンド生成・実行 ──
  function runWipe(container, color, onMid) {
    const band = document.createElement('div');
    band.style.cssText = `
      position:absolute; inset:0; z-index:10;
      background:${color};
      transform:translateX(-101%);
      transition:transform 0.38s cubic-bezier(0.7,0,0.3,1);
      pointer-events:none;
    `;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.appendChild(band);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // フェーズ1: 帯が入ってくる
        band.style.transform = 'translateX(0)';
        setTimeout(() => {
          if (onMid) onMid();
          // フェーズ2: 帯が出ていく
          band.style.transform = 'translateX(101%)';
          setTimeout(() => band.remove(), 420);
        }, 380);
      });
    });
  }

  // ── 3. テキスト要素ワイプ → スクランブル ──
  function animateText(el, color = 'var(--gold)') {
    el.style.opacity = '0';
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:block; position:relative; overflow:hidden;';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);

    runWipe(wrap, color, () => {
      el.style.opacity = '1';
      scramble(el);
    });
  }

  // ── 4. 画像ワイプ ──
  function animateImage(el) {
    el.style.opacity = '0';
    runWipe(el, 'var(--crimson)', () => {
      el.style.opacity = '1';
      el.style.transition = 'opacity 0.2s';
    });
  }

  // ── 5. フェードアップ（段階的） ──
  function fadeUp(el, delay = 0) {
    el.style.cssText += `opacity:0; transform:translateY(14px); transition:opacity 0.55s ${delay}ms ease, transform 0.55s ${delay}ms ease;`;
    requestAnimationFrame(() => {
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 30);
    });
  }

  // ── IntersectionObserver ──
  const seen = new WeakSet();
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || seen.has(entry.target)) return;
      seen.add(entry.target);
      const el = entry.target;
      const t = el.dataset.anim;

      if (t === 'scramble')   animateText(el, 'var(--gold)');
      if (t === 'scramble-r') animateText(el, 'var(--crimson)');
      if (t === 'wipe-img')   animateImage(el);
      if (t === 'fade')       fadeUp(el);
      if (t === 'stagger') {
        [...el.children].forEach((child, i) => fadeUp(child, i * 80));
      }
    });
  }, { threshold: 0.15 });

  // ── 自動適用（HTML側にdata-anim不要） ──
  function init() {
    const map = [
      ['h1.article-headline',  'scramble'],
      ['h2.section-heading',   'scramble'],
      ['.sub-heading',         'scramble-r'],
      ['.article-hero-img',    'wipe-img'],
      ['.koma .koma-img',      'wipe-img'],
      ['.cta-block',           'fade'],
      ['.data-table',          'fade'],
      ['.fire-pill',           'fade'],
      ['.dialog',              'stagger'],
      ['.yonkoma-grid',        'stagger'],
    ];

    map.forEach(([sel, anim]) => {
      document.querySelectorAll(sel).forEach(el => {
        if (!seen.has(el)) {
          el.dataset.anim = anim;
          io.observe(el);
        }
      });
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
