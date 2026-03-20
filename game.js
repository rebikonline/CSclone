'use strict';
// ═══════════════════════════════════════════════════════════
//  CS•BROWSER v4.0  —  Complete rewrite
//  Proper speeds, weapon models, buy phase, round system
// ═══════════════════════════════════════════════════════════

// ── CONSTANTS ──────────────────────────────────────────────
const W = 960, H = 540;
const FOV = Math.PI / 3;
const HALF_FOV = FOV / 2;
const NUM_RAYS = 480;
const MAX_DEPTH = 20;
const TEX_SIZE = 64;

// Player movement — tuned to feel like CS
const WALK_SPEED   = 0.0095;  // tiles/ms — CS-like
const RUN_SPEED    = 0.0145; // with shift
const CROUCH_SPEED = 0.005;
const PLAYER_RADIUS = 0.25;

// ── MAP ────────────────────────────────────────────────────
// 0=open  1=concrete wall  2=wooden crate  3=metal barrel  4=pillar
const RAW_MAP = [
  "111111111111111111111111111111",
  "100000000001111000000000000001",
  "100000000001111000000000000001",
  "100022000000000000000220000001",
  "100020000000000000000020000001",
  "100000001100000000110000000001",
  "100000001100000000110000000001",
  "100000000000040400000000000001",
  "100000000000000000000000000001",
  "133000000000000000000000033001",
  "133000000000000000000000033001",
  "100000000004000400000000000001",
  "100000000000000000000000000001",
  "100000001100000000110000000001",
  "100000001100000000110000000001",
  "100000000000000000000000000001",
  "100022200000000000000022200001",
  "100000000000040400000000000001",
  "100000000000000000000000000001",
  "100000000000000000000000000001",
  "111111000000000000000001111111",
  "100000000000000000000000000001",
  "100000000000000000000000000001",
  "111111111111111111111111111111",
];
const MAP_W = RAW_MAP[0].length;
const MAP_H = RAW_MAP.length;
const MAP = RAW_MAP.map(r => r.split('').map(Number));

function cellAt(x, y) {
  const mx = Math.floor(x), my = Math.floor(y);
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return 1;
  return MAP[my][mx];
}
function isWalkable(x, y) { return cellAt(x, y) === 0; }

// ── SPAWN ZONES ────────────────────────────────────────────
// T side: top-left area,  CT side: bottom-right area
const T_SPAWNS  = [{x:2.5,y:1.5},{x:3.5,y:1.5},{x:1.5,y:2.5},{x:2.5,y:2.5},{x:3.5,y:2.5}];
const CT_SPAWNS = [{x:26.5,y:21.5},{x:25.5,y:21.5},{x:27.5,y:22.5},{x:26.5,y:22.5},{x:25.5,y:22.5}];

function getSpawn(team, idx) {
  const arr = team === 'T' ? T_SPAWNS : CT_SPAWNS;
  const sp = arr[idx % arr.length];
  return { x: sp.x, y: sp.y };
}

// ── TEXTURES (procedural pixel art) ────────────────────────
function makeTex(fn) {
  const buf = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++)
    for (let x = 0; x < TEX_SIZE; x++) {
      const [r,g,b] = fn(x, y);
      const i = (y * TEX_SIZE + x) * 4;
      buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=255;
    }
  return buf;
}

const TEXTURES = {
  wall: makeTex((x,y) => {
    const row = Math.floor(y / 10), col = Math.floor(x / 14);
    const isGrout = (y % 10 < 1) || ((row % 2 === 0) ? (x % 14 < 1) : ((x + 7) % 14 < 1));
    const noise = (Math.sin(x * 127.1 + y * 311.7) * 43758.5) % 1;
    const base = isGrout ? 40 : 100 + Math.floor(noise * 20);
    return [base + 10, base * 0.9, base * 0.75];
  }),
  crate: makeTex((x,y) => {
    const grain = ((Math.sin(x*73.1+y*127.9)*43758.5)%1)*.15;
    const line = (y%12<1||x%12<1) ? 0.5 : 1;
    const base = Math.floor((0.55 + grain) * line * 180);
    return [base, Math.floor(base*0.75), Math.floor(base*0.35)];
  }),
  barrel: makeTex((x,y) => {
    const band = Math.floor(y/8)%2;
    const rivet = (y%8===0&&x%16===0);
    const base = band ? 60 : 85;
    const v = rivet ? 180 : base + Math.floor(((Math.sin(x*41.9+y*93.1)*43758.5)%1)*15);
    return [Math.floor(v*.45), Math.floor(v*.55), Math.floor(v*.45)];
  }),
  pillar: makeTex((x,y) => {
    const edge = (x < 3 || x > 60);
    const noise = ((Math.sin(x*31.1+y*57.3)*43758.5)%1)*10;
    const base = edge ? 160 : 120 + noise;
    return [base, base, base];
  }),
  floor: makeTex((x,y) => {
    const tile = (Math.floor(x/16)+Math.floor(y/16))%2;
    const noise = ((Math.sin(x*17.3+y*41.7)*43758.5)%1)*8;
    const base = tile ? 45 : 55;
    return [base+noise, Math.floor((base+noise)*0.85), Math.floor((base+noise)*0.7)];
  }),
  ceil: makeTex((x,y) => {
    const noise = ((Math.sin(x*23.1+y*67.9)*43758.5)%1)*6;
    const base = 18 + noise;
    return [base, base, base+5];
  }),
};

function sampleTex(tex, u, v) {
  const tx = Math.floor(((u % 1) + 1) % 1 * TEX_SIZE) & (TEX_SIZE - 1);
  const ty = Math.floor(((v % 1) + 1) % 1 * TEX_SIZE) & (TEX_SIZE - 1);
  const i = (ty * TEX_SIZE + tx) * 4;
  return [tex[i], tex[i+1], tex[i+2]];
}

function texForCell(c) {
  if (c === 2) return TEXTURES.crate;
  if (c === 3) return TEXTURES.barrel;
  if (c === 4) return TEXTURES.pillar;
  return TEXTURES.wall;
}

// ── WEAPONS ────────────────────────────────────────────────
const WEAPONS = {
  knife:  {name:'Knife',   team:'*', price:0,    dmg:85,  rpm:60,   ammo:Infinity, reload:0.8, spread:0,     range:1.8, auto:false},
  glock:  {name:'Glock-18',team:'T', price:200,  dmg:25,  rpm:400,  ammo:20,       reload:2.0, spread:0.024, range:14,  auto:true },
  usp:    {name:'USP-S',   team:'CT',price:300,  dmg:34,  rpm:400,  ammo:12,       reload:2.2, spread:0.010, range:16,  auto:false},
  p250:   {name:'P250',    team:'*', price:300,  dmg:38,  rpm:400,  ammo:13,       reload:2.2, spread:0.016, range:14,  auto:false},
  deagle: {name:'Deagle',  team:'*', price:700,  dmg:63,  rpm:267,  ammo:7,        reload:2.2, spread:0.022, range:22,  auto:false},
  mac10:  {name:'MAC-10',  team:'T', price:1050, dmg:29,  rpm:800,  ammo:30,       reload:2.0, spread:0.028, range:10,  auto:true },
  mp9:    {name:'MP9',     team:'CT',price:1250, dmg:26,  rpm:857,  ammo:30,       reload:2.1, spread:0.022, range:12,  auto:true },
  ak47:   {name:'AK-47',   team:'T', price:2700, dmg:36,  rpm:600,  ammo:30,       reload:2.5, spread:0.016, range:22,  auto:true },
  m4a4:   {name:'M4A4',    team:'CT',price:3100, dmg:33,  rpm:666,  ammo:30,       reload:3.1, spread:0.013, range:22,  auto:true },
  sg553:  {name:'SG 553',  team:'T', price:3000, dmg:34,  rpm:545,  ammo:30,       reload:2.8, spread:0.014, range:24,  auto:true },
  aug:    {name:'AUG',     team:'CT',price:3300, dmg:32,  rpm:600,  ammo:30,       reload:3.0, spread:0.012, range:24,  auto:true },
  awp:    {name:'AWP',     team:'*', price:4750, dmg:115, rpm:41,   ammo:10,       reload:3.7, spread:0.001, range:55,  auto:false},
  scout:  {name:'SSG 08',  team:'*', price:1700, dmg:75,  rpm:100,  ammo:10,       reload:3.0, spread:0.004, range:42,  auto:false},
};
window.WEAPONS = WEAPONS;

const BUY_ITEMS = {
  pistols: ['glock','usp','p250','deagle'],
  smg:     ['mac10','mp9'],
  rifle:   ['ak47','m4a4','sg553','aug'],
  sniper:  ['awp','scout'],
  equip:   [
    {id:'armor',    name:'Vest',        price:650,  team:'*', icon:'🦺'},
    {id:'helmet',   name:'Vest+Helmet', price:1000, team:'*', icon:'⛑️'},
    {id:'nade',     name:'HE Grenade',  price:300,  team:'*', icon:'💣'},
    {id:'smoke',    name:'Smoke',       price:300,  team:'*', icon:'💨'},
    {id:'flash',    name:'Flashbang',   price:200,  team:'*', icon:'💡'},
    {id:'defuse',   name:'Defuse Kit',  price:400,  team:'CT',icon:'🔧'},
  ]
};

// ── PLAYER ─────────────────────────────────────────────────
class Player {
  constructor(id, team, spawnIdx) {
    const sp = getSpawn(team, spawnIdx);
    this.id     = id;
    this.team   = team;
    this.x      = sp.x;
    this.y      = sp.y;
    this.angle  = team === 'T' ? 0.4 : Math.PI + 0.4;
    this.hp     = 100;
    this.armor  = 0;
    this.hasHelmet  = false;
    this.hasDefuse  = false;
    this.money  = 800;
    this.weapon = team === 'T' ? 'glock' : 'usp';
    this.weapons = {
      knife: { ammo: Infinity, cur: Infinity },
      [this.weapon]: { ammo: WEAPONS[this.weapon].ammo, cur: WEAPONS[this.weapon].ammo }
    };
    this.kills  = 0;
    this.deaths = 0;
    this.alive  = true;
    this.name   = id;
    this.isBot  = false;
    this.reloading   = false;
    this.reloadTimer = 0;
    this.shootTimer  = 0;
    this.grenades    = { nade:0, smoke:0, flash:0 };
    this.hasBomb     = false;
    this.hasFlag     = false;
    this.isMoving    = false;
  }

