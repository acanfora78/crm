// Suite QA end-to-end (Playwright). Uso: mkdir -p /tmp/qa && cd /tmp/qa && node /home/user/crm/tests/qa.js
// Copre modalità browser locale, archivio online simulato e responsive. Scrive results.json nella cartella corrente.
const {chromium}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const DIR=process.cwd();
const results=[];let section='';
const ok=(name,cond,detail='')=>{results.push({section,name,pass:!!cond,detail:cond?'':String(detail)});};
const sec=n=>{section=n;console.log('>>',n);};
const N=s=>String(s||'').replace(/[  ]/g,' ').replace(/\s+/g,' ').trim();
const MOCK=`(()=>{const KEY='__MOCKDB__';const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}};const save=o=>localStorage.setItem(KEY,JSON.stringify(o));const L={};
function emit(c){const o=load();const docs=Object.entries(o[c]||{}).map(([id,d])=>({id,exists:true,data:()=>d,metadata:{fromCache:false,hasPendingWrites:false}}));(L[c]||[]).forEach(fn=>fn({docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:{fromCache:false,hasPendingWrites:false}}));}
window.__mock={fail:null,sticky:false,writes:0,calls:0};
async function mf(){await new Promise(r=>setTimeout(r,5));window.__mock.calls++;if(window.__mock.fail){const code=window.__mock.fail;if(!window.__mock.sticky)window.__mock.fail=null;throw{code,message:code};}}
const db={collection(c){return{onSnapshot(next,err){(L[c]=L[c]||[]).push(next);setTimeout(()=>emit(c),20);return()=>{};},doc(id){return{async set(d){await mf();if(typeof d!=='object'||Array.isArray(d))throw{code:'invalid_argument'};const o=load();o[c]=o[c]||{};o[c][id]=JSON.parse(JSON.stringify(d));save(o);window.__mock.writes++;emit(c);},async delete(){await mf();const o=load();if(o[c])delete o[c][id];save(o);emit(c);}};}};}};
window.addEventListener('storage',e=>{if(e.key===KEY)Object.keys(L).forEach(emit);});
window.claude={use:async n=>n==='db'?db:null};})();`;
// page wrapper identical to publish skeleton
const html='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+fs.readFileSync('/home/user/crm/index.html','utf8')+'</body></html>';
fs.writeFileSync(path.join(DIR,'index.html'),html);
const srv=http.createServer((q,r)=>{const f=path.join(DIR,decodeURIComponent(q.url.split('?')[0].split('#')[0])||'/index.html');try{const b=fs.readFileSync(f.endsWith('/')?f+'index.html':f);r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(b);}catch(e){r.writeHead(404);r.end();}}).listen(0);
const BASE=()=>`http://127.0.0.1:${srv.address().port}/index.html`;

async function open(ctx,hash='',w=1440,h=1000){const p=await ctx.newPage();p.setViewportSize({width:w,height:h});p.setDefaultTimeout(5000);p.__errs=[];p.on('pageerror',e=>p.__errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts\.g/.test(m.text()))p.__errs.push(m.text())});await p.goto(BASE()+(hash?'#'+hash:''));await p.waitForSelector('.page-head',{timeout:15000});return p;}
const go=async(p,h)=>{await p.evaluate(x=>location.hash=x,h);await p.waitForTimeout(150);};
const kpis=async p=>{await go(p,'dashboard');return Object.fromEntries(await p.$$eval('.kpi',ks=>ks.map(k=>[k.querySelector('.l').textContent,[k.querySelector('.v').textContent,k.querySelector('.h').textContent]])));};
const store=async(p,mode)=>p.evaluate(m=>{if(m==='db'){const o=JSON.parse(localStorage.getItem('__MOCKDB__')||'{}');const out={};for(const c of ['contacts','followups','appointments','quotes','clients'])out[c]=Object.entries(o[c]||{}).map(([id,d])=>Object.assign({id},d));return out;}return JSON.parse(localStorage.getItem('smm-crm-data-v1')||'{}');},mode);
async function fill(p,fields){for(const [k,v] of Object.entries(fields)){const el=await p.$(`#entityForm [name="${k}"]`);const tag=await el.evaluate(e=>e.tagName);if(tag==='SELECT'){const opts=await el.$$eval('option',o=>o.map(x=>[x.value,x.textContent]));const hit=opts.find(o=>o[0]===v)||opts.find(o=>o[1]===v)||opts.find(o=>o[1].startsWith(v));await el.selectOption(hit?hit[0]:v);}else await el.fill(String(v));}}
async function create(p,c,fields){await p.click('#newBtn');await p.click(`#newMenu [data-c="${c}"]`);await p.waitForSelector('#entityForm');await fill(p,fields);await p.click('.modal-f button[type=submit]');await p.waitForTimeout(250);const err=await p.$$eval('#entityForm .err',e=>e.map(x=>x.textContent).filter(Boolean)).catch(()=>[]);if(err.length) return err;if(await p.$('#confirmRoot .modal')) await p.click('#confirmRoot [data-k=no]');if(await p.$('.drawer')) await p.click('[data-act=closeDrawer]');return null;}
async function exportText(p,sel){await p.click(sel);await p.waitForSelector('#exportText');const t=await p.inputValue('#exportText');await p.click('.modal-f [data-m=close]');return t;}
async function upload(p,sel,file){const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click(sel)]);await fc.setFiles(file);await p.waitForSelector('.modal [data-m=go]');}
const toastText=async p=>N(await p.$$eval('.toast',t=>t.map(x=>x.textContent).join(' | ')));

