// CS•BROWSER ENGINE v2.0 — Full game engine
'use strict';

const W=960,H=540,FOV=Math.PI/3,HALF_FOV=FOV/2,NUM_RAYS=320;
const RAY_STEP=FOV/NUM_RAYS,MAX_DEPTH=20,MOVE_SPEED=0.05,ROT_SPEED=0.002;

const MAP=[
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,1,0,0,0,0,1,1,0,0,0,1],
  [1,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,0,1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,1,0,0,0,0,1,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];
const MAP_W=MAP[0].length,MAP_H=MAP.length;
const SPAWNS_T=[{x:2.5,y:2.5},{x:3.5,y:2.5},{x:2.5,y:3.5},{x:3.5,y:3.5},{x:4.5,y:2.5}];
const SPAWNS_CT=[{x:16.5,y:16.5},{x:15.5,y:16.5},{x:16.5,y:15.5},{x:15.5,y:15.5},{x:14.5,y:16.5}];
function getSpawn(team,idx){const a=team==='T'?SPAWNS_T:SPAWNS_CT;return a[idx%a.length];}

const WEAPONS={
  knife: {name:'Knife',   damage:85,  rpm:60,   ammo:Infinity,reload:1.0, spread:0,    range:2,  automatic:false,price:0},
  pistol:{name:'USP-S',  damage:35,  rpm:400,  ammo:12,      reload:2.2, spread:0.01, range:15, automatic:false,price:300},
  glock: {name:'Glock',  damage:28,  rpm:400,  ammo:20,      reload:2.2, spread:0.02, range:14, automatic:true, price:200},
  p250:  {name:'P250',   damage:38,  rpm:400,  ammo:13,      reload:2.2, spread:0.015,range:14, automatic:false,price:300},
  deagle:{name:'Deagle', damage:63,  rpm:267,  ammo:7,       reload:2.2, spread:0.02, range:20, automatic:false,price:700},
  ak47:  {name:'AK-47',  damage:36,  rpm:600,  ammo:30,      reload:2.5, spread:0.015,range:20, automatic:true, price:2700},
  m4a4:  {name:'M4A4',   damage:33,  rpm:666,  ammo:30,      reload:3.1, spread:0.012,range:20, automatic:true, price:3100},
  sg553: {name:'SG553',  damage:34,  rpm:545,  ammo:30,      reload:2.8, spread:0.013,range:22, automatic:true, price:3000},
  aug:   {name:'AUG',    damage:32,  rpm:600,  ammo:30,      reload:3.0, spread:0.011,range:22, automatic:true, price:3300},
  awp:   {name:'AWP',    damage:115, rpm:41,   ammo:10,      reload:3.7, spread:0.001,range:50, automatic:false,price:4750},
  scout: {name:'Scout',  damage:75,  rpm:100,  ammo:10,      reload:3.0, spread:0.003,range:40, automatic:false,price:1700},
  mp9:   {name:'MP9',    damage:26,  rpm:857,  ammo:30,      reload:2.1, spread:0.02, range:12, automatic:true, price:1250},
  mac10: {name:'MAC-10', damage:29,  rpm:800,  ammo:30,      reload:2.0, spread:0.025,range:10, automatic:true, price:1050},
};
window.WEAPONS=WEAPONS;

// ── PLAYER ──
class Player{
  constructor(id,team,idx){
    const sp=getSpawn(team,idx);
    this.id=id;this.team=team;this.x=sp.x;this.y=sp.y;
    this.angle=team==='T'?0:Math.PI;
    this.hp=100;this.armor=0;this.money=800;
    this.weapon='pistol';this.weapons={knife:{...WEAPONS.knife,currentAmmo:Infinity},pistol:{...WEAPONS.pistol,currentAmmo:12}};
    this.kills=0;this.deaths=0;this.alive=true;this.name=id;this.isBot=false;
    this.reloading=false;this.reloadTimer=0;this.shootTimer=0;
    this.grenades={};this.hasFlag=false;this.hasBomb=false;this.hasHelmet=false;this.hasDefuse=false;
  }
  get wepData(){return this.weapons[this.weapon]||this.weapons.knife;}
  get wepInfo(){return WEAPONS[this.weapon]||WEAPONS.knife;}
}

Player.prototype.takeDamage=function(dmg,attacker){
  if(!this.alive)return;
  // Anticheat: attacker can't heal themselves
  if(attacker&&attacker.id===this.id) return;
  const absorp=Math.min(this.armor,dmg*(this.hasHelmet?0.4:0.5));
  this.armor=Math.max(0,this.armor-absorp*2);
  this.hp=Math.max(0,this.hp-(dmg-absorp));
  const g=window._game;
  if(attacker?.id===g?.localPlayer?.id) g?.hud?.showHit(dmg);
  if(this.id===g?.localPlayer?.id) g?.hud?.showHurt(dmg);
  if(this.hp<=0){
    this.alive=false;this.deaths++;
    if(attacker){
      attacker.kills++;
      g?.hud?.addKill(attacker,this);
      if(g?.modeCtrl?.onKill) g.modeCtrl.onKill(attacker,this);
    }
    if(g?.modeCtrl?.onDeath) g.modeCtrl.onDeath(this);
  }
};

