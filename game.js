'use strict';
// ═══════════════════════════════════════════════
//  CS•BROWSER ENGINE v3.0
//  Textured raycasting + weapon sprites + AI bots
// ═══════════════════════════════════════════════

const W=960,H=540,HALF_W=W/2,HALF_H=H/2;
const FOV=Math.PI/3,HALF_FOV=FOV/2;
const NUM_RAYS=480,RAY_STEP=FOV/NUM_RAYS;
const MAX_DEPTH=18,CELL=1;

// ── DE_DUST2-style map ──────────────────────────
// 0=floor 1=wall 2=box 3=container 4=pillar
const MAP=[
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,0,2,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,2,0,0,0,1],
  [1,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,1],
  [1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,4,0,4,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,1],
  [1,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,1],
  [1,0,0,0,0,0,0,0,4,0,0,0,0,0,0,4,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,4,0,4,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1],
  [1,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,1],
  [1,0,0,2,2,0,0,0,0,2,2,0,0,2,2,0,0,0,0,2,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];
const MAP_W=MAP[0].length,MAP_H=MAP.length;
function cellAt(x,y){return MAP[Math.floor(y)]?.[Math.floor(x)]??1;}
function walkable(x,y){const c=cellAt(x,y);return c===0;}

const SPAWNS_T=[{x:2,y:2},{x:2.5,y:3},{x:3,y:2},{x:2,y:3.5},{x:3.5,y:2.5}];
const SPAWNS_CT=[{x:20,y:20},{x:20.5,y:21},{x:21,y:20},{x:20,y:21.5},{x:21.5,y:20.5}];
function getSpawn(team,idx){const a=team==='T'?SPAWNS_T:SPAWNS_CT;return{...a[idx%a.length]};}

// ── TEXTURES (procedural) ──────────────────────
class Textures{
  constructor(){
    this.size=64;
    this.wall=this._makeBrick(64,'#8B7355','#6B5335');
    this.box=this._makeWood(64,'#8B6914','#7A5C10');
    this.container=this._makeMetal(64,'#4A6741','#3A5631');
    this.pillar=this._makeMetal(64,'#888888','#666666');
    this.floor=this._makeFloor(64,'#3a3020','#2a2015');
    this.ceil=this._makeCeil(64,'#151520','#0a0a18');
  }

  _makeBrick(size,c1,c2){
    const cv=document.createElement('canvas');cv.width=cv.height=size;
    const ctx=cv.getContext('2d');
    ctx.fillStyle=c1;ctx.fillRect(0,0,size,size);
    ctx.fillStyle=c2;
    const bh=10,bw=28,gap=2;
    for(let row=0;row<size/bh;row++){
      const off=(row%2===0)?0:bw/2;
      for(let col=-1;col<size/bw+1;col++){
        const x=col*bw+off,y=row*bh;
        ctx.fillRect(x,y,gap,bh);
        ctx.fillRect(x,y,bw,gap);
      }
    }
    // noise
    for(let i=0;i<200;i++){ctx.fillStyle=`rgba(0,0,0,${Math.random()*.15})`;ctx.fillRect(Math.random()*size,Math.random()*size,2,2);}
    return ctx.getImageData(0,0,size,size);
  }
  _makeWood(size,c1,c2){
    const cv=document.createElement('canvas');cv.width=cv.height=size;
    const ctx=cv.getContext('2d');ctx.fillStyle=c1;ctx.fillRect(0,0,size,size);
    ctx.strokeStyle=c2;ctx.lineWidth=2;
    for(let i=0;i<size;i+=8){ctx.beginPath();ctx.moveTo(0,i+Math.sin(i*.5)*3);ctx.lineTo(size,i+Math.cos(i*.3)*3);ctx.stroke();}
    for(let i=0;i<100;i++){ctx.fillStyle=`rgba(0,0,0,${Math.random()*.1})`;ctx.fillRect(Math.random()*size,Math.random()*size,1,4);}
    return ctx.getImageData(0,0,size,size);
  }
  _makeMetal(size,c1,c2){
    const cv=document.createElement('canvas');cv.width=cv.height=size;
    const ctx=cv.getContext('2d');
    const g=ctx.createLinearGradient(0,0,size,size);g.addColorStop(0,c1);g.addColorStop(0.5,c2);g.addColorStop(1,c1);ctx.fillStyle=g;ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;
    for(let i=0;i<size;i+=16){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,size);ctx.stroke();}
    for(let i=0;i<size;i+=16){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(size,i);ctx.stroke();}
    // rivets
    for(let y=8;y<size;y+=16)for(let x=8;x<size;x+=16){ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}
    return ctx.getImageData(0,0,size,size);
  }
  _makeFloor(size,c1,c2){
    const cv=document.createElement('canvas');cv.width=cv.height=size;
    const ctx=cv.getContext('2d');ctx.fillStyle=c1;ctx.fillRect(0,0,size,size);
    ctx.strokeStyle=c2;ctx.lineWidth=1;
    for(let i=0;i<size;i+=16){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,size);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(size,i);ctx.stroke();}
    return ctx.getImageData(0,0,size,size);
  }
  _makeCeil(size,c1,c2){
    const cv=document.createElement('canvas');cv.width=cv.height=size;
    const ctx=cv.getContext('2d');ctx.fillStyle=c1;ctx.fillRect(0,0,size,size);
    for(let i=0;i<50;i++){ctx.fillStyle=`rgba(255,255,255,${Math.random()*.04})`;ctx.fillRect(Math.random()*size,Math.random()*size,Math.random()*4+1,Math.random()*4+1);}
    return ctx.getImageData(0,0,size,size);
  }
  getTexForCell(cell){return cell===2?this.box:cell===3?this.container:cell===4?this.pillar:this.wall;}
  sample(tex,u,v){
    const s=this.size,x=Math.floor(u*s)&(s-1),y=Math.floor(v*s)&(s-1);
    const i=(y*s+x)*4;return[tex.data[i],tex.data[i+1],tex.data[i+2]];
  }
}

// ── WEAPONS ──────────────────────────────────────
const WEAPONS={
  knife: {name:'Knife',   dmg:85, rpm:60,   ammo:Infinity,reload:0.8, spread:0,    range:1.8,auto:false,price:0,   spr:'knife'},
  glock: {name:'Glock',   dmg:28, rpm:400,  ammo:20,      reload:2.0, spread:0.022,range:14, auto:true, price:200, spr:'glock'},
  usp:   {name:'USP-S',   dmg:35, rpm:400,  ammo:12,      reload:2.2, spread:0.01, range:16, auto:false,price:300, spr:'pistol'},
  p250:  {name:'P250',    dmg:38, rpm:400,  ammo:13,      reload:2.2, spread:0.015,range:14, auto:false,price:300, spr:'pistol'},
  deagle:{name:'Deagle',  dmg:63, rpm:267,  ammo:7,       reload:2.2, spread:0.02, range:20, auto:false,price:700, spr:'deagle'},
  mp9:   {name:'MP9',     dmg:26, rpm:857,  ammo:30,      reload:2.1, spread:0.02, range:12, auto:true, price:1250,spr:'smg'},
  mac10: {name:'MAC-10',  dmg:29, rpm:800,  ammo:30,      reload:2.0, spread:0.025,range:10, auto:true, price:1050,spr:'smg'},
  ak47:  {name:'AK-47',   dmg:36, rpm:600,  ammo:30,      reload:2.5, spread:0.015,range:22, auto:true, price:2700,spr:'ak47'},
  m4a4:  {name:'M4A4',    dmg:33, rpm:666,  ammo:30,      reload:3.1, spread:0.012,range:22, auto:true, price:3100,spr:'m4'},
  sg553: {name:'SG553',   dmg:34, rpm:545,  ammo:30,      reload:2.8, spread:0.013,range:24, auto:true, price:3000,spr:'ak47'},
  aug:   {name:'AUG',     dmg:32, rpm:600,  ammo:30,      reload:3.0, spread:0.011,range:24, auto:true, price:3300,spr:'m4'},
  awp:   {name:'AWP',     dmg:115,rpm:41,   ammo:10,      reload:3.7, spread:0.001,range:55, auto:false,price:4750,spr:'awp'},
  scout: {name:'Scout',   dmg:75, rpm:100,  ammo:10,      reload:3.0, spread:0.003,range:42, auto:false,price:1700,spr:'awp'},
};
window.WEAPONS=WEAPONS;

