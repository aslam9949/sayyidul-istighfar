/* Hub: per-lesson progress rings, search, occasion filters and a resume card.
   Everything is read from localStorage only — no analytics, no network. */
(function () {
  'use strict';

  var LESSONS = window.LESSONS || [];
  var search = document.getElementById('search');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.tag-chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.pick'));
  var empty = document.getElementById('empty');
  var resume = document.getElementById('resume');
  var resumeLink = document.getElementById('resumeLink');
  var resumeName = document.getElementById('resumeName');

  /* ---- progress rings ---- */
  LESSONS.forEach(function (l) {
    var done = 0;
    try {
      var raw = JSON.parse(localStorage.getItem(l.key + '_memorized') || '[]');
      if (Array.isArray(raw)) {
        done = raw.filter(function (i) { return Number.isInteger(i) && i >= 0 && i < l.lines; }).length;
      }
    } catch (e) {}
    var pct = l.lines ? Math.round((done / l.lines) * 100) : 0;
    var ring = document.querySelector('[data-ring="' + l.key + '"]');
    if (!ring) return;
    var fill = ring.querySelector('.ring-fill');
    var label = ring.querySelector('.label');
    var C = 2 * Math.PI * 22;
    if (fill) {
      fill.setAttribute('stroke-dashoffset', String(C * (1 - pct / 100)));
      // set both branches: the ring used to stay green after progress was reset
      fill.setAttribute('stroke', pct === 100 ? '#4caf50' : '#c9a84c');
    }
    if (label) label.textContent = pct + '%';
    ring.setAttribute('aria-label', pct + '% memorised');
  });

  /* ---- resume ---- */
  try {
    var last = localStorage.getItem('si_last_lesson');
    var seen = parseInt(localStorage.getItem('si_lesson_seen') || '0', 10);
    var match = LESSONS.filter(function (l) { return l.slug === last; })[0];
    if (match && seen && Date.now() - seen < 1000 * 60 * 60 * 24 * 30) {
      resumeLink.href = match.slug + '.html';
      resumeName.textContent = match.title;
      resume.classList.add('show');
    }
  } catch (e) {}

  /* ---- search + tag filter ---- */
  var activeTag = null;

  function apply() {
    var q = (search && search.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var hay = (card.dataset.title || '') + ' ' + (card.dataset.tags || '') + ' ' +
        (card.textContent || '').toLowerCase();
      var okText = !q || hay.indexOf(q) >= 0;
      var okTag = !activeTag || (card.dataset.tags || '').split(',').indexOf(activeTag) >= 0;
      var show = okText && okTag;
      card.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    if (empty) empty.classList.toggle('show', shown === 0);
  }

  if (search) {
    var t = null;
    search.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(apply, 90);
    });
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var tag = chip.dataset.tag;
      var on = activeTag === tag;
      activeTag = on ? null : tag;
      chips.forEach(function (c) {
        var isOn = c.dataset.tag === activeTag;
        c.classList.toggle('active', isOn);
        c.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      });
      apply();
    });
  });
})();