  get wep()    { return this.weapons[this.weapon] || this.weapons.knife; }
  get wepInfo(){ return WEAPONS[this.weapon]       || WEAPONS.knife; }
}

Player.prototype.takeDamage = function(dmg, attacker) {
  if (!this.alive) return;
  if (attacker && attacker.id === this.id) return; // no self damage
  const abs = this.armor > 0
    ? Math.min(this.armor, dmg * (this.hasHelmet ? 0.35 : 0.5))
    : 0;
  this.armor = Math.max(0, this.armor - abs * 2.5);
  this.hp    = Math.max(0, Math.round(this.hp - (dmg - abs)));

  const g = window._game;
  if (attacker?.id === g?.localPlayer?.id) g.hud.triggerHitmarker();
  if (this.id === g?.localPlayer?.id)       g.hud.triggerHurt(dmg);

  if (this.hp <= 0) {
    this.alive = false;
    this.deaths++;
    if (attacker) {
      attacker.kills++;
      g?.hud?.addKillFeed(attacker, this);
      g?.modeCtrl?.onKill?.(attacker, this);
    }
    g?.modeCtrl?.onDeath?.(this);
  }
};

// ── BOT AI ─────────────────────────────────────────────────
const BOT_NAMES = [
  'xX_Ruslan_Xx','QuickDraw_99','NomadSniper','SilentKiller',
  'Rush_B_Cyka','IronWall_Pro','GhostShooter','VodkaWarrior',
  'SashaGOAT','DarkAngel_RU'
];

class Bot extends Player {
  constructor(id, team, spawnIdx) {
    super(id, team, spawnIdx);
    this.isBot  = true;
    this.name   = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const w     = team === 'T' ? 'ak47' : 'm4a4';
    this.weapon = w;
    this.weapons[w] = { ammo: WEAPONS[w].ammo, cur: WEAPONS[w].ammo };

    this.aimError    = 0.08;
    this.reactionMs  = 320;
    this.reactionT   = 0;

    this.state       = 'patrol';
    this.target      = null;
    this.lastSeen    = null;
    this.patrolPts   = this._genPatrol();
    this.patrolIdx   = 0;

    this.stuckTimer  = 0;
    this.lastBotPos  = { x: this.x, y: this.y };
    this.strafeDir   = 1;
    this.strafeTimer = 0;
  }

  _genPatrol() {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      let x, y, tries = 0;
      do {
        x = 1.5 + Math.random() * (MAP_W - 3);
        y = 1.5 + Math.random() * (MAP_H - 3);
        tries++;
      } while (!isWalkable(x, y) && tries < 40);
      pts.push({ x, y });
    }
    return pts;
  }

  canSee(target) {
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 14) return false;
    const steps = Math.ceil(dist * 6);
    for (let i = 1; i < steps; i++) {
      const tx = this.x + dx * (i / steps);
      const ty = this.y + dy * (i / steps);
      if (!isWalkable(tx, ty)) return false;
    }
    return true;
  }

  moveToward(tx, ty, speed) {
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return;
    const nx = this.x + (dx / dist) * speed;
    const ny = this.y + (dy / dist) * speed;
    const r = PLAYER_RADIUS;
    if (isWalkable(nx + r, this.y) && isWalkable(nx - r, this.y)) this.x = nx;
    if (isWalkable(this.x, ny + r) && isWalkable(this.x, ny - r)) this.y = ny;
  }

  update(dt, players) {
    if (!this.alive) return;
    this.shootTimer  = Math.max(0, this.shootTimer  - dt);
    this.reactionT   = Math.max(0, this.reactionT   - dt);
    this.strafeTimer = Math.max(0, this.strafeTimer - dt);
    if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 700 + Math.random() * 1100; }

    // Stuck detection
    this.stuckTimer += dt;
    if (this.stuckTimer > 700) {
      const dd = Math.hypot(this.x - this.lastBotPos.x, this.y - this.lastBotPos.y);
      if (dd < 0.06) this.angle += (Math.random() - 0.5) * Math.PI * 1.5;
      this.stuckTimer = 0;
      this.lastBotPos = { x: this.x, y: this.y };
    }

    // Find enemy
    let nearest = null, nearD = Infinity;
    for (const p of players) {
      if (!p.alive || p.team === this.team || p.id === this.id) continue;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < nearD && this.canSee(p)) { nearest = p; nearD = d; }
    }
    if (nearest && !this.target) this.reactionT = this.reactionMs;
    this.target = nearest;
    if (this.target) this.lastSeen = { x: this.target.x, y: this.target.y };

    const speed = WALK_SPEED * 0.85 * dt;

    if (this.target && this.reactionT <= 0) {
      // Aim
      const ta = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      const ae = (Math.random() - 0.5) * this.aimError * 2;
      let da = (ta + ae) - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * 0.18;
      // Strafe
      const sa = this.angle + Math.PI / 2 * this.strafeDir;
      this.moveToward(this.x + Math.cos(sa) * 2, this.y + Math.sin(sa) * 2, speed * 0.55);
      // Shoot
      if (this.shootTimer <= 0 && !this.reloading) this._botShoot(players);
    } else if (this.lastSeen) {
      const ta = Math.atan2(this.lastSeen.y - this.y, this.lastSeen.x - this.x);
      let da = ta - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * 0.1;
      this.moveToward(this.lastSeen.x, this.lastSeen.y, speed);
      if (Math.hypot(this.x - this.lastSeen.x, this.y - this.lastSeen.y) < 0.5) this.lastSeen = null;
    } else {
      const pt = this.patrolPts[this.patrolIdx % this.patrolPts.length];
      const ta = Math.atan2(pt.y - this.y, pt.x - this.x);
      let da = ta - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * 0.09;
      this.moveToward(pt.x, pt.y, speed);
      if (Math.hypot(this.x - pt.x, this.y - pt.y) < 0.5)
        this.patrolIdx = (this.patrolIdx + 1) % this.patrolPts.length;
    }

    // Reload
    if (this.wep.cur <= 0 && !this.reloading) this._botReload();
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.wep.cur = WEAPONS[this.weapon]?.ammo || 30;
      }
    }

    this.isMoving = true;
  }

  _botShoot(players) {
    const wi = WEAPONS[this.weapon];
    if (!wi || this.wep.cur <= 0) return;
    this.wep.cur--;
    this.shootTimer = 60000 / wi.rpm;
    if (this.target && this.canSee(this.target)) {
      const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      const acc  = this.target.isMoving ? 0.55 : 0.72;
      if (Math.random() < acc) {
        const dmg = wi.dmg * (0.75 + Math.random() * 0.5) * (1 - dist / wi.range * 0.3);
        this.target.takeDamage(dmg, this);
      }
    }
  }

  _botReload() {
    this.reloading    = true;
    this.reloadTimer  = (WEAPONS[this.weapon]?.reload || 2) * 1000;
  }
}

// ── ANTICHEAT ──────────────────────────────────────────────
class AntiCheat {
  constructor() { this.lastPos = { x: 0, y: 0 }; this.violations = 0; }
  tick(p, dt) {
    // Speed check
    const moved = Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y);
    const maxOk = RUN_SPEED * dt * 1.8;
    if (moved > maxOk && moved > 0.4) {
      this.violations++;
      if (this.violations > 8) {
        p.x = this.lastPos.x; p.y = this.lastPos.y;
        console.warn('[AC] Speed violation');
      }
    } else this.violations = Math.max(0, this.violations - 1);
    // Stat clamps
    if (p.hp    > 100)   p.hp    = 100;
    if (p.armor > 100)   p.armor = 100;
    if (p.money > 16000) p.money = 16000;
    for (const [wid, wd] of Object.entries(p.weapons)) {
      const max = WEAPONS[wid]?.ammo ?? 30;
      if (wd.cur !== Infinity && wd.cur > max) { wd.cur = max; console.warn('[AC] Ammo hack'); }
    }
    this.lastPos = { x: p.x, y: p.y };
  }
}

// ── GRENADES ───────────────────────────────────────────────
window._grenades = [];
window._flashTimer = 0;

function throwGrenade(player, type) {
  const g = {
    x: player.x + Math.cos(player.angle) * 0.9,
    y: player.y + Math.sin(player.angle) * 0.9,
    vx: Math.cos(player.angle) * 0.008,
    vy: Math.sin(player.angle) * 0.008,
    type, age: 0,
    maxAge: type === 'smoke' ? 10000 : 650,
    exploded: false
  };
  window._grenades.push(g);
  if (player.grenades) player.grenades[type] = Math.max(0, (player.grenades[type] || 1) - 1);

  if (type === 'nade') {
    setTimeout(() => {
      const game = window._game;
      if (!game) return;
      for (const p of game.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < 3.2) p.takeDamage((1 - d / 3.2) * 98, player);
      }
    }, 450);
  }
  if (type === 'flash') {
    setTimeout(() => {
      const lp = window._game?.localPlayer;
      if (!lp) return;
      const d   = Math.hypot(lp.x - g.x, lp.y - g.y);
      const dot = Math.cos(lp.angle - Math.atan2(g.y - lp.y, g.x - lp.x));
      if (d < 4 && dot > 0.2) window._flashTimer = 1600;
    }, 300);
  }
}

