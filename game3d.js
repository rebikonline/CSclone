'use strict';
// ═══════════════════════════════════════════════════════════
//  CS•BROWSER 3D  —  Three.js engine
//  Real 3D, proper player models, de_dust2 style map
// ═══════════════════════════════════════════════════════════

const W = 960, H = 540;

// ── WEAPONS ────────────────────────────────────────────────
const WEAPONS = {
  knife:  {name:'Knife',    team:'*', price:0,    dmg:85,  rpm:60,   ammo:Infinity, reload:0.8, spread:0,     range:1.8, auto:false},
  glock:  {name:'Glock-18', team:'T', price:200,  dmg:25,  rpm:400,  ammo:20,       reload:2.0, spread:0.024, range:14,  auto:true },
  usp:    {name:'USP-S',    team:'CT',price:300,  dmg:34,  rpm:400,  ammo:12,       reload:2.2, spread:0.010, range:16,  auto:false},
  p250:   {name:'P250',     team:'*', price:300,  dmg:38,  rpm:400,  ammo:13,       reload:2.2, spread:0.016, range:14,  auto:false},
  deagle: {name:'Deagle',   team:'*', price:700,  dmg:63,  rpm:267,  ammo:7,        reload:2.2, spread:0.022, range:22,  auto:false},
  mac10:  {name:'MAC-10',   team:'T', price:1050, dmg:29,  rpm:800,  ammo:30,       reload:2.0, spread:0.028, range:10,  auto:true },
  mp9:    {name:'MP9',      team:'CT',price:1250, dmg:26,  rpm:857,  ammo:30,       reload:2.1, spread:0.022, range:12,  auto:true },
  ak47:   {name:'AK-47',    team:'T', price:2700, dmg:36,  rpm:600,  ammo:30,       reload:2.5, spread:0.016, range:22,  auto:true },
  m4a4:   {name:'M4A4',     team:'CT',price:3100, dmg:33,  rpm:666,  ammo:30,       reload:3.1, spread:0.013, range:22,  auto:true },
  awp:    {name:'AWP',      team:'*', price:4750, dmg:115, rpm:41,   ammo:10,       reload:3.7, spread:0.001, range:55,  auto:false},
  scout:  {name:'SSG 08',   team:'*', price:1700, dmg:75,  rpm:100,  ammo:10,       reload:3.0, spread:0.004, range:42,  auto:false},
};
window.WEAPONS = WEAPONS;

// ── PLAYER DATA ─────────────────────────────────────────────
const SPAWNS_T  = [{x:-18,z:-18},{x:-16,z:-18},{x:-18,z:-16},{x:-14,z:-18},{x:-18,z:-14}];
const SPAWNS_CT = [{x:18, z:18}, {x:16, z:18}, {x:18, z:16}, {x:14, z:18}, {x:18, z:14}];
function getSpawn(team, idx) {
  const a = team==='T' ? SPAWNS_T : SPAWNS_CT;
  return a[idx % a.length];
}

class PlayerData {
  constructor(id, team, spawnIdx) {
    const sp = getSpawn(team, spawnIdx);
    this.id=id; this.team=team;
    this.x=sp.x; this.z=sp.z; this.y=0;
    this.angle = team==='T' ? 0 : Math.PI;
    this.hp=100; this.armor=0; this.hasHelmet=false; this.hasDefuse=false;
    this.money=800;
    const startWep = team==='T' ? 'glock' : 'usp';
    this.weapon=startWep;
    this.weapons={
      knife:{cur:Infinity,ammo:Infinity},
      [startWep]:{cur:WEAPONS[startWep].ammo, ammo:WEAPONS[startWep].ammo}
    };
    this.kills=0; this.deaths=0; this.alive=true;
    this.name=id; this.isBot=false;
    this.reloading=false; this.reloadTimer=0; this.shootTimer=0;
    this.grenades={nade:0,smoke:0,flash:0};
    this.hasBomb=false; this.hasFlag=false;
    this.velX=0; this.velZ=0; this.isMoving=false;
  }
  get wep(){ return this.weapons[this.weapon]||this.weapons.knife; }
  get wepInfo(){ return WEAPONS[this.weapon]||WEAPONS.knife; }
}

PlayerData.prototype.takeDamage = function(dmg, by) {
  if (!this.alive) return;
  if (by?.id === this.id) return;
  const abs = this.armor>0 ? Math.min(this.armor, dmg*(this.hasHelmet?.35:.5)) : 0;
  this.armor = Math.max(0, this.armor - abs*2.5);
  this.hp    = Math.max(0, Math.round(this.hp - (dmg-abs)));
  const g = window._game;
  if (by?.id === g?.local?.id) g.hud.flashHit();
  if (this.id === g?.local?.id) g.hud.flashHurt(dmg);
  if (this.hp <= 0) {
    this.alive=false; this.deaths++;
    if (by) { by.kills++; g?.hud?.addKill(by,this); g?.mode?.onKill?.(by,this); }
    g?.mode?.onDeath?.(this);
  }
};

// ── BOT AI ──────────────────────────────────────────────────
const BOT_NAMES=['xX_Ruslan_Xx','QuickDraw99','NomadSniper','SilentKiller','Rush_B_Pro','IronWall','GhostShot','VodkaWarrior','SashaGOAT','DarkAngel'];

