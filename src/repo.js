// All queries are parameterized and require agent_id from the authenticated session (never from user/model input).
const {Pool,types}=require("pg");types.setTypeParser(1082,v=>v);types.setTypeParser(1700,parseFloat); // DATE as plain string (no timezone shift), NUMERIC as number
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const q=(s,a)=>pool.query(s,a).then(r=>r.rows);
module.exports={pool,
 agentByEmail:e=>q("SELECT * FROM agents WHERE email=$1 AND is_active",[e]).then(r=>r[0]),
 searchClients:(ag,text)=>q("SELECT client_id,full_name,alt_name,phone_masked,preferred_language FROM clients WHERE agent_id=$1 AND (position(normalized_name in lower($2))>0 OR position(alt_name in $2)>0 OR position(split_part(normalized_name,' ',1) in lower($2))>0 OR position(split_part(alt_name,' ',1) in $2)>0)",[ag,text]),
 listClients:(ag,s)=>q("SELECT c.client_id,c.full_name,c.preferred_language,c.kyc_status,c.phone_masked FROM clients c WHERE c.agent_id=$1 AND c.normalized_name LIKE $2 ORDER BY c.full_name LIMIT 100",[ag,"%"+(s||"").toLowerCase()+"%"]),
 sipDue:(ag,f,t)=>q("SELECT c.client_id,c.full_name,s.amount,s.next_due_date,s.scheme_label,s.status FROM sip_accounts s JOIN clients c USING(client_id) WHERE c.agent_id=$1 AND s.status='ACTIVE' AND s.next_due_date BETWEEN $2 AND $3 ORDER BY s.next_due_date LIMIT 200",[ag,f,t]),
 pendingKyc:ag=>q("SELECT client_id,full_name,kyc_status,kyc_updated FROM clients WHERE agent_id=$1 AND kyc_status='PENDING' ORDER BY full_name LIMIT 200",[ag]),
 renewals:(ag,f,t)=>q("SELECT c.client_id,c.full_name,p.insurer_label,p.policy_type,p.premium_amount,p.premium_due_date,p.expiry_date FROM insurance_policies p JOIN clients c USING(client_id) WHERE c.agent_id=$1 AND p.status='ACTIVE' AND (p.premium_due_date BETWEEN $2 AND $3 OR p.expiry_date BETWEEN $2 AND $3) ORDER BY p.premium_due_date LIMIT 200",[ag,f,t]),
 summary:async(ag,id)=>{const c=(await q("SELECT * FROM clients WHERE agent_id=$1 AND client_id=$2",[ag,id]))[0];if(!c)return null;
  c.sip=(await q("SELECT scheme_label,amount,next_due_date,status FROM sip_accounts WHERE client_id=$1 AND status='ACTIVE' LIMIT 1",[id]))[0]||null;
  c.policy=(await q("SELECT insurer_label,policy_type,premium_amount,premium_due_date,expiry_date FROM insurance_policies WHERE client_id=$1 AND status='ACTIVE' LIMIT 1",[id]))[0]||null;return c},
 draftSource:async(ag,id,topic)=>{const r={sip:"SELECT c.full_name,s.* FROM sip_accounts s JOIN clients c USING(client_id) WHERE c.agent_id=$1 AND c.client_id=$2 AND s.status='ACTIVE' LIMIT 1",premium:"SELECT c.full_name,p.* FROM insurance_policies p JOIN clients c USING(client_id) WHERE c.agent_id=$1 AND c.client_id=$2 AND p.status='ACTIVE' LIMIT 1",kyc:"SELECT full_name,kyc_status FROM clients WHERE agent_id=$1 AND client_id=$2"};return(await q(r[topic],[ag,id]))[0]},
 insertDraft:(ag,cid,topic,lang,text,fields)=>q("INSERT INTO followups(agent_id,client_id,topic,language,draft_text,fields_used) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[ag,cid,topic,lang,text,fields]).then(r=>r[0]),
 listDrafts:(ag)=>q("SELECT f.*,c.full_name FROM followups f JOIN clients c USING(client_id) WHERE f.agent_id=$1 ORDER BY f.created_at DESC LIMIT 100",[ag]),
 updateDraft:(ag,id,status,text)=>q("UPDATE followups SET status=$3,draft_text=COALESCE($4,draft_text),approved_at=CASE WHEN $3='APPROVED' THEN now() ELSE approved_at END WHERE agent_id=$1 AND followup_id=$2 AND status='DRAFT' RETURNING *",[ag,id,status,text]).then(r=>r[0]),
 audit:(ag,cid,action,tool,req,note)=>q("INSERT INTO audit_logs(agent_id,client_id,action,tool_name,request_id,note) VALUES($1,$2,$3,$4,$5,$6)",[ag,cid,action,tool,req,note]).catch(()=>{}),
 listAudit:ag=>q("SELECT * FROM audit_logs WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 200",[ag])};
module.exports.bootstrap=async ag=>{const clients=await q("SELECT * FROM clients WHERE agent_id=$1 ORDER BY full_name",[ag]),ids=clients.map(c=>c.client_id);
 const sips=await q("SELECT * FROM sip_accounts WHERE client_id=ANY($1) AND status='ACTIVE'",[ids]),pols=await q("SELECT * FROM insurance_policies WHERE client_id=ANY($1) AND status='ACTIVE'",[ids]);
 return{clients:clients.map(c=>({...c,sip:sips.find(s=>s.client_id===c.client_id)||null,policy:pols.find(p=>p.client_id===c.client_id)||null})),followups:await module.exports.listDrafts(ag)}};