// ── BOT AI ──
const BOT_NAMES=['xXxBot','Ruslan_pro','QuickD','Nomad','SilentK','Rush_B','Vodka','Sasha_pro','GhostSniper','IronWall'];
class Bot extends Player{
  constructor(id,team,idx){
    super(id,team,idx);this.isBot=true;
    this.name=BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)];
    this.aimError=0.07;this.reactionTime=350;
    this.state='patrol';this.target=null;this.lastSeenPos=null;
    this.patrolPts=this._genPatrol();this.patrolIdx=0;
    this.stuckTimer=0;this.lastPos={x:this.x,y:this.y};
    this.weapon=team==='T'?'ak47':'m4a4';
    this.weapons[this.weapon]={...WEAPONS[this.weapon],currentAmmo:WEAPONS[this.weapon].ammo};
  }
  _genPatrol(){const pts=[];for(let i=0;i<6;i++){let x,y,t=0;do{x=1+Math.random()*(MAP_W-2);y=1+Math.random()*(MAP_H-2);t++;}while(MAP[Math.floor(y)]?.[Math.floor(x)]===1&&t<20);pts.push({x,y});}return pts;}
  canSee(tgt){
    const dx=tgt.x-this.x,dy=tgt.y-this.y,dist=Math.hypot(dx,dy);
    if(dist>12)return false;
    const steps=Math.ceil(dist*4);
    for(let i=1;i<steps;i++){const tx=this.x+dx*(i/steps),ty=this.y+dy*(i/steps);if(MAP[Math.floor(ty)]?.[Math.floor(tx)]===1)return false;}
    return true;
  }
  tryMove(dx,dy){const nx=this.x+dx,ny=this.y+dy;if(MAP[Math.floor(this.y)]?.[Math.floor(nx)]!==1)this.x=nx;if(MAP[Math.floor(ny)]?.[Math.floor(this.x)]!==1)this.y=ny;}
  update(dt,players){
    if(!this.alive)return;
    this.shootTimer=Math.max(0,this.shootTimer-dt);
    this.stuckTimer+=dt;
    const dx=this.x-this.lastPos.x,dy=this.y-this.lastPos.y;
    if(this.stuckTimer>500&&Math.hypot(dx,dy)<0.01){this.angle+=(Math.random()-.5)*Math.PI;this.stuckTimer=0;}
    if(Math.hypot(dx,dy)>0.01){this.lastPos={x:this.x,y:this.y};this.stuckTimer=0;}
    let nearest=null,nearDist=Infinity;
    for(const p of players){if(!p.alive||p.team===this.team||p.id===this.id)continue;const d=Math.hypot(p.x-this.x,p.y-this.y);if(d<nearDist&&this.canSee(p)){nearest=p;nearDist=d;}}
    this.target=nearest;
    if(this.target){this.state=nearDist<8?'attack':'chase';this.lastSeenPos={x:this.target.x,y:this.target.y};}
    else if(this.lastSeenPos)this.state='search';
    else this.state='patrol';
    const spd=MOVE_SPEED*0.7*dt;
    switch(this.state){
      case'attack':{
        const ta=Math.atan2(this.target.y-this.y,this.target.x-this.x);
        this.angle+=(ta+(Math.random()-.5)*this.aimError-this.angle)*0.15;
        if(this.shootTimer<=0&&!this.reloading)this._botShoot(players);
        const sa=this.angle+Math.PI/2;this.tryMove(Math.cos(sa)*spd*0.3,Math.sin(sa)*spd*0.3);
        break;}
      case'chase':{const ta=Math.atan2(this.target.y-this.y,this.target.x-this.x);this.angle+=(ta-this.angle)*0.1;this.tryMove(Math.cos(this.angle)*spd,Math.sin(this.angle)*spd);break;}
      case'search':{if(this.lastSeenPos){const ta=Math.atan2(this.lastSeenPos.y-this.y,this.lastSeenPos.x-this.x);this.angle+=(ta-this.angle)*0.1;this.tryMove(Math.cos(this.angle)*spd,Math.sin(this.angle)*spd);if(Math.hypot(this.x-this.lastSeenPos.x,this.y-this.lastSeenPos.y)<0.5)this.lastSeenPos=null;}break;}
      case'patrol':{const pt=this.patrolPts[this.patrolIdx];if(pt){const ta=Math.atan2(pt.y-this.y,pt.x-this.x);this.angle+=(ta-this.angle)*0.1;this.tryMove(Math.cos(this.angle)*spd,Math.sin(this.angle)*spd);if(Math.hypot(this.x-pt.x,this.y-pt.y)<0.4)this.patrolIdx=(this.patrolIdx+1)%this.patrolPts.length;}break;}
    }
  }
  _botShoot(players){
    const wep=WEAPONS[this.weapon];if(!wep)return;
    if(this.weapons[this.weapon]?.currentAmmo<=0){this.reloading=true;this.reloadTimer=wep.reload*1000;setTimeout(()=>{this.reloading=false;if(this.weapons[this.weapon])this.weapons[this.weapon].currentAmmo=wep.ammo;},wep.reload*1000);return;}
    if(this.weapons[this.weapon])this.weapons[this.weapon].currentAmmo--;
    this.shootTimer=60000/wep.rpm;
    if(this.target&&this.canSee(this.target)&&Math.random()>0.3){
      this.target.takeDamage(wep.damage*(0.7+Math.random()*0.6),this);
    }
  }
}

// ── ANTICHEAT ──
class AntiCheat{
  constructor(){this.lastPos={x:0,y:0};this.violations=0;}
  check(p,dt){
    if(!p)return;
    const dist=Math.hypot(p.x-this.lastPos.x,p.y-this.lastPos.y);
    const maxAllowed=MOVE_SPEED*1.8*(dt/16)*dt;
    if(dist>maxAllowed*3&&dist>0.4){this.violations++;if(this.violations>8){p.x=this.lastPos.x;p.y=this.lastPos.y;}}
    else this.violations=Math.max(0,this.violations-1);
    if(p.hp>100)p.hp=100;
    if(p.armor>100)p.armor=100;
    if(p.money>16000)p.money=16000;
    for(const[wid,wd]of Object.entries(p.weapons||{})){const mx=WEAPONS[wid]?.ammo||30;if(wd.currentAmmo!==Infinity&&wd.currentAmmo>mx)wd.currentAmmo=mx;}
    this.lastPos={x:p.x,y:p.y};
  }
}