class Bot extends PlayerData {
  constructor(id, team, idx) {
    super(id, team, idx);
    this.isBot=true;
    this.name=BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)];
    const w=team==='T'?'ak47':'m4a4';
    this.weapon=w; this.weapons[w]={cur:WEAPONS[w].ammo,ammo:WEAPONS[w].ammo};
    this.aimErr=0.08; this.reactionMs=320; this.reactionT=0;
    this.state='patrol'; this.target=null; this.lastSeen=null;
    this.patrolPts=this._genPatrol(); this.patrolIdx=0;
    this.stuckT=0; this.lastBotPos={x:this.x,z:this.z};
    this.strafeDir=1; this.strafeT=0;
  }
  _genPatrol() {
    const pts=[];
    for(let i=0;i<8;i++) {
      pts.push({x:(Math.random()-0.5)*36, z:(Math.random()-0.5)*36});
    }
    return pts;
  }
  canSee(target, scene) {
    const dx=target.x-this.x, dz=target.z-this.z;
    const dist=Math.hypot(dx,dz);
    if(dist>16) return false;
    // Simple raycast check against wall meshes
    const dir=new THREE.Vector3(dx/dist, 0, dz/dist);
    const origin=new THREE.Vector3(this.x, 0.5, this.z);
    const ray=new THREE.Raycaster(origin, dir, 0, dist-0.3);
    const hits=ray.intersectObjects(scene.wallMeshes||[], false);
    return hits.length===0;
  }
  update(dt, players, scene) {
    if(!this.alive) return;
    this.shootTimer=Math.max(0,this.shootTimer-dt);
    this.reactionT=Math.max(0,this.reactionT-dt);
    this.strafeT=Math.max(0,this.strafeT-dt);
    if(this.strafeT<=0){this.strafeDir*=-1; this.strafeT=700+Math.random()*1100;}
    // Stuck
    this.stuckT+=dt;
    if(this.stuckT>700){
      const dd=Math.hypot(this.x-this.lastBotPos.x, this.z-this.lastBotPos.z);
      if(dd<0.08) this.angle+=(Math.random()-.5)*Math.PI*1.5;
      this.stuckT=0; this.lastBotPos={x:this.x,z:this.z};
    }
    // Find enemy
    let nearest=null, nearD=Infinity;
    for(const p of players){
      if(!p.alive||p.team===this.team||p.id===this.id) continue;
      const d=Math.hypot(p.x-this.x, p.z-this.z);
      if(d<nearD&&this.canSee(p,scene)){nearest=p;nearD=d;}
    }
    if(nearest&&!this.target) this.reactionT=this.reactionMs;
    this.target=nearest;
    if(this.target) this.lastSeen={x:this.target.x,z:this.target.z};

    const spd=0.009*dt;
    if(this.target&&this.reactionT<=0){
      const ta=Math.atan2(this.target.x-this.x, this.target.z-this.z);
      const ae=(Math.random()-.5)*this.aimErr*2;
      let da=ta+ae-this.angle; while(da>Math.PI)da-=Math.PI*2; while(da<-Math.PI)da+=Math.PI*2;
      this.angle+=da*0.18;
      // Strafe
      const sa=this.angle+Math.PI/2*this.strafeDir;
      this._move(Math.sin(sa)*spd*0.55, Math.cos(sa)*spd*0.55, scene);
      if(this.shootTimer<=0&&!this.reloading) this._shoot(players);
    } else if(this.lastSeen){
      const ta=Math.atan2(this.lastSeen.x-this.x, this.lastSeen.z-this.z);
      let da=ta-this.angle; while(da>Math.PI)da-=Math.PI*2; while(da<-Math.PI)da+=Math.PI*2;
      this.angle+=da*0.1;
      this._move(Math.sin(this.angle)*spd, Math.cos(this.angle)*spd, scene);
      if(Math.hypot(this.x-this.lastSeen.x,this.z-this.lastSeen.z)<0.5) this.lastSeen=null;
    } else {
      const pt=this.patrolPts[this.patrolIdx%this.patrolPts.length];
      const ta=Math.atan2(pt.x-this.x,pt.z-this.z);
      let da=ta-this.angle; while(da>Math.PI)da-=Math.PI*2; while(da<-Math.PI)da+=Math.PI*2;
      this.angle+=da*0.09;
      this._move(Math.sin(this.angle)*spd,Math.cos(this.angle)*spd,scene);
      if(Math.hypot(this.x-pt.x,this.z-pt.z)<0.6) this.patrolIdx++;
    }
    if(this.wep.cur<=0&&!this.reloading) this._reload();
    if(this.reloadTimer>0){this.reloadTimer-=dt;if(this.reloadTimer<=0){this.reloading=false;this.wep.cur=WEAPONS[this.weapon]?.ammo||30;}}
    this.isMoving=true;
  }
  _move(dx,dz,scene){
    const nx=this.x+dx, nz=this.z+dz;
    if(!scene.collides(nx,this.z,0.3)) this.x=nx;
    if(!scene.collides(this.x,nz,0.3)) this.z=nz;
  }
  _shoot(players){
    const wi=WEAPONS[this.weapon]; if(!wi||this.wep.cur<=0) return;
    this.wep.cur--; this.shootTimer=60000/wi.rpm;
    if(this.target&&Math.random()<(this.target.isMoving?.55:.72)){
      const dist=Math.hypot(this.target.x-this.x,this.target.z-this.z);
      this.target.takeDamage(wi.dmg*(0.75+Math.random()*.5)*(1-dist/wi.range*.3),this);
    }
  }
  _reload(){this.reloading=true;this.reloadTimer=(WEAPONS[this.weapon]?.reload||2)*1000;}
}

// ── 3D SCENE BUILDER ────────────────────────────────────────
class GameScene {
  constructor(threeScene) {
    this.scene=threeScene;
    this.wallMeshes=[];
    this.colBoxes=[];
    this._build();
  }

  _box(w,h,d,x,y,z,color,receiveShadow=true,castShadow=true) {
    const geo=new THREE.BoxGeometry(w,h,d);
    const mat=new THREE.MeshLambertMaterial({color});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(x,y,z);
    mesh.receiveShadow=receiveShadow;
    mesh.castShadow=castShadow;
    this.scene.add(mesh);
    return mesh;
  }

  _wall(w,h,d,x,y,z,color=0x8B7355) {
    const m=this._box(w,h,d,x,y+h/2,z,color);
    this.wallMeshes.push(m);
    this.colBoxes.push({x,z,w:w/2,d:d/2});
    return m;
  }

  _crate(x,z,size=1.2) {
    const m=this._box(size,size,size,x,size/2,z,0x8B6914);
    // Wood grain lines
    this.wallMeshes.push(m);
    this.colBoxes.push({x,z,w:size/2,d:size/2});
    return m;
  }

  collides(x,z,r) {
    for(const b of this.colBoxes) {
      if(Math.abs(x-b.x)<b.w+r && Math.abs(z-b.z)<b.d+r) return true;
    }
    return false;
  }

