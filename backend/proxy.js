// Zero-dependency Node proxy. Holds secrets server-side, gates /api/* behind verified
// auth, encrypts sensitive state at rest. Run behind nginx+TLS via pm2. See SETUP.md.
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

// ── Secrets: from env or a 0600 file — NEVER hardcode in a committed file ────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';
const APP_ORIGIN    = process.env.APP_ORIGIN || 'https://app.your-domain.com'; // lock CORS to this
const STATE_FILE    = '/var/www/state.json';
const STATE_KEY_FILE= '/var/www/.state-key';

// ── Encryption at rest (AES-256-GCM) for any sensitive tokens we persist ─────────
function getStateKey(){
  try{ if(fs.existsSync(STATE_KEY_FILE)){ const k=fs.readFileSync(STATE_KEY_FILE,'utf8').trim();
    if(k.length>=64) return Buffer.from(k.slice(0,64),'hex'); } }catch(e){}
  const nk=crypto.randomBytes(32);
  try{ fs.writeFileSync(STATE_KEY_FILE, nk.toString('hex'), {mode:0o600}); }catch(e){}
  return nk;
}
const STATE_K = getStateKey();
function loadST(){ try{ const j=JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));
  if(j&&j.__enc===1){ const d=crypto.createDecipheriv('aes-256-gcm',STATE_K,Buffer.from(j.iv,'hex'));
    d.setAuthTag(Buffer.from(j.tag,'hex'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(j.ct,'hex')),d.final()]).toString('utf8')); }
  return j; }catch(e){ return {}; } }
function saveST(s){ try{ const iv=crypto.randomBytes(12);
  const e=crypto.createCipheriv('aes-256-gcm',STATE_K,iv);
  const ct=Buffer.concat([e.update(JSON.stringify(s),'utf8'),e.final()]);
  fs.writeFileSync(STATE_FILE,JSON.stringify({__enc:1,iv:iv.toString('hex'),
    ct:ct.toString('hex'),tag:e.getAuthTag().toString('hex')})); }catch(e){} }
let ST = loadST();

// ── Verify an identity-provider ID token (replace with your IdP specifics) ───────
// Pattern: RS256 verify against the provider's public certs; check iss/aud/exp/iat;
// restrict to an allowed email domain; mark admins from an allowlist.
const ADMIN_EMAILS = ['<you@company.com>'];
function verifyIdToken(token, cb){
  if(!token) return cb('no token');
  // TODO: real RS256 verification vs your IdP's JWKS + iss/aud/exp checks.
  // Reference implementation: see the Firebase ID-token verifier pattern.
  return cb('verifyIdToken not configured');
}

// ── Per-token rate limiting (simple sliding window) ─────────────────────────────
const RL = new Map();
function rateLimited(key, max=60, windowMs=60000){
  const now=Date.now(); const a=(RL.get(key)||[]).filter(t=>now-t<windowMs);
  a.push(now); RL.set(key,a); return a.length>max;
}

function sendJson(res, code, obj){
  res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':APP_ORIGIN});
  res.end(JSON.stringify(obj));
}
function proxyReq(req, res, host, path, hdrs){
  let body=''; req.on('data',c=>body+=c);
  req.on('end',()=>{ const opts={hostname:host,path,method:req.method,
    headers:Object.assign({'Content-Type':'application/json'},hdrs)};
    if(body) opts.headers['Content-Length']=Buffer.byteLength(body);
    https.request(opts,pr=>{ res.writeHead(pr.statusCode,
      {'Content-Type':'application/json','Access-Control-Allow-Origin':APP_ORIGIN}); pr.pipe(res); })
      .on('error',e=>{res.writeHead(500);res.end(JSON.stringify({error:e.message}));}).end(body||undefined);
  });
}

http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);              // CORS locked, not *
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  if(req.method==='OPTIONS'){ res.writeHead(200); res.end(); return; }
  const url = req.url.split('?')[0];

  if(url==='/api/health') return sendJson(res,200,{ok:true});

  // Gate every other /api/* route behind a verified ID token.
  if(url.indexOf('/api/')===0){
    const m=(req.headers['authorization']||'').match(/^Bearer\s+(.+)$/i);
    return verifyIdToken(m?m[1]:null,(err,user)=>{
      if(err) return sendJson(res,401,{error:'unauthorized',detail:err});
      if(rateLimited(user.uid)) return sendJson(res,429,{error:'rate limited'});
      req._user=user; route(req,res,url);
    });
  }
  res.writeHead(404); res.end();
}).listen(3001,()=>console.log('proxy :3001 (behind nginx/TLS) | CORS '+APP_ORIGIN));

function route(req,res,url){
  if(req.method==='POST' && url==='/api/claude')
    return proxyReq(req,res,'api.anthropic.com','/v1/messages',
      {'x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'});
  res.writeHead(404); res.end();
}