async function suite(mode){
  const b=await chromium.launch();const ctx=await b.newContext();
  if(mode==='db') await ctx.addInitScript(MOCK);
  const p=await open(ctx);
  const tag=mode==='db'?'[archivio online simulato] ':'[browser locale] ';
  sec(tag+'Stato iniziale e archiviazione');
  const chip=N(await p.textContent('.store-chip'));
  ok('Indicatore archivio corretto',mode==='db'?/Archivio claude\.ai/.test(chip):/Solo questo browser/.test(chip),chip);
  ok('Avviso salvataggio locale visibile solo in modalità locale',mode==='db'?!(await p.$('.note.warn')):!!(await p.$('.note.warn')));
  const k0=await kpis(p);ok('Dashboard vuota: tutti i KPI a zero',Object.values(k0).every(v=>/^0( €|%)?$/.test(N(v[0]))),JSON.stringify(k0));
  ok('Schermata di benvenuto con stato vuoto',!!(await p.$('.welcome')));

  sec(tag+'Validazione campi');
  await p.click('#newBtn');await p.click('#newMenu [data-c="followups"]');await p.waitForTimeout(150);
  ok('Follow-up senza contatti: chiede di creare prima un contatto',/Serve prima un contatto/.test(await p.textContent('#confirmRoot').catch(()=>'')));
  await p.click('#confirmRoot [data-k=no]');
  let e=await create(p,'contacts',{});ok('Nome azienda obbligatorio',e&&e.includes('Campo obbligatorio'),e);
  await fill(p,{company:'Real Uno',email:'non-valida',potentialValue:'abc',phone:'xx',lastContact:'2099-01-01',nextAction:'Chiamare'});await p.click('.modal-f button[type=submit]');await p.waitForTimeout(150);
  const errs=Object.fromEntries(await p.$$eval('#entityForm .fld',f=>f.map(x=>[x.dataset.f,x.querySelector('.err').textContent]).filter(x=>x[1])));
  ok('Email non valida rifiutata',/Email non valida/.test(errs.email),JSON.stringify(errs));
  ok('Importo non numerico rifiutato',/importo numerico/.test(errs.potentialValue||''),JSON.stringify(errs));
  ok('Telefono non valido rifiutato',/Numero non valido/.test(errs.phone||''));
  ok('Ultimo contatto nel futuro rifiutato',/futuro/.test(errs.lastContact||''));
  ok('Prossima azione senza data rifiutata',/entro quando/.test(errs.nextActionDate||''));
  await fill(p,{potentialValue:'-5',email:'a@b.it',phone:'+39 333 1234567',lastContact:'',nextAction:''});await p.click('.modal-f button[type=submit]');await p.waitForTimeout(150);
  ok('Importo negativo rifiutato',/negativo/.test(await p.textContent('.fld[data-f=potentialValue] .err')));
  await fill(p,{potentialValue:'1.500,50',sector:'Ristorazione',location:'Napoli',service:'Sito web',source:'Instagram'});await p.click('.modal-f button[type=submit]');await p.waitForTimeout(300);
  if(await p.$('.drawer')) await p.click('[data-act=closeDrawer]');
  let st=await store(p,mode);ok('Contatto reale salvato con importo 1.500,50 → 1500.5',st.contacts&&st.contacts.length===1&&st.contacts[0].potentialValue===1500.5,JSON.stringify(st.contacts));

  sec(tag+'CRUD');
  e=await create(p,'quotes',{contactId:'Real Uno',service:'Branding',amount:'0'});ok('Preventivo con importo 0 rifiutato',e&&e.some(x=>/maggiore di zero/.test(x)),e);
  await fill(p,{amount:'800',status:'inviato'});
  const sd=await p.inputValue('#f_sentDate');ok('Stato "inviato" compila data invio e scadenza +30gg',!!sd&&!!(await p.inputValue('#f_expiryDate')));
  await p.fill('#f_sentDate','2026-11-10');await p.fill('#f_expiryDate','2026-11-01');await p.click('.modal-f button[type=submit]');await p.waitForTimeout(150);
  ok('Scadenza precedente all\'invio rifiutata',/precedente/.test(await p.textContent('.fld[data-f=expiryDate] .err')));
  await p.fill('#f_expiryDate','2026-12-10');await p.click('.modal-f button[type=submit]');await p.waitForTimeout(250);
  e=await create(p,'clients',{company:'Real Cliente',services:'Sito',agreedAmount:'1000',deposit:'800',balance:'300'});
  ok('Acconto + saldo > concordato rifiutato',e&&e.some(x=>/superano/.test(x)),e);
  ok('Acconto senza data rifiutato',e&&e.some(x=>/acconto/.test(x)),e);
  await fill(p,{balance:'200',depositDate:'2026-11-01',balanceDate:'2026-11-15'});await p.click('.modal-f button[type=submit]');await p.waitForTimeout(250);
  e=await create(p,'followups',{contactId:'Real Uno',date:'2026-11-20',time:'09:30',description:'Richiamare'});ok('Follow-up creato',!e,e);
  e=await create(p,'appointments',{contactId:'Real Uno',date:'2026-11-25',time:'15:00',meetingType:'In presenza'});ok('Appuntamento creato',!e,e);
  st=await store(p,mode);ok('Un record per ogni sezione salvato',['contacts','followups','appointments','quotes','clients'].every(c=>(st[c]||[]).length===1),JSON.stringify(Object.fromEntries(Object.entries(st).map(([k,v])=>[k,Array.isArray(v)?v.length:v]))));
  // edit contact via drawer
  await go(p,'contatti');await p.click('tbody tr');await p.click('.drawer [data-act=edit]');await p.fill('#f_contactName','Mario Bianchi');await p.click('.modal-f button[type=submit]');await p.waitForTimeout(250);
  ok('Modifica contatto visibile nella scheda',/Mario Bianchi/.test(await p.textContent('.drawer')));
  await p.click('[data-act=closeDrawer]');
  // edit quote → accettato → crea cliente
  await go(p,'preventivi');await p.click('tbody tr');await p.selectOption('#f_status','accettato');await p.click('.modal-f button[type=submit]');await p.waitForTimeout(250);
  ok('Preventivo accettato propone "Crea cliente"',!!(await p.$('[data-act=quoteToClient]')));
  // follow-up complete updates lastContact
  await go(p,'followup');await p.click('[data-act=fuStatus][data-st=completato]');await p.waitForTimeout(250);
  st=await store(p,mode);ok('Completare un follow-up aggiorna "ultimo contatto"',st.contacts[0].lastContact==='2026-11-18',st.contacts[0].lastContact);
  ok('Follow-up passa a completato',st.followups[0].status==='completato');
  // delete appointment
  await go(p,'appuntamenti');await p.click('.li-click');await p.click('.modal-f [data-m=del]');await p.click('#confirmRoot [data-k=ok]');await p.waitForTimeout(250);
  st=await store(p,mode);ok('Eliminazione appuntamento',st.appointments.length===0);

  sec(tag+'Persistenza dopo refresh');
  await p.reload();await p.waitForSelector('.page-head');await p.waitForTimeout(300);
  await go(p,'contatti');ok('Contatto presente dopo il refresh',/Real Uno/.test(await p.textContent('.tbl')));
  await go(p,'clienti');ok('Cliente presente dopo il refresh',/Real Cliente/.test(await p.textContent('.tbl')));

  sec(tag+'Dati di test');
  await go(p,'dati');await p.click('[data-act=testCreate]');await p.waitForTimeout(600);
  st=await store(p,mode);const nT=['contacts','followups','appointments','quotes','clients'].reduce((n,c)=>n+st[c].filter(r=>r._test).length,0);
  ok('Creati 20 record di test marcati',nT===20,nT);
  ok('Tutti i contatti di test hanno prefisso [TEST]',st.contacts.filter(r=>r._test).every(r=>r.company.startsWith('[TEST]')));

  sec(tag+'Statistiche e calcoli');
  // expected = test data + real records (Real Uno: nuovo, 1500.5, lastContact today; quote 800 accettato; client 1000 dep 800 bal 200; fu completed)
  const k=await kpis(p);const v=l=>N(k[l][0]),hh=l=>N(k[l][1]);
  ok('Potenziali clienti = 7',v('Potenziali clienti')==='7',v('Potenziali clienti'));
  ok('Clienti contattati = 5',v('Clienti contattati')==='5',v('Clienti contattati'));
  ok('Appuntamenti fissati = 3 (1 in programma)',v('Appuntamenti fissati')==='3'&&/^1 in/.test(hh('Appuntamenti fissati')),v('Appuntamenti fissati')+' '+hh('Appuntamenti fissati'));
  ok('Preventivi inviati = 5 per 13.600 €',v('Preventivi inviati')==='5'&&hh('Preventivi inviati')==='13.600 € totali',v('Preventivi inviati')+' '+hh('Preventivi inviati'));
  ok('Trattative aperte = 2 per 7500 €',v('Trattative aperte')==='2'&&/7500 €/.test(hh('Trattative aperte')),hh('Trattative aperte'));
  ok('Contratti acquisiti = 3',v('Contratti acquisiti')==='3',v('Contratti acquisiti'));
  ok('Valore opportunità = 12.000,50 €',v('Valore opportunità')==='12.000,50 €',v('Valore opportunità'));
  ok('Fatturato acquisito = 7200 €, incassato 4200 €',v('Fatturato acquisito')==='7200 €'&&hh('Fatturato acquisito')==='incassato 4200 €',v('Fatturato acquisito')+' / '+hh('Fatturato acquisito'));
  ok('Conversion rate = 14,3% (1 vinto su 7), win rate 50%',v('Conversion rate')==='14,3%'&&/50%/.test(hh('Conversion rate')),v('Conversion rate')+' '+hh('Conversion rate'));
  ok('Attività in scadenza = 6, di cui 4 scadute',v('Attività in scadenza')==='6'&&hh('Attività in scadenza')==='4 scadute',v('Attività in scadenza')+' '+hh('Attività in scadenza'));
  ok('Grafici disegnati (3 SVG + funnel)',(await p.$$('.chart svg')).length===3&&(await p.$$('.f-row')).length===9);
  await go(p,'preventivi');const qv=(await p.$$eval('.sumbar .v',x=>x.map(y=>y.textContent))).map(N);
  ok('Preventivi: aperti 9300 €, inviati 6300 €, accettati 5800 €, rifiutati 1500 €',qv.join('|')==='9300 €|6300 €|5800 €|1500 €',qv.join('|'));
  ok('Preventivi inviati scaduti segnalati',/1 scaduti/.test(N(await p.textContent('.sumbar'))));
  await go(p,'clienti');const cv=(await p.$$eval('.sumbar .v',x=>x.map(y=>y.textContent))).map(N);
  ok('Clienti: concordato 7200 €, incassato 4200 €, da incassare 3000 €',cv.slice(0,3).join('|')==='7200 €|4200 €|3000 €',cv.join('|'));

  sec(tag+'Pipeline');
  await go(p,'pipeline');
  const colCount=async s=>N(await p.textContent(`.col[data-stage=${s}] .col-h .n`));
  ok('Pipeline: 9 colonne',(await p.$$('.col')).length===9);
  ok('Colonna Vinto: 1 scheda',await colCount('vinto')==='1');
  await p.click('.kc:has-text("Alfa Ristorante") [data-dir="1"]');await p.waitForTimeout(250);
  ok('Freccia sposta Alfa in "Da contattare"',await colCount('da_contattare')==='2');
  ok('Toast con Annulla',/Annulla/.test(await toastText(p)));
  await p.click('.toast button');await p.waitForTimeout(250);
  ok('Annulla riporta Alfa in "Nuovo lead"',await colCount('nuovo')==='2');
  await p.dragAndDrop('.kc:has-text("Alfa Ristorante") .t','.col[data-stage=interessato] .col-b');await p.waitForTimeout(300);
  ok('Trascinamento in "Interessato"',await colCount('interessato')==='2');
  const k2=await kpis(p);ok('Statistiche aggiornate dopo lo spostamento (trattative aperte 3)',N(k2['Trattative aperte'][0])==='3',N(k2['Trattative aperte'][0]));
  await go(p,'pipeline');await p.click('.kc:has-text("Real Uno")');await p.selectOption('#dStage','vinto');await p.waitForTimeout(300);
  ok('Passaggio a Vinto propone la scheda cliente',/Contratto acquisito/.test(await p.textContent('#confirmRoot').catch(()=>'')));
  await p.click('#confirmRoot [data-k=no]');await p.click('[data-act=closeDrawer]').catch(()=>{});
  st=await store(p,mode);const ru=st.contacts.find(c=>c.company==='Real Uno');
  ok('Storico fasi registrato',ru.stageHistory.length>=2&&ru.stageHistory.at(-1).stage==='vinto'&&ru.stageHistory.at(-1).from==='nuovo',JSON.stringify(ru.stageHistory));
  const k3=await kpis(p);ok('Conversion rate aggiornato a 28,6%',N(k3['Conversion rate'][0])==='28,6%',N(k3['Conversion rate'][0]));

  sec(tag+'Ricerca, filtri, ordinamento');
  await p.fill('#globalSearch','gamma');await p.waitForTimeout(150);ok('Ricerca globale trova Gamma (contatto, preventivo, follow-up)',/Gamma Studio/.test(await p.textContent('#searchResults'))&&(await p.$$('.sr-item')).length>=3);
  await p.keyboard.press('Enter');await p.waitForTimeout(150);ok('Invio apre la scheda',/Gamma/.test(await p.textContent('.drawer h2')));await p.keyboard.press('Escape');
  await go(p,'contatti');await p.selectOption('#cSector','Ristorazione');await p.waitForTimeout(150);ok('Filtro settore',(await p.$$('tbody tr')).length===1);
  await p.click('[data-act=clearFilters]');await p.selectOption('#cStage','perso');await p.waitForTimeout(150);ok('Filtro fase',(await p.$$('tbody tr')).length===1);
  await p.click('[data-act=clearFilters]');await p.click('th[data-key=potentialValue]');await p.waitForTimeout(100);
  ok('Ordinamento per valore (decrescente)',/Epsilon/.test(await p.textContent('tbody tr:first-child')),await p.textContent('tbody tr:first-child'));

  sec(tag+'Sicurezza: contenuti malevoli');
  await p.evaluate(()=>{window.__xss=0;});
  e=await create(p,'contacts',{company:'<img src=x onerror="window.__xss=1">=HYPERLINK("http://x")',notes:'<script>window.__xss=2</script>',website:'javascript:alert(1)',instagram:'"><svg onload=window.__xss=3>'});
  for(const h of ['dashboard','contatti','pipeline','followup','appuntamenti','preventivi','clienti','dati']){await go(p,h);}
  await go(p,'contatti');await p.click('tbody tr:has-text("HYPERLINK")');await p.waitForTimeout(150);
  await p.fill('#globalSearch','hyperlink');await p.waitForTimeout(150);
  ok('Nessun codice eseguito da nomi/ note (XSS)',(await p.evaluate(()=>window.__xss))===0);
  const href=await p.getAttribute('.drawer a[target=_blank]','href');ok('Link "javascript:" neutralizzato',/^https:\/\//.test(href),href);
  await p.keyboard.press('Escape');await p.keyboard.press('Escape');

  sec(tag+'Esportazione / importazione CSV');
  await go(p,'contatti');const csv=await exportText(p,'.page-head [data-act=export]');
  ok('CSV contatti: intestazioni e 8 righe',csv.split(/\r?\n/).length===9,csv.split(/\r?\n/).length);
  ok('CSV: formula neutralizzata con apostrofo',/;'<img|"'<img|'=|;'\+39/.test(csv)&&!/;=HYPERLINK/.test(csv));
  ok('CSV: importi con virgola e date gg/mm/aaaa',/1500,5/.test(csv)&&/\d{2}\/\d{2}\/\d{4}/.test(csv));
  fs.writeFileSync(path.join(DIR,'contatti.csv'),'﻿'+csv);
  const csvQ=await (async()=>{await go(p,'preventivi');return exportText(p,'.page-head [data-act=export]');})();fs.writeFileSync(path.join(DIR,'preventivi.csv'),csvQ);
  // re-import on same data → duplicates skipped
  await go(p,'contatti');await upload(p,'.page-head [data-act=import]',path.join(DIR,'contatti.csv'));
  ok('Reimportazione: duplicati riconosciuti e saltati',/duplicati saltati[^:]*: 8/.test(N(await p.textContent('.modal-b'))),N(await p.textContent('.modal-b')));
  await p.click('.modal-f [data-m=close]');
  // malformed CSV
  fs.writeFileSync(path.join(DIR,'bad.csv'),'Nome azienda;Valore potenziale (€);Data di acquisizione;Fase pipeline\nOk Srl;1.200;01/02/2026;Interessato\n;100;;\nBad Srl;abc;31/02/2026;Boh\n"Quoted; Srl";2.000,5;2026-03-04;Vinto\n');
  await upload(p,'.page-head [data-act=import]',path.join(DIR,'bad.csv'));
  const mb=N(await p.textContent('.modal-b'));
  ok('CSV con errori: righe valide 2, errori 2 con motivo',/pronte all'importazione: 2/.test(mb)&&/con errori: 2/.test(mb)&&/Riga 3/.test(mb)&&/Riga 4/.test(mb),mb);
  await p.click('.modal-f [data-m=go]');await p.waitForTimeout(500);
  st=await store(p,mode);const q1=st.contacts.find(c=>c.company==='Quoted; Srl'),o1=st.contacts.find(c=>c.company==='Ok Srl');
  ok('Campo con ; tra virgolette importato correttamente',!!q1&&q1.potentialValue===2000.5&&q1.stage==='vinto'&&q1.acquisitionDate==='2026-03-04',JSON.stringify(q1));
  ok('Importo 1.200 e data 01/02/2026 interpretati',o1&&o1.potentialValue===1200&&o1.acquisitionDate==='2026-02-01'&&o1.stage==='interessato',JSON.stringify(o1));
  // full round trip: export → wipe → import contacts + quotes
  await go(p,'dati');const all1=await store(p,mode);
  await p.click('[data-act=wipe]');await p.fill('#confirmRoot input[name=word]','sbagliato');await p.click('#confirmRoot [data-k=ok]');await p.waitForTimeout(200);
  ok('Eliminazione totale rifiutata senza parola di conferma',(await store(p,mode)).contacts.length===all1.contacts.length);
  // JSON backup before wipe
  const bk=await exportText(p,'[data-act=backup]');fs.writeFileSync(path.join(DIR,'backup.json'),bk);
  ok('Backup JSON contiene tutti i record',(()=>{const o=JSON.parse(bk);return ['contacts','followups','appointments','quotes','clients'].every(c=>o[c].length===all1[c].length);})());
  await p.click('[data-act=wipe]');await p.fill('#confirmRoot input[name=word]','ELIMINA');await p.click('#confirmRoot [data-k=ok]');await p.waitForTimeout(800);
  st=await store(p,mode);ok('Eliminazione totale con conferma',['contacts','followups','appointments','quotes','clients'].every(c=>(st[c]||[]).length===0));
  await upload(p,'tr:has-text("Contatti") [data-act=import]',path.join(DIR,'contatti.csv'));await p.click('.modal-f [data-m=go]');await p.waitForTimeout(600);
  await upload(p,'tr:has-text("Preventivi") [data-act=import]',path.join(DIR,'preventivi.csv'));const qm=N(await p.textContent('.modal-b'));await p.click('.modal-f [data-m=go]');await p.waitForTimeout(600);
  st=await store(p,mode);
  ok('CSV contatti reimportato: 8 contatti',st.contacts.length===8,st.contacts.length);
  const xs=st.contacts.find(c=>/HYPERLINK/.test(c.company));ok('Testo con formula ripristinato identico',xs&&xs.company.startsWith('<img src=x'),xs&&xs.company);
  const ph=st.contacts.find(c=>c.company==='Real Uno');ok('Telefono +39 ripristinato senza apostrofo',ph&&ph.phone==='+39 333 1234567',ph&&ph.phone);
  ok('CSV preventivi collegati ai contatti per nome',st.quotes.length===6&&st.quotes.every(q=>st.contacts.some(c=>c.id===q.contactId)),qm);

  sec(tag+'Backup e ripristino JSON');
  await go(p,'dati');await upload(p,'[data-act=restore]',path.join(DIR,'backup.json'));await p.click('input[value=replace]');await p.click('.modal-f [data-m=go]');await p.waitForTimeout(1200);
  st=await store(p,mode);const same=['contacts','followups','appointments','quotes','clients'].every(c=>{const a=all1[c].map(r=>r.id).sort().join(),b=(st[c]||[]).map(r=>r.id).sort().join();return a===b;});
  ok('Ripristino "Sostituisci": archivio identico al backup (stessi id in ogni sezione)',same);
  const ruB=all1.contacts.find(c=>c.company==='Real Uno'),ruA=st.contacts.find(c=>c.company==='Real Uno');
  ok('Ripristino conserva storico fasi e campi',JSON.stringify(ruB.stageHistory)===JSON.stringify(ruA.stageHistory)&&ruA.potentialValue===1500.5);
  const k4=await kpis(p);ok('KPI dopo ripristino uguali a prima',N(k4['Fatturato acquisito'][0])==='7200 €'&&N(k4['Contratti acquisiti'][0])==='3',JSON.stringify(k4['Fatturato acquisito']));
  // merge: newer local edit must not be overwritten by older backup
  await go(p,'contatti');await p.click('tbody tr:has-text("Real Uno")');await p.click('.drawer [data-act=edit]');await p.fill('#f_notes','Nota più recente');await p.click('.modal-f button[type=submit]');await p.waitForTimeout(250);await p.keyboard.press('Escape');
  await go(p,'dati');await upload(p,'[data-act=restore]',path.join(DIR,'backup.json'));await p.click('.modal-f [data-m=go]');await p.waitForTimeout(500);
  st=await store(p,mode);ok('Ripristino "Unisci" non sovrascrive modifiche più recenti',st.contacts.find(c=>c.company==='Real Uno').notes==='Nota più recente');
  // corrupted backup
  fs.writeFileSync(path.join(DIR,'evil.json'),JSON.stringify({contacts:[{id:'../x',company:{a:1},website:5,stage:'boh',potentialValue:'-9',stageHistory:'x'},{id:'ok-1',company:'Corrotto',acquisitionDate:'2026-99-99'},null,7],quotes:'nope'}));
  await upload(p,'[data-act=restore]',path.join(DIR,'evil.json'));const em=N(await p.textContent('.modal-b'));await p.click('.modal-f [data-m=go]');await p.waitForTimeout(500);
  st=await store(p,mode);const cr=st.contacts.find(c=>c.id==='ok-1');
  ok('Backup corrotto: record illeggibili scartati, campi ripuliti, pagina funzionante',/2 scartati/.test(em)&&cr&&cr.acquisitionDate===''&&st.contacts.some(c=>c.company===''&&c.stage==='nuovo'&&c.potentialValue===null)&&!p.__errs.length,em+' '+p.__errs.join());
  for(const h of ['dashboard','contatti','pipeline']) await go(p,h);
  ok('Nessun errore JavaScript dopo dati corrotti',!p.__errs.length,p.__errs.join(' | '));

  sec(tag+'Eliminazione sicura dei dati di test');
  await go(p,'dati');
  // create a real follow-up linked to a test contact and a real client linked to test contact
  await p.click('[data-act=testDelete]');await p.click('#confirmRoot [data-k=ok]');await p.waitForTimeout(800);
  st=await store(p,mode);
  ok('Nessun record di test rimasto',['contacts','followups','appointments','quotes','clients'].every(c=>!(st[c]||[]).some(r=>r._test)));
  ok('Dati reali intatti (Real Uno, Real Cliente, Ok Srl, Quoted; Srl)',['Real Uno','Ok Srl','Quoted; Srl'].every(n=>st.contacts.some(c=>c.company===n))&&st.clients.some(c=>c.company==='Real Cliente'),st.contacts.map(c=>c.company).join(','));

  sec(tag+'Eliminazione contatto con collegati');
  await go(p,'contatti');await p.click('tbody tr:has-text("Real Uno") [data-act=delContact]');await p.click('#confirmRoot [data-k=ok]');await p.waitForTimeout(400);
  st=await store(p,mode);ok('Contatto e attività collegate eliminati, cliente acquisito mantenuto',!st.contacts.some(c=>c.company==='Real Uno')&&!st.followups.length&&!st.quotes.some(q=>q.contactId===ruB.id)&&st.clients.some(c=>c.company==='Real Cliente'));

  if(mode==='db'){
    sec(tag+'Errori di rete e sincronizzazione tra dispositivi');
    await p.evaluate(()=>{window.__mock.fail='unavailable';});e=await create(p,'contacts',{company:'Retry Srl'});await p.waitForTimeout(1500);if(await p.$('.drawer'))await p.click('[data-act=closeDrawer]');
    st=await store(p,mode);ok('Errore temporaneo: salvataggio ritentato e riuscito',st.contacts.some(c=>c.company==='Retry Srl'));
    await p.evaluate(()=>{window.__mock.fail='quota_exceeded';});e=await create(p,'contacts',{company:'Quota Srl'});await p.waitForTimeout(300);
    st=await store(p,mode);ok('Spazio esaurito: record non salvato, messaggio chiaro, interfaccia coerente',!st.contacts.some(c=>c.company==='Quota Srl')&&/Spazio dell'archivio esaurito/.test(await toastText(p)));
    ok('Dopo l\'errore il modulo resta aperto con i dati inseriti',(await p.$('#entityForm'))&&(await p.inputValue('#f_company'))==='Quota Srl');await p.keyboard.press('Escape');
    await go(p,'contatti');ok('Interfaccia non mostra il record non salvato',!/Quota Srl/.test(await p.textContent('.tbl')));
    const p2=await open(ctx,'contatti');await p.evaluate(()=>{window.__mock.fail=null;});
    e=await create(p,'contacts',{company:'Sync Srl'});await p2.waitForTimeout(400);
    ok('Secondo dispositivo riceve il nuovo contatto in tempo reale',/Sync Srl/.test(await p2.textContent('.tbl')));
    ok('Nessuna copia nel browser locale in modalità online',!(await p.evaluate(()=>localStorage.getItem('smm-crm-data-v1'))));
    await p2.close();
  } else {
    sec(tag+'Due schede aperte contemporaneamente');
    const p2=await open(ctx,'contatti');
    await create(p,'contacts',{company:'Scheda A'});await p2.waitForTimeout(300);
    await create(p2,'contacts',{company:'Scheda B'});await p.waitForTimeout(300);
    st=await store(p,mode);ok('Nessuna sovrascrittura tra schede (A e B salvati)',st.contacts.some(c=>c.company==='Scheda A')&&st.contacts.some(c=>c.company==='Scheda B'));
    await go(p,'contatti');ok('La prima scheda vede il contatto creato nella seconda',/Scheda B/.test(await p.textContent('.tbl')));
    // storage blocked → error shown, no false success
    await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('QuotaExceededError');};});
    await create(p,'contacts',{company:'Pieno Srl'});await p.waitForTimeout(200);
    ok('Browser pieno: errore mostrato e record non tenuto in memoria',/non ha salvato/.test(await toastText(p))&&!/Pieno Srl/.test(await p.textContent('.tbl')));
    await p2.close();
  }
  ok('Nessun errore JavaScript nella sessione',!p.__errs.length,p.__errs.join(' | '));
  await b.close();
}

