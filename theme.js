// Aplica o tema (claro/escuro/automático) antes da página aparecer, para não piscar.
(function () {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (e) {}
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
})();
