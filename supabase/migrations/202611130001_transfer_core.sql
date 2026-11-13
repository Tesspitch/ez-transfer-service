begin;
create schema tt;
revoke all on schema tt from public,anon,authenticated;
create table tt.members(user_id uuid primary key references auth.users(id),role text not null default 'member' check(role in ('member','admin')),active boolean not null default true,created_at timestamptz not null default now());
create table tt.storage_budget(id int primary key check(id=1),limit_bytes bigint not null default 8589934592,reserved_bytes bigint not null default 0 check(reserved_bytes>=0),stored_bytes bigint not null default 0 check(stored_bytes>=0));
insert into tt.storage_budget(id) values(1);
create table tt.transfers(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references tt.members(user_id), original_name text not null check(length(original_name) between 1 and 255),
 size_bytes bigint not null check(size_bytes between 1 and 1073741824),object_key text not null unique,
 state text not null default 'allocating' check(state in ('allocating','uploading','finalizing','ready','deleting','deleted')),
 retention text not null check(retention in ('1h','24h','7d','forever')), ready_at timestamptz,expires_at timestamptz,code_hash text unique,code_ciphertext text,
 upload_id text,hard_deadline timestamptz not null default now()+interval '2 hours', latest_url_expires_at timestamptz,
 lease_generation bigint not null default 1,lease_until timestamptz default now()+interval '2 minutes',ambiguous_until timestamptz,
 accounting text not null default 'reserved' check(accounting in ('reserved','stored','released')),
 created_at timestamptz not null default now(),delete_requested_at timestamptz,deleted_at timestamptz
);
create index transfers_owner on tt.transfers(owner_id,created_at desc,id desc);
create index transfers_expiry on tt.transfers(expires_at) where state='ready';
create table tt.idempotency_requests(owner_id uuid not null,key uuid not null,fingerprint text not null,transfer_id uuid not null references tt.transfers(id),created_at timestamptz not null default now(),primary key(owner_id,key));
create table tt.cleanup_jobs(transfer_id uuid primary key references tt.transfers(id),next_attempt_at timestamptz not null default now(),lease_until timestamptz,attempts int not null default 0,last_error_class text);
create table tt.access_events(id uuid primary key default gen_random_uuid(),transfer_id uuid not null references tt.transfers(id),actor_id uuid,kind text not null,created_at timestamptz not null default now());
create index access_events_created on tt.access_events(created_at);
create table tt.rate_windows(actor_id uuid not null,action text not null,minute timestamptz not null,count int not null,primary key(actor_id,action,minute));
create table tt.maintenance(id text primary key,value jsonb not null default '{}',updated_at timestamptz not null default now());