// ── WEAPON SPRITE RENDERER ──────────────────────
class WeaponRenderer{
  constructor(ctx){
    this.ctx=ctx;
    this.bob=0;this.bobDir=1;this.bobAmt=0;
    this.recoil=0;this.flash=0;
    this.swayX=0;this.swayY=0;
  }
  update(dt,moving,shooting){
    if(moving){this.bobAmt=Math.min(1,this.bobAmt+dt*.004);}
    else{this.bobAmt=Math.max(0,this.bobAmt-dt*.006);}
    this.bob+=dt*.005*this.bobAmt;
    this.recoil=Math.max(0,this.recoil-dt*.015);
    this.flash=Math.max(0,this.flash-dt*.02);
    this.swayX*=0.88;this.swayY*=0.88;
  }
  shoot(){this.recoil=1;this.flash=1;}
  sway(dx,dy){this.swayX-=dx*.3;this.swayY-=dy*.3;}
  draw(weaponId,reloading,ammo){
    const ctx=this.ctx;
    const bobX=Math.sin(this.bob)*6*this.bobAmt;
    const bobY=Math.abs(Math.cos(this.bob))*8*this.bobAmt;
    const rx=this.swayX*.5,ry=this.swayY*.5;
    const baseX=W*.52+bobX+rx,baseY=H*.72+bobY+this.recoil*18+ry;
    ctx.save();

    // Muzzle flash
    if(this.flash>0&&weaponId!=='knife'){
      ctx.save();
      const fx=baseX-60,fy=baseY-80;
      const g=ctx.createRadialGradient(fx,fy,0,fx,fy,30*this.flash);
      g.addColorStop(0,'rgba(255,230,100,0.95)');g.addColorStop(0.4,'rgba(255,120,0,0.6)');g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.fillRect(fx-35,fy-35,70,70);
      ctx.restore();
    }

    const w=weaponId,r=this.recoil;
    ctx.translate(baseX,baseY);

    if(w==='knife'){this._drawKnife(ctx,r);}
    else if(w==='ak47'||w==='sg553'){this._drawRifle(ctx,r,'#8B6914','#5a4010');}
    else if(w==='m4a4'||w==='aug'){this._drawRifle(ctx,r,'#555','#333');}
    else if(w==='awp'||w==='scout'){this._drawSniper(ctx,r);}
    else if(w==='mp9'||w==='mac10'){this._drawSMG(ctx,r);}
    else{this._drawPistol(ctx,r,w==='deagle');}

    // Reload animation overlay
    if(reloading){
      ctx.rotate(Math.PI*.15);
      ctx.fillStyle='rgba(255,150,0,0.0)';// just rotation effect
    }

    // Ammo indicator dots on weapon
    if(ammo!==Infinity&&ammo<=5&&ammo>0){
      ctx.fillStyle='#ff4400';
      for(let i=0;i<ammo;i++){ctx.beginPath();ctx.arc(-40+i*8,10,3,0,Math.PI*2);ctx.fill();}
    }

    ctx.restore();

    // Hands (always drawn)
    this._drawHands(ctx,baseX,baseY,w);
  }

  _drawHands(ctx,bx,by,weapon){
    ctx.save();
    // Right hand
    const skinColor='#C8956C';
    // Gloves for rifle/smg
    const gloveColor=weapon==='ak47'||weapon==='sg553'?'#222':weapon==='m4a4'||weapon==='aug'?'#111':'#C8956C';

    // Right hand
    ctx.fillStyle=gloveColor;
    ctx.beginPath();ctx.ellipse(bx+10,by+20,22,30,-.3,0,Math.PI*2);ctx.fill();
    // Thumb
    ctx.beginPath();ctx.ellipse(bx+30,by+5,10,16,.5,0,Math.PI*2);ctx.fill();
    // Fingers
    for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(bx+i*12-20,by+40,7,14,-.1,0,Math.PI*2);ctx.fill();}

    // Left hand (support hand, more to the left)
    ctx.fillStyle=gloveColor;
    ctx.beginPath();ctx.ellipse(bx-70,by-10,20,26,-.1,0,Math.PI*2);ctx.fill();
    for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(bx-90+i*10,by+12,6,12,-.1,0,Math.PI*2);ctx.fill();}

    // Wrist/arm
    ctx.fillStyle=gloveColor;
    ctx.fillRect(bx-10,by+40,40,60);
    ctx.fillRect(bx-90,by+10,30,60);
    ctx.restore();
  }

  _drawRifle(ctx,r,c1,c2){
    // Body
    ctx.fillStyle=c2;ctx.fillRect(-120,-30,180,22);
    ctx.fillStyle=c1;ctx.fillRect(-115,-28,170,18);
    // Barrel
    ctx.fillStyle='#333';ctx.fillRect(-120,-26,30,8);
    ctx.fillStyle='#222';ctx.fillRect(-140,-25,25,6);
    // Grip
    ctx.fillStyle=c2;ctx.fillRect(30,-10,20,40);
    // Magazine
    ctx.fillStyle='#1a1a1a';ctx.fillRect(-10,0,18,35);
    // Stock
    ctx.fillStyle=c1;ctx.fillRect(50,-20,30,15);
    // Sight
    ctx.fillStyle='#111';ctx.fillRect(-20,-36,50,8);
    // Recoil animation
    if(r>.1){ctx.fillStyle='rgba(255,200,50,0.4)';ctx.beginPath();ctx.arc(-145,-22,10*r,0,Math.PI*2);ctx.fill();}
  }

  _drawSniper(ctx,r){
    ctx.fillStyle='#2a2a2a';ctx.fillRect(-160,-15,220,14);
    ctx.fillStyle='#333';ctx.fillRect(-165,-14,25,10);
    // Scope
    ctx.fillStyle='#111';ctx.fillRect(-60,-28,40,14);ctx.fillStyle='#222';ctx.fillRect(-58,-26,36,10);
    ctx.fillStyle='#0af';ctx.fillRect(-56,-24,32,6);
    // Grip
    ctx.fillStyle='#222';ctx.fillRect(30,-5,18,35);
    // Bipod lines
    ctx.strokeStyle='#444';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-100,0);ctx.lineTo(-110,20);ctx.stroke();ctx.beginPath();ctx.moveTo(-80,0);ctx.lineTo(-70,20);ctx.stroke();
    if(r>.1){ctx.fillStyle='rgba(255,200,50,0.4)';ctx.beginPath();ctx.arc(-168,-10,8*r,0,Math.PI*2);ctx.fill();}
  }

  _drawSMG(ctx,r){
    ctx.fillStyle='#333';ctx.fillRect(-80,-22,130,18);
    ctx.fillStyle='#222';ctx.fillRect(-85,-21,20,14);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(20,-8,16,30);
    ctx.fillStyle='#1a1a1a';ctx.fillRect(-20,-2,14,28);
    if(r>.1){ctx.fillStyle='rgba(255,200,50,0.35)';ctx.beginPath();ctx.arc(-88,-14,8*r,0,Math.PI*2);ctx.fill();}
  }

  _drawPistol(ctx,r,isDeagle){
    const sc=isDeagle?1.3:1;
    ctx.scale(sc,sc);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(-40,-25,80,18);
    ctx.fillStyle='#333';ctx.fillRect(-44,-24,20,14);
    ctx.fillStyle='#222';ctx.fillRect(20,-12,18,38);
    ctx.fillStyle='#1a1a1a';ctx.fillRect(-10,0,14,22);
    if(isDeagle){ctx.fillStyle='#444';ctx.fillRect(-42,-28,15,6);}
    if(r>.1){ctx.fillStyle='rgba(255,200,50,0.35)';ctx.beginPath();ctx.arc(-46,-18,7*r,0,Math.PI*2);ctx.fill();}
  }

  _drawKnife(ctx,r){
    ctx.save();ctx.rotate(-.3+r*.2);
    // Blade
    ctx.fillStyle='#ccc';
    ctx.beginPath();ctx.moveTo(-10,-60);ctx.lineTo(10,-60);ctx.lineTo(5,40);ctx.lineTo(-5,40);ctx.closePath();ctx.fill();
    // Edge shine
    ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,-55);ctx.lineTo(4,35);ctx.stroke();
    // Guard
    ctx.fillStyle='#888';ctx.fillRect(-20,35,40,10);
    // Handle
    ctx.fillStyle='#3a2010';ctx.fillRect(-12,45,24,50);
    // Wrap lines
    ctx.strokeStyle='#2a1508';ctx.lineWidth=3;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-12,50+i*10);ctx.lineTo(12,50+i*10);ctx.stroke();}
    ctx.restore();
  }
}

