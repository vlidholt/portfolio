/**
 * Casual Games section — standalone Missile Command demo.
 *
 * Renders the 512×342 game canvas directly, scaled to fill the section via
 * CSS object-fit / height rules.  Pointer coordinates are mapped back to the
 * game's native resolution on every click/touch.
 */

import { MissileCommand, GAME_W, GAME_H } from './missileCommand.js';

export function initCasualGames(sectionEl) {
  const canvas  = sectionEl.querySelector('#casual-games-canvas');
  canvas.width  = GAME_W;
  canvas.height = GAME_H;

  const game = new MissileCommand(canvas);

  // Map a client-space point → game-space point accounting for CSS scaling.
  function gameCoords(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (GAME_W / r.width),
      y: (clientY - r.top)  * (GAME_H / r.height),
    };
  }

  canvas.addEventListener('click', (e) => {
    const { x, y } = gameCoords(e.clientX, e.clientY);
    game.addExplosion(x, y);
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const { x, y } = gameCoords(e.touches[0].clientX, e.touches[0].clientY);
    game.addExplosion(x, y);
  }, { passive: false });

  game.start();

  let lastTime = 0;

  return {
    update(time) {
      const dt = lastTime ? Math.min(time - lastTime, 100) : 0;
      lastTime  = time;
      game.update(dt);
      game.render();
    },
  };
}
