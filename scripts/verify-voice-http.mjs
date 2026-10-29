// Authenticated, read-only business-state checks; successful transcription uses the API.
import fs from 'node:fs'; import assert from 'node:assert/strict'; import dotenv from 'dotenv';
const env=dotenv.parse(fs.readFileSync(process.argv[2] || '.env.local'));
const base=process.argv[3] || 'http://localhost:5180';
const login=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',Origin:base},body:JSON.stringify({email:'alex@baxter.example',password:env.DEMO_PASSWORD})});
assert.equal(login.status,200,'sign in');
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const bootstrap=await (await fetch(base+'/api/v1/bootstrap',{headers:{cookie}})).json();
const caseId=bootstrap.cases.find(c=>c.shipment_reference==='DEMO-SHP-0101')?.id || bootstrap.cases[0].id;
const q=new URLSearchParams({runId:bootstrap.run.id,caseId,language:'auto'});
const audio=fs.readFileSync('.local/voice-eval/india-noisy.wav');
const results=[];
async function check(name,{query=q,body=audio,headers={},authenticated=true,origin=base}={},expected=200){
 const start=Date.now();const r=await fetch(base+'/api/v1/voice/transcribe?'+query,{method:'POST',headers:{...(authenticated?{cookie}:{}),Origin:origin,'Content-Type':'audio/wav',...headers},body,signal:AbortSignal.timeout(90000)});
 const data=await r.json();assert.equal(r.status,expected,name);
 if(expected===200){assert.match(data.text,/do not approve/i);assert.match(data.text,/Utrecht/i);assert.match(data.text,/Lyon/i);assert.equal(data.model,'gpt-transcribe');}
 results.push({name,status:r.status,ms:Date.now()-start,...(expected===200?{transcript:data.text,model:data.model}:{})});
}
await check('authentication required',{authenticated:false},401);
await check('untrusted cookie origin rejected',{origin:'https://untrusted.example'},403);
await check('cross tenant rejected',{headers:{'x-tenant-id':'10000000-0000-4000-8000-000000000002'}},403);
await check('stale run rejected',{query:new URLSearchParams({runId:'00000000-0000-4000-8000-000000000000',caseId})},409);
await check('missing case rejected',{query:new URLSearchParams({runId:bootstrap.run.id,caseId:'00000000-0000-4000-8000-000000000000'})},404);
await check('invalid language rejected',{query:new URLSearchParams({runId:bootstrap.run.id,caseId,language:'invented'})},400);
await check('empty recording rejected',{body:Buffer.alloc(0)},400);
await check('non audio rejected',{body:JSON.stringify({audio:'bad'}),headers:{'Content-Type':'application/json'}},400);
await check('large noisy WAV via full HTTP path');
fs.writeFileSync(base.includes('localhost')?'outputs/voice-http-local.json':'outputs/voice-http-deployed.json',JSON.stringify({date:new Date().toISOString(),base,results},null,2));
console.log(JSON.stringify({base,audioBytes:audio.length,results},null,2));
