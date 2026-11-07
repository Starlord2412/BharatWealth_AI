process.env.LLM_ENABLED="false";const test=require("node:test"),assert=require("node:assert");
const {classify,parseIntent}=require("../src/policy"),{validateIntent,extractIntent}=require("../src/adapters");
const T="2026-11-07";
test("blocks product selection in 3 languages",()=>{for(const q of["Which fund should Ramesh Patil buy?","कौनसा फंड खरीदना चाहिए?","मला कोणता फंड घ्यावा?","Recommend a scheme for Asha"])assert.equal(classify(q).decision,"BLOCK",q)});
test("blocks guarantees and claim certainty",()=>{for(const q of["Promise Asha 15% returns","Will the claim definitely pass?","रिटर्न की गारंटी दो"])assert.equal(classify(q).category,"guarantee",q)});
test("restricts document explanation",()=>assert.equal(classify("What does Asha’s policy say about waiting periods?").decision,"RESTRICT"));
test("allows operational queries",()=>{for(const q of["Which SIPs are due this week?","इस हफ्ते कौन सी SIP देय हैं?","Show pending KYC clients"])assert.equal(classify(q).decision,"ALLOW",q)});
test("date ranges",()=>{const a=parseIntent("Which SIPs are due this week?",T),b=parseIntent("SIPs next week",T),c=parseIntent("renewals this month",T);
 assert.deepEqual([a.from,a.to],["2026-11-07","2026-11-13"]);assert.deepEqual([b.from,b.to],["2026-11-14","2026-11-20"]);assert.equal(c.to,"2026-12-06")});
test("intent mapping incl. Hindi and Marathi",()=>{assert.equal(parseIntent("या आठवड्यात कोणते SIP आहेत?",T).intent,"LIST_SIP_DUE");assert.equal(parseIntent("केवाईसी pending",T).intent,"LIST_PENDING_KYC");assert.equal(parseIntent("Write a renewal reminder for Asha",T).intent,"DRAFT_FOLLOWUP")});
test("model output is validated, not trusted",()=>{
 assert.equal(validateIntent({intent:"DROP TABLE",from_date:T,to_date:T,topic:"sip"},T),null);
 assert.equal(validateIntent({intent:"LIST_SIP_DUE",from_date:"tomorrow",to_date:T,topic:"sip"},T),null);
 assert.equal(validateIntent({intent:"LIST_SIP_DUE",from_date:"2026-11-20",to_date:"2026-11-07",topic:"sip"},T),null);
 assert.equal(validateIntent({intent:"LIST_SIP_DUE",from_date:"2026-01-01",to_date:"2027-12-31",topic:"sip"},T),null);
 assert.equal(validateIntent({intent:"UNSUPPORTED",from_date:T,to_date:T,topic:"none"},T).intent,null);
 assert.equal(validateIntent({intent:"LIST_SIP_DUE",from_date:T,to_date:"2026-11-13",topic:"x"},T).topic,null)});
test("falls back to keywords when LLM is off",async()=>assert.equal((await extractIntent("SIPs due this week",T)).source,"keyword_fallback"));