// ── GAME MODES ─────────────────────────────────────────────
class BombMode {
  constructor() { this.bomb = null; }
  init(players) {
    this.bomb = null;
    const ts = players.filter(p => p.team === 'T' && p.alive);
    if (ts.length) ts[0].hasBomb = true;
  }
  tryPlant(player) {
    if (!player.hasBomb || this.bomb?.planted) return false;
    const onA = Math.hypot(player.x - 3,    player.y - 3)    < 2.5;
    const onB = Math.hypot(player.x - 25.5, player.y - 20.5) < 2.5;
    if (onA || onB) {
      this.bomb = { x: player.x, y: player.y, planted: true, timer: 40000, defuse: 0 };
      player.hasBomb = false;
      return true;
    }
    return false;
  }
  update(dt, players, game) {
    if (this.bomb?.planted) {
      this.bomb.timer -= dt;
      if (this.bomb.timer <= 0) {
        game.roundEnd('T', '💣  BOMB EXPLODED');
        for (const p of players) {
          if (!p.alive) continue;
          const d = Math.hypot(p.x - this.bomb.x, p.y - this.bomb.y);
          if (d < 5) p.takeDamage(d < 1.5 ? 500 : d < 3 ? 200 : 80, null);
        }
        return;
      }
      const lp = game.localPlayer;
      if (lp?.alive && lp.team === 'CT') {
        const d = Math.hypot(lp.x - this.bomb.x, lp.y - this.bomb.y);
        if (d < 1.8 && game.input?.keys['KeyE']) {
          this.bomb.defuse += dt / 1000 * (lp.hasDefuse ? 0.45 : 1);
          if (this.bomb.defuse >= 1) game.roundEnd('CT', '✅  BOMB DEFUSED');
        } else this.bomb.defuse = 0;
      }
      // Bot defuse
      for (const p of players) {
        if (!p.isBot || p.team !== 'CT' || !p.alive) continue;
        if (Math.hypot(p.x - this.bomb.x, p.y - this.bomb.y) < 1.5) {
          this.bomb.defuse += dt / 1000;
          if (this.bomb.defuse >= 1) { game.roundEnd('CT', '✅  BOMB DEFUSED'); return; }
        }
      }
    }
    const tAlive  = players.filter(p => p.team === 'T'  && p.alive).length;
    const ctAlive = players.filter(p => p.team === 'CT' && p.alive).length;
    if (!tAlive  && !this.bomb?.planted) game.roundEnd('CT', '🎯  Terrorists eliminated');
    if (!ctAlive && !this.bomb?.planted) game.roundEnd('T',  '🎯  Counter-terrorists eliminated');
  }
}

class DeathmatchMode {
  constructor() { this.target = 30; }
  init() {}
  update(dt, players, game) {
    for (const p of players) if (p.kills >= this.target) { game.roundEnd(p.team, `🏆  ${p.name} wins!`); return; }
    for (const p of players) if (!p.alive && p._respawnTimer > 0) {
      p._respawnTimer -= dt;
      if (p._respawnTimer <= 0) {
        const sp = getSpawn(p.team, Math.floor(Math.random() * 5));
        p.x = sp.x; p.y = sp.y; p.hp = 100; p.alive = true;
      }
    }
  }
  onKill(k, v) { if (v) v._respawnTimer = 3000; }
}

class CTFMode {
  constructor() {
    this.flags  = {
      T:  { ox:2,   oy:2,   x:2,   y:2,   held:null, atBase:true },
      CT: { ox:26,  oy:22,  x:26,  y:22,  held:null, atBase:true },
    };
    this.scores = { T:0, CT:0 };
    this.target = 3;
  }
  init() {}
  update(dt, players, game) {
    for (const p of players) {
      if (!p.alive) continue;
      const et   = p.team === 'T' ? 'CT' : 'T';
      const ef   = this.flags[et];
      const myF  = this.flags[p.team];
      if (!ef.held && Math.hypot(p.x - ef.x, p.y - ef.y) < 0.9) {
        ef.held = p; p.hasFlag = true;
      }
      if (ef.held === p) { ef.x = p.x; ef.y = p.y; }
      if (p.hasFlag && myF.atBase && Math.hypot(p.x - myF.x, p.y - myF.y) < 1.2) {
        this.scores[p.team]++;
        p.hasFlag = false; ef.held = null; ef.x = ef.ox; ef.y = ef.oy; ef.atBase = true;
        if (this.scores[p.team] >= this.target) game.roundEnd(p.team, `🚩  ${p.team} wins CTF!`);
      }
    }
  }
  onDeath(v) {
    if (!v.hasFlag) return;
    const et = v.team === 'T' ? 'CT' : 'T';
    const f  = this.flags[et];
    f.held = null; f.x = v.x; f.y = v.y; f.atBase = false; v.hasFlag = false;
  }
}

const ARMS_CHAIN = ['knife','glock','p250','deagle','mac10','mp9','ak47','m4a4','sg553','aug','awp','scout'];
class ArmsRaceMode {
  constructor() { this.prog = {}; }
  init(players) { for (const p of players) this.prog[p.id] = 0; }
  update() {}
  onKill(killer) {
    if (!killer) return;
    const idx = Math.min((this.prog[killer.id] || 0) + 1, ARMS_CHAIN.length - 1);
    this.prog[killer.id] = idx;
    const wid = ARMS_CHAIN[idx];
    if (WEAPONS[wid] && !killer.weapons[wid]) killer.weapons[wid] = { ammo: WEAPONS[wid].ammo, cur: WEAPONS[wid].ammo };
    killer.weapon = wid;
    if (idx >= ARMS_CHAIN.length - 1) window._game?.roundEnd(killer.team, `🏆  ${killer.name} completes Arms Race!`);
  }
}