  _build() {
    const S = this.scene;
    const sz=42; // map half-size

    // ── FLOOR ──
    const floorGeo=new THREE.PlaneGeometry(sz*2,sz*2,40,40);
    const floorMat=new THREE.MeshLambertMaterial({color:0xC2A870});
    const floor=new THREE.Mesh(floorGeo,floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    S.add(floor);

    // Floor tiles pattern
    const tileGeo=new THREE.PlaneGeometry(sz*2,sz*2);
    const tileCv=document.createElement('canvas'); tileCv.width=tileCv.height=512;
    const tCtx=tileCv.getContext('2d');
    const ts=32;
    for(let ty=0;ty<512/ts;ty++) for(let tx=0;tx<512/ts;tx++) {
      tCtx.fillStyle=(tx+ty)%2===0?'#C2A870':'#B8996A';
      tCtx.fillRect(tx*ts,ty*ts,ts,ts);
      tCtx.strokeStyle='rgba(0,0,0,0.1)'; tCtx.strokeRect(tx*ts,ty*ts,ts,ts);
    }
    const tileTex=new THREE.CanvasTexture(tileCv);
    tileTex.repeat.set(8,8); tileTex.wrapS=tileTex.wrapT=THREE.RepeatWrapping;
    floorMat.map=tileTex; floorMat.needsUpdate=true;

    // ── OUTER WALLS ──
    const wh=4, wt=1;
    this._wall(sz*2,wh,wt,  0,0,  sz);  // north
    this._wall(sz*2,wh,wt,  0,0, -sz);  // south
    this._wall(wt,  wh,sz*2, sz,0,  0); // east
    this._wall(wt,  wh,sz*2,-sz,0,  0); // west

    // ── CEILING tiles (partial — only spawn areas covered) ──
    const ceilMat=new THREE.MeshLambertMaterial({color:0x6B8CAE, side:THREE.BackSide});

    // ── INTERIOR — de_dust2 inspired layout ──
    // Long A walls
    this._wall(14,wh,wt, -14,0,-8, 0x8B7355);  // long left
    this._wall(14,wh,wt,  14,0,-8, 0x8B7355);  // long right
    this._wall(wt, wh,10, -7,0,-3, 0x8B7355);  // connector left
    this._wall(wt, wh,10,  7,0,-3, 0x8B7355);  // connector right

    // Mid walls
    this._wall(8,wh,wt,  0,0,  0, 0x9B7A52);
    this._wall(8,wh,wt,  0,0, -16, 0x9B7A52);
    this._wall(wt,wh,8,  -12,0,-8, 0x9B7A52);
    this._wall(wt,wh,8,   12,0,-8, 0x9B7A52);

    // Tunnel / B site walls
    this._wall(10,wh,wt, -8,0, 8, 0x7A6B4F);
    this._wall(10,wh,wt,  8,0, 8, 0x7A6B4F);
    this._wall(wt,wh,10, -3,0,13, 0x7A6B4F);
    this._wall(wt,wh,10,  3,0,13, 0x7A6B4F);

    // A site boxes
    this._crate(-6,-4, 1.2);  this._crate(-4.5,-4,1.2);
    this._crate(-6,-2.5,1.2); this._crate(6,-4,1.2);
    this._crate(4.5,-4,1.2);

    // B site boxes
    this._crate(-8,10,1.2); this._crate(-6.5,10,1.2);
    this._crate(8,10,1.2);  this._crate(6.5,10,1.2);
    this._crate(8,11.5,1.2);

    // Mid boxes / cover
    this._crate(-2,0,1.0); this._crate(2,0,1.0);
    this._crate(-10,0,1.0); this._crate(10,0,1.0);
    this._crate(0,-10,1.2); this._crate(0,10,1.2);

    // T spawn walls (left-top corner)
    this._wall(12,wh,wt, -30,0,-30, 0x6B5335);
    this._wall(wt,wh,12, -24,0,-30, 0x6B5335);
    // CT spawn walls (right-bottom corner)
    this._wall(12,wh,wt,  30,0, 30, 0x4A6741);
    this._wall(wt,wh,12,  24,0, 30, 0x4A6741);

    // Pillars
    for(const [px,pz] of [[-15,-15],[15,-15],[-15,15],[15,15]]) {
      const pillar=this._box(1.5,wh,1.5,px,wh/2,pz,0x888888);
      this.wallMeshes.push(pillar);
      this.colBoxes.push({x:px,z:pz,w:0.75,d:0.75});
    }

    // ── SITE MARKERS (flat on floor) ──
    const mkGeo=new THREE.PlaneGeometry(4,4);
    const mkMatA=new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:0.25});
    const mkMatB=new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:0.25});
    const mA=new THREE.Mesh(mkGeo,mkMatA); mA.rotation.x=-Math.PI/2; mA.position.set(-5,-5,0.01); S.add(mA);
    const mB=new THREE.Mesh(mkGeo,mkMatB); mB.rotation.x=-Math.PI/2; mB.position.set(5,0.01,12); S.add(mB);

    // Site A / B labels
    this._siteLabel('A',-5,0.05,-5,0xffcc00);
    this._siteLabel('B', 5,0.05,12,0xffcc00);

    // Spawn zone indicators
    this._spawnZone(-18,-18,0xff4400,'T'); // T spawn
    this._spawnZone( 18, 18,0x0044ff,'CT'); // CT spawn
  }

  _siteLabel(letter,x,y,z,color) {
    // Small floating text mesh (canvas texture)
    const cv=document.createElement('canvas'); cv.width=128;cv.height=128;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='rgba(255,200,0,0.9)'; ctx.font='bold 96px Arial';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(letter,64,64);
    const tex=new THREE.CanvasTexture(cv);
    const geo=new THREE.PlaneGeometry(2,2);
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(x,2,z); mesh.rotation.x=-Math.PI/2;
    this.scene.add(mesh);
  }

  _spawnZone(x,z,color,label) {
    const geo=new THREE.PlaneGeometry(8,8);
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.15});
    const m=new THREE.Mesh(geo,mat); m.rotation.x=-Math.PI/2; m.position.set(x,0.02,z);
    this.scene.add(m);
    // Border
    const edges=new THREE.EdgesGeometry(new THREE.BoxGeometry(8,0.05,8));
    const eLine=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color,opacity:0.5,transparent:true}));
    eLine.position.set(x,0.02,z); this.scene.add(eLine);
  }
}

// ── PLAYER 3D MODEL ─────────────────────────────────────────
function createPlayerModel(team, isLocal=false) {
  const grp = new THREE.Group();
  const tc = team==='T' ? 0xcc3300 : 0x003399;
  const dark = team==='T' ? 0x882200 : 0x002288;
  const pants = team==='T' ? 0x442200 : 0x001155;
  const skin = 0xC09070;
  const gear = team==='T' ? 0x1a1a00 : 0x001122;

  const L=m=>new THREE.MeshLambertMaterial({color:m});

  // Head
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6),L(skin));
  head.position.y=1.55; head.castShadow=true; grp.add(head);
  // Helmet
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.24,8,4,0,Math.PI*2,0,Math.PI*0.55),L(gear));
  helm.position.y=1.62; helm.castShadow=true; grp.add(helm);
  // Visor
  const visor=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.07,0.05),L(0x111111));
  visor.position.set(0,1.54,0.21); grp.add(visor);
  // Eyes
  for(const ex of [-0.08,0.08]) {
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.04,4,4),L(0xffffff));
    eye.position.set(ex,1.56,0.19); grp.add(eye);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.025,4,4),L(0x000000));
    pupil.position.set(ex,1.56,0.22); grp.add(pupil);
  }
  // Neck
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.15,6),L(skin));
  neck.position.y=1.38; grp.add(neck);
  // Torso
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.65,0.7,0.3),L(tc));
  torso.position.y=0.95; torso.castShadow=true; grp.add(torso);
  // Vest/armor overlay
  const vest=new THREE.Mesh(new THREE.BoxGeometry(0.68,0.65,0.32),L(dark));
  vest.position.y=0.98; grp.add(vest);
  // Belt
  const belt=new THREE.Mesh(new THREE.BoxGeometry(0.68,0.08,0.32),L(0x222222));
  belt.position.y=0.62; grp.add(belt);
  // Arms
  for(const [side,rx] of [[-1,-0.42],[1,0.42]]) {
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.09,0.35,6),L(tc));
    upper.position.set(rx,0.98,0); upper.castShadow=true; grp.add(upper);
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.08,0.32,6),L(gear));
    lower.position.set(rx,0.70,0.05); lower.castShadow=true; grp.add(lower);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(0.09,6,4),L(skin));
    hand.position.set(rx,0.54,0.06); grp.add(hand);
  }
  // Legs
  for(const lx of [-0.16, 0.16]) {
    const thigh=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.10,0.38,6),L(pants));
    thigh.position.set(lx,0.38,0); thigh.castShadow=true; grp.add(thigh);
    const shin=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.08,0.35,6),L(pants));
    shin.position.set(lx,0.06,0); shin.castShadow=true; grp.add(shin);
    const boot=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.1,0.28),L(0x111111));
    boot.position.set(lx,-0.1,0.04); boot.castShadow=true; grp.add(boot);
  }
  // Weapon (AK-style silhouette)
  const wGrp=new THREE.Group();
  // Body
  const wBody=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.08,0.07),L(0x5a4010));
  wBody.position.set(-0.22,0,0); wGrp.add(wBody);
  // Barrel
  const wBarrel=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.35,6),L(0x222222));
  wBarrel.rotation.z=Math.PI/2; wBarrel.position.set(-0.58,0,0); wGrp.add(wBarrel);
  // Mag
  const wMag=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.2,0.06),L(0x111111));
  wMag.position.set(-0.1,-0.14,0); wGrp.add(wMag);
  // Stock
  const wStock=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.06,0.06),L(0x3a2010));
  wStock.position.set(0.15,0,0); wGrp.add(wStock);
  wGrp.position.set(0.25,0.62,0.2);
  wGrp.rotation.y=Math.PI/2;
  grp.add(wGrp);

  // Name label (canvas texture)
  const labelGroup=new THREE.Group();
  grp.add(labelGroup);
  grp.userData.labelGroup=labelGroup;
  grp.userData.team=team;
  grp.userData.wGrp=wGrp;
  return grp;
}

