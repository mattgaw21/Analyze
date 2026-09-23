-- Fix: let a user see a workspace they just created, even before
-- the membership row exists yet (closes the chicken-and-egg gap).

drop policy "members see their own workspace" on workspaces;

create policy "members see their own workspace"
  on workspaces for select
  using (
    id in (select workspace_id from workspace_members where user_id = auth.uid())
    or created_by = auth.uid()
  );