// ── RAYCASTER ──────────────────────────────────────────────
class Raycaster {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.imgData = this.ctx.createImageData(W, H);
    this.buf     = this.imgData.data;
    this.zBuf    = new Float64Array(W);
  }

  render(player, players) {
    const buf = this.buf;
    const px = player.x, py = player.y, pa = player.angle;

    // DDA raycast per column
    for (let col = 0; col < W; col++) {
      const cameraX = 2 * col / W - 1;
      // Ray direction
      const rdx = Math.cos(pa) + Math.sin(pa) * cameraX * Math.tan(HALF_FOV) * (-1);
      const rdy = Math.sin(pa) - Math.cos(pa) * cameraX * Math.tan(HALF_FOV) * (-1);

      let mx = Math.floor(px), my = Math.floor(py);
      const sx = rdx >= 0 ? 1 : -1, sy = rdy >= 0 ? 1 : -1;
      const ddx = Math.abs(rdx) < 1e-10 ? 1e10 : Math.abs(1 / rdx);
      const ddy = Math.abs(rdy) < 1e-10 ? 1e10 : Math.abs(1 / rdy);
      let sdx = rdx >= 0 ? (mx + 1 - px) * ddx : (px - mx) * ddx;
      let sdy = rdy >= 0 ? (my + 1 - py) * ddy : (py - my) * ddy;

      let hit = 0, side = 0, cell = 0;
      for (let step = 0; step < 64; step++) {
        if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; }
        else           { sdy += ddy; my += sy; side = 1; }
        cell = MAP[my]?.[mx] ?? 1;
        if (cell > 0) { hit = 1; break; }
      }

      const perp = side === 0 ? (sdx - ddx) : (sdy - ddy);
      const dist = Math.max(0.05, perp);
      this.zBuf[col] = dist;

      // Wall slice
      const lineH    = Math.min(H * 3, Math.floor(H / dist));
      const drawTop  = Math.max(0, Math.floor((H - lineH) / 2));
      const drawBot  = Math.min(H - 1, Math.floor((H + lineH) / 2));

      let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      wallX -= Math.floor(wallX);

      const tex    = texForCell(cell);
      const texCol = Math.floor(wallX * TEX_SIZE) & (TEX_SIZE - 1);
      const bright = Math.max(0, 1 - dist / MAX_DEPTH) * (side === 1 ? 0.62 : 1.0);

      for (let row = drawTop; row <= drawBot; row++) {
        const texRow = Math.floor(((row - drawTop) / (drawBot - drawTop + 1)) * TEX_SIZE) & (TEX_SIZE - 1);
        const ti = (texRow * TEX_SIZE + texCol) * 4;
        const pi = (row * W + col) * 4;
        buf[pi    ] = tex[ti    ] * bright;
        buf[pi + 1] = tex[ti + 1] * bright;
        buf[pi + 2] = tex[ti + 2] * bright;
        buf[pi + 3] = 255;
      }

      // Floor / ceiling per column
      const floorTex = TEXTURES.floor, ceilTex = TEXTURES.ceil;
      for (let row = 0; row < drawTop; row++) {
        const rowDist = H / Math.max(1, H - 2 * row);
        const fx = px + Math.cos(pa) * rowDist + (-Math.sin(pa)) * rowDist * cameraX;
        const fy = py + Math.sin(pa) * rowDist + ( Math.cos(pa)) * rowDist * cameraX;
        const [cr,cg,cb] = sampleTex(ceilTex, fx, fy);
        const cb2 = Math.max(0, 0.4 - row / H * 0.9);
        const pi = (row * W + col) * 4;
        buf[pi]=cr*cb2; buf[pi+1]=cg*cb2; buf[pi+2]=cb*cb2; buf[pi+3]=255;
      }
      for (let row = drawBot + 1; row < H; row++) {
        const rowDist = H / Math.max(1, 2 * row - H);
        const fx = px + Math.cos(pa) * rowDist + (-Math.sin(pa)) * rowDist * cameraX;
        const fy = py + Math.sin(pa) * rowDist + ( Math.cos(pa)) * rowDist * cameraX;
        const [fr,fg,fb2] = sampleTex(floorTex, fx, fy);
        const fb = Math.max(0, (row - drawBot) / (H - drawBot) * 0.55);
        const pi = (row * W + col) * 4;
        buf[pi]=fr*fb; buf[pi+1]=fg*fb; buf[pi+2]=fb2*fb; buf[pi+3]=255;
      }
    }

    this.ctx.putImageData(this.imgData, 0, 0);

    // Sprite pass — other players
    this._renderSprites(player, players);
  }

  _renderSprites(player, players) {
    const ctx  = this.ctx;
    const sprs = [];
    for (const p of players) {
      if (!p.alive || p.id === player.id) continue;
      const dx = p.x - player.x, dy = p.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.3 || dist > 15) continue;
      let a = Math.atan2(dy, dx) - player.angle;
      while (a >  Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > HALF_FOV * 1.25) continue;
      sprs.push({ p, dist, a });
    }
    sprs.sort((a, b) => b.dist - a.dist);

    for (const { p, dist, a } of sprs) {
      const h   = Math.min(H * 0.85, H / dist * 0.72);
      const sx  = W / 2 + Math.tan(a) * (W / 2) / Math.tan(HALF_FOV);
      const x   = sx - h / 2, y = H * 0.42 - h / 2;

      // Z-check
      const colL = Math.max(0,   Math.floor((sx - h / 2) / W * W));
      const colR = Math.min(W-1, Math.floor((sx + h / 2) / W * W));
      let blocked = 0, total = 0;
      for (let c = colL; c <= colR; c += 3) { if (this.zBuf[c] < dist - 0.1) blocked++; total++; }
      if (total > 0 && blocked / total > 0.75) continue;

      const bright = Math.max(0.15, 1 - dist / 15);
      ctx.save();
      ctx.globalAlpha = bright;

      // Ground-anchored sprite — bottom at H*0.5 (horizon)
      const groundY = H * 0.5;
      const sprH = h;
      const sprTop = groundY - sprH;
      const sprW = sprH * 0.55;
      const sprX = sx - sprW / 2;

      const bodyC  = p.team === 'T' ? '#cc3300' : '#0044cc';
      const darkC  = p.team === 'T' ? '#882200' : '#002288';
      const pantsC = p.team === 'T' ? '#442200' : '#001144';

      // Shadow on floor
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(sx, groundY, sprW*0.45, sprH*0.04, 0, 0, Math.PI*2); ctx.fill();

      // Legs
      const legTop = sprTop + sprH*0.62;
      ctx.fillStyle = pantsC;
      ctx.fillRect(sprX + sprW*0.08, legTop, sprW*0.36, sprH*0.38);
      ctx.fillRect(sprX + sprW*0.56, legTop, sprW*0.36, sprH*0.38);
      // Boot
      ctx.fillStyle = '#111';
      ctx.fillRect(sprX + sprW*0.06, sprTop+sprH*0.9, sprW*0.4, sprH*0.1);
      ctx.fillRect(sprX + sprW*0.54, sprTop+sprH*0.9, sprW*0.4, sprH*0.1);

      // Torso
      ctx.fillStyle = bodyC;
      ctx.fillRect(sprX + sprW*0.1, sprTop + sprH*0.22, sprW*0.8, sprH*0.42);

      // Arms
      ctx.fillStyle = darkC;
      ctx.fillRect(sprX,            sprTop+sprH*0.22, sprW*0.12, sprH*0.30);
      ctx.fillRect(sprX+sprW*0.88,  sprTop+sprH*0.22, sprW*0.12, sprH*0.30);

      // Gun (held at right side)
      ctx.fillStyle = '#222';
      ctx.fillRect(sprX - sprW*0.15, sprTop+sprH*0.35, sprW*0.55, sprH*0.07);

      // Neck
      ctx.fillStyle = '#c09070';
      ctx.fillRect(sprX+sprW*0.4, sprTop+sprH*0.14, sprW*0.2, sprH*0.10);

      // Head
      ctx.fillStyle = '#c09070';
      ctx.beginPath(); ctx.ellipse(sx, sprTop+sprH*0.10, sprW*0.24, sprH*0.14, 0, 0, Math.PI*2); ctx.fill();

      // Helmet
      ctx.fillStyle = p.team === 'T' ? '#1a1a1a' : '#0d0d22';
      ctx.beginPath();
      ctx.arc(sx, sprTop+sprH*0.08, sprW*0.22, Math.PI*1.1, Math.PI*1.9); ctx.fill();
      ctx.fillRect(sx-sprW*0.22, sprTop+sprH*0.06, sprW*0.44, sprH*0.05);

      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx-sprW*0.12, sprTop+sprH*0.07, sprW*0.08, sprH*0.04);
      ctx.fillRect(sx+sprW*0.04, sprTop+sprH*0.07, sprW*0.08, sprH*0.04);

      if (p.hasFlag) {
        ctx.font = `${Math.max(10, sprH*0.22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🚩', sx, sprTop - 4);
      }

      // HP bar always visible
      const bw = Math.max(30, sprW*1.1), bh = 4;
      const bx2 = sx - bw/2, by2 = sprTop - 16;
      if (dist < 10) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx2, by2, bw, bh);
        ctx.fillStyle = p.hp > 50 ? '#00ee44' : p.hp > 25 ? '#ffaa00' : '#ff2200';
        ctx.fillRect(bx2, by2, bw*(p.hp/100), bh);
        ctx.fillStyle = p.team === 'T' ? '#ff9977' : '#88aaff';
        ctx.font = `bold ${Math.max(7, sprH*0.09)}px 'Share Tech Mono'`;
        ctx.textAlign = 'center'; ctx.shadowBlur = 3; ctx.shadowColor = '#000';
        ctx.fillText(p.name.substring(0,12), sx, by2 - 3);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }
}

// ── WEAPON VIEW MODEL ──────────────────────────────────────
class WeaponView {
  constructor(ctx) {
    this.ctx      = ctx;
    this.bob      = 0;
    this.bobSpeed = 0;
    this.recoil   = 0;
    this.flash    = 0;
    this.swayX    = 0;
    this.swayY    = 0;
  }

  update(dt, moving, shooting) {
    this.bobSpeed = moving
      ? Math.min(this.bobSpeed + dt * 0.003, 1)
      : Math.max(this.bobSpeed - dt * 0.005, 0);
    this.bob    += dt * 0.005 * this.bobSpeed;
    this.recoil  = Math.max(0, this.recoil - dt * 0.012);
    this.flash   = Math.max(0, this.flash  - dt * 0.025);
    this.swayX  *= 0.87;
    this.swayY  *= 0.87;
  }

  onShoot() { this.recoil = 1; this.flash = 1; }

  addSway(dx, dy) {
    this.swayX -= dx * 0.25;
    this.swayY -= dy * 0.2;
  }

  draw(weaponId, crouching) {
    const ctx   = this.ctx;
    const bobX  = Math.sin(this.bob) * 5 * this.bobSpeed;
    const bobY  = Math.abs(Math.cos(this.bob)) * 7 * this.bobSpeed;
    const rc    = this.recoil;
    const cr    = crouching ? -8 : 0;
    const baseX = W * 0.54 + bobX + this.swayX * 0.4;
    const baseY = H * 0.71 + bobY + rc * 16 + this.swayY * 0.3 + cr;

    ctx.save();

    // Muzzle flash
    if (this.flash > 0 && weaponId !== 'knife') {
      const fx = baseX - 90, fy = baseY - 65;
      const gf = ctx.createRadialGradient(fx, fy, 0, fx, fy, 28 * this.flash);
      gf.addColorStop(0, `rgba(255,235,120,${this.flash})`);
      gf.addColorStop(0.5, `rgba(255,110,0,${this.flash * 0.6})`);
      gf.addColorStop(1, 'transparent');
      ctx.fillStyle = gf;
      ctx.fillRect(fx - 32, fy - 32, 64, 64);
    }

    ctx.translate(baseX, baseY);
    this._drawWeapon(ctx, weaponId, rc);
    ctx.restore();

    // Hands
    this._drawHands(ctx, baseX, baseY, weaponId);
  }

  _drawWeapon(ctx, id, rc) {
    if (id === 'knife') return this._wKnife(ctx, rc);
    if (id === 'awp' || id === 'scout') return this._wSniper(ctx, rc, id === 'awp');
    if (id === 'ak47' || id === 'sg553') return this._wRifle(ctx, rc, '#7a5c10', '#4a3808');
    if (id === 'm4a4' || id === 'aug')   return this._wRifle(ctx, rc, '#444', '#2a2a2a');
    if (id === 'mac10' || id === 'mp9')  return this._wSMG(ctx, rc);
    return this._wPistol(ctx, rc, id === 'deagle');
  }

  _wRifle(ctx, rc, c1, c2) {
    // Upper receiver
    ctx.fillStyle = c1;
    ctx.fillRect(-130, -28, 190, 16);
    // Lower receiver
    ctx.fillStyle = c2;
    ctx.fillRect(-125, -12, 130, 10);
    // Barrel
    ctx.fillStyle = '#222';
    ctx.fillRect(-155, -24, 30, 8);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-170, -23, 18, 6);
    // Magazine
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(-15, -2); ctx.lineTo(-5, -2); ctx.lineTo(-8, 38); ctx.lineTo(-18, 38);
    ctx.closePath(); ctx.fill();
    // Grip
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.moveTo(30, -12); ctx.lineTo(50, -12); ctx.lineTo(46, 32); ctx.lineTo(28, 32);
    ctx.closePath(); ctx.fill();
    // Stock
    ctx.fillStyle = c1;
    ctx.fillRect(52, -20, 25, 12);
    ctx.fillRect(58, -8,  18, 18);
    // Top rail / sight
    ctx.fillStyle = '#111';
    ctx.fillRect(-25, -34, 60, 6);
    ctx.fillStyle = '#0af';
    ctx.fillRect(-22, -32, 54, 3);
  }

  _wSniper(ctx, rc, isAwp) {
    const sc = isAwp ? 1 : 0.85;
    ctx.scale(sc, sc);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-170, -18, 230, 12);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-175, -17, 25, 9);
    // Scope
    ctx.fillStyle = '#111';
    ctx.fillRect(-80, -30, 50, 14);
    ctx.fillStyle = '#333';
    ctx.fillRect(-78, -28, 46, 10);
    ctx.fillStyle = '#4af';
    ctx.fillRect(-76, -26, 42, 6);
    // Bolt
    if (!isAwp) { ctx.fillStyle = '#555'; ctx.fillRect(20, -18, 10, 10); }
    // Grip
    ctx.fillStyle = '#222';
    ctx.fillRect(30, -8, 18, 32);
    // Mag
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-30, -6, 12, 24);
    // Bipod
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-110, 0); ctx.lineTo(-118, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-90,  0); ctx.lineTo(-82,  22); ctx.stroke();
  }

  _wSMG(ctx, rc) {
    ctx.fillStyle = '#2d2d2d';
    ctx.fillRect(-90, -20, 140, 14);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-95, -19, 22, 10);
    ctx.fillStyle = '#222';
    ctx.fillRect(25, -10, 16, 28);
    ctx.fillStyle = '#111';
    ctx.fillRect(-25, -4, 12, 28);
  }

  _wPistol(ctx, rc, big) {
    const s = big ? 1.25 : 1;
    ctx.scale(s, s);
    ctx.fillStyle = '#252525';
    ctx.fillRect(-50, -22, 88, 16);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-55, -21, 22, 12);
    ctx.fillStyle = '#222';
    ctx.fillRect(20, -12, 18, 36);
    ctx.fillStyle = '#111';
    ctx.fillRect(-10, -4,  12, 22);
    if (big) {
      ctx.fillStyle = '#333';
      ctx.fillRect(-52, -26, 14, 5);
    }
  }

  _wKnife(ctx, rc) {
    ctx.save();
    ctx.rotate(-0.28 + rc * 0.18);
    ctx.translate(20, -20);
    // Blade
    ctx.fillStyle = '#c8c8c8';
    ctx.beginPath();
    ctx.moveTo(-8, -55); ctx.lineTo(8, -55); ctx.lineTo(4, 30); ctx.lineTo(-4, 30);
    ctx.closePath(); ctx.fill();
    // Spine
    ctx.fillStyle = '#999';
    ctx.fillRect(-8, -55, 3, 85);
    // Edge shine
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(6, -50); ctx.lineTo(3, 25); ctx.stroke();
    // Guard
    ctx.fillStyle = '#777';
    ctx.fillRect(-14, 28, 28, 8);
    // Handle
    ctx.fillStyle = '#2a1608';
    ctx.fillRect(-10, 36, 20, 48);
    // Wrap
    ctx.strokeStyle = '#1a0e05'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(-10, 42 + i*10); ctx.lineTo(10, 42 + i*10); ctx.stroke();
    }
    ctx.restore();
  }

  _drawHands(ctx, bx, by, weapon) {
    const isRifle  = ['ak47','m4a4','sg553','aug'].includes(weapon);
    const isSniper = ['awp','scout'].includes(weapon);
    const glove = isRifle || isSniper ? '#1a1a1a' : '#c08060';

    ctx.save();
    // Right hand (trigger)
    ctx.fillStyle = glove;
    ctx.beginPath();
    ctx.ellipse(bx + 30, by + 18, 20, 28, -0.25, 0, Math.PI * 2);
    ctx.fill();
    // Fingers right
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(bx + 12 + i*14, by + 38, 6, 13, -0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Thumb
    ctx.beginPath();
    ctx.ellipse(bx + 52, by + 8, 9, 15, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Left hand (support)
    ctx.beginPath();
    ctx.ellipse(bx - 70, by - 8, 18, 24, -0.1, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(bx - 88 + i*12, by + 12, 5, 11, -0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Forearms
    ctx.fillRect(bx + 10, by + 44, 36, 55);
    ctx.fillRect(bx - 88, by + 8,  28, 55);
    ctx.restore();
  }
}

// ── HUD ────────────────────────────────────────────────────
class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.hitM   = 0;
    this.hurtA  = 0;
    this.kf     = [];
    this.dead   = false;
  }

  triggerHitmarker()    { this.hitM = 230; }
  triggerHurt(d)        { this.hurtA = Math.min(1, d / 75); }
  addKillFeed(k, v)     { this.kf.unshift({ k, v, t: Date.now() }); if (this.kf.length > 5) this.kf.pop(); }

  render(player, round, scores, ping, settings, phase, phaseTimer) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    if (phase === 'buy') {
      this._buyPhaseOverlay(ctx, phaseTimer, player);
    }

    this._crosshair(ctx, settings?.cross || 'classic', player);
    this._hp(ctx, player);
    this._ammo(ctx, player);
    this._money(ctx, player);
    this._topBar(ctx, scores, round, phase);
    this._killfeed(ctx);
    if (settings?.radar !== false) this._radar(ctx, player, window._game?.players || []);
    if (settings?.fps !== false)   this._fps(ctx);

    // Hurt vignette
    if (this.hurtA > 0) {
      const v = ctx.createRadialGradient(W/2, H/2, H*.15, W/2, H/2, H*.82);
      v.addColorStop(0, 'transparent');
      v.addColorStop(1, `rgba(200,0,0,${this.hurtA * .5})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      this.hurtA = Math.max(0, this.hurtA - 0.025);
    }

    // Dead overlay
    if (this.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#cc1111'; ctx.font = "bold 56px 'Bebas Neue'";
      ctx.textAlign = 'center';
      ctx.shadowBlur = 20; ctx.shadowColor = '#ff0000';
      ctx.fillText('YOU DIED', W/2, H/2 - 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#888'; ctx.font = "16px 'Share Tech Mono'";
      ctx.fillText('Waiting for round to end...', W/2, H/2 + 18);
    }

    if (ping) {
      const pc = ping < 80 ? '#00ff88' : ping < 150 ? '#ffcc00' : '#ff4400';
      ctx.fillStyle = pc; ctx.font = "10px 'Share Tech Mono'"; ctx.textAlign = 'right';
      ctx.fillText(`${ping}ms`, W - 6, 14);
    }

    if (this.hitM > 0) this.hitM -= 16;
  }

  _buyPhaseOverlay(ctx, timer) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(W/2 - 160, 72, 320, 38);
    ctx.fillStyle = '#ffcc00';
    ctx.font = "bold 14px 'Share Tech Mono'";
    ctx.textAlign = 'center';
    ctx.fillText(`⏳ BUY PHASE  ${Math.ceil(timer/1000)}s  —  press B to buy`, W/2, 96);
  }

  _crosshair(ctx, style, player) {
    const cx = W/2, cy = H/2;
    const c  = this.hitM > 0 ? '#ff4400' : 'rgba(110,255,150,0.92)';
    const spread = player.isMoving ? 4 : 0;
    ctx.save();
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.5;
    ctx.shadowBlur = 5; ctx.shadowColor = c;

    if (style === 'dot') {
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
    } else if (style === 'circle') {
      ctx.beginPath(); ctx.arc(cx, cy, 9 + spread, 0, Math.PI*2); ctx.stroke();
    } else {
      const g = 6 + spread, l = 8;
      ctx.beginPath();
      ctx.moveTo(cx-g-l, cy); ctx.lineTo(cx-g, cy);
      ctx.moveTo(cx+g,   cy); ctx.lineTo(cx+g+l, cy);
      ctx.moveTo(cx, cy-g-l); ctx.lineTo(cx, cy-g);
      ctx.moveTo(cx, cy+g);   ctx.lineTo(cx, cy+g+l);
      ctx.stroke();
      if (style === 'cross') { ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill(); }
    }
    ctx.restore();
  }

  _hp(ctx, p) {
    const x = 14, y = H - 54, w = 200, h = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x-2, y-2, w+4, h+22);
    const hc = p.hp > 50 ? '#00cc44' : p.hp > 25 ? '#ddaa00' : '#cc1111';
    ctx.fillStyle = hc; ctx.fillRect(x, y, w * (p.hp/100), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
    ctx.fillStyle = '#fff'; ctx.font = "bold 12px 'Share Tech Mono'"; ctx.textAlign='left';
    ctx.fillText(`♥ ${p.hp}`, x+5, y+13);
    if (p.armor > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x, y+20, w, 5);
      ctx.fillStyle = '#3377ff'; ctx.fillRect(x, y+20, w*(p.armor/100), 5);
    }
    // Grenades
    let gx = x;
    const gr = p.grenades || {};
    if (gr.nade  > 0) { ctx.fillStyle='#ffaa00'; ctx.font="11px 'Share Tech Mono'"; ctx.fillText(`💣×${gr.nade}`,  gx, y-9); gx+=58; }
    if (gr.smoke > 0) { ctx.fillStyle='#aaaaaa'; ctx.fillText(`💨×${gr.smoke}`, gx, y-9); gx+=58; }
    if (gr.flash > 0) { ctx.fillStyle='#ffffff'; ctx.fillText(`💡×${gr.flash}`, gx, y-9); }
  }

  _ammo(ctx, p) {
    const wd = p.wep, x = W - 14, y = H - 20;
    const aStr = wd.cur === Infinity ? '∞' : String(wd.cur).padStart(2, ' ');
    const maxA = WEAPONS[p.weapon]?.ammo;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x-105, y-32, 110, 38);
    ctx.fillStyle = wd.cur === 0 ? '#ff2200' : wd.cur <= 5 ? '#ffaa00' : '#ffffff';
    ctx.font = "bold 32px 'Share Tech Mono'"; ctx.textAlign='right';
    ctx.fillText(aStr, x, y);
    ctx.fillStyle = '#555'; ctx.font = "12px 'Share Tech Mono'";
    ctx.fillText(maxA === Infinity ? '' : `/${maxA}`, x - 55, y);
    ctx.fillStyle = '#aaa'; ctx.font = "10px 'Share Tech Mono'";
    ctx.fillText(WEAPONS[p.weapon]?.name || '', x, y - 20);
    if (p.reloading) {
      const prog = 1 - p.reloadTimer / ((WEAPONS[p.weapon]?.reload || 2) * 1000);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W*.32, H*.88, W*.36, 16);
      ctx.fillStyle = '#ffaa00'; ctx.fillRect(W*.32, H*.88, W*.36*prog, 16);
      ctx.fillStyle = '#fff'; ctx.font="11px 'Share Tech Mono'"; ctx.textAlign='center';
      ctx.fillText('RELOADING', W/2, H*.88+12);
    }
  }

  _money(ctx, p) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(12, H-82, 105, 20);
    ctx.fillStyle = '#ffcc00'; ctx.font = "bold 14px 'Share Tech Mono'"; ctx.textAlign='left';
    ctx.fillText(`$${p.money}`, 16, H-67);
    if (p.hasDefuse) { ctx.fillStyle='#00aaff'; ctx.font="10px 'Share Tech Mono'"; ctx.fillText('🔧 KIT', 16, H-56); }
  }

  _topBar(ctx, scores, round, phase) {
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(W/2 - 130, 2, 260, 55);
    ctx.strokeStyle = 'rgba(255,107,0,0.25)'; ctx.lineWidth=1;
    ctx.strokeRect(W/2-130, 2, 260, 55);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6644'; ctx.font = "bold 18px 'Bebas Neue'";
    ctx.fillText(`T  ${scores?.T || 0}`, W/2 - 35, 26);
    ctx.fillStyle = '#666'; ctx.fillText(':', W/2, 26);
    ctx.fillStyle = '#4488ff';
    ctx.fillText(`  ${scores?.CT || 0}  CT`, W/2 + 30, 26);

    if (phase === 'buy') {
      ctx.fillStyle = '#ffcc00'; ctx.font = "11px 'Share Tech Mono'";
      ctx.fillText('BUY PHASE', W/2, 45);
    } else {
      const sec = Math.max(0, Math.ceil((round.endTime - Date.now()) / 1000));
      ctx.fillStyle = sec <= 10 ? '#ff4400' : '#ffffff';
      ctx.font = "bold 22px 'Share Tech Mono'";
      ctx.fillText(`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`, W/2, 50);
    }
  }

  _killfeed(ctx) {
    const now = Date.now();
    let ky = 72;
    for (const kf of this.kf) {
      const age = now - kf.t;
      if (age > 5500) continue;
      const al = Math.min(1, (5500 - age) / 500);
      ctx.save(); ctx.globalAlpha = al;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W - 260, ky - 15, 252, 20);
      ctx.font = "bold 11px 'Share Tech Mono'"; ctx.textAlign='right';
      ctx.fillStyle = kf.k.team === 'T' ? '#ff9977' : '#77aaff';
      ctx.fillText(kf.k.name.substring(0, 10), W - 142, ky);
      ctx.fillStyle = '#888'; ctx.fillText(' ☠ ', W - 115, ky);
      ctx.fillStyle = kf.v.team === 'T' ? '#ff9977' : '#77aaff';
      ctx.fillText(kf.v.name.substring(0, 10), W - 14, ky);
      ctx.restore();
      ky += 23;
    }
  }

  _radar(ctx, p, players) {
    const rx = W - 108, ry = H - 108, rs = 96, sc = rs / 13;
    ctx.save();
    ctx.beginPath(); ctx.arc(rx, ry, rs/2, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fill(); ctx.clip();
    // Map
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const c = MAP[y][x];
        if (!c) continue;
        const col = c===2?'rgba(180,130,40,0.55)':c===3?'rgba(50,120,50,0.55)':c===4?'rgba(160,160,160,0.55)':'rgba(255,255,255,0.2)';
        ctx.fillStyle = col;
        ctx.fillRect(rx + (x - p.x) * sc, ry + (y - p.y) * sc, sc, sc);
      }
    // Players
    for (const pl of players) {
      if (!pl.alive) continue;
      const px2 = rx + (pl.x - p.x) * sc, py2 = ry + (pl.y - p.y) * sc;
      ctx.beginPath(); ctx.arc(px2, py2, pl.id === p.id ? 5 : 3.5, 0, Math.PI*2);
      ctx.fillStyle = pl.id === p.id ? '#fff' : pl.team === 'T' ? '#ff4400' : '#0088ff';
      ctx.fill();
      if (pl.id === p.id) {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px2, py2);
        ctx.lineTo(px2 + Math.cos(pl.angle)*9, py2 + Math.sin(pl.angle)*9);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(rx, ry, rs/2, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.stroke();
  }

  _fps(ctx) {
    if (!this._fpsData) this._fpsData = { fps: 60, last: performance.now() };
    const now = performance.now(), dt2 = now - this._fpsData.last;
    this._fpsData.last = now;
    this._fpsData.fps  = Math.round(0.88 * this._fpsData.fps + 0.12 * (1000 / Math.max(1, dt2)));
    const f = this._fpsData.fps;
    ctx.fillStyle = f > 50 ? '#00ff88' : f > 30 ? '#ffaa00' : '#ff2200';
    ctx.font = "10px 'Share Tech Mono'"; ctx.textAlign = 'right';
    ctx.fillText(`${f}fps`, W - 6, 26);
  }
}

// ── SCOREBOARD ─────────────────────────────────────────────
function renderScoreboard(ctx, players, visible) {
  if (!visible) return;
  const rows = players.length;
  const ph   = rows * 28 + 96;
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(W/2 - 280, 48, 560, ph);
  ctx.strokeStyle = 'rgba(255,107,0,0.3)'; ctx.lineWidth = 1;
  ctx.strokeRect(W/2 - 280, 48, 560, ph);

  ctx.fillStyle = '#fff'; ctx.font = "bold 15px 'Share Tech Mono'"; ctx.textAlign='center';
  ctx.fillText('SCOREBOARD', W/2, 74);

  // Header
  ctx.fillStyle = '#555'; ctx.font = "9px 'Share Tech Mono'";
  ctx.textAlign = 'right';
  ctx.fillText('K   D   $', W/2 + 275, 90);

  let y = 106;
  for (const team of ['CT', 'T']) {
    const pl = players.filter(p => p.team === team);
    ctx.fillStyle = team === 'T' ? '#ff6633' : '#3399ff';
    ctx.font = "bold 10px 'Share Tech Mono'"; ctx.textAlign = 'left';
    ctx.fillText(team === 'T' ? '── TERRORISTS ──' : '── COUNTER-TERRORISTS ──', W/2 - 268, y);
    y += 15;
    for (const p of pl) {
      ctx.fillStyle = p.isBot ? '#555' : (p.id === window._game?.localPlayer?.id ? '#ffcc00' : '#ccc');
      ctx.font = "12px 'Share Tech Mono'"; ctx.textAlign = 'left';
      ctx.fillText((p.isBot ? '[BOT] ' : '') + p.name.substring(0, 16), W/2 - 268, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${p.kills}   ${p.deaths}   $${p.money}`, W/2 + 275, y);
      y += 24;
    }
    y += 4;
  }
}

// ── INPUT ──────────────────────────────────────────────────
class Input {
  constructor() {
    this.keys   = {};
    this.mdx    = 0;
    this.mdy    = 0;
    this.mb     = false;
    this.locked = false;
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (['Tab','Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('mousemove', e => { if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; } });
    window.addEventListener('mousedown', e => { if (e.button === 0) this.mb = true; });
    window.addEventListener('mouseup',   e => { if (e.button === 0) this.mb = false; });
  }
  consume() { const r = { dx: this.mdx, dy: this.mdy }; this.mdx = 0; this.mdy = 0; return r; }
}

// ── AUDIO ──────────────────────────────────────────────────
class GameAudio {
  constructor() { try { this.ctx = new AudioContext(); } catch(e) { this.ctx = null; } }
  play(type) {
    if (!this.ctx) return;
    const ac = this.ctx, g = ac.createGain(); g.connect(ac.destination);
    if (type === 'shoot') {
      const b = ac.createBuffer(1, ac.sampleRate*.08, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i=0; i<d.length; i++) d[i] = (Math.random()*2-1)*Math.exp(-i/650)*.9;
      const s = ac.createBufferSource(); s.buffer = b;
      const f = ac.createBiquadFilter(); f.type='bandpass'; f.frequency.value=800; f.Q.value=.45;
      s.connect(f); f.connect(g); g.gain.setValueAtTime(.38, ac.currentTime); s.start();
    } else if (type === 'reload') {
      const o = ac.createOscillator(); o.type='square'; o.frequency.value=180;
      o.connect(g); g.gain.setValueAtTime(.07, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ac.currentTime+.13); o.start(); o.stop(ac.currentTime+.13);
    } else if (type === 'step') {
      const o = ac.createOscillator(); o.type='sine'; o.frequency.value=55;
      o.connect(g); g.gain.setValueAtTime(.065, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ac.currentTime+.07); o.start(); o.stop(ac.currentTime+.07);
    } else if (type === 'hit') {
      const b = ac.createBuffer(1, ac.sampleRate*.04, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i=0; i<d.length; i++) d[i] = (Math.random()*2-1)*.5*Math.exp(-i/300);
      const s = ac.createBufferSource(); s.buffer=b; s.connect(g);
      g.gain.setValueAtTime(.28, ac.currentTime); s.start();
    } else if (type === 'bomb') {
      const o = ac.createOscillator(); o.type='sine'; o.frequency.value=440;
      o.connect(g); g.gain.setValueAtTime(.14, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ac.currentTime+.28); o.start(); o.stop(ac.currentTime+.28);
    }
  }
}

// ══════════════════════════════════════════════════════════
//  MAIN GAME CLASS
// ══════════════════════════════════════════════════════════
class Game {
  constructor(canvas3d, canvasHud, fbConfig, settings) {
    this.c3d    = canvas3d;
    this.chd    = canvasHud;
    this.rc     = new Raycaster(canvas3d);
    this.hud    = new HUD(canvasHud);
    this.input  = new Input();
    this.audio  = new GameAudio();
    this.ac     = new AntiCheat();
    this.wv     = new WeaponView(canvas3d.getContext('2d'));
    this.settings = settings || {};

    this.localPlayer = null;
    this.players     = [];
    this.bots        = [];
    this.round       = { num:1, endTime: Date.now() + 115000 };
    this.scores      = { T:0, CT:0 };
    this.showSB      = false;
    this.modeCtrl    = null;
    this.gameMode    = 'bomb';

    // Round state: 'buy' | 'live' | 'end'
    this.phase       = 'buy';
    this.phaseTimer  = 15000;

    this.roundEndMsg = null;
    this.roundEndT   = 0;

    this.db = null; this.roomId = null; this.ping = 0;
    this.lastTime = 0; this.stepTimer = 0;

    if (fbConfig) this._initFb(fbConfig);
    window._game = this;
  }

  _initFb(cfg) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      this.db = firebase.database();
    } catch(e) {}
  }

  startSingleplayer(name, team, mode, diff) {
    this.gameMode = mode || 'bomb';
    const dc = {
      easy:   { ae: 0.18, rt: 550 },
      normal: { ae: 0.08, rt: 320 },
      hard:   { ae: 0.03, rt: 160 },
      expert: { ae: 0.01, rt:  70 },
    }[diff || 'normal'] || { ae: 0.08, rt: 320 };

    const t = team === 'AUTO' ? (['T','CT'][Math.random() > .5 ? 1 : 0]) : (team || 'T');
    this.localPlayer = new Player(name || 'Player', t, 0);
    // Give starter rifle
    const rifle = t === 'T' ? 'ak47' : 'm4a4';
    this.localPlayer.weapons[rifle] = { ammo: WEAPONS[rifle].ammo, cur: WEAPONS[rifle].ammo };
    this.localPlayer.weapon = rifle;
    this.players = [this.localPlayer];

    this.modeCtrl = mode==='bomb' ? new BombMode()
      : mode==='deathmatch' ? new DeathmatchMode()
      : mode==='ctf'        ? new CTFMode()
      : new ArmsRaceMode();

    // Spawn bots — 4 per team (including local player's team already has 1)
    let ti = 1, ci = 0;
    for (let i = 0; i < 9; i++) {
      const bt = i < 4 ? 'T' : 'CT';
      const bot = new Bot(`Bot_${i+1}`, bt, bt === t ? ti++ : ci++);
      bot.aimError = dc.ae; bot.reactionMs = dc.rt;
      this.bots.push(bot);
      this.players.push(bot);
    }

    if (this.modeCtrl.init) this.modeCtrl.init(this.players);
    this.phase      = 'buy';
    this.phaseTimer = 15000;
    this.round.endTime = Date.now() + 115000;

    this.gameLoop();
  }

  startMultiplayer(name, team, mode, roomId) {
    this.roomId   = roomId;
    this.gameMode = mode || 'bomb';
    const t = team || 'T';
    this.localPlayer = new Player(name || 'Player', t, 0);
    const rifle = t === 'T' ? 'ak47' : 'm4a4';
    this.localPlayer.weapons[rifle] = { ammo: WEAPONS[rifle].ammo, cur: WEAPONS[rifle].ammo };
    this.localPlayer.weapon = rifle;
    this.players = [this.localPlayer];
    this.modeCtrl = mode==='bomb' ? new BombMode() : mode==='deathmatch' ? new DeathmatchMode() : mode==='ctf' ? new CTFMode() : new ArmsRaceMode();

    if (this.db) {
      const ref = this.db.ref(`csrooms/${roomId}/players/${name}`);
      ref.set({ name, team:t, x:this.localPlayer.x, y:this.localPlayer.y, angle:this.localPlayer.angle, hp:100, alive:true, weapon:rifle, kills:0, deaths:0 });
      ref.onDisconnect().remove();
      this.db.ref(`csrooms/${roomId}/players`).on('value', snap => {
        const data = snap.val() || {};
        for (const [id, pd] of Object.entries(data)) {
          if (id === name) continue;
          let p = this.players.find(p => p.id === id);
          if (!p) { p = new Player(id, pd.team, 0); this.players.push(p); }
          Object.assign(p, pd);
        }
        const need = 10 - this.players.length;
        for (let i = this.bots.length; i < need; i++) {
          const b = new Bot(`Bot_${i}`, i%2===0?'T':'CT', i);
          this.bots.push(b); this.players.push(b);
        }
      });
      setInterval(() => { this.ping = 18 + Math.floor(Math.random() * 28); }, 2000);
    }

    this.phase = 'buy'; this.phaseTimer = 15000;
    this.gameLoop();
  }

  gameLoop(ts = 0) {
    const dt = Math.min(ts - this.lastTime, 50);
    this.lastTime = ts;
    this.update(dt);
    this.render();
    requestAnimationFrame(t => this.gameLoop(t));
  }

  update(dt) {
    // Grenade physics
    window._grenades = window._grenades.filter(g => { g.age += dt; return g.age < g.maxAge; });
    window._flashTimer = Math.max(0, (window._flashTimer || 0) - dt);

    // Phase timer
    if (this.phase === 'buy') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'live';
        // Close buy menu if open
        document.getElementById('bm')?.classList.remove('sh');
      }
    }

    // Round end countdown
    if (this.roundEndT > 0) {
      this.roundEndT -= dt;
      if (this.roundEndT <= 0) { this.roundEndMsg = null; this.nextRound(); }
      // Bots still update
      for (const b of this.bots) b.update(dt, this.players);
      return;
    }

    if (!this.localPlayer?.alive) {
      if (this.phase !== 'buy') for (const b of this.bots) b.update(dt, this.players);
      if (this.phase === 'live' && this.modeCtrl?.update) this.modeCtrl.update(dt, this.players, this);
      return;
    }

    const p   = this.localPlayer;
    const inp = this.input;

    // Mouse look
    const sens = (this.settings.sens || 8) * 0.00020;
    const { dx, dy } = inp.consume();
    p.angle += dx * sens;
    this.wv.addSway(dx, dy);

    // Keyboard rotation fallback
    if (inp.keys['ArrowLeft'])  p.angle -= 0.0028 * dt;
    if (inp.keys['ArrowRight']) p.angle += 0.0028 * dt;

    // Movement
    const crouching = inp.keys['ControlLeft'] || inp.keys['ControlRight'];
    const running   = inp.keys['ShiftLeft'] && !crouching;
    const spd = (crouching ? CROUCH_SPEED : running ? RUN_SPEED : WALK_SPEED) * dt;

    let mx = 0, my = 0;
    if (inp.keys['KeyW'] || inp.keys['ArrowUp'])   { mx += Math.cos(p.angle)*spd; my += Math.sin(p.angle)*spd; }
    if (inp.keys['KeyS'] || inp.keys['ArrowDown'])  { mx -= Math.cos(p.angle)*spd; my -= Math.sin(p.angle)*spd; }
    if (inp.keys['KeyA']) { mx += Math.cos(p.angle - Math.PI/2)*spd; my += Math.sin(p.angle - Math.PI/2)*spd; }
    if (inp.keys['KeyD']) { mx += Math.cos(p.angle + Math.PI/2)*spd; my += Math.sin(p.angle + Math.PI/2)*spd; }

    const r = PLAYER_RADIUS;
    if (isWalkable(p.x + mx + r * Math.sign(mx || .001), p.y) && isWalkable(p.x + mx - r * Math.sign(mx || .001), p.y)) p.x += mx;
    if (isWalkable(p.x, p.y + my + r * Math.sign(my || .001)) && isWalkable(p.x, p.y + my - r * Math.sign(my || .001))) p.y += my;

    p.isMoving  = Math.abs(mx) + Math.abs(my) > 0.001;
    p.crouching = crouching;

    // Footsteps
    if (p.isMoving && !crouching) {
      this.stepTimer += dt;
      if (this.stepTimer > 340) { this.stepTimer = 0; this.audio.play('step'); }
    }

    // Weapon slots
    if (inp.keys['Digit1']) p.weapon = 'knife';
    if (inp.keys['Digit2']) { const w = ['glock','usp','p250','deagle'].find(x => p.weapons[x]); if (w) p.weapon = w; }
    if (inp.keys['Digit3']) { const w = ['ak47','m4a4','sg553','aug','mac10','mp9'].find(x => p.weapons[x]); if (w) p.weapon = w; }
    if (inp.keys['Digit4']) { const w = ['awp','scout'].find(x => p.weapons[x]); if (w) p.weapon = w; }

    // Grenades
    if (inp.keys['Digit5'] && (p.grenades?.nade||0)>0  && !inp.keys['_g5']) { throwGrenade(p,'nade');  inp.keys['_g5']=true; }
    if (inp.keys['Digit6'] && (p.grenades?.smoke||0)>0 && !inp.keys['_g6']) { throwGrenade(p,'smoke'); inp.keys['_g6']=true; }
    if (inp.keys['Digit7'] && (p.grenades?.flash||0)>0 && !inp.keys['_g7']) { throwGrenade(p,'flash'); inp.keys['_g7']=true; }
    if (!inp.keys['Digit5']) inp.keys['_g5'] = false;
    if (!inp.keys['Digit6']) inp.keys['_g6'] = false;
    if (!inp.keys['Digit7']) inp.keys['_g7'] = false;

    // Plant bomb (only in live phase)
    if (inp.keys['KeyE'] && this.modeCtrl instanceof BombMode && p.hasBomb) {
      if (this.modeCtrl.tryPlant(p)) this.audio.play('bomb');
    }

    // Reload
    if (inp.keys['KeyR'] && !p.reloading) this._reload(p);
    if (p.reloadTimer > 0) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        p.reloading = false;
        if (WEAPONS[p.weapon]) p.wep.cur = WEAPONS[p.weapon].ammo;
      }
    }

    // Shoot (only in live phase)
    p.shootTimer = Math.max(0, p.shootTimer - dt);
    const wi = WEAPONS[p.weapon];
    const canShoot = inp.mb && !p.reloading && p.shootTimer <= 0
      && (p.wep?.cur > 0 || p.wep?.cur === Infinity);
    if (canShoot && (wi?.auto || inp.keys['_ms'] !== inp.mb)) {
      inp.keys['_ms'] = inp.mb;
      this._shoot(p);
    }
    if (!inp.mb) inp.keys['_ms'] = false;

    this.showSB = !!inp.keys['Tab'];

    this.ac.tick(p, dt);
    this.wv.update(dt, p.isMoving, false);

    if (this.phase !== 'buy') {
      for (const b of this.bots) b.update(dt, this.players);
    }
    if (this.phase === 'live' && this.modeCtrl?.update) this.modeCtrl.update(dt, this.players, this);

    // Firebase sync
    if (this.db && this.roomId && Date.now() % 55 < 18) {
      this.db.ref(`csrooms/${this.roomId}/players/${p.id}`).update({
        x:p.x, y:p.y, angle:p.angle, hp:p.hp, alive:p.alive, weapon:p.weapon, kills:p.kills, deaths:p.deaths
      });
    }
  }

  _shoot(p) {
    const wi = WEAPONS[p.weapon];
    if (!wi || !p.wep) return;
    if (p.wep.cur <= 0 && p.wep.cur !== Infinity) { this._reload(p); return; }
    if (p.wep.cur !== Infinity) p.wep.cur--;
    p.shootTimer = 60000 / wi.rpm;
    if (this.settings.sound !== false) this.audio.play('shoot');
    this.wv.onShoot();

    // Spread: more when moving, less when crouching
    const spreadMul = p.isMoving ? 2.2 : p.crouching ? 0.35 : 1;
    const spread    = wi.spread * spreadMul * (Math.random() - 0.5) * 2;
    const sa        = p.angle + spread;
    const cos       = Math.cos(sa), sin = Math.sin(sa);

    for (const t of this.players) {
      if (!t.alive || t.id === p.id || t.team === p.team) continue;
      const ddx = t.x - p.x, ddy = t.y - p.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > wi.range) continue;
      const dot = (ddx*cos + ddy*sin) / dist;
      if (dot < 0.965) continue;
      // Line-of-sight
      let blocked = false;
      const steps = Math.ceil(dist * 7);
      for (let s = 1; s < steps; s++) {
        if (!isWalkable(p.x + cos*(s/steps*dist), p.y + sin*(s/steps*dist))) { blocked=true; break; }
      }
      if (blocked) continue;
      const hs  = Math.random() < 0.12 && dist < 7 ? 2.0 : 1.0;
      const dmg = wi.dmg * (0.8 + Math.random() * 0.4) * (1 - dist / wi.range * 0.3) * hs;
      t.takeDamage(dmg, p);
      if (this.settings.sound !== false) this.audio.play('hit');
      break;
    }
  }

  _reload(p) {
    if (p.reloading || WEAPONS[p.weapon]?.ammo === Infinity) return;
    p.reloading   = true;
    p.reloadTimer = (WEAPONS[p.weapon]?.reload || 2) * 1000;
    if (this.settings.sound !== false) this.audio.play('reload');
  }

  roundEnd(team, msg) {
    if (this.roundEndMsg) return;
    this.roundEndMsg = msg;
    this.roundEndT   = 5000;
    this.phase       = 'end';
    this.scores[team] = (this.scores[team] || 0) + 1;
    for (const p of this.players)
      p.money = Math.min(16000, p.money + (p.team === team ? 3250 : 1400));
  }

  nextRound() {
    this.round.num++;
    this.round.endTime = Date.now() + 115000;
    this.phase       = 'buy';
    this.phaseTimer  = 15000;

    let ti = 0, ci = 0;
    for (const p of this.players) {
      const si = p.team === 'T' ? ti++ : ci++;
      const sp = getSpawn(p.team, si);
      p.x         = sp.x; p.y = sp.y;
      p.angle     = p.team === 'T' ? 0.4 : Math.PI + 0.4;
      p.hp        = 100;
      p.armor     = 0;
      p.alive     = true;
      p.reloading = false; p.reloadTimer = 0; p.shootTimer = 0;
      p.hasBomb   = false; p.hasFlag    = false;
      // Reload weapons
      for (const wd of Object.values(p.weapons)) if (wd.cur !== Infinity) wd.cur = wd.ammo;
    }

    this.hud.dead = false;
    if (this.modeCtrl?.init) this.modeCtrl.init(this.players);
  }

  render() {
    if (!this.localPlayer) return;
    const ctx3 = this.c3d.getContext('2d');

    this.rc.render(this.localPlayer, this.players);

    // Smoke effect
    for (const g of window._grenades) {
      if (g.type !== 'smoke') continue;
      const dx = g.x - this.localPlayer.x, dy = g.y - this.localPlayer.y;
      const d  = Math.hypot(dx, dy);
      if (d < 5.5) {
        const age   = g.age;
        const maxA  = g.maxAge;
        const fade  = age < 400 ? age/400 : age > maxA-800 ? (maxA-age)/800 : 1;
        const alpha = Math.min(0.72, (1 - d/5.5) * 0.82) * fade;
        ctx3.fillStyle = `rgba(190,190,190,${alpha})`;
        ctx3.fillRect(0, 0, W, H);
      }
    }

    // Flash
    if (window._flashTimer > 0) {
      ctx3.fillStyle = `rgba(255,255,255,${Math.min(1, window._flashTimer / 170)})`;
      ctx3.fillRect(0, 0, W, H);
    }

    // Weapon view model (only when alive)
    if (this.localPlayer.alive) {
      this.wv.draw(this.localPlayer.weapon, this.localPlayer.crouching);
    }

    // HUD
    this.hud.render(
      this.localPlayer, this.round, this.scores, this.ping,
      this.settings, this.phase, this.phaseTimer
    );

    // Scoreboard
    const hctx = this.chd.getContext('2d');
    renderScoreboard(hctx, this.players, this.showSB);

    // Mode-specific HUD
    this._modeHUD(ctx3);

    // Round end banner
    if (this.roundEndMsg) {
      ctx3.fillStyle = 'rgba(0,0,0,0.78)';
      ctx3.fillRect(W/2 - 220, H/2 - 48, 440, 88);
      ctx3.strokeStyle = 'rgba(255,107,0,.4)'; ctx3.lineWidth = 1;
      ctx3.strokeRect(W/2 - 220, H/2 - 48, 440, 88);
      ctx3.fillStyle = '#ffcc00'; ctx3.font = "bold 28px 'Bebas Neue'"; ctx3.textAlign='center';
      ctx3.shadowBlur = 12; ctx3.shadowColor = '#ff8800';
      ctx3.fillText(this.roundEndMsg, W/2, H/2 - 8);
      ctx3.shadowBlur = 0;
      ctx3.fillStyle = '#888'; ctx3.font = "13px 'Share Tech Mono'";
      ctx3.fillText(`Score  T ${this.scores.T} : ${this.scores.CT} CT  — Next round...`, W/2, H/2 + 22);
    }
  }

  _modeHUD(ctx) {
    ctx.textAlign = 'center';

    if (this.modeCtrl instanceof BombMode) {
      const b = this.modeCtrl.bomb;
      if (b?.planted) {
        const s = Math.ceil(b.timer / 1000);
        ctx.fillStyle = s <= 10 ? '#ff2200' : '#ffaa00';
        ctx.font = "bold 28px 'Share Tech Mono'";
        ctx.fillText(`💣  ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`, W/2, H - 82);
        if (b.defuse > 0) {
          ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(W/2 - 95, H-72, 190, 12);
          ctx.fillStyle = this.localPlayer.hasDefuse ? '#00ff88' : '#00aaff';
          ctx.fillRect(W/2 - 95, H-72, 190 * b.defuse, 12);
          ctx.fillStyle = '#fff'; ctx.font = "10px 'Share Tech Mono'";
          ctx.fillText('DEFUSING — hold E', W/2, H - 62);
        }
      }
      if (this.localPlayer?.hasBomb) {
        ctx.fillStyle = '#ffcc00'; ctx.font = "12px 'Share Tech Mono'";
        ctx.fillText('💣  BOMB CARRIER  —  press E at SITE A (top-left) or SITE B (bottom-right)', W/2, H - 18);
      }
    }

    if (this.modeCtrl instanceof CTFMode) {
      if (this.localPlayer?.hasFlag) {
        ctx.fillStyle = '#ffcc00'; ctx.font = "12px 'Share Tech Mono'";
        ctx.fillText('🚩  YOU HAVE THE FLAG — return to your base!', W/2, H - 18);
      }
      const s = this.modeCtrl.scores;
      ctx.font = "12px 'Share Tech Mono'";
      ctx.fillStyle = '#ff6644'; ctx.textAlign='left';
      ctx.fillText(`T 🚩 ${s.T}/${this.modeCtrl.target}`, 10, H - 18);
      ctx.fillStyle = '#44aaff'; ctx.textAlign='right';
      ctx.fillText(`CT 🚩 ${s.CT}/${this.modeCtrl.target}`, W - 10, H - 18);
    }

    if (this.modeCtrl instanceof ArmsRaceMode) {
      const pr  = this.modeCtrl.prog[this.localPlayer?.id] || 0;
      const wn  = WEAPONS[ARMS_CHAIN[pr]]?.name || '';
      ctx.fillStyle = '#ffcc00'; ctx.font = "11px 'Share Tech Mono'"; ctx.textAlign='right';
      ctx.fillText(`Arms Race  ${pr+1}/${ARMS_CHAIN.length}  current: ${wn}`, W - 10, H - 18);
    }
  }
}

window.Game = Game;
