/* Dependency-free, content-derived DNA word helix. Canvas is decorative. */
(() => {
  const canvas = document.getElementById('identity-helix');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fallback = ['Identity', 'FIDO2', 'Passkeys', 'PKI', 'Trust', 'Authentication', 'Terminal', 'tmux', 'Yazi'];
  let words = fallback, frame = 0, w = 0, h = 0, raf = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const render = () => {
    ctx.clearRect(0, 0, w, h);
    const count = 17, radius = Math.min(w * .22, 92), center = w * .26;
    const pitch = h / (count - 1);
    for (let i = 0; i < count; i++) {
      const y = i * pitch, phase = i * .37 + frame;
      const z = Math.cos(phase), dx = Math.sin(phase) * radius;
      const x1 = center + dx, x2 = center - dx;
      ctx.strokeStyle = 'rgba(0,237,138,.22)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      for (const [x, depth] of [[x1, z], [x2, -z]]) {
        ctx.beginPath(); ctx.arc(x, y, 1.7 + (depth + 1) * 1.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,245,145,${.26 + (depth + 1) * .3})`; ctx.fill();
      }
      if (true) {
        const word = words[i % words.length];
        const fontSize = i % 4 === 0 ? 20 : 18;
        ctx.font = `${i % 4 === 0 ? 'bold ' : ''}${fontSize}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'left';
        const x = center + radius + 14;
        const available = Math.max(32, w - x - 14);
        ctx.fillStyle = `rgba(80,255,169,${.66 + .22 * Math.sin(phase) ** 2})`;
        // Never horizontally squeeze text: choose a legible font size instead.
        let size = fontSize;
        while (size > 12 && ctx.measureText(word).width > available) {
          size -= 1;
          ctx.font = `${i % 4 === 0 ? 'bold ' : ''}${size}px ui-monospace, Menlo, monospace`;
        }
        ctx.fillText(word, x, y + 5);
      }
    }
  };
  const tick = () => { frame += .012; render(); raf = requestAnimationFrame(tick); };
  const update = () => { cancelAnimationFrame(raf); resize(); if (reduced.matches) render(); else tick(); };
  window.addEventListener('resize', update, { passive:true });
  reduced.addEventListener?.('change', update);
  fetch(canvas.dataset.wordsUrl || '/wordcloud.json').then(r => { if (!r.ok) throw Error('no vocabulary'); return r.json(); })
    .then(data => { if (Array.isArray(data.words) && data.words.length) { words = data.words.slice(0, 32); if (reduced.matches) render(); } })
    .catch(() => {});
  update();
})();
