// Pone el tema (claro u oscuro) antes de que cargue la app, para que no se
// vea un destello blanco al abrirla en oscuro. Es la misma regla que
// src/tema.js: si se cambia una, cambiar la otra. Va como archivo aparte
// porque la seguridad de la API (helmet) no deja correr scripts en línea.
(function () {
  var preferencia = 'auto';
  try {
    preferencia = localStorage.getItem('tema') || 'auto';
  } catch (e) {}
  var oscuro =
    preferencia === 'oscuro' ||
    (preferencia !== 'claro' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = oscuro ? 'oscuro' : 'claro';
  if (oscuro) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#1d3a26');
  }
})();