function makeNameLabel(name, team, hp) {
  const cv=document.createElement('canvas'); cv.width=256; cv.height=48;
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,256,48);
  // HP bar background
  ctx.fillStyle='rgba(0,0,0,0.55)';
  ctx.fillRect(8,28,240,10);
  // HP bar fill
  ctx.fillStyle=hp>50?'#00ee44':hp>25?'#ffaa00':'#ff2200';
  ctx.fillRect(8,28,Math.round(240*(hp/100)),10);
  // Name
  ctx.fillStyle=team==='T'?'#ffaa88':'#88aaff';
  ctx.font='bold 20px Arial'; ctx.textAlign='center';
  ctx.fillText(name.substring(0,14),128,22);
  const tex=new THREE.CanvasTexture(cv);
  const geo=new THREE.PlaneGeometry(2,0.4);
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  return new THREE.Mesh(geo,mat);
}

// ── GAME MODES ──────────────────────────────────────────────
class BombMode {
  constructor(){this.bomb=null;}
  init(players){this.bomb=null;const ts=players.filter(p=>p.team==='T'&&p.alive);if(ts.length)ts[0].hasBomb=true;}
  tryPlant(p){
    if(!p.hasBomb||this.bomb?.planted)return false;
    const onA=Math.hypot(p.x+5,p.z+5)<3, onB=Math.hypot(p.x-5,p.z-12)<3;
    if(onA||onB){this.bomb={x:p.x,z:p.z,planted:true,timer:40000,defuse:0};p.hasBomb=false;return true;}
    return false;
  }
  update(dt,players,game){
    if(this.bomb?.planted){
      this.bomb.timer-=dt;
      if(this.bomb.timer<=0){game.roundEnd('T','💣 BOMB EXPLODED');for(const p of players){if(!p.alive)continue;const d=Math.hypot(p.x-this.bomb.x,p.z-this.bomb.z);if(d<5)p.takeDamage(d<1.5?500:d<3?200:80,null);}return;}
      const lp=game.local;
      if(lp?.alive&&lp.team==='CT'){const d=Math.hypot(lp.x-this.bomb.x,lp.z-this.bomb.z);if(d<2&&game.input?.keys['KeyE']){this.bomb.defuse+=dt/1000*(lp.hasDefuse?.45:1);if(this.bomb.defuse>=1)game.roundEnd('CT','✅ BOMB DEFUSED');}else this.bomb.defuse=0;}
    }
    const tA=players.filter(p=>p.team==='T'&&p.alive).length, cA=players.filter(p=>p.team==='CT'&&p.alive).length;
    if(!tA&&!this.bomb?.planted)game.roundEnd('CT','All terrorists eliminated');
    if(!cA&&!this.bomb?.planted)game.roundEnd('T','All CTs eliminated');
  }
}
class DeathmatchMode {
  constructor(){this.target=30;}
  init(){}
  update(dt,players,game){
    for(const p of players)if(p.kills>=this.target){game.roundEnd(p.team,`🏆 ${p.name} wins!`);return;}
    for(const p of players)if(!p.alive&&p._rt>0){p._rt-=dt;if(p._rt<=0){const sp=getSpawn(p.team,Math.floor(Math.random()*5));p.x=sp.x;p.z=sp.z;p.hp=100;p.alive=true;if(game.playerMeshes[p.id])game.playerMeshes[p.id].visible=true;}}
  }
  onKill(k,v){if(v)v._rt=3000;}
}
class CTFMode {
  constructor(){this.flags={T:{ox:-18,oz:-18,x:-18,z:-18,held:null},CT:{ox:18,oz:18,x:18,z:18,held:null}};this.scores={T:0,CT:0};this.target=3;}
  init(){}
  update(dt,players,game){
    for(const p of players){if(!p.alive)continue;const et=p.team==='T'?'CT':'T';const ef=this.flags[et];const mf=this.flags[p.team];
    if(!ef.held&&Math.hypot(p.x-ef.x,p.z-ef.z)<1.2){ef.held=p;p.hasFlag=true;}
    if(ef.held===p){ef.x=p.x;ef.z=p.z;}
    if(p.hasFlag&&Math.hypot(p.x-mf.ox,p.z-mf.oz)<1.5){this.scores[p.team]++;p.hasFlag=false;ef.held=null;ef.x=ef.ox;ef.z=ef.oz;if(this.scores[p.team]>=this.target)game.roundEnd(p.team,`🚩 ${p.team} wins CTF!`);}}
  }
  onDeath(v){if(!v.hasFlag)return;const et=v.team==='T'?'CT':'T';const f=this.flags[et];f.held=null;f.x=v.x;f.z=v.z;v.hasFlag=false;}
}

