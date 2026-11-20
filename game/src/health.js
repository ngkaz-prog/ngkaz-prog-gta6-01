// Health and damage, shared by the player, the police and combat: armour absorbs
// 60% of a hit first, then health. Kept in its own file so no module needs to
// import the player module just to hurt him.

/** Damage the player, armour absorbing 60% first. Returns true when he is wasted. */
export function damagePlayer(state, amount, sound) {
  const player = state.player;
  if (player.invuln > 0 || player.hp <= 0) return false;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, remaining * 0.6);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.hp = Math.max(0, player.hp - remaining);
  player.invuln = 0.5;
  if (sound) sound.hurt();
  state.camera.shake = Math.max(state.camera.shake, 6);
  if (player.hp <= 0) {
    player.dead = true;
    player.deadReason = 'wasted';
    return true;
  }
  return false;
}