-- One service-only transactional entrypoint keeps state/accounting mutations serialized.
-- All actions lock budget first: a single organization, deliberately simple lock order.
create function public.transfer_rpc(action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,tt as $$
declare
 t tt.transfers%rowtype; b tt.storage_budget%rowtype; m tt.members%rowtype; old tt.idempotency_requests%rowtype;
 uid uuid := (p->>'userId')::uuid; tid uuid := (p->>'id')::uuid; n timestamptz := clock_timestamp();
 count_value int; limit_value int; fingerprint text; result jsonb; generation bigint;
begin
 select * into b from tt.storage_budget where id=1 for update;
 if action='member' then
   select * into m from tt.members where user_id=uid and active;
   if not found then raise exception 'FORBIDDEN'; end if;
   return jsonb_build_object('userId',m.user_id,'role',m.role);
 end if;
 if action='budget' then return to_jsonb(b); end if;
 if uid is not null then
   select * into m from tt.members where user_id=uid and active;
   if not found then raise exception 'FORBIDDEN'; end if;
 end if;
 if action='rate' then
   limit_value:=case p->>'action' when 'create' then 10 when 'receive' then 30 else 120 end;
   insert into tt.rate_windows values(uid,p->>'action',date_trunc('minute',n),1)
    on conflict on constraint rate_windows_pkey do update set count=tt.rate_windows.count+1 returning count into count_value;
   if count_value>limit_value then raise exception 'RATE'; end if;
   return '{}'::jsonb;
 end if;
 if action='reserve' then
   if uid is null or (p->>'sizeBytes')::bigint not between 1 and 1073741824 or p->>'retention' not in ('1h','24h','7d','forever') then raise exception 'INVALID'; end if;
   fingerprint:=jsonb_build_array(p->>'name',(p->>'sizeBytes')::bigint,p->>'retention')::text;
   select * into old from tt.idempotency_requests where owner_id=uid and key=(p->>'key')::uuid;
   if found then
     if old.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
     select * into t from tt.transfers where id=old.transfer_id;
     if t.state='deleted' then raise exception 'GONE'; end if;
     return to_jsonb(t)||jsonb_build_object('_created',false);
   end if;
   if b.reserved_bytes+b.stored_bytes+(p->>'sizeBytes')::bigint>b.limit_bytes then raise exception 'QUOTA'; end if;
   tid:=gen_random_uuid();
   insert into tt.transfers(id,owner_id,original_name,size_bytes,object_key,retention)
    values(tid,uid,p->>'name',(p->>'sizeBytes')::bigint,'transfers/'||tid::text,p->>'retention') returning * into t;
   update tt.storage_budget set reserved_bytes=reserved_bytes+t.size_bytes where id=1;
   insert into tt.idempotency_requests(owner_id,key,fingerprint,transfer_id) values(uid,(p->>'key')::uuid,fingerprint,tid);
   return to_jsonb(t)||jsonb_build_object('_created',true);
 end if;
 if action='list' then
   select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into result from (
     select * from tt.transfers where owner_id=uid and state<>'deleted'
     and (p->>'cursor' is null or (created_at,id)<((p->>'cursorTime')::timestamptz,(p->>'cursor')::uuid))
     order by created_at desc,id desc limit 26) q;
   return result;
 end if;
 if action='resolve' then
   select * into t from tt.transfers where code_hash=p->>'hash' and state='ready' and(expires_at is null or expires_at>n);
   if not found then raise exception 'NOT_FOUND'; end if;
   insert into tt.access_events(transfer_id,actor_id,kind) values(t.id,uid,'code_resolved');
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
   delete from tt.idempotency_requests i where i.created_at<n-interval '7 days' and not exists(select 1 from tt.cleanup_jobs where transfer_id=i.transfer_id) and exists(select 1 from tt.transfers where id=i.transfer_id and state in ('ready','deleted'));
   return '{}'::jsonb;
 end if;
 if action='by_key' then select * into t from tt.transfers where object_key=p->>'key'; if not found then return 'null'::jsonb; end if; return to_jsonb(t); end if;
 select * into t from tt.transfers where id=tid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if action in ('owned','delete','retention','code','parts','begin_finalize') and t.owner_id<>uid then raise exception 'NOT_FOUND'; end if;
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
   insert into tt.access_events(transfer_id,actor_id,kind) values(tid,t.owner_id,'uploaded');
   return to_jsonb(t);
 end if;
 if action in ('code','download','retention') then
   if t.state<>'ready' or (t.expires_at is not null and t.expires_at<=n) then raise exception 'NOT_FOUND'; end if;
   if action='download' then
     if t.owner_id<>uid and (p->>'hash' is null or p->>'hash'<>t.code_hash) then raise exception 'NOT_FOUND'; end if;
     insert into tt.access_events(transfer_id,actor_id,kind) values(tid,uid,'download_url_issued');
   elsif action='retention' then
     if p->>'retention' not in ('1h','24h','7d','forever') then raise exception 'INVALID'; end if;
     update tt.transfers set retention=p->>'retention',expires_at=case p->>'retention' when 'forever' then null when '1h' then n+interval '1 hour' when '24h' then n+interval '24 hours' else n+interval '7 days' end where id=tid returning * into t;
     insert into tt.access_events(transfer_id,actor_id,kind) values(tid,uid,'retention_changed');
   end if;
   return to_jsonb(t);
 end if;
 if action in ('delete','compensate') then
   if t.state='deleted' then return to_jsonb(t); end if;
   if action='compensate' and (t.state not in ('allocating','uploading','finalizing') or(p->>'generation' is not null and t.lease_generation<>(p->>'generation')::bigint)) then return to_jsonb(t); end if;
   update tt.transfers set state='deleting',delete_requested_at=coalesce(delete_requested_at,n),lease_generation=lease_generation+1,
    ambiguous_until=case when state in ('allocating','finalizing') then greatest(coalesce(ambiguous_until,n),n+interval '24 hours') else ambiguous_until end where id=tid returning * into t;
   insert into tt.cleanup_jobs(transfer_id) values(tid) on conflict do nothing;
   insert into tt.access_events(transfer_id,actor_id,kind) values(tid,uid,'delete_requested');
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
revoke all on function public.transfer_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.transfer_rpc(text,jsonb) to service_role;
revoke all on all tables in schema tt from public,anon,authenticated;
commit;
