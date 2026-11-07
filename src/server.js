require("dotenv").config();const express=require("express"),cookie=require("cookie-parser"),jwt=require("jsonwebtoken"),bcrypt=require("bcryptjs"),rate=require("express-rate-limit"),crypto=require("crypto"),path=require("path");
const R=require("./repo"),A=require("./adapters"),{classify,detectLang}=require("./policy"),{M,D}=require("./templates");
const app=express(),SECRET=process.env.JWT_SECRET||"dev-only-secret",TODAY=()=>process.env.DEMO_TODAY||new Date().toISOString().slice(0,10);
app.use(express.json({limit:"50kb"}),cookie());app.use("/api/",rate({windowMs:60000,max:120}));
app.use((req,res,next)=>{req.rid="req_"+crypto.randomBytes(4).toString("hex");next()});
const auth=(req,res,next)=>{try{const t=req.cookies.token||(req.headers.authorization||"").replace("Bearer ","");req.agent=jwt.verify(t,SECRET);next()}catch{res.status(401).json({error:"unauthenticated"})}};
const wrap=f=>(req,res)=>f(req,res).catch(e=>{console.error(req.rid,e.message);res.status(500).json({error:"temporary_error",request_id:req.rid})});
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||"");
app.post("/api/v1/auth/login",rate({windowMs:60000,max:10}),wrap(async(req,res)=>{const{email,password}=req.body||{},a=await R.agentByEmail(String(email||"").toLowerCase());
 if(!a||!bcrypt.compareSync(String(password||""),a.password_hash))return res.status(401).json({error:"invalid_credentials"});
 const token=jwt.sign({id:a.agent_id,name:a.name,lang:a.preferred_language},SECRET,{expiresIn:"2h"});
 res.cookie("token",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7200000});await R.audit(a.agent_id,null,"LOGIN",null,req.rid);res.json({token,agent:{id:a.agent_id,name:a.name,language:a.preferred_language}})}));
app.post("/api/v1/auth/logout",(req,res)=>res.clearCookie("token").json({ok:true}));
app.use("/api/v1",auth);
app.get("/api/v1/clients",wrap(async(req,res)=>res.json(await R.listClients(req.agent.id,String(req.query.search||"").slice(0,60)))));
app.get("/api/v1/clients/:id/summary",wrap(async(req,res)=>{const s=await R.summary(req.agent.id,req.params.id);await R.audit(req.agent.id,s?req.params.id:null,"VIEW_CLIENT","get_client_summary",req.rid);s?res.json(s):res.status(404).json({error:"not_found"})}));
app.get("/api/v1/sips/due",wrap(async(req,res)=>{const{from,to}=req.query;if(!dateOk(from)||!dateOk(to)||(new Date(to)-new Date(from))/864e5>92)return res.status(400).json({error:"invalid_date_range"});res.json(await R.sipDue(req.agent.id,from,to))}));
app.get("/api/v1/kyc/pending",wrap(async(req,res)=>res.json(await R.pendingKyc(req.agent.id))));
app.get("/api/v1/policies/renewals",wrap(async(req,res)=>{const{from,to}=req.query;if(!dateOk(from)||!dateOk(to))return res.status(400).json({error:"invalid_date_range"});res.json(await R.renewals(req.agent.id,from,to))}));
const TOPICS={sip:["scheme_label","amount","next_due_date"],premium:["insurer_label","policy_type","premium_amount","premium_due_date"],kyc:["kyc_status"]};
async function makeDraft(ag,agentName,cid,topic,lang,req){if(!TOPICS[topic])return null;const src=await R.draftSource(ag.id||ag,cid,topic);if(!src)return null;
 const text=D[topic][lang](src,agentName);const d=await R.insertDraft(ag.id||ag,cid,topic,lang,text,TOPICS[topic]);await R.audit(ag.id||ag,cid,"DRAFT_CREATED","draft_followup",req.rid,topic);return d}
app.post("/api/v1/followups/drafts",wrap(async(req,res)=>{const{client_id,topic,language}=req.body||{};const d=await makeDraft(req.agent,req.agent.name,String(client_id),topic,["en","hi","mr"].includes(language)?language:"en",req);d?res.status(201).json(d):res.status(404).json({error:"not_found"})}));
app.get("/api/v1/followups",wrap(async(req,res)=>res.json(await R.listDrafts(req.agent.id))));
app.patch("/api/v1/followups/:id/approve",wrap(async(req,res)=>{if(req.body?.confirm!==true)return res.status(400).json({error:"explicit_confirmation_required"});
 const d=await R.updateDraft(req.agent.id,+req.params.id,"APPROVED",req.body.text?String(req.body.text).slice(0,2000):null);await R.audit(req.agent.id,d?.client_id,"DRAFT_APPROVED",null,req.rid,"not sent");d?res.json(d):res.status(404).json({error:"not_found_or_not_draft"})}));