async function responsive(){
  const b=await chromium.launch();const ctx=await b.newContext();
  const p0=await open(ctx,'dati');await p0.click('[data-act=testCreate]');await p0.waitForTimeout(500);await p0.close();
  const sizes=[['Desktop 1440',1440,900],['Laptop 1024',1024,768],['Tablet 768',768,1024],['Smartphone 390',390,844],['Smartphone 360',360,740]];
  const views=['dashboard','contatti','pipeline','followup','appuntamenti','preventivi','clienti','dati'];
  sec('Responsive');
  for(const [n,w,h] of sizes){const p=await open(ctx,'',w,h);const bad=[];
    for(const v of views){await go(p,v);await p.waitForTimeout(120);const ov=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(ov>1)bad.push(v+'+'+ov+'px');}
    await go(p,'contatti');await p.click('tbody tr');const dw=await p.evaluate(()=>{const d=document.querySelector('.drawer').getBoundingClientRect();return d.right<=innerWidth+1&&d.left>=-1;});
    await p.keyboard.press('Escape');await p.click('#newBtn');await p.click('#newMenu [data-c=contacts]');const mw=await p.evaluate(()=>{const d=document.querySelector('.modal').getBoundingClientRect();return d.right<=innerWidth+1;});await p.keyboard.press('Escape');
    ok(`${n}: nessuno scorrimento orizzontale della pagina in 8 sezioni`,!bad.length,bad.join(', '));
    ok(`${n}: scheda dettaglio e moduli entro lo schermo`,dw&&mw);
    if(w<900){const vis=await p.isVisible('#menuBtn');await p.click('#menuBtn');await p.waitForTimeout(250);const open_=await p.evaluate(()=>document.querySelector('#side').getBoundingClientRect().left>=0);ok(`${n}: menu laterale apribile`,vis&&open_);}
    else ok(`${n}: pulsante menu nascosto su desktop`,!(await p.isVisible('#menuBtn')));
    if(w<=390){await go(p,'dashboard');await p.screenshot({path:`m-dash-${w}.png`,fullPage:false});await go(p,'contatti');await p.screenshot({path:`m-contatti-${w}.png`});await go(p,'pipeline');await p.screenshot({path:`m-pipe-${w}.png`});}
    if(w===1440){await go(p,'dashboard');await p.screenshot({path:'d-dash.png',fullPage:true});await go(p,'appuntamenti');await p.screenshot({path:'d-cal.png'});}
    ok(`${n}: nessun errore JavaScript`,!p.__errs.length,p.__errs.join('|'));await p.close();}
  await b.close();
}
(async()=>{for(const fn of [()=>suite('local'),()=>suite('db'),responsive]){try{await fn();}catch(e){results.push({section,name:'ECCEZIONE NEL TEST',pass:false,detail:e.message.split('\n').slice(0,4).join(' ')});}}
srv.close();fs.writeFileSync('results.json',JSON.stringify(results,null,1));
const f=results.filter(r=>!r.pass);console.log(`PASS ${results.length-f.length}/${results.length}`);f.forEach(r=>console.log('FAIL',r.section,'::',r.name,'::',r.detail));})();