// ── PLAYER ──────────────────────────────────────
class Player{
  constructor(id,team,idx){
    const sp=getSpawn(team,idx);
    this.id=id;this.team=team;this.x=sp.x+.5;this.y=sp.y+.5;
    this.angle=team==='T'?Math.PI*.25:Math.PI*1.25;
    this.hp=100;this.armor=0;this.hasHelmet=false;this.hasDefuse=false;
    this.money=800;this.weapon='usp';
    this.weapons={knife:{...WEAPONS.knife,ammo:Infinity,cur:Infinity},usp:{...WEAPONS.usp,cur:12}};
    this.kills=0;this.deaths=0;this.alive=true;this.name=id;this.isBot=false;
    this.reloading=false;this.reloadTimer=0;this.shootTimer=0;
    this.grenades={};this.hasBomb=false;this.hasFlag=false;
    this.velX=0;this.velY=0;this.moving=false;this.crouching=false;
  }
  get wep(){return this.weapons[this.weapon]||this.weapons.knife;}
  get wepInfo(){return WEAPONS[this.weapon]||WEAPONS.knife;}
}

Player.prototype.takeDamage=function(dmg,by){
  if(!this.alive)return;
  if(by?.id===this.id)return;
  const abs=this.armor>0?Math.min(this.armor,dmg*(this.hasHelmet?.35:.5)):0;
  this.armor=Math.max(0,this.armor-abs*2.5);this.hp=Math.max(0,this.hp-Math.round(dmg-abs));
  const g=window._game;
  if(by?.id===g?.localPlayer?.id)g.hud.flashHit();
  if(this.id===g?.localPlayer?.id){g.hud.flashHurt(dmg);if(this.hp<=0)g.hud.showDeath();}
  if(this.hp<=0){
    this.alive=false;this.deaths++;
    if(by){by.kills++;g?.hud?.addKill(by,this);g?.modeCtrl?.onKill?.(by,this);}
    g?.modeCtrl?.onDeath?.(this);
  }
};

// ── BOT AI ──────────────────────────────────────
const BOT_NAMES=['xX_Ruslan_Xx','QuickDraw99','NomadSniper','SilentKill','Rush_B_Cyka','IronWall','GhostShot','Vodka_Pro','SashaGOAT','DarkAngel'];
class Bot extends Player{
  constructor(id,team,idx){
    super(id,team,idx);this.isBot=true;this.name=BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)];
    const w=team==='T'?'ak47':'m4a4';
    this.weapon=w;this.weapons[w]={...WEAPONS[w],cur:WEAPONS[w].ammo};
    this.aimErr=0.08;this.reactionMs=320;this.state='patrol';this.target=null;
    this.lastSeen=null;this.patrolPts=this._patrol();this.patrolIdx=0;
    this.stuckT=0;this.lastPos={x:this.x,y:this.y};this.reactionT=0;
    this.strafeDir=1;this.strafeTimer=0;
  }
  _patrol(){const pts=[];for(let i=0;i<8;i++){let x,y,t=0;do{x=1.5+Math.random()*(MAP_W-3);y=1.5+Math.random()*(MAP_H-3);t++;}while(!walkable(x,y)&&t<30);pts.push({x,y});}return pts;}

  canSee(t,players){
    const dx=t.x-this.x,dy=t.y-this.y,d=Math.hypot(dx,dy);
    if(d>14)return false;
    const steps=Math.ceil(d*5);
    for(let i=1;i<steps;i++){const tx=this.x+dx*(i/steps),ty=this.y+dy*(i/steps);if(!walkable(tx,ty))return false;}
    return true;
  }

  tryMove(dx,dy){
    const nx=this.x+dx,ny=this.y+dy;
    const r=0.3;
    if(walkable(nx+r*Math.sign(dx),this.y)&&walkable(nx-r*Math.sign(dx),this.y))this.x=nx;
    if(walkable(this.x,ny+r*Math.sign(dy))&&walkable(this.x,ny-r*Math.sign(dy)))this.y=ny;
  }

  update(dt,players){
    if(!this.alive)return;
    this.shootTimer=Math.max(0,this.shootTimer-dt);
    this.reactionT=Math.max(0,this.reactionT-dt);
    this.strafeTimer=Math.max(0,this.strafeTimer-dt);
    if(this.strafeTimer<=0){this.strafeDir*=-1;this.strafeTimer=800+Math.random()*1200;}

    // Stuck detection
    this.stuckT+=dt;
    if(this.stuckT>600){const dd=Math.hypot(this.x-this.lastPos.x,this.y-this.lastPos.y);if(dd<0.05){this.angle+=(Math.random()-.5)*Math.PI*1.5;}this.stuckT=0;this.lastPos={x:this.x,y:this.y};}

    // Find enemy
    let nearest=null,nearD=Infinity;
    for(const p of players){
      if(!p.alive||p.team===this.team||p.id===this.id)continue;
      const d=Math.hypot(p.x-this.x,p.y-this.y);
      if(d<nearD&&this.canSee(p,players)){nearest=p;nearD=d;}
    }

    if(nearest&&!this.target)this.reactionT=this.reactionMs;
    this.target=nearest;
    if(this.target)this.lastSeen={x:this.target.x,y:this.target.y};

    const spd=MOVE_SPEED*(this.target?0.6:0.55)*dt;
    if(this.target&&this.reactionT<=0){
      // Aim at target
      const tx=this.target.x,ty=this.target.y;
      const ta=Math.atan2(ty-this.y,tx-this.x);
      const ae=(Math.random()-.5)*this.aimErr*2;
      let da=ta+ae-this.angle;
      while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
      this.angle+=da*.18;
      // Strafe
      const sa=this.angle+Math.PI/2*this.strafeDir;
      this.tryMove(Math.cos(sa)*spd*.5,Math.sin(sa)*spd*.5);
      // Shoot
      if(this.shootTimer<=0&&!this.reloading){this._shoot(players);}
      this.moving=true;
    } else if(this.lastSeen){
      const ta=Math.atan2(this.lastSeen.y-this.y,this.lastSeen.x-this.x);
      let da=ta-this.angle;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
      this.angle+=da*.1;
      this.tryMove(Math.cos(this.angle)*spd,Math.sin(this.angle)*spd);
      this.moving=true;
      if(Math.hypot(this.x-this.lastSeen.x,this.y-this.lastSeen.y)<0.5)this.lastSeen=null;
    } else {
      const pt=this.patrolPts[this.patrolIdx%this.patrolPts.length];
      const ta=Math.atan2(pt.y-this.y,pt.x-this.x);
      let da=ta-this.angle;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
      this.angle+=da*.09;
      this.tryMove(Math.cos(this.angle)*spd,Math.sin(this.angle)*spd);
      this.moving=true;
      if(Math.hypot(this.x-pt.x,this.y-pt.y)<0.5)this.patrolIdx=(this.patrolIdx+1)%this.patrolPts.length;
    }

    // Auto reload
    if(this.wep.cur<=0&&!this.reloading)this._reload();
    if(this.reloadTimer>0){this.reloadTimer-=dt;if(this.reloadTimer<=0){this.reloading=false;this.wep.cur=WEAPONS[this.weapon]?.ammo||30;}}
  }

  _shoot(players){
    const wi=WEAPONS[this.weapon];if(!wi||this.wep.cur<=0)return;
    this.wep.cur--;this.shootTimer=60000/wi.rpm;
    if(this.target&&this.canSee(this.target,players)){
      const hitChance=this.target.moving?.6:.75;
      if(Math.random()<hitChance){
        const dist=Math.hypot(this.target.x-this.x,this.target.y-this.y);
        const dmg=wi.dmg*(0.75+Math.random()*.5)*(1-dist/wi.range*.25);
        this.target.takeDamage(dmg,this);
      }
    }
  }
  _reload(){this.reloading=true;this.reloadTimer=(WEAPONS[this.weapon]?.reload||2)*1000;}
}

// ── ANTICHEAT ──────────────────────────────────
class AntiCheat{
  constructor(){this.lastPos={x:0,y:0};this.v=0;}
  check(p,dt){
    const d=Math.hypot(p.x-this.lastPos.x,p.y-this.lastPos.y);
    const max=MOVE_SPEED*1.75*(dt/16)*dt;
    if(d>max*4&&d>.5){this.v++;if(this.v>10){p.x=this.lastPos.x;p.y=this.lastPos.y;console.warn('[AC] Speed');}}
    else this.v=Math.max(0,this.v-1);
    if(p.hp>100)p.hp=100;if(p.armor>100)p.armor=100;if(p.money>16000)p.money=16000;
    for(const[w,d]of Object.entries(p.weapons||{})){const m=WEAPONS[w]?.ammo??30;if(d.cur!==Infinity&&d.cur>m){d.cur=m;console.warn('[AC] Ammo');}}
    this.lastPos={x:p.x,y:p.y};
  }
}

