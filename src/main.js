import './style.css';
import { initAbout }       from './aboutSection.js';
import { initEarlyGames }  from './earlyGames.js';
import { initEducation }   from './education.js';
import { initCasualGames } from './casualGames.js';

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

  // ── Emulator overlay ────────────────────────────────────────────────
  const emulatorOverlay = document.getElementById('emulator-overlay');
  const emulatorFrame   = document.getElementById('emulator-frame');
  const emulatorClose   = document.querySelector('.emulator-close');
  const emulatorLoading = document.getElementById('emulator-loading');
  const topNav          = document.getElementById('top-nav');

  let emulatorOpen    = false;
  let expectingLoad   = false; // true only while the emulator URL is loading

  // Hide loading indicator only when the emulator page itself has loaded —
  // not when the iframe navigates to about:blank on close.
  emulatorFrame.addEventListener('load', () => {
    if (expectingLoad) {
      expectingLoad = false;
      emulatorLoading.classList.add('hidden');
    }
  });

  // Called when the Three.js scene dispatches 'open-emulator' (user clicked screen)
  function openEmulator() {
    if (emulatorOpen) return;
    emulatorOpen = true;

    // Show loading indicator and arm the flag before setting src
    emulatorLoading.classList.remove('hidden');
    expectingLoad = true;

    // Set src synchronously — still within the user-gesture call stack from the
    // original click. Browsers expire the user-gesture context almost immediately,
    // so a setTimeout here would cause WebAudio (and thus the emulator) to stall.
    emulatorFrame.src = 'https://mutantdungeon.viktorious.com/';

    emulatorOverlay.removeAttribute('aria-hidden');
    emulatorOverlay.classList.remove('closing');
    emulatorOverlay.classList.add('open');

    // Allow close button to be reached by keyboard
    emulatorClose.removeAttribute('tabindex');

    topNav.style.opacity      = '0';
    topNav.style.pointerEvents = 'none';
  }

  function closeEmulator() {
    if (!emulatorOpen) return;
    emulatorOpen = false;

    // Fade overlay out (no delay on close)
    emulatorOverlay.classList.remove('open');
    emulatorOverlay.classList.add('closing');
    emulatorClose.setAttribute('tabindex', '-1');
    topNav.style.opacity      = '';
    topNav.style.pointerEvents = '';

    // After overlay has faded, tell education.js to zoom back out
    // and unload the iframe
    setTimeout(() => {
      emulatorOverlay.classList.remove('closing');
      emulatorOverlay.setAttribute('aria-hidden', 'true');
      document.dispatchEvent(new CustomEvent('close-emulator'));
      expectingLoad = false;                        // disarm before navigating away
      emulatorFrame.src = 'about:blank';            // reliably unloads the emulator
      emulatorLoading.classList.remove('hidden');   // ready for next open
    }, 380);
  }

  document.addEventListener('open-emulator', openEmulator);
  emulatorClose.addEventListener('click', closeEmulator);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && emulatorOpen) closeEmulator();
  });

  // ── Scenes ──────────────────────────────────────────────────────────
  const aboutSec       = document.getElementById('about');
  const about          = initAbout(aboutSec, scrollContainer);

  const earlyGamesSec  = document.getElementById('early-games');
  const earlyGames     = initEarlyGames(earlyGamesSec, scrollContainer);

  const educationSec   = document.getElementById('education');
  const education      = initEducation(educationSec, scrollContainer);

  const casualGamesSec = document.getElementById('casual-games');
  const casualGames    = initCasualGames(casualGamesSec, scrollContainer);

  // ── Animation loop ───────────────────────────────────────────────────
  function animate(time) {
    requestAnimationFrame(animate);
    about.update(time);
    earlyGames.update(time);
    education.update(time);
    casualGames.update(time);
  }

  requestAnimationFrame(animate);
});