// ── GRENADES ──
window._grenadeEffects=[];
window._flashTime=0;
function throwGrenade(player,type){
  const g={x:player.x+Math.cos(player.angle)*0.8,y:player.y+Math.sin(player.angle)*0.8,type,t:0,maxT:type==='smoke'?8000:600,alive:true};
  window._grenadeEffects.push(g);
  if(player.grenades)player.grenades[type]=Math.max(0,(player.grenades[type]||1)-1);
  if(type==='nade'){setTimeout(()=>{const gm=window._game;if(!gm)return;for(const p of gm.players){if(!p.alive)continue;const d=Math.hypot(p.x-g.x,p.y-g.y);if(d<2.5)p.takeDamage((1-d/2.5)*90,player);}},400);}
  if(type==='flash'){setTimeout(()=>{const p=window._game?.localPlayer;if(p){const d=Math.hypot(p.x-g.x,p.y-g.y);if(d<3)window._flashTime=1500;}},300);}
}

// ── GAME MODES ──
class BombMode{
  constructor(){this.bomb=null;this.bombCarrier=null;}
  init(players){const ts=players.filter(p=>p.team==='T'&&p.alive);if(ts.length){this.bombCarrier=ts[0];this.bombCarrier.hasBomb=true;}this.bomb=null;}
  tryPlant(player){if(!player.hasBomb||this.bomb?.planted)return false;const onA=Math.hypot(player.x-3,player.y-3)<2.5,onB=Math.hypot(player.x-16,player.y-16)<2.5;if(onA||onB){this.bomb={x:player.x,y:player.y,planted:true,timer:40000,defuseProgress:0};player.hasBomb=false;return true;}return false;}
  update(dt,players,game){
    if(this.bomb?.planted){
      this.bomb.timer-=dt;
      if(this.bomb.timer<=0){game.roundEnd('T','💣 BOMB EXPLODED');for(const p of players){if(!p.alive)continue;const d=Math.hypot(p.x-this.bomb.x,p.y-this.bomb.y);if(d<4)p.takeDamage(d<1.5?500:d<3?150:60,null);}return;}
      const lp=game.localPlayer;
      if(lp?.alive&&lp.team==='CT'){const d=Math.hypot(lp.x-this.bomb.x,lp.y-this.bomb.y);if(d<1.5&&game.input?.keys['KeyE']){const spd=lp.hasDefuse?0.5:1;this.bomb.defuseProgress=(this.bomb.defuseProgress||0)+dt/1000*spd;if(this.bomb.defuseProgress>=1)game.roundEnd('CT','✅ BOMB DEFUSED');}else this.bomb.defuseProgress=0;}
    }
    const ta=players.filter(p=>p.team==='T'&&p.alive).length,ca=players.filter(p=>p.team==='CT'&&p.alive).length;
    if(!ta&&!this.bomb?.planted)game.roundEnd('CT','All Ts eliminated');
    if(!ca&&!this.bomb?.planted)game.roundEnd('T','All CTs eliminated');
  }
}
class DeathmatchMode{
  constructor(){this.target=30;}
  update(dt,players,game){
    for(const p of players)if(p.kills>=this.target){game.roundEnd(p.team,`🏆 ${p.name} wins!`);return;}
    for(const p of players)if(!p.alive&&p._dmR){p._dmR-=dt;if(p._dmR<=0){const sp=getSpawn(p.team,Math.floor(Math.random()*5));p.x=sp.x;p.y=sp.y;p.hp=100;p.alive=true;p._dmR=0;}}
  }
  onKill(killer,victim){if(victim)victim._dmR=3000;}
}
class CTFMode{
  constructor(){this.flags={T:{x:2,y:2,held:null,atBase:true},CT:{x:17,y:17,held:null,atBase:true}};this.scores={T:0,CT:0};this.target=3;}
  update(dt,players,game){
    for(const p of players){if(!p.alive)continue;const et=p.team==='T'?'CT':'T';const ef=this.flags[et];const of2=this.flags[p.team];
    if(!ef.held&&Math.hypot(p.x-ef.x,p.y-ef.y)<0.8){ef.held=p;p.hasFlag=true;}
    if(ef.held===p){ef.x=p.x;ef.y=p.y;}
    if(p.hasFlag&&of2.atBase&&Math.hypot(p.x-of2.x,p.y-of2.y)<1){this.scores[p.team]++;p.hasFlag=false;ef.held=null;ef.atBase=true;ef.x=p.team==='T'?17:2;ef.y=p.team==='T'?17:2;if(this.scores[p.team]>=this.target)game.roundEnd(p.team,`🚩 ${p.team} wins CTF!`);}}
  }
  onDeath(victim){if(victim.hasFlag){const et=victim.team==='T'?'CT':'T';const f=this.flags[et];f.held=null;f.x=victim.x;f.y=victim.y;f.atBase=false;victim.hasFlag=false;}}
}
const ARMS_CHAIN=['knife','glock','p250','deagle','mac10','mp9','ak47','m4a4','sg553','aug','awp','scout'];
class ArmsRaceMode{
  constructor(){this.progress={};}
  init(players){for(const p of players){this.progress[p.id]=0;}}
  update(dt,players,game){}
  onKill(killer){if(!killer)return;const idx=Math.min((this.progress[killer.id]||0)+1,ARMS_CHAIN.length-1);this.progress[killer.id]=idx;const wid=ARMS_CHAIN[idx];if(WEAPONS[wid]&&!killer.weapons[wid])killer.weapons[wid]={...WEAPONS[wid],currentAmmo:WEAPONS[wid].ammo};killer.weapon=wid;if(idx>=ARMS_CHAIN.length-1)window._game?.roundEnd(killer.team,`🏆 ${killer.name} wins Arms Race!`);}
}