// ── GRENADE SYSTEM ──────────────────────────────
window._gfx=[];window._flashT=0;
function throwGrenade(p,type){
  const g={x:p.x+Math.cos(p.angle)*.8,y:p.y+Math.sin(p.angle)*.8,type,t:0,maxT:type==='smoke'?9000:type==='flash'?600:600,alive:true};
  window._gfx.push(g);
  if(p.grenades)p.grenades[type]=Math.max(0,(p.grenades[type]||1)-1);
  if(type==='nade'){setTimeout(()=>{const gm=window._game;if(!gm)return;for(const pl of gm.players){if(!pl.alive)continue;const d=Math.hypot(pl.x-g.x,pl.y-g.y);if(d<3)pl.takeDamage((1-d/3)*95,p);}},450);}
  if(type==='flash'){setTimeout(()=>{const lp=window._game?.localPlayer;if(!lp)return;const d=Math.hypot(lp.x-g.x,lp.y-g.y);if(d<3.5){const dot=Math.cos(lp.angle-Math.atan2(g.y-lp.y,g.x-lp.x));if(dot>.3)window._flashT=1800;}},280);}
}

// ── GAME MODES ──────────────────────────────────
class BombMode{
  constructor(){this.bomb=null;this.siteA={x:3,y:3};this.siteB={x:20,y:20};}
  init(players){this.bomb=null;const ts=players.filter(p=>p.team==='T'&&p.alive);if(ts.length){ts[0].hasBomb=true;}}
  tryPlant(p){
    if(!p.hasBomb||this.bomb?.planted)return false;
    const onA=Math.hypot(p.x-this.siteA.x,p.y-this.siteA.y)<2.5;
    const onB=Math.hypot(p.x-this.siteB.x,p.y-this.siteB.y)<2.5;
    if(onA||onB){this.bomb={x:p.x,y:p.y,planted:true,timer:40000,defuse:0};p.hasBomb=false;return true;}
    return false;
  }
  update(dt,players,game){
    if(this.bomb?.planted){
      this.bomb.timer-=dt;
      if(this.bomb.timer<=0){game.roundEnd('T','💣 BOMB EXPLODED');for(const p of players){if(!p.alive)continue;const d=Math.hypot(p.x-this.bomb.x,p.y-this.bomb.y);if(d<4.5)p.takeDamage(d<1.5?500:d<3?180:70,null);}return;}
      const lp=game.localPlayer;
      if(lp?.alive&&lp.team==='CT'){const d=Math.hypot(lp.x-this.bomb.x,lp.y-this.bomb.y);if(d<1.8&&game.input?.keys['KeyE']){const spd=lp.hasDefuse?.45:1;this.bomb.defuse+=dt/1000*spd;if(this.bomb.defuse>=1)game.roundEnd('CT','✅ BOMB DEFUSED');}else this.bomb.defuse=0;}
      // Bot defuse
      for(const p of players){if(!p.isBot||p.team!=='CT'||!p.alive)continue;const d=Math.hypot(p.x-this.bomb.x,p.y-this.bomb.y);if(d<1.5){this.bomb.defuse+=dt/1000;if(this.bomb.defuse>=1){game.roundEnd('CT','✅ BOMB DEFUSED');return;}}}
    }
    const ta=players.filter(p=>p.team==='T'&&p.alive).length,ca=players.filter(p=>p.team==='CT'&&p.alive).length;
    if(!ta&&!this.bomb?.planted)game.roundEnd('CT','💀 All terrorists eliminated');
    if(!ca&&!this.bomb?.planted)game.roundEnd('T','💀 All CTs eliminated');
  }
}
class DeathmatchMode{
  constructor(){this.target=30;}
  init(){}
  update(dt,players,game){
    for(const p of players)if(p.kills>=this.target){game.roundEnd(p.team,`🏆 ${p.name} wins!`);return;}
    for(const p of players)if(!p.alive&&p._dmR){p._dmR-=dt;if(p._dmR<=0){const sp=getSpawn(p.team,Math.floor(Math.random()*5));p.x=sp.x+.5;p.y=sp.y+.5;p.hp=100;p.alive=true;p._dmR=0;}}
  }
  onKill(k,v){if(v)v._dmR=3000;}
}
class CTFMode{
  constructor(){this.flags={T:{x:2,y:2,held:null,atBase:true},CT:{x:21,y:21,held:null,atBase:true}};this.scores={T:0,CT:0};this.target=3;}
  init(){}
  update(dt,players,game){
    for(const p of players){if(!p.alive)continue;const et=p.team==='T'?'CT':'T';const ef=this.flags[et];const of2=this.flags[p.team];
    if(!ef.held&&Math.hypot(p.x-ef.x,p.y-ef.y)<1){ef.held=p;p.hasFlag=true;}
    if(ef.held===p){ef.x=p.x;ef.y=p.y;}
    if(p.hasFlag&&of2.atBase&&Math.hypot(p.x-of2.x,p.y-of2.y)<1.2){this.scores[p.team]++;p.hasFlag=false;ef.held=null;ef.atBase=true;ef.x=p.team==='T'?21:2;ef.y=p.team==='T'?21:2;if(this.scores[p.team]>=this.target)game.roundEnd(p.team,`🚩 ${p.team} captures ${this.target} flags!`);}}
  }
  onDeath(v){if(v.hasFlag){const et=v.team==='T'?'CT':'T';const f=this.flags[et];f.held=null;f.x=v.x;f.y=v.y;f.atBase=false;v.hasFlag=false;}}
}
const ARM_CHAIN=['knife','glock','p250','deagle','mac10','mp9','ak47','m4a4','sg553','aug','awp','scout'];
class ArmsRaceMode{
  constructor(){this.prog={};}
  init(players){for(const p of players)this.prog[p.id]=0;}
  update(){}
  onKill(k){if(!k)return;const i=Math.min((this.prog[k.id]||0)+1,ARM_CHAIN.length-1);this.prog[k.id]=i;const w=ARM_CHAIN[i];if(WEAPONS[w]&&!k.weapons[w])k.weapons[w]={...WEAPONS[w],cur:WEAPONS[w].ammo};k.weapon=w;if(i>=ARM_CHAIN.length-1)window._game?.roundEnd(k.team,`🏆 ${k.name} wins Arms Race!`);}
}

// ── TEXTURED RAYCASTER ──────────────────────────
class Raycaster{
  constructor(canvas){
    this.cv=canvas;this.ctx=canvas.getContext('2d');
    this.imgData=this.ctx.createImageData(W,H);
    this.zBuf=new Float64Array(W);
    this.tex=new Textures();
  }

  castRay(px,py,angle){
    const cos=Math.cos(angle),sin=Math.sin(angle);
    let mx=Math.floor(px),my=Math.floor(py);
    const sx=cos>0?1:-1,sy=sin>0?1:-1;
    const dDX=Math.abs(1/cos),dDY=Math.abs(1/sin);
    let sDistX=cos>0?(mx+1-px)*dDX:(px-mx)*dDX;
    let sDistY=sin>0?(my+1-py)*dDY:(py-my)*dDY;
    let hit=0,side=0,cell=0;
    for(let i=0;i<64;i++){
      if(sDistX<sDistY){sDistX+=dDX;mx+=sx;side=0;}else{sDistY+=dDY;my+=sy;side=1;}
      cell=MAP[my]?.[mx]??1;if(cell>0){hit=1;break;}
    }
    const perpDist=side===0?(sDistX-dDX):(sDistY-dDY);
    let wallX;
    if(side===0)wallX=py+perpDist*sin;else wallX=px+perpDist*cos;
    wallX-=Math.floor(wallX);
    return{dist:Math.max(0.05,perpDist),side,wallX,cell};
  }

