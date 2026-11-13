begin;
alter table tt.transfers alter column owner_id drop not null;
alter table tt.transfers add column owner_token_hash text, add column share_mode text, add column receiver_token_hash text, add column receiver_claim_request_id uuid, add column claimed_at timestamptz, add column creation_rate_key text;
alter table tt.transfers add constraint transfer_anonymous_owner check ((owner_id is not null and owner_token_hash is null and share_mode is null) or (owner_id is null and owner_token_hash ~ '^[a-f0-9]{64}$' and owner_token_hash is not null and share_mode in ('single','multiple') and share_mode is not null));
alter table tt.transfers add constraint receiver_claim_consistent check ((receiver_token_hash is null and receiver_claim_request_id is null and claimed_at is null) or (share_mode='single' and receiver_token_hash ~ '^[a-f0-9]{64}$' and receiver_token_hash is not null and receiver_claim_request_id is not null and claimed_at is not null));
create index transfers_creation_rate on tt.transfers(creation_rate_key) where state in ('allocating','uploading','finalizing');
alter table tt.access_events add column actor_kind text not null default 'system';
create table tt.anonymous_requests(key uuid primary key,owner_hash text not null,fingerprint text not null,transfer_id uuid not null references tt.transfers(id),created_at timestamptz not null default now());
create table tt.anonymous_rates(rate_key text not null,action text not null,minute timestamptz not null,count int not null,primary key(rate_key,action,minute));
create function public.transfer_rpc_v2(action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,tt as $$
declare
 t tt.transfers%rowtype; b tt.storage_budget%rowtype; old tt.anonymous_requests%rowtype;
 uid uuid := null; oh text:=p->>'ownerHash'; rh text:=p->>'receiverHash'; tid uuid := (p->>'id')::uuid; n timestamptz := clock_timestamp();
 count_value int; limit_value int; fingerprint text; result jsonb; generation bigint;
begin
 select * into b from tt.storage_budget where id=1 for update;
 n:=clock_timestamp();
 if action='budget' then return to_jsonb(b); end if;
 if action='rate' then
   limit_value:=case p->>'action' when 'create' then 10 when 'receive' then 30 else 600 end;
   insert into tt.anonymous_rates values(p->>'rateKey',p->>'action',date_trunc('minute',n),1)
    on conflict on constraint anonymous_rates_pkey do update set count=tt.anonymous_rates.count+1 returning count into count_value;
   if count_value>limit_value then raise exception 'RATE'; end if;
   return '{}'::jsonb;
 end if;
 if action='reserve' then
   if oh is null or oh !~ '^[a-f0-9]{64}$' or p->>'shareMode' not in ('single','multiple') or (p->>'sizeBytes')::bigint not between 1 and 1073741824 or p->>'retention' not in ('1h','24h','7d','forever') then raise exception 'INVALID'; end if;
   fingerprint:=jsonb_build_array(p->>'name',(p->>'sizeBytes')::bigint,p->>'retention',p->>'shareMode')::text;
   select * into old from tt.anonymous_requests where key=(p->>'key')::uuid;
   if found then
     if old.owner_hash is distinct from oh then raise exception 'NOT_FOUND'; end if;
     if old.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
     select * into t from tt.transfers where id=old.transfer_id;
     if t.state='deleted' then raise exception 'GONE'; end if;
     return to_jsonb(t)||jsonb_build_object('_created',false);
   end if;
   if (select count(*) from tt.transfers where creation_rate_key=p->>'rateKey' and state in ('allocating','uploading','finalizing'))>=3 then raise exception 'RATE'; end if;
   if b.reserved_bytes+b.stored_bytes+(p->>'sizeBytes')::bigint>b.limit_bytes then raise exception 'QUOTA'; end if;
   tid:=gen_random_uuid();
   insert into tt.transfers(id,owner_token_hash,share_mode,creation_rate_key,original_name,size_bytes,object_key,retention)
    values(tid,oh,p->>'shareMode',p->>'rateKey',p->>'name',(p->>'sizeBytes')::bigint,'transfers/'||tid::text,p->>'retention') returning * into t;
   update tt.storage_budget set reserved_bytes=reserved_bytes+t.size_bytes where id=1;
   insert into tt.anonymous_requests(owner_hash,key,fingerprint,transfer_id) values(oh,(p->>'key')::uuid,fingerprint,tid);
   return to_jsonb(t)||jsonb_build_object('_created',true);
 end if;
 if action='list' then raise exception 'NOT_FOUND'; end if;
 if action='resolve' then
   select * into t from tt.transfers where code_hash=p->>'hash' and owner_token_hash is not null and state='ready' and(expires_at is null or expires_at>n);
   if not found then raise exception 'NOT_FOUND'; end if;
   if t.share_mode='single' and t.receiver_token_hash is not null and t.receiver_token_hash is distinct from rh then raise exception 'FILE_ALREADY_CLAIMED'; end if;
   insert into tt.access_events(transfer_id,actor_kind,kind) values(t.id,'receiver','code_resolved');
   return to_jsonb(t);
 end if;
 if action='due' then
   update tt.transfers set state='deleting',delete_requested_at=coalesce(delete_requested_at,n),lease_generation=lease_generation+1,
     ambiguous_until=case when state in ('allocating','finalizing') then greatest(coalesce(ambiguous_until,n),n+interval '24 hours') else ambiguous_until end
     where (state='ready' and expires_at<=n) or (state='uploading' and hard_deadline<=n) or (state in ('allocating','finalizing') and lease_until<n);
   insert into tt.cleanup_jobs(transfer_id) select id from tt.transfers where state='deleting' on conflict do nothing;
   with jobs as (select j.transfer_id from tt.cleanup_jobs j where j.next_attempt_at<=n and (j.lease_until is null or j.lease_until<n) order by j.next_attempt_at limit 3 for update skip locked),
   claimed as (update tt.cleanup_jobs j set lease_until=n+interval '2 minutes',attempts=attempts+1 from jobs where j.transfer_id=jobs.transfer_id returning j.transfer_id),
   updated as (update tt.transfers set lease_generation=lease_generation+1 where id in(select transfer_id from claimed) returning *)
   select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from updated x;
   return result;
 end if;
 if action='maintenance' then
   insert into tt.maintenance(id,value) values(p->>'key',p->'value') on conflict(id) do update set value=excluded.value,updated_at=n;
   return '{}'::jsonb;
 end if;
 if action='maintenance_get' then return coalesce((select value from tt.maintenance where id=p->>'key'),'{}'::jsonb); end if;
 if action='gc' then
   delete from tt.access_events where created_at<n-interval '30 days';
   delete from tt.rate_windows where minute<n-interval '1 day';
   delete from tt.anonymous_rates where minute<n-interval '1 day';
   delete from tt.anonymous_requests i where created_at<n-interval '7 days' and exists(select 1 from tt.transfers where id=i.transfer_id and state in ('ready','deleted')) and not exists(select 1 from tt.cleanup_jobs where transfer_id=i.transfer_id);
   delete from tt.idempotency_requests i where i.created_at<n-interval '7 days' and not exists(select 1 from tt.cleanup_jobs where transfer_id=i.transfer_id) and exists(select 1 from tt.transfers where id=i.transfer_id and state in ('ready','deleted'));
   return '{}'::jsonb;
 end if;
 if action='by_key' then select * into t from tt.transfers where object_key=p->>'key'; if not found then return 'null'::jsonb; end if; return to_jsonb(t); end if;
 select * into t from tt.transfers where id=tid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if action in ('owned','delete','retention','code','parts','begin_finalize','claim','download') and t.owner_token_hash is null then raise exception 'NOT_FOUND'; end if;
 if action in ('owned','delete','retention','code','parts','begin_finalize') and (oh is null or t.owner_token_hash is distinct from oh) then raise exception 'NOT_FOUND'; end if;
 if action='owned' then return to_jsonb(t); end if;
 if action='parts' then
   if t.state<>'uploading' or t.hard_deadline<=n then raise exception 'STATE'; end if;
   update tt.transfers set latest_url_expires_at=greatest(coalesce(latest_url_expires_at,n),least((p->>'until')::timestamptz,hard_deadline)) where id=tid returning * into t;
   return to_jsonb(t);
 end if;
 if action='activate' then
   if t.state<>'allocating' or t.lease_generation<>(p->>'generation')::bigint then raise exception 'STATE'; end if;
   update tt.transfers set upload_id=p->>'uploadId',state='uploading',lease_until=null where id=tid returning * into t;
   return to_jsonb(t);
 end if;
 if action='begin_finalize' then
   if t.state='ready' then return to_jsonb(t); end if;
   if t.state<>'uploading' or t.hard_deadline<=n then raise exception 'STATE'; end if;
   update tt.transfers set state='finalizing',lease_generation=lease_generation+1,lease_until=n+interval '2 minutes' where id=tid returning * into t;
   return to_jsonb(t);
 end if;
 if action='ready' then
   if t.state='ready' then return to_jsonb(t); end if;
   if t.state<>'finalizing' or t.lease_generation<>(p->>'generation')::bigint or t.hard_deadline<=n then raise exception 'STATE'; end if;
   update tt.storage_budget set reserved_bytes=reserved_bytes-t.size_bytes,stored_bytes=stored_bytes+t.size_bytes where id=1;
   update tt.transfers set state='ready',accounting='stored',ready_at=n,expires_at=case retention when 'forever' then null when '1h' then n+interval '1 hour' when '24h' then n+interval '24 hours' else n+interval '7 days' end,
     code_hash=p->>'hash',code_ciphertext=p->>'ciphertext',lease_until=null where id=tid returning * into t;
   insert into tt.access_events(transfer_id,actor_kind,kind) values(tid,'owner','uploaded');
   return to_jsonb(t);
 end if;
 if action='claim' then
   if t.state<>'ready' or (t.expires_at is not null and t.expires_at<=n) or t.code_hash is distinct from p->>'hash' then raise exception 'NOT_FOUND'; end if;
   if t.share_mode<>'single' then raise exception 'MODE_MISMATCH'; end if;
   if rh is null or rh !~ '^[a-f0-9]{64}$' or p->>'claimRequestId' is null then raise exception 'INVALID'; end if;
   if t.receiver_token_hash is not null then
     if t.receiver_token_hash is distinct from rh or t.receiver_claim_request_id is distinct from (p->>'claimRequestId')::uuid then raise exception 'FILE_ALREADY_CLAIMED'; end if;
   else
     update tt.transfers set receiver_token_hash=rh,receiver_claim_request_id=(p->>'claimRequestId')::uuid,claimed_at=n where id=tid returning * into t;
     insert into tt.access_events(transfer_id,actor_kind,kind) values(tid,'receiver','claimed');
   end if;
   return to_jsonb(t);
 end if;
 if action in ('code','download','retention') then
   if t.state<>'ready' or (t.expires_at is not null and t.expires_at<=n) then raise exception 'NOT_FOUND'; end if;
   if action='download' then
     if p ? 'ownerHash' then
       if oh is null or t.owner_token_hash is distinct from oh then raise exception 'NOT_FOUND'; end if;
     elsif t.share_mode='single' then
       if rh is null or t.receiver_token_hash is null or t.receiver_token_hash is distinct from rh then raise exception 'NOT_FOUND'; end if;
     elsif t.share_mode='multiple' then
       if p->>'hash' is null or t.code_hash is distinct from p->>'hash' then raise exception 'NOT_FOUND'; end if;
     else raise exception 'NOT_FOUND'; end if;
     insert into tt.access_events(transfer_id,actor_kind,kind) values(tid,case when oh is not null then 'owner' else 'receiver' end,'download_url_issued');
   elsif action='retention' then
     if p->>'retention' not in ('1h','24h','7d','forever') then raise exception 'INVALID'; end if;
     update tt.transfers set retention=p->>'retention',expires_at=case p->>'retention' when 'forever' then null when '1h' then n+interval '1 hour' when '24h' then n+interval '24 hours' else n+interval '7 days' end where id=tid returning * into t;
     insert into tt.access_events(transfer_id,actor_kind,kind) values(tid,'owner','retention_changed');
   end if;
   return to_jsonb(t);
 end if;
 if action in ('delete','compensate') then
   if t.state='deleted' then return to_jsonb(t); end if;
   if action='compensate' and (t.state not in ('allocating','uploading','finalizing') or(p->>'generation' is not null and t.lease_generation<>(p->>'generation')::bigint)) then return to_jsonb(t); end if;
   update tt.transfers set state='deleting',delete_requested_at=coalesce(delete_requested_at,n),lease_generation=lease_generation+1,
    ambiguous_until=case when state in ('allocating','finalizing') then greatest(coalesce(ambiguous_until,n),n+interval '24 hours') else ambiguous_until end where id=tid returning * into t;
   insert into tt.cleanup_jobs(transfer_id) values(tid) on conflict do nothing;
   insert into tt.access_events(transfer_id,actor_kind,kind) values(tid,case when action='delete' then 'owner' else 'system' end,'delete_requested');
   return to_jsonb(t);
 end if;
 if action='cleaned' then
   if t.state='deleted' then return to_jsonb(t); end if;
   if t.state<>'deleting' or t.lease_generation<>(p->>'generation')::bigint then raise exception 'STATE'; end if;
   if greatest(coalesce(t.latest_url_expires_at+interval '2 minutes',n),coalesce(t.ambiguous_until,n))>n then raise exception 'STATE'; end if;
   if t.accounting='stored' then update tt.storage_budget set stored_bytes=stored_bytes-t.size_bytes where id=1;
   elsif t.accounting='reserved' then update tt.storage_budget set reserved_bytes=reserved_bytes-t.size_bytes where id=1; end if;
   update tt.transfers set state='deleted',accounting='released',deleted_at=n,code_hash=null,code_ciphertext=null where id=tid returning * into t;
   delete from tt.cleanup_jobs where transfer_id=tid;
   insert into tt.access_events(transfer_id,kind) values(tid,'deleted'); return to_jsonb(t);
 end if;
 if action='retry_cleanup' then
   if t.lease_generation<>(p->>'generation')::bigint then raise exception 'STATE'; end if;
   update tt.cleanup_jobs set lease_until=null,last_error_class='RETRY',next_attempt_at=greatest(n+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::int),coalesce(t.ambiguous_until,n),coalesce(t.latest_url_expires_at+interval '2 minutes',n)) where transfer_id=tid;
   return '{}'::jsonb;
 end if;
 raise exception 'INVALID';
end; $$;
revoke all on function public.transfer_rpc_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.transfer_rpc_v2(text,jsonb) to service_role;
revoke all on all tables in schema tt from public,anon,authenticated;
commit;