// ── RAYCASTER ──
class Raycaster{
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.zbuf=new Float32Array(NUM_RAYS);this.sliceW=W/NUM_RAYS;}
  castRay(px,py,angle){
    const cos=Math.cos(angle),sin=Math.sin(angle);
    let dist=0,side=0;const dx=cos>0?1:-1,dy=sin>0?1:-1;let x=px,y=py;
    for(let s=0;s<MAX_DEPTH*10;s++){
      const dX=cos!==0?((dx>0?Math.ceil(x)-x:x-Math.floor(x))/Math.abs(cos)):Infinity;
      const dY=sin!==0?((dy>0?Math.ceil(y)-y:y-Math.floor(y))/Math.abs(sin)):Infinity;
      if(dX<dY){x+=dx*(dX+0.001);dist+=dX;side=0;}else{y+=dy*(dY+0.001);dist+=dY;side=1;}
      if(dist>MAX_DEPTH)break;if(MAP[Math.floor(y)]?.[Math.floor(x)]===1)break;
    }
    dist*=Math.cos(angle-Math.round(angle/Math.PI)*Math.PI);
    return{dist:Math.max(0.1,dist),side};
  }
  render(player,players){
    const ctx=this.ctx;ctx.clearRect(0,0,W,H);
    const sky=ctx.createLinearGradient(0,0,0,H/2);sky.addColorStop(0,'#0a0a0f');sky.addColorStop(1,'#1a1a2e');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H/2);
    const fl=ctx.createLinearGradient(0,H/2,0,H);fl.addColorStop(0,'#1a1208');fl.addColorStop(1,'#0d0d0d');ctx.fillStyle=fl;ctx.fillRect(0,H/2,W,H/2);
    for(let i=0;i<NUM_RAYS;i++){
      const ra=player.angle-HALF_FOV+i*RAY_STEP;const{dist,side}=this.castRay(player.x,player.y,ra);this.zbuf[i]=dist;
      const wh=Math.min(H,H/dist);const wt=(H-wh)/2;
      let b=Math.max(0,1-dist/MAX_DEPTH);if(side===1)b*=0.65;
      const rf=i/NUM_RAYS;const r=Math.floor(b*(80+Math.sin(rf*100)*5)),g=Math.floor(b*(75+Math.cos(rf*80)*4)),bl=Math.floor(b*(70+Math.sin(rf*60)*3));
      ctx.fillStyle=`rgb(${r},${g},${bl})`;ctx.fillRect(i*this.sliceW,wt,this.sliceW+1,wh);
    }
    this._renderSprites(player,players,ctx);
  }
  _renderSprites(player,players,ctx){
    const sprites=[];
    for(const p of players){
      if(!p.alive||p.id===player.id)continue;
      const dx=p.x-player.x,dy=p.y-player.y,dist=Math.hypot(dx,dy);
      if(dist<0.3||dist>12)continue;
      let a=Math.atan2(dy,dx)-player.angle;
      while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;
      if(Math.abs(a)>HALF_FOV*1.2)continue;
      sprites.push({p,dist,angle:a});
    }
    sprites.sort((a,b)=>b.dist-a.dist);
    for(const{p,dist,angle}of sprites){
      const h=Math.min(H*1.5,H/dist),sx=(W/2)+Math.tan(angle)*(W/2)/Math.tan(HALF_FOV),x=sx-h/2,y=H/2-h/2;
      const col=Math.floor(sx/this.sliceW);if(col<0||col>=NUM_RAYS||this.zbuf[col]<dist)continue;
      const color=p.team==='T'?'#ff4400':'#0088ff',bright=Math.max(0.2,1-dist/12);
      ctx.save();ctx.globalAlpha=bright;
      ctx.fillStyle=color;ctx.fillRect(x+h*.25,y+h*.15,h*.5,h*.65);
      ctx.fillStyle=p.team==='T'?'#cc3300':'#0066cc';ctx.beginPath();ctx.arc(x+h/2,y+h*.15,h*.15,0,Math.PI*2);ctx.fill();
      if(p.hasFlag){ctx.fillStyle='#ffcc00';ctx.font=`${Math.max(8,h*.15)}px sans-serif`;ctx.textAlign='center';ctx.fillText('🚩',x+h/2,y-12);}
      if(dist<6){ctx.globalAlpha=bright*.9;ctx.fillStyle=color;ctx.font=`${Math.max(8,h*.1)}px 'Share Tech Mono'`;ctx.textAlign='center';ctx.fillText(p.name.substring(0,10),x+h/2,y-4);const bw=h*.6,bh=4,bx=x+h/2-bw/2,by=y-12;ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(bx,by,bw,bh);ctx.fillStyle=p.hp>50?'#00ff44':p.hp>25?'#ffaa00':'#ff2200';ctx.fillRect(bx,by,bw*(p.hp/100),bh);}
      ctx.restore();
    }
  }
}

