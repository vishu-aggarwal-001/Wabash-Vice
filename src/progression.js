// Character progression: earn XP from missions, jobs, stunts and finds; each level gives a
// talent point for Endurance (health, stamina), Driving (acceleration, nitro, grip) or
// Crime (bigger payouts, cops notice you less).
export const TALENTS = {
  endurance: { name: 'Endurance', desc: '+15 max health and faster stamina recovery per point', max: 5 },
  driving: { name: 'Driving', desc: '+5% acceleration, +6% grip and faster nitro refill per point', max: 5 },
  crime: { name: 'Criminal enterprise', desc: '+8% pay from jobs and missions, cops lose you faster', max: 5 },
};
const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000, 6200, 7600, 9200, 11000];

export class Progression {
  constructor(g) {
    this.g = g;
    g.save.xp ||= 0;
    g.save.talents = Object.assign({ endurance: 0, driving: 0, crime: 0 }, g.save.talents || {});
  }
  get xp() { return this.g.save.xp; }
  get level() { let l = 1; while (l < LEVELS.length && this.xp >= LEVELS[l]) l++; return l; }
  get nextXP() { return LEVELS[this.level] ?? null; }
  get prevXP() { return LEVELS[this.level - 1] ?? 0; }
  get points() { return this.level - 1 - Object.values(this.g.save.talents).reduce((a, b) => a + b, 0); }
  t(name) { return this.g.save.talents[name] || 0; }
  get maxHP() { return 100 + 15 * this.t('endurance'); }
  get payMult() { return 1 + 0.08 * this.t('crime'); }
  get driveMult() { return 1 + 0.05 * this.t('driving'); }

  add(n, why) {
    const before = this.level;
    this.g.save.xp += Math.round(n);
    if (this.level > before) {
      this.g.hud.big(`LEVEL ${this.level}`, `You have ${this.points} talent point${this.points === 1 ? '' : 's'} to spend — Tab → Skills`, 'pass');
      this.g.audio.chime(true);
      this.g.player.hp = this.maxHP;
    } else if (why) this.g.hud.toast(`+${Math.round(n)} XP · ${why}`, 'good');
    this.g.persist();
  }
  spend(name) {
    if (this.points <= 0 || this.t(name) >= TALENTS[name].max) return false;
    this.g.save.talents[name]++;
    if (name === 'endurance') this.g.player.hp = Math.min(this.maxHP, this.g.player.hp + 15);
    this.g.persist();
    return true;
  }
}
