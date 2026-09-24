-- RLS helper functions only need to be executable by signed-in users (policies run them
-- as the querying role). Functions are executable by PUBLIC by default, which exposed
-- them to anon via /rest/v1/rpc (flagged by the Supabase security advisor).
revoke execute on function public.is_group_member(uuid)     from public, anon;
revoke execute on function public.shares_group_with(uuid)   from public, anon;
revoke execute on function public.is_group_admin(uuid)      from public, anon;
revoke execute on function public.is_collective_admin(uuid) from public, anon;
revoke execute on function public.in_collective(uuid)       from public, anon;
grant  execute on function public.is_group_member(uuid)     to authenticated;
grant  execute on function public.shares_group_with(uuid)   to authenticated;
grant  execute on function public.is_group_admin(uuid)      to authenticated;
grant  execute on function public.is_collective_admin(uuid) to authenticated;
grant  execute on function public.in_collective(uuid)       to authenticated;
