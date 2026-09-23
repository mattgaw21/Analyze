require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Admin client (master key) — only used here to pre-confirm test accounts,
// so this test doesn't need real inboxes. Real user sign-ups still require
// actual email confirmation, untouched.
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createConfirmedTestUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (error) throw new Error('Test user creation failed: ' + error.message);
  return data.user;
}

async function run() {
  const stamp = Date.now();
  const userA = { email: `test-a-${stamp}@gmail.com`, password: 'TestPassword123!' };
  const userB = { email: `test-b-${stamp}@gmail.com`, password: 'TestPassword123!' };

  console.log('1. Creating User A (pre-confirmed, test-only) and their workspace...');
  const authA = await createConfirmedTestUser(userA.email, userA.password);
  const clientA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const signInA = await clientA.auth.signInWithPassword(userA);
  if (signInA.error) throw new Error('Sign in A failed: ' + signInA.error.message);
  console.log('   -> Signed in as:', signInA.data.user?.id, '(should match', authA.id + ')');
  const { data: workspaceA, error: wsErrorA } = await clientA
    .from('workspaces')
    .insert({ name: 'Workspace A', created_by: authA.id })
    .select()
    .single();
  if (wsErrorA) throw new Error('Workspace A creation failed: ' + wsErrorA.message);
  await clientA.from('workspace_members').insert({ workspace_id: workspaceA.id, user_id: authA.id, role: 'owner' });
  console.log('   -> User A workspace:', workspaceA.name, workspaceA.id);

  console.log('2. Creating User B (pre-confirmed, test-only) and their workspace...');
  const authB = await createConfirmedTestUser(userB.email, userB.password);
  const clientB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  await clientB.auth.signInWithPassword(userB);
  const { data: workspaceB, error: wsErrorB } = await clientB
    .from('workspaces')
    .insert({ name: 'Workspace B', created_by: authB.id })
    .select()
    .single();
  if (wsErrorB) throw new Error('Workspace B creation failed: ' + wsErrorB.message);
  await clientB.from('workspace_members').insert({ workspace_id: workspaceB.id, user_id: authB.id, role: 'owner' });
  console.log('   -> User B workspace:', workspaceB.name, workspaceB.id);

  console.log('\n3. While logged in as User B, trying to read all workspaces...');
  const { data: visibleWorkspaces, error } = await clientB.from('workspaces').select('*');
  if (error) throw new Error('Read failed: ' + error.message);

  console.log('   User B can see', visibleWorkspaces.length, 'workspace(s):', visibleWorkspaces.map(w => w.name));

  const canSeeOwnOnly = visibleWorkspaces.length === 1 && visibleWorkspaces[0].name === 'Workspace B';

  if (canSeeOwnOnly) {
    console.log('\n✅ SUCCESS — User B can only see their own workspace, not User A\'s. Security rules are working correctly for real logged-in users.');
  } else {
    console.log('\n❌ PROBLEM — User B can see workspaces that are not theirs.');
    process.exit(1);
  }

  console.log('\n4. Cleaning up test accounts...');
  await admin.auth.admin.deleteUser(authA.id);
  await admin.auth.admin.deleteUser(authB.id);
  console.log('   -> Test accounts removed. Real data untouched.');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
