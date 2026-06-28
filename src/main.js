import './style.css';
import { initAbout }       from './aboutSection.js';
import { initEarlyGames }  from './earlyGames.js';
import { initEducation }   from './education.js';

document.addEventListener('DOMContentLoaded', () => {
  const scrollContainer = document.getElementById('scroll-container');

  // ── Navigation ──────────────────────────────────────────────────────
  const allSections   = [...document.querySelectorAll('.section')];
  const topNavLinks   = [...document.querySelectorAll('#top-nav a[data-section]')];

  function goToSection(id) {
    const el = document.getElementById(id);
    if (el) {
      scrollContainer.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
    }
  }

  topNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      goToSection(link.dataset.section);
    });
  });

  function setActiveSection(id) {
    topNavLinks.forEach(l => l.classList.toggle('active', l.dataset.section === id));
  }

  // Reveal animation + active tracking via IntersectionObserver
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        if (entry.intersectionRatio >= 0.5) {
          setActiveSection(entry.target.id);
        }
      }
    }
  }, {
    root:      scrollContainer,
    threshold: [0.1, 0.5],
  });

  allSections.forEach(s => revealObserver.observe(s));

  // About is always visible on load
  document.getElementById('about').classList.add('visible');
  setActiveSection('about');

  // ── Scenes ──────────────────────────────────────────────────────────
  const aboutSec       = document.getElementById('about');
  const about          = initAbout(aboutSec, scrollContainer);

  const earlyGamesSec  = document.getElementById('early-games');
  const earlyGames     = initEarlyGames(earlyGamesSec, scrollContainer);

  const educationSec   = document.getElementById('education');
  const education      = initEducation(educationSec, scrollContainer);

  // ── Animation loop ───────────────────────────────────────────────────
  function animate(time) {
    requestAnimationFrame(animate);
    about.update(time);
    earlyGames.update(time);
    education.update(time);
  }

  requestAnimationFrame(animate);
});