app.patch("/api/v1/followups/:id/cancel",wrap(async(req,res)=>{const d=await R.updateDraft(req.agent.id,+req.params.id,"CANCELLED",null);await R.audit(req.agent.id,d?.client_id,"DRAFT_CANCELLED",null,req.rid);d?res.json(d):res.status(404).json({error:"not_found_or_not_draft"})}));
app.get("/api/v1/audit",wrap(async(req,res)=>res.json(await R.listAudit(req.agent.id))));
// Assistant turn: classify -> policy gate -> intent -> scoped tool -> grounded answer
app.post("/api/v1/assistant/turn",wrap(async(req,res)=>{const text=String(req.body?.text||"").trim().slice(0,500),ag=req.agent.id;if(!text)return res.status(400).json({error:"empty"});
 const lang=["en","hi","mr"].includes(req.body.language)?req.body.language:detectLang(text),t=M[lang],out={request_id:req.rid,language:lang,evidence:null,candidates:[],safety:{}};
 const pc=classify(text);out.safety={decision:pc.decision,category:pc.category};
 if(pc.decision!=="ALLOW"){await R.audit(ag,null,pc.decision,null,req.rid,pc.category);return res.json({...out,status:pc.decision==="BLOCK"?"blocked":"restricted",answer_text:pc.category==="guarantee"?t.guar:pc.decision==="BLOCK"?t.rec:t.doc})}
 const p=await A.extractIntent(text,TODAY());out.intent=p.intent||"UNKNOWN";out.intent_source=p.source;const found=await R.searchClients(ag,text),exact=found.length===1||found.some(c=>text.toLowerCase().includes(c.full_name.toLowerCase())||text.includes(c.alt_name));
 const needs=p.intent==="DRAFT_FOLLOWUP"||p.intent==="GET_CLIENT_SUMMARY";
 if(found.length>1&&!exact)return res.json({...out,status:"clarification",answer_text:t.cl,candidates:found});
 if(!found.length&&(p.nameTry||needs))return res.json({...out,status:p.nameTry?"not_found":"clarification",answer_text:p.nameTry?t.nf:t.ask});
 if(!p.intent)return res.json({...out,status:"unknown",answer_text:t.unk});
 let intent=p.intent;if(found[0]&&intent!=="DRAFT_FOLLOWUP")intent="GET_CLIENT_SUMMARY";let rows,ans;out.status="answered";
 if(intent==="LIST_SIP_DUE"){rows=await R.sipDue(ag,p.from,p.to);ans=rows.length?t.sip(rows.length):t.none}
 else if(intent==="LIST_PENDING_KYC"){rows=await R.pendingKyc(ag);ans=rows.length?t.kyc(rows.length):t.none}
 else if(intent==="LIST_POLICY_RENEWALS"){rows=await R.renewals(ag,p.from,p.to);ans=rows.length?t.ren(rows.length):t.none}
 else if(intent==="GET_CLIENT_SUMMARY"){rows=await R.summary(ag,found[0].client_id);ans=t.sum(rows.full_name);out.untrusted_note=rows.notes||null}
 else{const c=found[0],topic=p.topic||(await R.draftSource(ag,c.client_id,"premium")?"premium":await R.draftSource(ag,c.client_id,"sip")?"sip":"kyc"),
  d=await makeDraft(req.agent,req.agent.name,c.client_id,topic,req.body.language?lang:c.preferred_language,req);ans=d?t.dr(c.full_name):t.none;out.draft=d}
 await R.audit(ag,found[0]?.client_id,"TOOL",intent,req.rid,Array.isArray(rows)?rows.length+" rows":"1");res.json({...out,answer_text:ans,evidence:rows||null})}));
app.get("/api/v1/bootstrap",wrap(async(req,res)=>res.json(await R.bootstrap(req.agent.id))));
app.patch("/api/v1/followups/:id",wrap(async(req,res)=>{const t=String(req.body?.text||"").slice(0,2000);if(!t)return res.status(400).json({error:"empty"});
 const d=await R.updateDraft(req.agent.id,+req.params.id,"DRAFT",t);await R.audit(req.agent.id,d?.client_id,"DRAFT_EDITED",null,req.rid);d?res.json(d):res.status(404).json({error:"not_found_or_not_draft"})}));
// Voice: STT returns a transcript for the agent to confirm/correct; it never executes tools. Kill switch: VOICE_ENABLED=false.
const vErr=(res,rid,e)=>{console.error(rid,e.message);res.status(e.status||502).json({error:e.message==="voice_disabled"?"voice_unavailable":"provider_error",request_id:rid,fallback:"typed_input"})};
app.post("/api/v1/voice/turn",express.raw({type:()=>true,limit:"1mb"}),async(req,res)=>{try{if(!req.body?.length)return res.status(400).json({error:"empty_audio"});
 const lang=["en","hi","mr"].includes(req.query.language)?req.query.language:null,r=await A.stt(req.body,req.headers["content-type"]||"audio/webm",lang);
 await R.audit(req.agent.id,null,"STT",null,req.rid,"audio not stored");res.json({request_id:req.rid,transcript:r.transcript,language:r.language_code,low_confidence:r.transcript.trim().length<3})}catch(e){vErr(res,req.rid,e)}});
app.post("/api/v1/voice/speak",async(req,res)=>{try{const text=String(req.body?.text||"").slice(0,2500);if(!text)return res.status(400).json({error:"empty"});res.type("audio/wav").send(await A.tts(text,req.body.language))}catch(e){vErr(res,req.rid,e)}});
app.use("/api",(req,res)=>res.status(404).json({error:"not_found"}));
app.use(express.static(path.join(__dirname,"../public")));
if(require.main===module)app.listen(process.env.PORT||3000,()=>console.log("API on :"+(process.env.PORT||3000)));
module.exports=app;