  render(player,players){
    const buf=this.imgData.data;
    const cosA=Math.cos(player.angle),sinA=Math.sin(player.angle);

    for(let x=0;x<W;x++){
      const cameraX=2*x/W-1;
      const rDirX=cosA-sinA*cameraX*Math.tan(HALF_FOV)*2;
      const rDirY=sinA+cosA*cameraX*Math.tan(HALF_FOV)*2;
      const rayA=Math.atan2(rDirY,rDirX);
      const {dist,side,wallX,cell}=this.castRay(player.x,player.y,rayA);
      this.zBuf[x]=dist;

      const lineH=Math.min(H,Math.floor(H/dist));
      const drawStart=Math.max(0,Math.floor((H-lineH)/2));
      const drawEnd=Math.min(H-1,Math.floor((H+lineH)/2));

      // Texture
      const tex=this.tex.getTexForCell(cell);
      const texX=Math.floor(wallX*this.tex.size);
      let bright=Math.max(0,1-dist/MAX_DEPTH);
      if(side===1)bright*=0.6;

      for(let y=drawStart;y<drawEnd;y++){
        const texY=Math.floor(((y-drawStart)/(drawEnd-drawStart))*this.tex.size)&(this.tex.size-1);
        const ti=(texY*this.tex.size+texX)*4;
        const idx=(y*W+x)*4;
        buf[idx]  =tex.data[ti]*bright;
        buf[idx+1]=tex.data[ti+1]*bright;
        buf[idx+2]=tex.data[ti+2]*bright;
        buf[idx+3]=255;
      }

      // Floor & ceiling
      const floorTex=this.tex.floor,ceilTex=this.tex.ceil,ts=this.tex.size;
      for(let y=0;y<drawStart;y++){
        const rowDist=H/(H-2*y);
        const fx=player.x+cosA*rowDist+(-sinA)*rowDist*cameraX;
        const fy=player.y+sinA*rowDist+cosA*rowDist*cameraX;
        const tx=Math.floor(fx*ts)&(ts-1),ty2=Math.floor(fy*ts)&(ts-1);
        const ci=(ty2*ts+tx)*4,cIdx=(y*W+x)*4;
        const cb=Math.max(0,0.4-y/H*.8);
        buf[cIdx]=ceilTex.data[ci]*cb;buf[cIdx+1]=ceilTex.data[ci+1]*cb;buf[cIdx+2]=ceilTex.data[ci+2]*cb;buf[cIdx+3]=255;
      }
      for(let y=drawEnd;y<H;y++){
        const rowDist=H/(2*y-H);
        const fx=player.x+cosA*rowDist+(-sinA)*rowDist*cameraX;
        const fy=player.y+sinA*rowDist+cosA*rowDist*cameraX;
        const tx=Math.floor(fx*ts)&(ts-1),ty2=Math.floor(fy*ts)&(ts-1);
        const fi=(ty2*ts+tx)*4,fIdx=(y*W+x)*4;
        const fb=Math.max(0,(y-drawEnd)/(H-drawEnd)*.5);
        buf[fIdx]=floorTex.data[fi]*fb;buf[fIdx+1]=floorTex.data[fi+1]*fb;buf[fIdx+2]=floorTex.data[fi+2]*fb;buf[fIdx+3]=255;
      }
    }
    this.ctx.putImageData(this.imgData,0,0);
    this._sprites(player,players);
  }

  _sprites(player,players){
    const ctx=this.ctx;
    const sprites=[];
    for(const p of players){
      if(!p.alive||p.id===player.id)continue;
      const dx=p.x-player.x,dy=p.y-player.y,dist=Math.hypot(dx,dy);
      if(dist<0.4||dist>14)continue;
      let a=Math.atan2(dy,dx)-player.angle;
      while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;
      if(Math.abs(a)>HALF_FOV*1.3)continue;
      sprites.push({p,dist,a});
    }
    sprites.sort((a,b)=>b.dist-a.dist);
    for(const{p,dist,a}of sprites){
      const h=Math.min(H*1.8,H/dist*.8);
      const sx=HALF_W+Math.tan(a)*HALF_W/Math.tan(HALF_FOV);
      const x=sx-h/2,y=H*.45-h/2;
      const col=Math.round(sx);
      let blocked=false;
      for(let c=Math.max(0,col-Math.round(h/4));c<Math.min(W,col+Math.round(h/4));c+=4){if(this.zBuf[c]<dist){blocked=true;break;}}
      if(blocked&&dist>.5)continue;
      const br=Math.max(.15,1-dist/14);
      ctx.save();ctx.globalAlpha=br;
      // Body
      const tc=p.team==='T'?'#cc3300':'#003399';
      ctx.fillStyle=tc;ctx.fillRect(x+h*.2,y+h*.1,h*.6,h*.75);
      // Head
      ctx.fillStyle=p.team==='T'?'#bb2200':'#002288';
      ctx.beginPath();ctx.arc(x+h*.5,y+h*.1,h*.16,0,Math.PI*2);ctx.fill();
      // Eyes (white dots)
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x+h*.44,y+h*.08,h*.04,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+h*.56,y+h*.08,h*.04,0,Math.PI*2);ctx.fill();
      // Legs
      ctx.fillStyle=tc;ctx.fillRect(x+h*.22,y+h*.82,h*.22,h*.2);ctx.fillRect(x+h*.56,y+h*.82,h*.22,h*.2);
      // Weapon in hand
      ctx.fillStyle='#555';ctx.fillRect(x+h*.05,y+h*.35,h*.2,h*.08);
      if(p.hasFlag){ctx.font=`${Math.max(10,h*.18)}px sans-serif`;ctx.fillStyle='#ffcc00';ctx.textAlign='center';ctx.fillText('🚩',x+h*.5,y-6);}
      if(dist<7){
        ctx.fillStyle=p.team==='T'?'#ff8866':'#88bbff';
        ctx.font=`bold ${Math.max(9,h*.11)}px 'Share Tech Mono'`;ctx.textAlign='center';
        ctx.fillText(p.name.substring(0,12),x+h*.5,y-4);
        const bw=h*.55,bh=5,bx=x+h*.5-bw/2,by=y-13;
        ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(bx,by,bw,bh);
        ctx.fillStyle=p.hp>50?'#00ff44':p.hp>25?'#ffaa00':'#ff2200';ctx.fillRect(bx,by,bw*(p.hp/100),bh);
      }
      ctx.restore();
    }
  }
}

// ── HUD ────────────────────────────────────────
class HUD{
  constructor(cv){this.cv=cv;this.ctx=cv.getContext('2d');this.hitM=0;this.hurtA=0;this.kf=[];this.deathT=0;}
  flashHit(){this.hitM=220;}
  flashHurt(d){this.hurtA=Math.min(1,d/80);}
  showDeath(){this.deathT=Infinity;}
  addKill(k,v){this.kf.unshift({k,v,t:Date.now()});if(this.kf.length>5)this.kf.pop();}

