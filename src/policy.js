// Server-side safety policy + intent extraction. Replace parseIntent() with an LLM adapter later; keep validation.
const GUAR=/guarantee|promise|definitely|assured|गारंटी|हमी|पक्का/i,REC=/which (mutual )?(fund|scheme|plan)|best (fund|scheme)|recommend|should .*(buy|invest|switch)|suggest .*(fund|scheme)|(कौन|कोण).*फंड|फंड.*(खरीद|सुझ)|सिफारिश|शिफारस|सुझाव/i,DOC=/waiting period|exclusion|coverage|what does .*polic.* say|वेटिंग|कव्हरेज|कवरेज/i;
const classify=t=>GUAR.test(t)?{decision:"BLOCK",category:"guarantee"}:REC.test(t)?{decision:"BLOCK",category:"product_selection"}:DOC.test(t)?{decision:"RESTRICT",category:"document_explanation"}:{decision:"ALLOW",category:"operational"};
const INTENTS=["LIST_SIP_DUE","LIST_PENDING_KYC","LIST_POLICY_RENEWALS","GET_CLIENT_SUMMARY","DRAFT_FOLLOWUP"];
function parseIntent(text,today){const t=text;
 const intent=/remind|draft|follow[- ]?up|message|रिमाइंडर|संदेश|मेसेज|आठवण/i.test(t)?"DRAFT_FOLLOWUP":/kyc|केवाईसी/i.test(t)?"LIST_PENDING_KYC":/renew|premium|expir|polic|प्रीमियम|पॉलिसी|नवीनीकरण|नूतनीकरण/i.test(t)?"LIST_POLICY_RENEWALS":/\bsips?\b|एसआईपी|एसआयपी/i.test(t)?"LIST_SIP_DUE":/summary|details|about|info|जानकारी|माहिती|सारांश/i.test(t)?"GET_CLIENT_SUMMARY":null;
 const add=(s,n)=>{const d=new Date(s+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 let from=today,to=add(today,6);
 if(/next week|अगले (हफ्ते|सप्ताह)|पुढच्या आठवड्यात/i.test(t)){from=add(today,7);to=add(today,13)}else if(/month|महीन|महिन्/i.test(t))to=add(today,29);else if(/today|आज/i.test(t))from=to=today;
 const topic=/\bsips?\b|एसआईपी|एसआयपी/i.test(t)?"sip":/kyc|केवाईसी/i.test(t)?"kyc":null;
 const nameTry=/(for|of|about|to)\s+[A-Z][a-z]+|[A-Z][a-z]+[’']s\b/.test(t);
 const o={intent,from,to,topic,nameTry};if(o.intent&&!INTENTS.includes(o.intent))throw Error("schema");return o}
const detectLang=t=>!/[\u0900-\u097F]/.test(t)?"en":/आहे|आहेत|कोणत|या आठवड्यात|साठी|माझ्या|दाखवा|पुढच्या|महिन्यात/.test(t)?"mr":"hi";
module.exports={classify,parseIntent,detectLang,INTENTS};
