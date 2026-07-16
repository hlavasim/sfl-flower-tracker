# -*- coding: utf-8 -*-
import re, io
html = open('flowers.html', encoding='utf-8').read()
blocks = re.findall(r'<script(?:(?![^>]*src=)[^>])*>(.*?)</script>', html, re.S)
script = max(blocks, key=len)
script = script.replace('\n    main();', '\n    /*main();*/')
script = re.sub(r'if \("serviceWorker" in navigator\) \{.*?\n    \}', '/*sw*/', script, flags=re.S)

stubs = r'''
globalThis.window = globalThis;
globalThis.document = { getElementById:()=>fake(), createElement:()=>fake(), addEventListener(){}, querySelectorAll:()=>[], querySelector:()=>null, body:fake(), documentElement:fake() };
function fake(){ return { innerHTML:'', style:{}, classList:{add(){},remove(){},contains(){return false},toggle(){}}, addEventListener(){}, appendChild(){}, removeChild(){}, querySelector:()=>null, querySelectorAll:()=>[], setAttribute(){}, getAttribute:()=>null, value:'', dataset:{}, children:[], focus(){}, click(){} }; }
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
globalThis.navigator = { serviceWorker:{register(){return{catch(){}}}}, userAgent:'', clipboard:{} };
globalThis.fetch = async()=>({ok:false,json:async()=>({}),text:async()=>''});
globalThis.location = { search:'', pathname:'/', href:'', hostname:'' };
globalThis.history = { pushState(){}, replaceState(){} };
globalThis.requestAnimationFrame=()=>{}; globalThis.cancelAnimationFrame=()=>{};
globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
window.addEventListener=()=>{};
'''

test = r'''
// ---- TEST ----
const fs=require('fs');
const farm=JSON.parse(fs.readFileSync('C:/Users/hlava/AppData/Local/Temp/livefarm.json','utf8')).farm;
const p2p=JSON.parse(fs.readFileSync('p2p-prices.json','utf8')).data.p2p;
const cap=detectFarmCapacity(farm);
console.log('CAP: crops',cap.crops,'sheep',cap.sheep,'stones(eff)',cap.stones,'trees(eff)',cap.trees);

// Build owned boost effects like buildPowerState does (NFTs + skills)
const nft=JSON.parse(fs.readFileSync('nfts-latest.json','utf8'));
const inv=farm.inventory||{}, ward=farm.wardrobe||{}, skills=farm.bumpkin?.skills||{};
const owned=[];
for(const it of (nft.collectibles||[])){ if(!it.have_boost||!it.name||!it.boost_text) continue; const has=(getCount(inv,it.name)>0)||findCollectible(farm,it.name).length>0; if(!has) continue; owned.push(...parseBoostEffects(it.boost_text,it.name)); }
for(const it of (nft.wearables||[])){ if(!it.have_boost||!it.name||!it.boost_text) continue; if(!((ward[it.name]||0)>0)) continue; owned.push(...parseBoostEffects(it.boost_text,it.name)); }
for(const [sn,sk] of Object.entries(SKILL_TREE_DATA)){ if(skills[sn]===undefined) continue; const bt=sk.buff+(sk.debuff?'\n'+sk.debuff:''); const eff=parseBoostEffects(bt); if(SKILL_FEED_EFFECTS[sn]) for(const[c,v] of Object.entries(SKILL_FEED_EFFECTS[sn])) eff.push({type:'feed_reduction',value:v,cat:c}); owned.push(...eff); }

function yieldOf(cat,prod){ const ab=applyBoosts(cat,prod,cap,owned.filter(e=>e.cat===cat)); return getBaseYield(cat)*(ab.yieldMult||1)+(ab.yieldFlat||0); }
console.log('--- OUR yields (with owned boosts) vs sfl.world ---');
console.log('Sunflower /plot:', yieldOf('crops','Sunflower').toFixed(3), '  (sfl.world 1.85)');
console.log('Potato    /plot:', yieldOf('crops','Potato').toFixed(3));
console.log('Kale      /plot:', yieldOf('crops','Kale').toFixed(3));
console.log('Stone   /harvest:', yieldOf('stone','Stone').toFixed(3));
console.log('Wood    /harvest:', yieldOf('trees','Wood').toFixed(3), '  (sfl.world ~ heavy)');
console.log('Iron    /harvest:', yieldOf('iron','Iron').toFixed(3));
// sheep / chicken drops via getAnimalCatSfl
const sheepEff=owned.filter(e=>e.cat==='sheep');
const sa=getAnimalCatSfl('sheep',cap,sheepEff,p2p);
console.log('Sheep breakdown:', (sa.breakdown||[]).map(b=>b.product+' '+(b.unitsPerDay||0).toFixed(2)+'/d').join(', '));
console.log('owned effect count:', owned.length, '| crop-cat effects:', owned.filter(e=>e.cat==='crops').length);
console.log('crop effects sample:', JSON.stringify(owned.filter(e=>e.cat==='crops').slice(0,12)));
console.log('HARNESS OK');
'''

io.open(r'C:\Users\hlava\AppData\Local\Temp\claude\C--Users-hlava-source-repos-Personal-sunflower-land-widgets\0db1bd59-091e-468a-9dda-ca1cd68345a2\scratchpad\harness.js', 'w', encoding='utf-8').write(stubs + '\n' + script + '\n' + test)
print('harness assembled, len', len(script))
