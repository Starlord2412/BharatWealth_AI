DROP TABLE IF EXISTS audit_logs,followups,insurance_policies,sip_accounts,clients,agents CASCADE;
CREATE TABLE agents(agent_id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,preferred_language TEXT NOT NULL,is_active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE clients(client_id TEXT PRIMARY KEY,agent_id TEXT NOT NULL REFERENCES agents,full_name TEXT NOT NULL,alt_name TEXT,normalized_name TEXT NOT NULL,phone_masked TEXT,preferred_language TEXT NOT NULL,kyc_status TEXT NOT NULL,kyc_updated DATE,last_followup TEXT,notes TEXT);
CREATE TABLE sip_accounts(sip_id SERIAL PRIMARY KEY,client_id TEXT NOT NULL REFERENCES clients,scheme_label TEXT,amount NUMERIC(12,2),next_due_date DATE,status TEXT);
CREATE TABLE insurance_policies(policy_id SERIAL PRIMARY KEY,client_id TEXT NOT NULL REFERENCES clients,insurer_label TEXT,policy_type TEXT,premium_amount NUMERIC(12,2),premium_due_date DATE,expiry_date DATE,status TEXT);
CREATE TABLE followups(followup_id SERIAL PRIMARY KEY,agent_id TEXT NOT NULL REFERENCES agents,client_id TEXT NOT NULL REFERENCES clients,topic TEXT,language TEXT,draft_text TEXT NOT NULL,fields_used TEXT[],status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','APPROVED','CANCELLED')),due_at TIMESTAMPTZ,approved_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE audit_logs(audit_id SERIAL PRIMARY KEY,agent_id TEXT,client_id TEXT,action TEXT,tool_name TEXT,request_id TEXT,note TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX ON clients(agent_id,normalized_name);CREATE INDEX ON sip_accounts(status,next_due_date);CREATE INDEX ON insurance_policies(status,premium_due_date);CREATE INDEX ON followups(agent_id,status);
-- Row-level security as defense in depth (app sets: SET LOCAL app.agent_id = '<id>')
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_clients ON clients USING (agent_id = current_setting('app.agent_id',true));