// ── HUD ──
class HUD{
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.hitFlash=0;this.killFeed=[];this.hitmarker=0;}
  addKill(k,v){this.killFeed.unshift({k,v,t:Date.now()});if(this.killFeed.length>5)this.killFeed.pop();}
  showHit(){this.hitmarker=200;}
  showHurt(d){this.hitFlash=Math.min(1,d/100);}
  render(player,round,scores,ping,settings,mode){
    const ctx=this.ctx;ctx.clearRect(0,0,W,H);
    this._crosshair(ctx,player,settings?.cross||'classic');
    this._hp(ctx,player);this._ammo(ctx,player);
    ctx.fillStyle='#ffcc00';ctx.font="bold 16px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(`$${player.money}`,16,H-88);
    ctx.fillStyle='#fff';ctx.font="12px 'Share Tech Mono'";ctx.fillText(WEAPONS[player.weapon]?.name||'',16,H-70);
    ctx.fillStyle='#fff';ctx.font="bold 18px 'Share Tech Mono'";ctx.textAlign='center';
    const sc=`T  ${scores?.T||0} : ${scores?.CT||0}  CT`;ctx.fillText(sc,W/2,32);
    const sec=Math.max(0,Math.ceil((round.endTime-Date.now())/1000));
    ctx.fillStyle=sec<=10?'#ff4400':'#fff';ctx.font="bold 26px 'Share Tech Mono'";
    ctx.fillText(`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`,W/2,58);
    this._killfeed(ctx);
    if(settings?.radar!==false)this._radar(ctx,player,window._game?.players||[]);
    if(this.hitFlash>0){const v=ctx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,H*.8);v.addColorStop(0,'transparent');v.addColorStop(1,`rgba(255,0,0,${this.hitFlash*.5})`);ctx.fillStyle=v;ctx.fillRect(0,0,W,H);this.hitFlash-=0.03;}
    if(!player.alive){ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#ff2200';ctx.font="bold 52px 'Share Tech Mono'";ctx.textAlign='center';ctx.fillText('YOU DIED',W/2,H/2-16);ctx.fillStyle='#aaa';ctx.font="16px 'Share Tech Mono'";ctx.fillText('Respawning next round...',W/2,H/2+16);}
    if(ping){const pc=ping<80?'#00ff88':ping<150?'#ffcc00':'#ff4400';ctx.fillStyle=pc;ctx.font="11px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(`${ping}ms`,W-8,14);}
    if(this.hitmarker>0)this.hitmarker-=16;
  }
  _crosshair(ctx,player,style){
    const cx=W/2,cy=H/2,c=this.hitmarker>0?'#ff4400':'#00ff88';
    ctx.save();ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=2;ctx.shadowBlur=4;ctx.shadowColor=c;
    if(style==='dot'){ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();}
    else if(style==='circle'){ctx.beginPath();ctx.arc(cx,cy,10,0,Math.PI*2);ctx.stroke();}
    else{const g=5,l=10;ctx.beginPath();ctx.moveTo(cx-g-l,cy);ctx.lineTo(cx-g,cy);ctx.moveTo(cx+g,cy);ctx.lineTo(cx+g+l,cy);ctx.moveTo(cx,cy-g-l);ctx.lineTo(cx,cy-g);ctx.moveTo(cx,cy+g);ctx.lineTo(cx,cy+g+l);ctx.stroke();
    if(style==='cross'){ctx.beginPath();ctx.arc(cx,cy,2,0,Math.PI*2);ctx.fill();}}
    ctx.restore();
  }
  _hp(ctx,player){const x=16,y=H-48,w=190,h=16;ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(x,y,w,h);const hc=player.hp>50?'#00dd44':player.hp>25?'#ffaa00':'#ff2200';ctx.fillStyle=hc;ctx.fillRect(x,y,w*(player.hp/100),h);ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.strokeRect(x,y,w,h);ctx.fillStyle='#fff';ctx.font="bold 11px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(`♥ ${player.hp}`,x+5,y+11);if(player.armor>0){ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(x,y+19,w,5);ctx.fillStyle='#4488ff';ctx.fillRect(x,y+19,w*(player.armor/100),5);}}
  _ammo(ctx,player){const wd=player.wepData;const x=W-14,y=H-28;ctx.fillStyle='#fff';ctx.font="bold 26px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(wd.currentAmmo===Infinity?'∞':wd.currentAmmo,x,y);if(player.reloading){ctx.fillStyle='#ffaa00';ctx.font="11px 'Share Tech Mono'";ctx.fillText('RELOADING',x,y-20);}}
  _killfeed(ctx){const now=Date.now();let ky=76;for(const kf of this.killFeed){const age=now-kf.t;if(age>5000)continue;const al=Math.min(1,(5000-age)/500);ctx.save();ctx.globalAlpha=al;ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(W-255,ky-15,245,20);ctx.font="bold 12px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillStyle=kf.k.team==='T'?'#ff6644':'#44aaff';ctx.fillText(kf.k.name.substring(0,10),W-140,ky);ctx.fillStyle='#fff';ctx.fillText(' 💀 ',W-112,ky);ctx.fillStyle=kf.v.team==='T'?'#ff6644':'#44aaff';ctx.fillText(kf.v.name.substring(0,10),W-14,ky);ctx.restore();ky+=24;}}
  _radar(ctx,player,players){const rx=W-110,ry=H-110,rs=90,sc=rs/10;ctx.save();ctx.beginPath();ctx.arc(rx,ry,rs/2,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fill();ctx.clip();for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(MAP[y][x]===1){ctx.fillStyle='rgba(255,255,255,0.12)';ctx.fillRect(rx+(x-player.x)*sc,ry+(y-player.y)*sc,sc,sc);}for(const p of players){if(!p.alive)continue;const px=rx+(p.x-player.x)*sc,py=ry+(p.y-player.y)*sc;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fillStyle=p.id===player.id?'#ffffff':p.team==='T'?'#ff4400':'#0088ff';ctx.fill();}ctx.restore();ctx.beginPath();ctx.arc(rx,ry,rs/2,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=1;ctx.stroke();}
}

// ── INPUT ──
class Input{
  constructor(){this.keys={};this.mouseDx=0;this.mouseDown=false;this.locked=false;
    window.addEventListener('keydown',e=>{this.keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','Tab'].includes(e.code))e.preventDefault();});
    window.addEventListener('keyup',e=>{this.keys[e.code]=false;});
    window.addEventListener('mousemove',e=>{if(this.locked)this.mouseDx+=e.movementX;});
    window.addEventListener('mousedown',e=>{if(e.button===0)this.mouseDown=true;});
    window.addEventListener('mouseup',e=>{if(e.button===0)this.mouseDown=false;});
  }
  consume(){const d=this.mouseDx;this.mouseDx=0;return d;}
}

// ── AUDIO ──
class Audio2{
  constructor(){this.ctx=null;try{this.ctx=new AudioContext();}catch(e){}}
  play(type){
    if(!this.ctx)return;
    const ac=this.ctx,g=ac.createGain();g.connect(ac.destination);
    if(type==='shoot'){const buf=ac.createBuffer(1,ac.sampleRate*.07,ac.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/800)*.8;const src=ac.createBufferSource();src.buffer=buf;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=700;src.connect(f);f.connect(g);g.gain.setValueAtTime(0.35,ac.currentTime);src.start();}
    else if(type==='reload'){const o=ac.createOscillator();o.type='square';o.frequency.value=180;o.connect(g);g.gain.setValueAtTime(0.08,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.12);o.start();o.stop(ac.currentTime+0.12);}
    else if(type==='hit'){const buf=ac.createBuffer(1,ac.sampleRate*.04,ac.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*.5*Math.exp(-i/400);const src=ac.createBufferSource();src.buffer=buf;src.connect(g);g.gain.setValueAtTime(0.25,ac.currentTime);src.start();}
  }
}

// ── SCOREBOARD ──
function renderScoreboard(ctx,players,visible){
  if(!visible)return;
  ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(W/2-270,55,540,Math.max(200,players.length*34+80));
  ctx.fillStyle='#fff';ctx.font="bold 18px 'Share Tech Mono'";ctx.textAlign='center';ctx.fillText('SCOREBOARD',W/2,82);
  let y=100;
  for(const team of['CT','T']){
    const pl=players.filter(p=>p.team===team);
    ctx.fillStyle=team==='T'?'#ff6633':'#3399ff';ctx.font="bold 13px 'Share Tech Mono'";ctx.textAlign='left';
    ctx.fillText(team==='T'?'TERRORISTS':'COUNTER-TERRORISTS',W/2-255,y);y+=18;
    for(const p of pl){ctx.fillStyle=p.isBot?'#777':'#fff';ctx.font="12px 'Share Tech Mono'";ctx.textAlign='left';ctx.fillText(`${p.isBot?'[BOT] ':''}${p.name.substring(0,16)}`,W/2-255,y);ctx.textAlign='right';ctx.fillText(`${p.kills} / ${p.deaths}`,W/2+255,y);y+=20;}
    y+=8;
  }
}

// ══════════════════════════════════════════════
//  MAIN GAME CLASS
// ══════════════════════════════════════════════
class Game{
  constructor(canvas3d,canvasHud,fbConfig,settings){
    this.canvas3d=canvas3d;this.canvasHud=canvasHud;
    this.rc=new Raycaster(canvas3d);this.hud=new HUD(canvasHud);
    this.input=new Input();this.audio=new Audio2();
    this.settings=settings||{};
    this.localPlayer=null;this.players=[];this.bots=[];
    this.round={num:1,phase:'live',endTime:Date.now()+115000,startTime:Date.now()};
    this.scores={T:0,CT:0};this.showScoreboard=false;
    this.roomId=null;this.db=null;this.ping=0;
    this.modeCtrl=null;this.gameMode='bomb';
    this.roundEndMsg=null;this.roundEndTimer=0;
    this.ac=new AntiCheat();
    this.lastTime=0;this.muzzleFlash=0;
    if(fbConfig)this._initFb(fbConfig);
    window._game=this;
  }
  _initFb(cfg){try{if(!firebase.apps.length)firebase.initializeApp(cfg);this.db=firebase.database();}catch(e){}}

  startSingleplayer(name,team,mode,diff){
    this.gameMode=mode||'bomb';
    const dc={easy:{ae:0.15},normal:{ae:0.07},hard:{ae:0.03},expert:{ae:0.01}}[diff||'normal']||{ae:0.07};
    this.localPlayer=new Player(name||'Player',team||'T',0);
    this.localPlayer.weapons.ak47={...WEAPONS.ak47,currentAmmo:30};
    this.localPlayer.weapons.m4a4={...WEAPONS.m4a4,currentAmmo:30};
    this.localPlayer.weapon=team==='T'?'ak47':'m4a4';
    this.players=[this.localPlayer];
    this.modeCtrl=this.gameMode==='bomb'?new BombMode():this.gameMode==='deathmatch'?new DeathmatchMode():this.gameMode==='ctf'?new CTFMode():new ArmsRaceMode();
    let ti=1,ci=0;
    for(let i=0;i<9;i++){const bt=i<4?'T':'CT';const bot=new Bot(`Bot_${i+1}`,bt,bt===team?++ti:++ci);bot.aimError=dc.ae;this.bots.push(bot);this.players.push(bot);}
    if(this.modeCtrl?.init)this.modeCtrl.init(this.players);
    this.gameLoop();
  }

  startMultiplayer(name,team,mode,roomId){
    this.roomId=roomId;this.gameMode=mode||'bomb';
    this.localPlayer=new Player(name||'Player',team||'T',0);
    this.localPlayer.weapons.ak47={...WEAPONS.ak47,currentAmmo:30};
    this.localPlayer.weapon=team==='T'?'ak47':'m4a4';
    this.players=[this.localPlayer];
    this.modeCtrl=this.gameMode==='bomb'?new BombMode():this.gameMode==='deathmatch'?new DeathmatchMode():this.gameMode==='ctf'?new CTFMode():new ArmsRaceMode();
    if(this.db){
      const ref=this.db.ref(`csrooms/${roomId}/players/${name}`);
      ref.set({name,team,x:this.localPlayer.x,y:this.localPlayer.y,angle:this.localPlayer.angle,hp:100,alive:true,weapon:this.localPlayer.weapon,kills:0,deaths:0});
      ref.onDisconnect().remove();
      this.db.ref(`csrooms/${roomId}/players`).on('value',snap=>{
        const data=snap.val()||{};
        for(const[id,pd]of Object.entries(data)){if(id===name)continue;let p=this.players.find(p=>p.id===id);if(!p){p=new Player(id,pd.team,0);this.players.push(p);}Object.assign(p,pd);}
        const need=10-this.players.length;
        for(let i=this.bots.length;i<need;i++){const b=new Bot(`Bot_${i}`,i%2===0?'T':'CT',i);this.bots.push(b);this.players.push(b);}
      });
      setInterval(()=>{const t=Date.now();this.db.ref(`csrooms/${roomId}/ping/${name}`).set(t);this.ping=20+Math.random()*30;},2000);
    }
    this.gameLoop();
  }

  gameLoop(ts=0){const dt=Math.min(ts-this.lastTime,50);this.lastTime=ts;this.update(dt);this.render();requestAnimationFrame(t=>this.gameLoop(t));}

  update(dt){
    window._grenadeEffects=window._grenadeEffects.filter(g=>{g.t+=dt;g.alive=g.t<g.maxT;return g.alive;});
    window._flashTime=Math.max(0,(window._flashTime||0)-dt);
    if(this.roundEndTimer>0){this.roundEndTimer-=dt;if(this.roundEndTimer<=0){this.roundEndMsg=null;this.nextRound();}return;}
    if(!this.localPlayer?.alive)return;
    const p=this.localPlayer,inp=this.input;
    const mdx=inp.locked?inp.consume()*(this.settings?.sens||8)*0.00025:0;
    p.angle+=mdx;
    if(inp.keys['ArrowLeft']||inp.keys['KeyQ'])p.angle-=ROT_SPEED*dt*2;
    if(inp.keys['ArrowRight']||inp.keys['KeyE']&&!(this.modeCtrl instanceof BombMode&&p.hasBomb))p.angle+=ROT_SPEED*dt*2;
    const crouch=inp.keys['ControlLeft'];const run=inp.keys['ShiftLeft']&&!crouch;
    const spd=MOVE_SPEED*dt*(run?1.6:crouch?0.4:1);
    let mx=0,my=0;
    if(inp.keys['KeyW']||inp.keys['ArrowUp']){mx+=Math.cos(p.angle)*spd;my+=Math.sin(p.angle)*spd;}
    if(inp.keys['KeyS']||inp.keys['ArrowDown']){mx-=Math.cos(p.angle)*spd;my-=Math.sin(p.angle)*spd;}
    if(inp.keys['KeyA']){mx+=Math.cos(p.angle-Math.PI/2)*spd;my+=Math.sin(p.angle-Math.PI/2)*spd;}
    if(inp.keys['KeyD']){mx+=Math.cos(p.angle+Math.PI/2)*spd;my+=Math.sin(p.angle+Math.PI/2)*spd;}
    const nx=p.x+mx,ny=p.y+my;
    if(MAP[Math.floor(p.y)]?.[Math.floor(nx)]!==1)p.x=nx;
    if(MAP[Math.floor(ny)]?.[Math.floor(p.x)]!==1)p.y=ny;
    if(inp.keys['Digit1'])p.weapon='knife';
    if(inp.keys['Digit2']){const w=p.weapons.usp?'usp':p.weapons.glock?'glock':p.weapons.pistol?'pistol':null;if(w)p.weapon=w;}
    if(inp.keys['Digit3']){const w=['ak47','m4a4','sg553','aug','mp9','mac10'].find(x=>p.weapons[x]);if(w)p.weapon=w;}
    if(inp.keys['Digit4']){const w=p.weapons.awp?'awp':p.weapons.scout?'scout':null;if(w)p.weapon=w;}
    if(inp.keys['Digit5']&&(p.grenades?.nade||0)>0&&!inp.keys['_gt']){throwGrenade(p,'nade');inp.keys['_gt']=true;}
    if(inp.keys['Digit6']&&(p.grenades?.smoke||0)>0&&!inp.keys['_gt']){throwGrenade(p,'smoke');inp.keys['_gt']=true;}
    if(inp.keys['Digit7']&&(p.grenades?.flash||0)>0&&!inp.keys['_gt']){throwGrenade(p,'flash');inp.keys['_gt']=true;}
    if(!inp.keys['Digit5']&&!inp.keys['Digit6']&&!inp.keys['Digit7'])inp.keys['_gt']=false;
    if(inp.keys['KeyE']&&this.modeCtrl instanceof BombMode&&p.hasBomb)if(this.modeCtrl.tryPlant(p))this.audio.play('reload');
    if(inp.keys['KeyR']&&!p.reloading)this.reload(p);
    if(p.reloadTimer>0){p.reloadTimer=Math.max(0,p.reloadTimer-dt);if(p.reloadTimer===0){p.reloading=false;if(WEAPONS[p.weapon])p.wepData.currentAmmo=WEAPONS[p.weapon].ammo;}}
    p.shootTimer=Math.max(0,p.shootTimer-dt);
    const wi=WEAPONS[p.weapon],cs=inp.mouseDown&&!p.reloading&&p.shootTimer<=0&&(p.wepData?.currentAmmo>0||p.wepData?.currentAmmo===Infinity);
    if(cs&&(wi?.automatic||inp.keys['_s']!==inp.mouseDown)){inp.keys['_s']=inp.mouseDown;this.shoot(p);}
    if(!inp.mouseDown)inp.keys['_s']=false;
    this.showScoreboard=!!inp.keys['Tab'];
    this.ac.check(p,dt);
    for(const bot of this.bots)bot.update(dt,this.players);
    if(this.modeCtrl?.update)this.modeCtrl.update(dt,this.players,this);
    if(this.db&&this.roomId&&Date.now()%60<20)this.db.ref(`csrooms/${this.roomId}/players/${p.id}`).update({x:p.x,y:p.y,angle:p.angle,hp:p.hp,alive:p.alive,weapon:p.weapon,kills:p.kills,deaths:p.deaths});
  }

  shoot(player){
    const wep=WEAPONS[player.weapon];if(!wep||!player.wepData)return;
    if(player.wepData.currentAmmo<=0&&player.wepData.currentAmmo!==Infinity){this.reload(player);return;}
    if(player.wepData.currentAmmo!==Infinity)player.wepData.currentAmmo--;
    player.shootTimer=60000/wep.rpm;
    if(this.settings?.sound!==false)this.audio.play('shoot');
    this.muzzleFlash=3;
    const spread=wep.spread*(Math.random()-.5)*2;
    const sa=player.angle+spread,cos=Math.cos(sa),sin=Math.sin(sa);
    for(const tgt of this.players){
      if(!tgt.alive||tgt.id===player.id||tgt.team===player.team)continue;
      const dx=tgt.x-player.x,dy=tgt.y-player.y,dist=Math.hypot(dx,dy);
      if(dist>wep.range)continue;
      const dot=(dx*cos+dy*sin)/dist;if(dot<0.97)continue;
      let blocked=false;
      for(let s=1;s<=dist*4;s++){const tx=player.x+cos*(s/4),ty=player.y+sin*(s/4);if(MAP[Math.floor(ty)]?.[Math.floor(tx)]===1){blocked=true;break;}}
      if(blocked)continue;
      tgt.takeDamage(wep.damage*(0.8+Math.random()*.4)*(1-dist/wep.range*.3),player);
      if(this.settings?.sound!==false)this.audio.play('hit');
      break;
    }
  }

  reload(player){if(player.reloading)return;const wep=WEAPONS[player.weapon];if(!wep||wep.ammo===Infinity)return;player.reloading=true;player.reloadTimer=wep.reload*1000;if(this.settings?.sound!==false)this.audio.play('reload');}

  roundEnd(winTeam,msg){if(this.roundEndMsg)return;this.roundEndMsg=msg;this.roundEndTimer=4500;this.scores[winTeam]=(this.scores[winTeam]||0)+1;for(const p of this.players)p.money=Math.min(16000,p.money+(p.team===winTeam?3250:1400));}

  nextRound(){
    this.round.num++;this.round.endTime=Date.now()+115000;
    let ti=0,ci=0;
    for(const p of this.players){const si=p.team==='T'?ti++:ci++;const sp=getSpawn(p.team,si);p.x=sp.x;p.y=sp.y;p.angle=p.team==='T'?0:Math.PI;p.hp=100;p.armor=0;p.alive=true;p.reloading=false;p.reloadTimer=0;p.shootTimer=0;p.hasFlag=false;p.hasBomb=false;if(p.weapons.ak47)p.weapons.ak47.currentAmmo=30;if(p.weapons.m4a4)p.weapons.m4a4.currentAmmo=30;if(p.weapons.pistol)p.weapons.pistol.currentAmmo=12;}
    if(this.modeCtrl?.init)this.modeCtrl.init(this.players);
  }

  render(){
    if(!this.localPlayer)return;
    this.rc.render(this.localPlayer,this.players);
    const ctx=this.rc.ctx;
    for(const g of window._grenadeEffects){if(g.type==='smoke'){const dx=g.x-this.localPlayer.x,dy=g.y-this.localPlayer.y,d=Math.hypot(dx,dy);if(d<5){const al=Math.min(0.65,(1-d/5)*.75)*(g.t<500?g.t/500:g.t>7000?(8000-g.t)/1000:1);ctx.fillStyle=`rgba(200,200,200,${al})`;ctx.fillRect(0,0,W,H);}}}
    if(window._flashTime>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(1,window._flashTime/200)})`;ctx.fillRect(0,0,W,H);}
    if(this.muzzleFlash>0){ctx.fillStyle=`rgba(255,200,50,${this.muzzleFlash/3*.22})`;ctx.fillRect(0,0,W,H);this.muzzleFlash--;}
    this.hud.render(this.localPlayer,this.round,this.scores,this.ping,this.settings);
    const hc=this.canvasHud.getContext('2d');
    renderScoreboard(hc,this.players,this.showScoreboard);
    this._modeHUD(ctx);
    if(this.roundEndMsg){ctx.fillStyle='rgba(0,0,0,0.72)';ctx.fillRect(W/2-200,H/2-38,400,76);ctx.fillStyle='#ffcc00';ctx.font="bold 26px 'Share Tech Mono'";ctx.textAlign='center';ctx.fillText(this.roundEndMsg,W/2,H/2-6);ctx.fillStyle='#aaa';ctx.font="13px 'Share Tech Mono'";ctx.fillText('Next round starting...',W/2,H/2+18);}
    if(this.settings?.fps){if(!this._fT){this._fps=60;this._fT=Date.now();}const e=Date.now()-this._fT;this._fT=Date.now();this._fps=Math.round(.9*this._fps+.1*(1000/Math.max(1,e)));ctx.fillStyle=this._fps>50?'#00ff88':this._fps>30?'#ffaa00':'#ff2244';ctx.font="10px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(`${this._fps}fps`,W-8,26);}
  }

  _modeHUD(ctx){
    ctx.textAlign='center';
    if(this.modeCtrl instanceof BombMode){const b=this.modeCtrl.bomb;if(b?.planted){const s=Math.ceil(b.timer/1000);ctx.fillStyle=s<=10?'#ff2200':'#ffaa00';ctx.font="bold 30px 'Share Tech Mono'";ctx.fillText(`💣 ${s}s`,W/2,H-78);if(b.defuseProgress>0){ctx.fillStyle='#00aaff';ctx.fillRect(W/2-80,H-68,160*b.defuseProgress,5);}}if(this.localPlayer?.hasBomb){ctx.fillStyle='#ffcc00';ctx.font="12px 'Share Tech Mono'";ctx.fillText('💣 CARRY BOMB — E to plant at A(top-left) or B(bot-right)',W/2,H-18);}}
    if(this.modeCtrl instanceof CTFMode){if(this.localPlayer?.hasFlag){ctx.fillStyle='#ffcc00';ctx.font="12px 'Share Tech Mono'";ctx.fillText('🚩 CARRYING FLAG — return to your base!',W/2,H-18);}const s=this.modeCtrl.scores;ctx.font="12px 'Share Tech Mono'";ctx.fillStyle='#ff6644';ctx.textAlign='left';ctx.fillText(`T 🚩 ${s.T}/${this.modeCtrl.target}`,10,H-18);ctx.fillStyle='#44aaff';ctx.textAlign='right';ctx.fillText(`CT 🚩 ${s.CT}/${this.modeCtrl.target}`,W-10,H-18);}
    if(this.modeCtrl instanceof ArmsRaceMode){const pr=this.modeCtrl.progress[this.localPlayer?.id]||0;ctx.fillStyle='#ffcc00';ctx.font="11px 'Share Tech Mono'";ctx.textAlign='right';ctx.fillText(`Arms ${pr+1}/${ARMS_CHAIN.length}: ${WEAPONS[ARMS_CHAIN[pr]]?.name||''}`,W-10,H-18);}
  }
}

window.Game=Game;
