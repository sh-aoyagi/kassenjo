// 文字パラパラアニメーション
function splitAndAnimate(el) {
  const text = el.textContent;
  el.textContent = '';
  el.setAttribute('aria-label', text);

  [...text].forEach((char, i) => {
    const span = document.createElement('span');
    span.textContent = char === ' ' ? ' ' : char;
    span.classList.add('char');
    span.style.setProperty('--i', i);
    el.appendChild(span);
  });
}

function initTextAnimation() {
  const targets = document.querySelectorAll('[data-animate]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
        entry.target.classList.add('animated');
        splitAndAnimate(entry.target);
      }
    });
  }, { threshold: 0.2 });

  targets.forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', initTextAnimation);