// ── HUD ─────────────────────────────────────────────────────
class HUD2D {
  constructor(canvas){this.cv=canvas;this.ctx=canvas.getContext('2d');this.hitM=0;this.hurtA=0;this.kf=[];this.dead=false;}
  flashHit(){this.hitM=220;}
  flashHurt(d){this.hurtA=Math.min(1,d/75);}
  addKill(k,v){this.kf.unshift({k,v,t:Date.now()});if(this.kf.length>5)this.kf.pop();}
  render(p,round,scores,ping,settings,phase,phaseTimer){
    const ctx=this.ctx; ctx.clearRect(0,0,W,H);
    this._cross(ctx,settings?.cross||'classic');
    this._hp(ctx,p); this._ammo(ctx,p); this._money(ctx,p);
    this._topBar(ctx,scores,round,phase,phaseTimer);
    this._kf(ctx);
    if(settings?.radar!==false)this._radar(ctx,p,window._game?.players||[]);
    if(this.hurtA>0){const v=ctx.createRadialGradient(W/2,H/2,H*.15,W/2,H/2,H*.82);v.addColorStop(0,'transparent');v.addColorStop(1,`rgba(200,0,0,${this.hurtA*.55})`);ctx.fillStyle=v;ctx.fillRect(0,0,W,H);this.hurtA=Math.max(0,this.hurtA-.028);}
    if(this.dead){ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#cc1111';ctx.font="bold 56px 'Bebas Neue'";ctx.textAlign='center';ctx.shadowBlur=20;ctx.shadowColor='#ff0000';ctx.fillText('YOU DIED',W/2,H/2-18);ctx.shadowBlur=0;ctx.fillStyle='#888';ctx.font="15px 'Share Tech Mono'";ctx.fillText('Waiting for round to end...',W/2,H/2+16);}
    if(ping){const pc=ping<80?'#00ff88':ping<150?'#ffcc00':'#ff4400';ctx.fillStyle=pc;ctx.font="10px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(`${ping}ms`,W-6,14);}
    if(this.hitM>0)this.hitM-=16;
  }
  _cross(ctx,style){const cx=W/2,cy=H/2,c=this.hitM>0?'#ff4400':'rgba(120,255,160,.92)';ctx.save();ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=1.5;ctx.shadowBlur=5;ctx.shadowColor=c;if(style==='dot'){ctx.beginPath();ctx.arc(cx,cy,2.5,0,Math.PI*2);ctx.fill();}else{const g=6,l=9;ctx.beginPath();ctx.moveTo(cx-g-l,cy);ctx.lineTo(cx-g,cy);ctx.moveTo(cx+g,cy);ctx.lineTo(cx+g+l,cy);ctx.moveTo(cx,cy-g-l);ctx.lineTo(cx,cy-g);ctx.moveTo(cx,cy+g);ctx.lineTo(cx,cy+g+l);ctx.stroke();if(style==='cross'){ctx.beginPath();ctx.arc(cx,cy,2,0,Math.PI*2);ctx.fill();}}ctx.restore();}
  _hp(ctx,p){const x=14,y=H-54,w=200,h=18;ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(x-2,y-2,w+4,h+22);const hc=p.hp>50?'#00cc44':p.hp>25?'#ddaa00':'#cc1111';ctx.fillStyle=hc;ctx.fillRect(x,y,w*(p.hp/100),h);ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);ctx.fillStyle='#fff';ctx.font="bold 12px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(`♥ ${p.hp}`,x+5,y+13);if(p.armor>0){ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(x,y+20,w,5);ctx.fillStyle='#3377ff';ctx.fillRect(x,y+20,w*(p.armor/100),5);}const gr=p.grenades||{};let gx=x;if(gr.nade>0){ctx.fillStyle='#ffaa00';ctx.font="11px 'Share Tech Mono'";ctx.fillText(`💣×${gr.nade}`,gx,y-9);gx+=58;}if(gr.smoke>0){ctx.fillStyle='#aaa';ctx.fillText(`💨×${gr.smoke}`,gx,y-9);gx+=58;}if(gr.flash>0){ctx.fillStyle='#fff';ctx.fillText(`💡×${gr.flash}`,gx,y-9);}}
  _ammo(ctx,p){const wd=p.wep,x=W-14,y=H-20;const aStr=wd.cur===Infinity?'∞':String(wd.cur).padStart(2,' ');const maxA=WEAPONS[p.weapon]?.ammo;ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x-110,y-33,115,40);ctx.fillStyle=wd.cur===0?'#ff2200':wd.cur<=5?'#ffaa00':'#fff';ctx.font="bold 32px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(aStr,x,y);ctx.fillStyle='#555';ctx.font="12px 'Share Tech Mono'";ctx.fillText(maxA===Infinity?'':`/${maxA}`,x-55,y);ctx.fillStyle='#aaa';ctx.font="10px 'Share Tech Mono'";ctx.fillText(WEAPONS[p.weapon]?.name||'',x,y-21);if(p.reloading){const prog=1-p.reloadTimer/((WEAPONS[p.weapon]?.reload||2)*1000);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(W*.32,H*.88,W*.36,16);ctx.fillStyle='#ffaa00';ctx.fillRect(W*.32,H*.88,W*.36*prog,16);ctx.fillStyle='#fff';ctx.font="11px 'Share Tech Mono'";ctx.textAlign='center';ctx.fillText('RELOADING',W/2,H*.88+12);}}
  _money(ctx,p){ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(12,H-82,105,20);ctx.fillStyle='#ffcc00';ctx.font="bold 14px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(`$${p.money}`,16,H-67);}
  _topBar(ctx,scores,round,phase,phaseTimer){ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(W/2-140,2,280,58);ctx.strokeStyle='rgba(255,107,0,.2)';ctx.lineWidth=1;ctx.strokeRect(W/2-140,2,280,58);ctx.textAlign='center';ctx.fillStyle='#ff6644';ctx.font="bold 18px 'Bebas Neue'";ctx.fillText(`T  ${scores?.T||0}`,W/2-38,25);ctx.fillStyle='#666';ctx.fillText(':',W/2,25);ctx.fillStyle='#4488ff';ctx.fillText(`  ${scores?.CT||0}  CT`,W/2+32,25);if(phase==='buy'){ctx.fillStyle='#ffcc00';ctx.font="12px 'Share Tech Mono'";ctx.fillText(`⏳ BUY PHASE  ${Math.ceil((phaseTimer||0)/1000)}s`,W/2,46);}else{const sec=Math.max(0,Math.ceil((round.endTime-Date.now())/1000));ctx.fillStyle=sec<=10?'#ff4400':'#fff';ctx.font="bold 22px 'Share Tech Mono'";ctx.fillText(`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`,W/2,52);}}
  _kf(ctx){const now=Date.now();let ky=70;for(const kf of this.kf){const age=now-kf.t;if(age>5500)continue;const al=Math.min(1,(5500-age)/500);ctx.save();ctx.globalAlpha=al;ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(W-260,ky-15,252,20);ctx.font="bold 11px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillStyle=kf.k.team==='T'?'#ff9977':'#77aaff';ctx.fillText(kf.k.name.substring(0,10),W-142,ky);ctx.fillStyle='#888';ctx.fillText(' ☠ ',W-115,ky);ctx.fillStyle=kf.v.team==='T'?'#ff9977':'#77aaff';ctx.fillText(kf.v.name.substring(0,10),W-14,ky);ctx.restore();ky+=23;}}
  _radar(ctx,p,players){const rx=W-108,ry=H-108,rs=96,sc=rs/20;ctx.save();ctx.beginPath();ctx.arc(rx,ry,rs/2,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.68)';ctx.fill();ctx.clip();for(const pl of players){if(!pl.alive)continue;const px2=rx+(pl.x-p.x)*sc,py2=ry+(pl.z-p.z)*sc;ctx.beginPath();ctx.arc(px2,py2,pl.id===p.id?5:3.5,0,Math.PI*2);ctx.fillStyle=pl.id===p.id?'#fff':pl.team==='T'?'#ff4400':'#0088ff';ctx.fill();if(pl.id===p.id){ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px2,py2);ctx.lineTo(px2+Math.sin(pl.angle)*9,py2+Math.cos(pl.angle)*9);ctx.stroke();}}ctx.restore();ctx.beginPath();ctx.arc(rx,ry,rs/2,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.15)';ctx.lineWidth=1;ctx.stroke();}
}

function renderScoreboard3D(ctx,players,vis){
  if(!vis)return;
  const ph=players.length*28+96;ctx.fillStyle='rgba(0,0,0,.92)';ctx.fillRect(W/2-280,48,560,ph);ctx.strokeStyle='rgba(255,107,0,.3)';ctx.lineWidth=1;ctx.strokeRect(W/2-280,48,560,ph);ctx.fillStyle='#fff';ctx.font="bold 15px 'Share Tech Mono'";ctx.textAlign='center';ctx.fillText('SCOREBOARD',W/2,74);let y=100;for(const team of['CT','T']){const pl=players.filter(p=>p.team===team);ctx.fillStyle=team==='T'?'#ff6633':'#3399ff';ctx.font="bold 10px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(team==='T'?'── TERRORISTS ──':'── COUNTER-TERRORISTS ──',W/2-268,y);y+=15;for(const p of pl){ctx.fillStyle=p.isBot?'#555':(p.id===window._game?.local?.id?'#ffcc00':'#ccc');ctx.font="12px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText((p.isBot?'[BOT] ':'')+p.name.substring(0,16),W/2-268,y);ctx.textAlign='right';ctx.fillStyle='#aaa';ctx.fillText(`${p.kills}   ${p.deaths}   $${p.money}`,W/2+275,y);y+=24;}y+=4;}
}

// ── INPUT ────────────────────────────────────────────────────
class Input3D {
  constructor(){this.keys={};this.mdx=0;this.mdy=0;this.mb=false;this.locked=false;
    window.addEventListener('keydown',e=>{this.keys[e.code]=true;if(['Tab','Space'].includes(e.code))e.preventDefault();});
    window.addEventListener('keyup',e=>{this.keys[e.code]=false;});
    window.addEventListener('mousemove',e=>{if(this.locked){this.mdx+=e.movementX;this.mdy+=e.movementY;}});
    window.addEventListener('mousedown',e=>{if(e.button===0)this.mb=true;});
    window.addEventListener('mouseup',e=>{if(e.button===0)this.mb=false;});
  }
  consume(){const r={dx:this.mdx,dy:this.mdy};this.mdx=0;this.mdy=0;return r;}
}

// ── AUDIO ────────────────────────────────────────────────────
class Audio3D {
  constructor(){try{this.ctx=new AudioContext();}catch(e){this.ctx=null;}}
  play(type){if(!this.ctx)return;const ac=this.ctx,g=ac.createGain();g.connect(ac.destination);
    if(type==='shoot'){const b=ac.createBuffer(1,ac.sampleRate*.08,ac.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/650)*.9;const s=ac.createBufferSource();s.buffer=b;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=800;f.Q.value=.45;s.connect(f);f.connect(g);g.gain.setValueAtTime(.38,ac.currentTime);s.start();}
    else if(type==='reload'){const o=ac.createOscillator();o.type='square';o.frequency.value=180;o.connect(g);g.gain.setValueAtTime(.07,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.13);o.start();o.stop(ac.currentTime+.13);}
    else if(type==='step'){const o=ac.createOscillator();o.type='sine';o.frequency.value=55;o.connect(g);g.gain.setValueAtTime(.055,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.07);o.start();o.stop(ac.currentTime+.07);}
    else if(type==='hit'){const b=ac.createBuffer(1,ac.sampleRate*.04,ac.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*.5*Math.exp(-i/300);const s=ac.createBufferSource();s.buffer=b;s.connect(g);g.gain.setValueAtTime(.28,ac.currentTime);s.start();}}
}

// ═══════════════════════════════════════════════════════════
//  MAIN GAME CLASS  (Three.js)
// ═══════════════════════════════════════════════════════════
const WALK=0.0095, RUN=0.0145, CROUCH=0.005;

class Game3D {
  constructor(container, hudCanvas, fbConfig, settings) {
    this.container=container;
    this.hudCanvas=hudCanvas;
    this.settings=settings||{};
    this.hud=new HUD2D(hudCanvas);
    this.input=new Input3D();
    this.audio=new Audio3D();

    this.local=null;
    this.players=[];
    this.bots=[];
    this.playerMeshes={};
    this.nameMeshes={};

    this.round={num:1,endTime:Date.now()+115000};
    this.scores={T:0,CT:0};
    this.phase='buy'; this.phaseTimer=15000;
    this.showSB=false;
    this.mode=null; this.gameMode='bomb';
    this.roundEndMsg=null; this.roundEndT=0;
    this.stepTimer=0; this.bobT=0;
    this.recoilOffset=0;
    this.paused=false;

    this.db=null; this.roomId=null; this.ping=0;
    this.lastTime=0;

    this._initThree();
    if(fbConfig)this._initFb(fbConfig);
    window._game=this;
  }

  _initFb(cfg){try{if(!firebase.apps.length)firebase.initializeApp(cfg);this.db=firebase.database();}catch(e){}}

  _initThree(){
    // Renderer
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setSize(W,H);
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    this.renderer.setClearColor(0x87CEEB); // sky blue
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene3=new THREE.Scene();
    this.scene3.fog=new THREE.Fog(0x87CEEB,20,55);

    // Sky gradient
    const skyGeo=new THREE.SphereGeometry(80,16,8);
    const skyMat=new THREE.MeshBasicMaterial({
      color:0x4a7fc1, side:THREE.BackSide
    });
    this.scene3.add(new THREE.Mesh(skyGeo,skyMat));

    // Lights
    const ambient=new THREE.AmbientLight(0xffffff,0.55);
    this.scene3.add(ambient);
    const sun=new THREE.DirectionalLight(0xfff5e0,1.1);
    sun.position.set(20,40,10);
    sun.castShadow=true;
    sun.shadow.mapSize.width=sun.shadow.mapSize.height=2048;
    sun.shadow.camera.near=0.5;sun.shadow.camera.far=100;
    sun.shadow.camera.left=sun.shadow.camera.bottom=-50;
    sun.shadow.camera.right=sun.shadow.camera.top=50;
    this.scene3.add(sun);
    // Fill light
    const fill=new THREE.DirectionalLight(0xb0d4ff,0.35);
    fill.position.set(-10,10,-10); this.scene3.add(fill);

    // Camera (first person)
    this.camera=new THREE.PerspectiveCamera(75,W/H,0.1,100);
    this.camera.position.set(0,1.6,0);

    // Camera pitch object
    this.pitchObj=new THREE.Object3D();
    this.pitchObj.add(this.camera);
    this.yawObj=new THREE.Object3D();
    this.yawObj.add(this.pitchObj);
    this.scene3.add(this.yawObj);

    // Weapon view model
    this._initWeaponVM();

    // Build map
    this.gameScene=new GameScene(this.scene3);
  }

  _initWeaponVM(){
    this.vmGroup=new THREE.Group();
    this.camera.add(this.vmGroup);
    this.vmGroup.position.set(0.18,-0.2,-.4);
    this._buildWeaponMesh('ak47');
  }

  _buildWeaponMesh(wid){
    // Clear
    while(this.vmGroup.children.length) this.vmGroup.remove(this.vmGroup.children[0]);

    const L=c=>new THREE.MeshLambertMaterial({color:c});
    const G=(w,h,d)=>new THREE.BoxGeometry(w,h,d);

    if(wid==='knife'){
      const blade=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.18,0.005),L(0xcccccc));
      blade.position.set(0,0.04,0); this.vmGroup.add(blade);
      const handle=new THREE.Mesh(G(0.025,0.1,0.02),L(0x3a2010));
      handle.position.set(0,-0.06,0); this.vmGroup.add(handle);
    } else if(wid==='awp'||wid==='scout'){
      // Long sniper
      const body=new THREE.Mesh(G(0.025,0.025,0.5),L(0x1a1a1a));
      body.position.set(0,0,-0.05); this.vmGroup.add(body);
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.007,0.007,0.3,6),L(0x222));
      barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.005,-0.3); this.vmGroup.add(barrel);
      const scope=new THREE.Mesh(G(0.015,0.04,0.06),L(0x111));
      scope.position.set(0,0.03,-0.05); this.vmGroup.add(scope);
      const stock=new THREE.Mesh(G(0.02,0.04,0.12),L(0x2a2010));
      stock.position.set(0,0,0.22); this.vmGroup.add(stock);
      const mag=new THREE.Mesh(G(0.015,0.05,0.02),L(0x111));
      mag.position.set(0,-0.04,0); this.vmGroup.add(mag);
    } else if(wid==='mac10'||wid==='mp9'){
      const body=new THREE.Mesh(G(0.03,0.04,0.18),L(0x222));
      body.position.set(0,0,0); this.vmGroup.add(body);
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.12,6),L(0x333));
      barrel.rotation.x=Math.PI/2; barrel.position.set(0,0,-0.15); this.vmGroup.add(barrel);
      const mag=new THREE.Mesh(G(0.025,0.07,0.025),L(0x111));
      mag.position.set(0,-0.055,0.04); this.vmGroup.add(mag);
    } else if(wid==='deagle'||wid==='glock'||wid==='usp'||wid==='p250'){
      const body=new THREE.Mesh(G(0.022,0.045,0.14),L(0x1a1a1a));
      body.position.set(0,0,0); this.vmGroup.add(body);
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.007,0.007,0.09,6),L(0x222));
      barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.005,-0.12); this.vmGroup.add(barrel);
      const grip=new THREE.Mesh(G(0.02,0.07,0.03),L(0x222));
      grip.position.set(0,-0.06,0.04); this.vmGroup.add(grip);
      if(wid==='deagle'){this.vmGroup.scale.set(1.3,1.3,1.3);}
    } else {
      // Rifle (AK/M4/SG/AUG)
      const isAK=wid==='ak47'||wid==='sg553';
      const wc=isAK?0x5a4010:0x333333;
      const body=new THREE.Mesh(G(0.025,0.04,0.35),L(wc));
      body.position.set(0,0,0); this.vmGroup.add(body);
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.2,6),L(0x1a1a1a));
      barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.002,-0.27); this.vmGroup.add(barrel);
      const mag=new THREE.Mesh(G(0.02,0.07,0.025),L(0x111));
      mag.position.set(0,-0.055,-0.02); this.vmGroup.add(mag);
      const stock=new THREE.Mesh(G(0.02,0.03,0.1),L(isAK?0x3a2010:0x222));
      stock.position.set(0,-0.005,0.22); this.vmGroup.add(stock);
      const sight=new THREE.Mesh(G(0.012,0.015,0.04),L(0x111));
      sight.position.set(0,0.03,-0.05); this.vmGroup.add(sight);
    }
    // Hands
    const handL=new THREE.MeshLambertMaterial({color:0xc09070});
    const gloveL=new THREE.MeshLambertMaterial({color:0x1a1a1a});
    const hMat=['knife','glock','usp','p250','deagle'].includes(wid)?handL:gloveL;
    // Right hand
    const rHand=new THREE.Mesh(new THREE.SphereGeometry(0.03,6,4),hMat);
    rHand.position.set(0.04,-0.055,0.06); this.vmGroup.add(rHand);
    const rArm=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.12,6),hMat);
    rArm.rotation.z=Math.PI/4; rArm.position.set(0.08,-0.08,0.08); this.vmGroup.add(rArm);
    // Left hand (support)
    const lHand=new THREE.Mesh(new THREE.SphereGeometry(0.028,6,4),hMat);
    lHand.position.set(-0.05,-0.04,-0.1); this.vmGroup.add(lHand);
    const lArm=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.12,6),hMat);
    lArm.rotation.z=-Math.PI/5; lArm.position.set(-0.09,-0.07,-0.09); this.vmGroup.add(lArm);

    this.vmGroup.userData.wid=wid;
  }

  startSingleplayer(name,team,mode,diff){
    this.gameMode=mode||'bomb';
    const dc={easy:{ae:.18,rt:550},normal:{ae:.08,rt:320},hard:{ae:.03,rt:160},expert:{ae:.01,rt:70}}[diff||'normal'];
    const t=team==='AUTO'?['T','CT'][Math.random()>.5?1:0]:team||'T';
    this.local=new PlayerData(name||'Player',t,0);
    const rifle=t==='T'?'ak47':'m4a4';
    this.local.weapons[rifle]={cur:WEAPONS[rifle].ammo,ammo:WEAPONS[rifle].ammo};
    this.local.weapon=rifle;
    this.players=[this.local];

    this.mode=mode==='bomb'?new BombMode():mode==='deathmatch'?new DeathmatchMode():mode==='ctf'?new CTFMode():new BombMode();
    let ti=1,ci=0;
    for(let i=0;i<9;i++){const bt=i<4?'T':'CT';const bot=new Bot(`Bot_${i+1}`,bt,bt===t?ti++:ci++);bot.aimErr=dc.ae;bot.reactionMs=dc.rt;this.bots.push(bot);this.players.push(bot);}
    if(this.mode.init)this.mode.init(this.players);

    // Spawn player meshes for bots
    for(const p of this.players){
      if(p.id===this.local.id) continue;
      const mesh=createPlayerModel(p.team);
      mesh.position.set(p.x,0,p.z);
      mesh.scale.set(1.5,1.5,1.5);
      this.scene3.add(mesh);
      this.playerMeshes[p.id]=mesh;
      // Name label
      const lbl=makeNameLabel(p.name,p.team,p.hp);
      lbl.position.set(0,2.1,0);
      lbl.userData.playerData=p;
      mesh.add(lbl);
      this.nameMeshes[p.id]=lbl;
    }

    this.phase='buy'; this.phaseTimer=15000;
    this.round.endTime=Date.now()+115000;
    this._buildWeaponMesh(rifle);
    this._setPos(this.local);
    this.gameLoop();
  }

  _setPos(p){
    this.yawObj.position.set(p.x,0,p.z);
    this.yawObj.rotation.y=p.angle;
  }

  gameLoop(ts=0){
    const dt=Math.min(ts-this.lastTime,50);this.lastTime=ts;
    this.update(dt);this.render3(dt);
    requestAnimationFrame(t=>this.gameLoop(t));
  }

  update(dt){
    if(this.paused) return;
    // Phase
    if(this.phase==='buy'){this.phaseTimer-=dt;if(this.phaseTimer<=0){this.phase='live';document.getElementById('bm')?.classList.remove('sh');}}
    if(this.roundEndT>0){this.roundEndT-=dt;if(this.roundEndT<=0){this.roundEndMsg=null;this.nextRound();}if(this.phase!=='buy')for(const b of this.bots)b.update(dt,this.players,this.gameScene);return;}

    if(!this.local?.alive){if(this.phase!=='buy')for(const b of this.bots)b.update(dt,this.players,this.gameScene);if(this.phase==='live'&&this.mode?.update)this.mode.update(dt,this.players,this);this._updateMeshes();return;}

    const p=this.local,inp=this.input;
    const sens=(this.settings.sens||8)*.00020;
    const{dx,dy}=inp.consume();
    p.angle-=dx*sens;
    this.yawObj.rotation.y=p.angle;
    // Pitch
    const curPitch=this.pitchObj.rotation.x;
    this.pitchObj.rotation.x=Math.max(-Math.PI/2.2,Math.min(Math.PI/2.2,curPitch-dy*sens));

    const cr=inp.keys['ControlLeft'];const run=inp.keys['ShiftLeft']&&!cr;
    const spd=(cr?CROUCH:run?RUN:WALK)*dt;
    let moved=false;
    const moveDir=(a,s)=>{
      const nx=p.x+Math.sin(a)*s, nz=p.z+Math.cos(a)*s;
      if(!this.gameScene.collides(nx,p.z,.3)){p.x=nx;moved=true;}
      if(!this.gameScene.collides(p.x,nz,.3)){p.z=nz;moved=true;}
    };
    if(inp.keys['KeyW']||inp.keys['ArrowUp'])    moveDir(p.angle,spd);
    if(inp.keys['KeyS']||inp.keys['ArrowDown'])   moveDir(p.angle,-spd);
    if(inp.keys['KeyA'])                           moveDir(p.angle-Math.PI/2,spd);
    if(inp.keys['KeyD'])                           moveDir(p.angle+Math.PI/2,spd);
    p.isMoving=moved;
    this.yawObj.position.set(p.x, cr?.9:1.0, p.z);

    // Bob
    if(moved){this.bobT+=dt*.005;const b=Math.sin(this.bobT)*.015;this.pitchObj.position.set(0,b*.5,0);}
    else{this.pitchObj.position.y*=0.9;}

    // Footsteps
    if(moved&&!cr){this.stepTimer+=dt;if(this.stepTimer>340){this.stepTimer=0;this.audio.play('step');}}

    // Weapon switch
    if(inp.keys['Digit1']){p.weapon='knife';this._buildWeaponMesh('knife');}
    if(inp.keys['Digit2']){const w=['glock','usp','p250','deagle'].find(x=>p.weapons[x]);if(w&&w!==p.weapon){p.weapon=w;this._buildWeaponMesh(w);}}
    if(inp.keys['Digit3']){const w=['ak47','m4a4','sg553','aug','mac10','mp9'].find(x=>p.weapons[x]);if(w&&w!==p.weapon){p.weapon=w;this._buildWeaponMesh(w);}}
    if(inp.keys['Digit4']){const w=['awp','scout'].find(x=>p.weapons[x]);if(w&&w!==p.weapon){p.weapon=w;this._buildWeaponMesh(w);}}

    // Plant
    if(inp.keys['KeyE']&&this.mode instanceof BombMode&&p.hasBomb)if(this.mode.tryPlant(p))this.audio.play('step');

    // Reload
    if(inp.keys['KeyR']&&!p.reloading)this._reload(p);
    if(p.reloadTimer>0){p.reloadTimer-=dt;if(p.reloadTimer<=0){p.reloading=false;if(WEAPONS[p.weapon])p.wep.cur=WEAPONS[p.weapon].ammo;}}

    // Shoot
    p.shootTimer=Math.max(0,p.shootTimer-dt);
    const wi=WEAPONS[p.weapon];
    const canS=inp.mb&&!p.reloading&&p.shootTimer<=0&&(p.wep?.cur>0||p.wep?.cur===Infinity);
    if(canS&&(wi?.auto||inp.keys['_ms']!==inp.mb)){inp.keys['_ms']=inp.mb;this._shoot(p);}
    if(!inp.mb)inp.keys['_ms']=false;

    this.showSB=!!inp.keys['Tab'];

    // Bots
    if(this.phase!=='buy')for(const b of this.bots)b.update(dt,this.players,this.gameScene);
    if(this.phase==='live'&&this.mode?.update)this.mode.update(dt,this.players,this);
    this._updateMeshes();
  }

  _shoot(p){
    const wi=WEAPONS[p.weapon];if(!wi||!p.wep)return;
    if(p.wep.cur<=0&&p.wep.cur!==Infinity){this._reload(p);return;}
    if(p.wep.cur!==Infinity)p.wep.cur--;
    p.shootTimer=60000/wi.rpm;
    if(this.settings.sound!==false)this.audio.play('shoot');
    // Recoil
    this.recoilOffset=0.015;
    this.vmGroup.position.z+=0.03;
    setTimeout(()=>this.vmGroup.position.z-=0.03,80);

    // Muzzle flash
    const flash=new THREE.PointLight(0xff8800,3,3);
    flash.position.copy(this.camera.position);
    flash.position.z-=0.5;
    this.scene3.add(flash);
    setTimeout(()=>this.scene3.remove(flash),60);

    // Raycast
    const spread=wi.spread*(p.isMoving?2.2:1)*(Math.random()-.5)*2;
    const dir=new THREE.Vector3(
      Math.sin(p.angle+spread)*Math.cos(this.pitchObj.rotation.x),
      -Math.sin(this.pitchObj.rotation.x),
      Math.cos(p.angle+spread)*Math.cos(this.pitchObj.rotation.x)
    ).normalize();
    const ray=new THREE.Raycaster(new THREE.Vector3(p.x,1.6,p.z),dir,0,wi.range);
    // Check against players
    for(const t of this.players){
      if(!t.alive||t.id===p.id||t.team===p.team)continue;
      const mesh=this.playerMeshes[t.id];if(!mesh)continue;
      const hits=ray.intersectObject(mesh,true);
      if(hits.length>0){
        const hs=hits[0].point.y>1.3?2:1;
        t.takeDamage(wi.dmg*(0.8+Math.random()*.4)*(1-hits[0].distance/wi.range*.3)*hs,p);
        if(this.settings.sound!==false)this.audio.play('hit');
        // Hit decal (brief red flash on model)
        break;
      }
    }
  }

  _reload(p){if(p.reloading||WEAPONS[p.weapon]?.ammo===Infinity)return;p.reloading=true;p.reloadTimer=(WEAPONS[p.weapon]?.reload||2)*1000;if(this.settings.sound!==false)this.audio.play('reload');}

  roundEnd(team,msg){
    if(this.roundEndMsg)return;
    this.roundEndMsg=msg;this.roundEndT=5000;this.phase='end';
    this.scores[team]=(this.scores[team]||0)+1;
    for(const p of this.players)p.money=Math.min(16000,p.money+(p.team===team?3250:1400));
  }

  nextRound(){
    this.round.num++;this.round.endTime=Date.now()+115000;
    this.phase='buy';this.phaseTimer=15000;
    let ti=0,ci=0;
    for(const p of this.players){
      const si=p.team==='T'?ti++:ci++;const sp=getSpawn(p.team,si);
      p.x=sp.x;p.z=sp.z;p.hp=100;p.alive=true;
      p.reloading=false;p.reloadTimer=0;p.shootTimer=0;
      p.hasBomb=false;p.hasFlag=false;
      for(const wd of Object.values(p.weapons))if(wd.cur!==Infinity)wd.cur=wd.ammo;
      if(this.playerMeshes[p.id]){this.playerMeshes[p.id].visible=true;this.playerMeshes[p.id].position.set(p.x,0,p.z);this.playerMeshes[p.id].scale.set(1.5,1.5,1.5);}
    }
    this.hud.dead=false;
    this._setPos(this.local);
    if(this.mode?.init)this.mode.init(this.players);
  }

  _updateMeshes(){
    for(const p of this.players){
      if(p.id===this.local.id)continue;
      const mesh=this.playerMeshes[p.id];if(!mesh)continue;
      mesh.visible=p.alive;
      if(p.alive){
        mesh.position.set(p.x,0,p.z);
        mesh.rotation.y=p.angle;
        // Walking animation — bob legs/body
        if(p.isMoving){
          p._walkT=(p._walkT||0)+16;
          const bob=Math.sin(p._walkT*0.012)*0.08;
          mesh.position.y=Math.abs(Math.sin(p._walkT*0.012))*0.06;
          // Animate legs (children index 10,11 = thighs)
          const children=mesh.children;
          if(children.length>10){
            children[10].rotation.x=Math.sin(p._walkT*0.012)*0.5;
            children[11].rotation.x=-Math.sin(p._walkT*0.012)*0.5;
          }
        } else {
          mesh.position.y*=0.85;
        }
        // Update name label
        const lbl=this.nameMeshes[p.id];
        if(lbl){
          // Regen label only if hp changed
          if(lbl.userData.lastHp!==p.hp){
            lbl.userData.lastHp=p.hp;
            const newLbl=makeNameLabel(p.name,p.team,p.hp);
            mesh.remove(lbl);
            newLbl.position.set(0,2.1,0);
            newLbl.userData.playerData=p;
            newLbl.userData.lastHp=p.hp;
            mesh.add(newLbl);
            this.nameMeshes[p.id]=newLbl;
          }
          // Face camera
          const lbl2=this.nameMeshes[p.id];
          if(lbl2)lbl2.rotation.y=-mesh.rotation.y+this.yawObj.rotation.y;
        }
      }
    }
  }

  render3(dt){
    if(!this.local)return;
    this.renderer.render(this.scene3,this.camera);