  render(p,round,scores,ping,settings){
    const ctx=this.ctx;ctx.clearRect(0,0,W,H);
    this._cross(ctx,settings?.cross||'classic');
    this._hp(ctx,p);this._ammo(ctx,p);this._money(ctx,p);
    this._topBar(ctx,scores,round);
    this._kf(ctx);
    if(settings?.radar!==false)this._radar(ctx,p,window._game?.players||[]);
    if(this.hurtA>0){
      const v=ctx.createRadialGradient(W/2,H/2,H*.15,W/2,H/2,H*.8);
      v.addColorStop(0,'transparent');v.addColorStop(1,`rgba(200,0,0,${this.hurtA*.55})`);
      ctx.fillStyle=v;ctx.fillRect(0,0,W,H);this.hurtA=Math.max(0,this.hurtA-.028);
    }
    if(this.deathT>0){
      ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ff2200';ctx.font="bold 58px 'Bebas Neue'";ctx.textAlign='center';ctx.fillText('YOU DIED',W/2,H/2-20);
      ctx.fillStyle='#aaa';ctx.font="16px 'Share Tech Mono'";ctx.fillText('Waiting for next round...',W/2,H/2+16);
    }
    if(p.reloading){ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(W*.35,H*.88,W*.3,18);ctx.fillStyle='#ffaa00';const prog=1-p.reloadTimer/((WEAPONS[p.weapon]?.reload||2)*1000);ctx.fillRect(W*.35,H*.88,W*.3*prog,18);ctx.fillStyle='#fff';ctx.font="11px 'Share Tech Mono'";ctx.textAlign='center';ctx.fillText('RELOADING',W/2,H*.88+13);}
    if(ping){const c=ping<80?'#00ff88':ping<150?'#ffcc00':'#ff4400';ctx.fillStyle=c;ctx.font="10px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(`${ping}ms`,W-6,14);}
    if(this.hitM>0)this.hitM-=16;
  }

  _cross(ctx,style){
    const cx=W/2,cy=H/2,c=this.hitM>0?'#ff4400':'rgba(100,255,150,0.95)';
    ctx.save();ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=1.5;ctx.shadowBlur=6;ctx.shadowColor=c;
    if(style==='dot'){ctx.beginPath();ctx.arc(cx,cy,2.5,0,Math.PI*2);ctx.fill();}
    else if(style==='circle'){ctx.beginPath();ctx.arc(cx,cy,9,0,Math.PI*2);ctx.stroke();}
    else{const g=6,l=9;
      ctx.beginPath();ctx.moveTo(cx-g-l,cy);ctx.lineTo(cx-g,cy);ctx.moveTo(cx+g,cy);ctx.lineTo(cx+g+l,cy);ctx.moveTo(cx,cy-g-l);ctx.lineTo(cx,cy-g);ctx.moveTo(cx,cy+g);ctx.lineTo(cx,cy+g+l);ctx.stroke();
      if(style!=='classic'){ctx.beginPath();ctx.arc(cx,cy,2,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }

  _hp(ctx,p){
    const x=14,y=H-52,w=200,h=18;
    ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(x-2,y-2,w+4,h+4);
    ctx.fillStyle=p.hp>50?'#00cc44':p.hp>25?'#dd8800':'#cc1111';
    ctx.fillRect(x,y,w*(p.hp/100),h);
    ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#fff';ctx.font="bold 12px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(`♥ ${p.hp}`,x+5,y+13);
    if(p.armor>0){ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(x,y+21,w,5);ctx.fillStyle='#3377ff';ctx.fillRect(x,y+21,w*(p.armor/100),5);}
    // Grenades
    let gx=x;const gtype=p.grenades||{};
    if(gtype.nade>0){ctx.fillStyle='#ffaa00';ctx.font="12px 'Share Tech Mono'";ctx.fillText(`💣x${gtype.nade}`,gx,y-8);gx+=60;}
    if(gtype.smoke>0){ctx.fillText(`💨x${gtype.smoke}`,gx,y-8);gx+=60;}
    if(gtype.flash>0){ctx.fillText(`💡x${gtype.flash}`,gx,y-8);}
  }

  _ammo(ctx,p){
    const wd=p.wep;const x=W-14,y=H-24;
    const ammoStr=wd.cur===Infinity?'∞':String(wd.cur).padStart(2,'0');
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(x-90,y-28,95,34);
    ctx.fillStyle=wd.cur===0?'#ff2200':wd.cur<=5?'#ffaa00':'#ffffff';
    ctx.font="bold 30px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(ammoStr,x,y);
    ctx.fillStyle='#666';ctx.font="13px 'Share Tech Mono'";
    const maxA=WEAPONS[p.weapon]?.ammo;ctx.fillText(maxA===Infinity?'':` /${maxA}`,x-50,y);
    ctx.fillStyle='#aaa';ctx.font="10px 'Share Tech Mono'";ctx.fillText(WEAPONS[p.weapon]?.name||'',x,y-18);
  }

  _money(ctx,p){
    ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(12,H-78,100,18);
    ctx.fillStyle='#ffcc00';ctx.font="bold 14px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(`$${p.money}`,16,H-65);
  }

  _topBar(ctx,scores,round){
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(W/2-120,4,240,52);
    ctx.fillStyle='#ff6644';ctx.font="bold 16px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(`T  ${scores?.T||0}`,W/2-8,24);
    ctx.fillStyle='#666';ctx.fillText(':',W/2+2,24);
    ctx.fillStyle='#4488ff';ctx.textAlign='left';ctx.fillText(`  ${scores?.CT||0}  CT`,W/2+4,24);
    const sec=Math.max(0,Math.ceil((round.endTime-Date.now())/1000));
    ctx.fillStyle=sec<=10?'#ff4400':'#ffffff';ctx.font="bold 24px 'Share Tech Mono'";ctx.textAlign='center';
    ctx.fillText(`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`,W/2,50);
  }

  _kf(ctx){
    const now=Date.now();let ky=70;
    for(const kf of this.kf){const age=now-kf.t;if(age>5500)continue;const al=Math.min(1,(5500-age)/500);ctx.save();ctx.globalAlpha=al;ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(W-260,ky-15,252,20);ctx.font="bold 12px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillStyle=kf.k.team==='T'?'#ff8866':'#6699ff';ctx.fillText(kf.k.name.substring(0,10),W-146,ky);ctx.fillStyle='#aaa';ctx.fillText(' ☠ ',W-118,ky);ctx.fillStyle=kf.v.team==='T'?'#ff8866':'#6699ff';ctx.fillText(kf.v.name.substring(0,10),W-14,ky);ctx.restore();ky+=24;}
  }

  _radar(ctx,p,players){
    const rx=W-105,ry=H-105,rs=90,sc=rs/12;
    ctx.save();ctx.beginPath();ctx.arc(rx,ry,rs/2,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fill();ctx.clip();
    for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(MAP[y][x]>0){const wx=rx+(x-p.x)*sc,wy=ry+(y-p.y)*sc;const wc=MAP[y][x]===2?'rgba(180,140,50,0.5)':MAP[y][x]===3?'rgba(50,120,50,0.5)':MAP[y][x]===4?'rgba(150,150,150,0.5)':'rgba(255,255,255,0.18)';ctx.fillStyle=wc;ctx.fillRect(wx,wy,sc,sc);}
    for(const pl of players){if(!pl.alive)continue;const px=rx+(pl.x-p.x)*sc,py=ry+(pl.y-p.y)*sc;ctx.beginPath();ctx.arc(px,py,pl.id===p.id?5:3.5,0,Math.PI*2);ctx.fillStyle=pl.id===p.id?'#ffffff':pl.team==='T'?'#ff4400':'#0088ff';ctx.fill();if(pl.id===p.id){ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(pl.angle)*8,py+Math.sin(pl.angle)*8);ctx.stroke();}}
    ctx.restore();ctx.beginPath();ctx.arc(rx,ry,rs/2,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=1;ctx.stroke();
  }
}

// ── INPUT ──────────────────────────────────────
class Input{
  constructor(){this.keys={};this.mdx=0;this.mdy=0;this.mb=false;this.locked=false;
    window.addEventListener('keydown',e=>{this.keys[e.code]=true;if(['Tab','Space'].includes(e.code))e.preventDefault();});
    window.addEventListener('keyup',e=>{this.keys[e.code]=false;});
    window.addEventListener('mousemove',e=>{if(this.locked){this.mdx+=e.movementX;this.mdy+=e.movementY;}});
    window.addEventListener('mousedown',e=>{if(e.button===0)this.mb=true;});
    window.addEventListener('mouseup',e=>{if(e.button===0)this.mb=false;});
  }
  consume(){const dx=this.mdx,dy=this.mdy;this.mdx=0;this.mdy=0;return{dx,dy};}
}

// ── AUDIO ──────────────────────────────────────
class Audio2{
  constructor(){try{this.ctx=new AudioContext();}catch(e){this.ctx=null;}}
  play(type){
    if(!this.ctx)return;const ac=this.ctx,g=ac.createGain();g.connect(ac.destination);
    if(type==='shoot'){const b=ac.createBuffer(1,ac.sampleRate*.08,ac.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/700)*.9;const s=ac.createBufferSource();s.buffer=b;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=750;f.Q.value=.4;s.connect(f);f.connect(g);g.gain.setValueAtTime(.4,ac.currentTime);s.start();}
    else if(type==='reload'){const o=ac.createOscillator();o.type='square';o.frequency.value=190;o.connect(g);g.gain.setValueAtTime(.09,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.14);o.start();o.stop(ac.currentTime+.14);}
    else if(type==='step'){const o=ac.createOscillator();o.type='sine';o.frequency.value=60;o.connect(g);g.gain.setValueAtTime(.07,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.08);o.start();o.stop(ac.currentTime+.08);}
    else if(type==='hit'){const b=ac.createBuffer(1,ac.sampleRate*.04,ac.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*.5*Math.exp(-i/350);const s=ac.createBufferSource();s.buffer=b;s.connect(g);g.gain.setValueAtTime(.3,ac.currentTime);s.start();}
    else if(type==='plant'){const o=ac.createOscillator();o.type='sine';o.frequency.value=440;o.connect(g);g.gain.setValueAtTime(.15,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.3);o.start();o.stop(ac.currentTime+.3);}
  }
}

// ── SCOREBOARD ──────────────────────────────────
function renderScoreboard(ctx,players,vis){
  if(!vis)return;
  const h=players.length*30+90;
  ctx.fillStyle='rgba(0,0,0,0.9)';ctx.fillRect(W/2-270,50,540,h);
  ctx.strokeStyle='rgba(255,107,0,0.3)';ctx.lineWidth=1;ctx.strokeRect(W/2-270,50,540,h);
  ctx.fillStyle='#fff';ctx.font="bold 16px 'Share Tech Mono'";ctx.textAlign='center';ctx.fillText('SCOREBOARD',W/2,76);
  let y=96;
  for(const team of['CT','T']){
    const pl=players.filter(p=>p.team===team);
    ctx.fillStyle=team==='T'?'#ff6633':'#3399ff';ctx.font="bold 11px 'Share Tech Mono'";ctx.textAlign='left';
    ctx.fillText(team==='T'?'── TERRORISTS ──':'── COUNTER-TERRORISTS ──',W/2-255,y);y+=16;
    for(const p of pl){
      ctx.fillStyle=p.isBot?'#666':'#ddd';ctx.font="12px 'Share Tech Mono'";
      ctx.textAlign='left';ctx.fillText((p.isBot?'[BOT] ':'')+p.name.substring(0,18),W/2-255,y);
      ctx.textAlign='center';ctx.fillStyle=p.team==='T'?'#ff8866':'#6699ff';ctx.fillText(`${p.kills} / ${p.deaths}`,W/2+100,y);
      ctx.fillStyle='#888';ctx.fillText(`$${p.money}`,W/2+210,y);
      y+=22;
    }y+=4;
  }
}

// ══════════════════════════════════════════════
//  MAIN GAME CLASS
// ══════════════════════════════════════════════
const MOVE_SPEED=0.046;
class Game{
  constructor(c3d,chd,fbCfg,settings){
    this.c3d=c3d;this.chd=chd;
    this.rc=new Raycaster(c3d);this.hud=new HUD(chd);
    this.inp=new Input();this.snd=new Audio2();this.ac=new AntiCheat();
    this.settings=settings||{};
    this.localPlayer=null;this.players=[];this.bots=[];
    this.round={num:1,endTime:Date.now()+115000};this.scores={T:0,CT:0};
    this.showSB=false;this.modeCtrl=null;this.gameMode='bomb';
    this.roundEndMsg=null;this.roundEndT=0;
    this.wepR=new WeaponRenderer(c3d.getContext('2d'));
    this.db=null;this.roomId=null;this.ping=0;
    this.lastTime=0;this.stepT=0;
    if(fbCfg)this._fb(fbCfg);
    window._game=this;
  }
  _fb(cfg){try{if(!firebase.apps.length)firebase.initializeApp(cfg);this.db=firebase.database();}catch(e){}}

  startSingleplayer(name,team,mode,diff){
    this.gameMode=mode||'bomb';
    const dc={easy:{ae:.16,rt:500},normal:{ae:.08,rt:320},hard:{ae:.03,rt:160},expert:{ae:.01,rt:70}}[diff||'normal'];
    const t=team==='AUTO'?['T','CT'][Math.random()>.5?1:0]:team||'T';
    this.localPlayer=new Player(name||'Player',t,0);
    this.localPlayer.weapons.ak47={...WEAPONS.ak47,cur:30};this.localPlayer.weapons.m4a4={...WEAPONS.m4a4,cur:30};
    this.localPlayer.weapon=t==='T'?'ak47':'m4a4';
    this.players=[this.localPlayer];
    this.modeCtrl=mode==='bomb'?new BombMode():mode==='deathmatch'?new DeathmatchMode():mode==='ctf'?new CTFMode():new ArmsRaceMode();
    let ti=1,ci=0;
    for(let i=0;i<9;i++){const bt=i<4?'T':'CT';const bot=new Bot(`Bot_${i+1}`,bt,bt===t?ti++:ci++);bot.aimErr=dc.ae;bot.reactionMs=dc.rt;this.bots.push(bot);this.players.push(bot);}
    if(this.modeCtrl.init)this.modeCtrl.init(this.players);
    this.gameLoop();
  }

  startMultiplayer(name,team,mode,roomId){
    this.roomId=roomId;this.gameMode=mode||'bomb';
    const t=team||'T';
    this.localPlayer=new Player(name||'Player',t,0);
    this.localPlayer.weapons.ak47={...WEAPONS.ak47,cur:30};this.localPlayer.weapon=t==='T'?'ak47':'m4a4';
    this.players=[this.localPlayer];
    this.modeCtrl=mode==='bomb'?new BombMode():mode==='deathmatch'?new DeathmatchMode():mode==='ctf'?new CTFMode():new ArmsRaceMode();
    if(this.db){
      const ref=this.db.ref(`csrooms/${roomId}/players/${name}`);
      ref.set({name,team:t,x:this.localPlayer.x,y:this.localPlayer.y,angle:0,hp:100,alive:true,weapon:'ak47',kills:0,deaths:0});ref.onDisconnect().remove();
      this.db.ref(`csrooms/${roomId}/players`).on('value',snap=>{const data=snap.val()||{};for(const[id,pd]of Object.entries(data)){if(id===name)continue;let p=this.players.find(p=>p.id===id);if(!p){p=new Player(id,pd.team,0);this.players.push(p);}Object.assign(p,pd);}const need=10-this.players.length;for(let i=this.bots.length;i<need;i++){const b=new Bot(`Bot_${i}`,i%2===0?'T':'CT',i);this.bots.push(b);this.players.push(b);}});
      setInterval(()=>{this.ping=20+Math.random()*25;},2000);
    }
    this.gameLoop();
  }

  gameLoop(ts=0){const dt=Math.min(ts-this.lastTime,50);this.lastTime=ts;this.update(dt);this.render();requestAnimationFrame(t=>this.gameLoop(t));}

  update(dt){
    window._gfx=window._gfx.filter(g=>{g.t+=dt;return g.t<g.maxT;});
    window._flashT=Math.max(0,(window._flashT||0)-dt);
    if(this.roundEndT>0){this.roundEndT-=dt;if(this.roundEndT<=0){this.roundEndMsg=null;this.nextRound();}return;}

    if(!this.localPlayer?.alive){for(const b of this.bots)b.update(dt,this.players);if(this.modeCtrl?.update)this.modeCtrl.update(dt,this.players,this);return;}

    const p=this.localPlayer,inp=this.inp;
    const sens=(this.settings.sens||8)*.00022;
    const {dx,dy}=inp.consume();
    p.angle+=dx*sens;
    this.wepR.sway(dx,dy);
    if(inp.keys['ArrowLeft']||inp.keys['KeyQ'])p.angle-=.003*dt;
    if(inp.keys['ArrowRight'])p.angle+=.003*dt;

    const cr=inp.keys['ControlLeft'];const run=inp.keys['ShiftLeft']&&!cr;
    const spd=MOVE_SPEED*dt*(run?1.55:cr?.4:1);
    let mx=0,my=0;
    if(inp.keys['KeyW']||inp.keys['ArrowUp']){mx+=Math.cos(p.angle)*spd;my+=Math.sin(p.angle)*spd;}
    if(inp.keys['KeyS']||inp.keys['ArrowDown']){mx-=Math.cos(p.angle)*spd;my-=Math.sin(p.angle)*spd;}
    if(inp.keys['KeyA']){mx+=Math.cos(p.angle-Math.PI/2)*spd;my+=Math.sin(p.angle-Math.PI/2)*spd;}
    if(inp.keys['KeyD']){mx+=Math.cos(p.angle+Math.PI/2)*spd;my+=Math.sin(p.angle+Math.PI/2)*spd;}
    const r=0.28;
    if(walkable(p.x+mx+r*Math.sign(mx),p.y)&&walkable(p.x+mx-r*Math.sign(mx||.001),p.y))p.x+=mx;
    if(walkable(p.x,p.y+my+r*Math.sign(my))&&walkable(p.x,p.y+my-r*Math.sign(my||.001)))p.y+=my;
    p.moving=Math.abs(mx)+Math.abs(my)>.001;
    p.crouching=cr;
    // Footstep sound
    if(p.moving&&!cr){this.stepT+=dt;if(this.stepT>350){this.stepT=0;this.snd.play('step');}}

    // Weapon slots
    if(inp.keys['Digit1'])p.weapon='knife';
    if(inp.keys['Digit2']){const w=['usp','glock','p250','deagle'].find(x=>p.weapons[x]);if(w)p.weapon=w;}
    if(inp.keys['Digit3']){const w=['ak47','m4a4','sg553','aug','mp9','mac10'].find(x=>p.weapons[x]);if(w)p.weapon=w;}
    if(inp.keys['Digit4']){const w=['awp','scout'].find(x=>p.weapons[x]);if(w)p.weapon=w;}
    if(inp.keys['Digit5']&&(p.grenades?.nade||0)>0&&!inp.keys['_g5']){throwGrenade(p,'nade');inp.keys['_g5']=true;}
    if(inp.keys['Digit6']&&(p.grenades?.smoke||0)>0&&!inp.keys['_g6']){throwGrenade(p,'smoke');inp.keys['_g6']=true;}
    if(inp.keys['Digit7']&&(p.grenades?.flash||0)>0&&!inp.keys['_g7']){throwGrenade(p,'flash');inp.keys['_g7']=true;}
    if(!inp.keys['Digit5'])inp.keys['_g5']=false;if(!inp.keys['Digit6'])inp.keys['_g6']=false;if(!inp.keys['Digit7'])inp.keys['_g7']=false;

    // Plant bomb
    if(inp.keys['KeyE']&&this.modeCtrl instanceof BombMode&&p.hasBomb){if(this.modeCtrl.tryPlant(p))this.snd.play('plant');}

    // Reload
    if(inp.keys['KeyR']&&!p.reloading)this._reload(p);
    if(p.reloadTimer>0){p.reloadTimer=Math.max(0,p.reloadTimer-dt);if(p.reloadTimer===0){p.reloading=false;const wi=WEAPONS[p.weapon];if(wi&&p.weapons[p.weapon])p.wep.cur=wi.ammo;}}

    // Shoot
    p.shootTimer=Math.max(0,p.shootTimer-dt);
    const wi=WEAPONS[p.weapon];
    const canS=inp.mb&&!p.reloading&&p.shootTimer<=0&&(p.wep?.cur>0||p.wep?.cur===Infinity);
    if(canS&&(wi?.auto||inp.keys['_ms']!==inp.mb)){inp.keys['_ms']=inp.mb;this._shoot(p);}
    if(!inp.mb)inp.keys['_ms']=false;

    this.showSB=!!inp.keys['Tab'];
    this.ac.check(p,dt);
    this.wepR.update(dt,p.moving,false);

    for(const b of this.bots)b.update(dt,this.players);
    if(this.modeCtrl?.update)this.modeCtrl.update(dt,this.players,this);
    if(this.db&&this.roomId&&Date.now()%50<18)this.db.ref(`csrooms/${this.roomId}/players/${p.id}`).update({x:p.x,y:p.y,angle:p.angle,hp:p.hp,alive:p.alive,weapon:p.weapon,kills:p.kills,deaths:p.deaths});
  }

  _shoot(p){
    const wi=WEAPONS[p.weapon];if(!wi||!p.wep)return;
    if(p.wep.cur<=0&&p.wep.cur!==Infinity){this._reload(p);return;}
    if(p.wep.cur!==Infinity)p.wep.cur--;
    p.shootTimer=60000/wi.rpm;
    if(this.settings.sound!==false)this.snd.play('shoot');
    this.wepR.shoot();
    // Add spread based on movement/crouch
    const baseSpread=wi.spread*(p.moving?2:p.crouching?.3:1);
    const spread=baseSpread*(Math.random()-.5)*2;
    const sa=p.angle+spread,cos=Math.cos(sa),sin=Math.sin(sa);
    for(const t of this.players){
      if(!t.alive||t.id===p.id||t.team===p.team)continue;
      const ddx=t.x-p.x,ddy=t.y-p.y,dist=Math.hypot(ddx,ddy);
      if(dist>wi.range)continue;
      const dot=(ddx*cos+ddy*sin)/dist;if(dot<.96)continue;
      let blocked=false;const steps=Math.ceil(dist*6);
      for(let s=1;s<steps;s++){const tx=p.x+cos*(s/steps*dist),ty=p.y+sin*(s/steps*dist);if(!walkable(tx,ty)){blocked=true;break;}}
      if(blocked)continue;
      // Head/body multiplier (rough approximation)
      const headshot=Math.random()<.15&&dist<6?2:1;
      t.takeDamage(wi.dmg*(0.8+Math.random()*.4)*(1-dist/wi.range*.28)*headshot,p);
      if(this.settings.sound!==false)this.snd.play('hit');
      break;
    }
  }

  _reload(p){if(p.reloading||WEAPONS[p.weapon]?.ammo===Infinity)return;p.reloading=true;const t=(WEAPONS[p.weapon]?.reload||2)*1000;p.reloadTimer=t;if(this.settings.sound!==false)this.snd.play('reload');}

  roundEnd(team,msg){if(this.roundEndMsg)return;this.roundEndMsg=msg;this.roundEndT=5000;this.scores[team]=(this.scores[team]||0)+1;for(const p of this.players)p.money=Math.min(16000,p.money+(p.team===team?3250:1400));}

  nextRound(){
    this.round.num++;this.round.endTime=Date.now()+115000;
    let ti=0,ci=0;
    for(const p of this.players){
      const si=p.team==='T'?ti++:ci++;const sp=getSpawn(p.team,si);
      p.x=sp.x+.5;p.y=sp.y+.5;p.angle=p.team==='T'?Math.PI*.25:Math.PI*1.25;
      p.hp=100;p.alive=true;p.reloading=false;p.reloadTimer=0;p.shootTimer=0;p.hasBomb=false;p.hasFlag=false;p._dmR=0;
      if(p.weapons.ak47)p.weapons.ak47.cur=30;if(p.weapons.m4a4)p.weapons.m4a4.cur=30;if(p.weapons.usp)p.weapons.usp.cur=12;
    }
    this.hud.deathT=0;
    if(this.modeCtrl?.init)this.modeCtrl.init(this.players);
  }

  render(){
    if(!this.localPlayer)return;
    const ctx3=this.c3d.getContext('2d');

    this.rc.render(this.localPlayer,this.players);

    // Smoke grenade effect
    for(const g of window._gfx){
      if(g.type==='smoke'){const dx=g.x-this.localPlayer.x,dy=g.y-this.localPlayer.y,d=Math.hypot(dx,dy);if(d<5){const al=Math.min(.7,(1-d/5)*.8)*(g.t<400?g.t/400:g.t>8000?(9000-g.t)/1000:1);ctx3.fillStyle=`rgba(180,180,180,${al})`;ctx3.fillRect(0,0,W,H);}}
    }

    // Flash
    if(window._flashT>0){ctx3.fillStyle=`rgba(255,255,255,${Math.min(1,window._flashT/180)})`;ctx3.fillRect(0,0,W,H);}

    // Draw weapon (only if alive)
    if(this.localPlayer.alive){
      this.wepR.draw(this.localPlayer.weapon,this.localPlayer.reloading,this.localPlayer.wep?.cur);
    }

    // HUD
    this.hud.render(this.localPlayer,this.round,this.scores,this.ping,this.settings);

    const hctx=this.chd.getContext('2d');
    renderScoreboard(hctx,this.players,this.showSB);

    // Mode HUD
    this._modeHUD(ctx3);

    // Round end banner
    if(this.roundEndMsg){
      ctx3.fillStyle='rgba(0,0,0,0.75)';ctx3.fillRect(W/2-210,H/2-44,420,82);
      ctx3.strokeStyle='rgba(255,107,0,0.5)';ctx3.lineWidth=1;ctx3.strokeRect(W/2-210,H/2-44,420,82);
      ctx3.fillStyle='#ffcc00';ctx3.font="bold 26px 'Bebas Neue'";ctx3.textAlign='center';ctx3.fillText(this.roundEndMsg,W/2,H/2-10);
      ctx3.fillStyle='#888';ctx3.font="13px 'Share Tech Mono'";ctx3.fillText('Next round starting...',W/2,H/2+18);
    }

    // FPS
    if(this.settings.fps!==false){
      if(!this._fT){this._fps=60;this._fT=performance.now();}
      const n=performance.now(),e=n-this._fT;this._fT=n;this._fps=Math.round(.88*this._fps+.12*(1000/Math.max(1,e)));
      ctx3.fillStyle=this._fps>50?'#00ff88':this._fps>30?'#ffaa00':'#ff2200';ctx3.font="10px 'Share Tech Mono'";ctx3.textAlign='right';ctx3.fillText(`${this._fps}fps`,W-6,26);
    }
  }

  _modeHUD(ctx){
    ctx.textAlign='center';
    if(this.modeCtrl instanceof BombMode){
      const b=this.modeCtrl.bomb;
      if(b?.planted){const s=Math.ceil(b.timer/1000);ctx.fillStyle=s<=10?'#ff2200':'#ffaa00';ctx.font="bold 28px 'Share Tech Mono'";ctx.fillText(`💣 ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`,W/2,H-82);if(b.defuse>0){ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(W/2-90,H-74,180,12);ctx.fillStyle=this.localPlayer.hasDefuse?'#00ff88':'#00aaff';ctx.fillRect(W/2-90,H-74,180*b.defuse,12);ctx.fillStyle='#fff';ctx.font="10px 'Share Tech Mono'";ctx.fillText('DEFUSING...',W/2,H-64);}}
      if(this.localPlayer?.hasBomb){ctx.fillStyle='#ffcc00';ctx.font="12px 'Share Tech Mono'";ctx.fillText('💣 BOMB CARRIER  —  E to plant at SITE A (top-left) or B (bot-right)',W/2,H-18);}
    }
    if(this.modeCtrl instanceof CTFMode){
      if(this.localPlayer?.hasFlag){ctx.fillStyle='#ffcc00';ctx.font="12px 'Share Tech Mono'";ctx.fillText('🚩 YOU HAVE THE FLAG — return to your base!',W/2,H-18);}
      const s=this.modeCtrl.scores;
      ctx.font="12px 'Share Tech Mono'";ctx.fillStyle='#ff6644';ctx.textAlign='left';ctx.fillText(`T 🚩 ${s.T}/${this.modeCtrl.target}`,10,H-18);
      ctx.fillStyle='#44aaff';ctx.textAlign='right';ctx.fillText(`CT 🚩 ${s.CT}/${this.modeCtrl.target}`,W-10,H-18);
    }
    if(this.modeCtrl instanceof ArmsRaceMode){
      const pr=this.modeCtrl.prog[this.localPlayer?.id]||0;
      ctx.fillStyle='#ffcc00';ctx.font="11px 'Share Tech Mono'";ctx.textAlign='right';
      ctx.fillText(`Arms ${pr+1}/${ARM_CHAIN.length}: ${WEAPONS[ARM_CHAIN[pr]]?.name||''}`,W-10,H-18);
    }
  }
}
window.Game=Game;
