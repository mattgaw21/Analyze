require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createConfirmedUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('User creation failed: ' + error.message);
  return data.user;
}

async function fullUserFlow(index, stamp) {
  const email = `concurrent-${index}-${stamp}@gmail.com`;
  const password = 'TestPassword123!';
  const workspaceName = `Concurrent Workspace ${index}`;

  const authUser = await createConfirmedUser(email, password);
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  await client.auth.signInWithPassword({ email, password });

  const { data: ws, error: wsErr } = await client.from('workspaces').insert({ name: workspaceName, created_by: authUser.id }).select().single();
  if (wsErr) throw new Error(`User ${index} workspace failed: ` + wsErr.message);

  await client.from('workspace_members').insert({ workspace_id: ws.id, user_id: authUser.id, role: 'owner' });

  const { data: cl, error: clErr } = await client.from('clients').insert({ workspace_id: ws.id, name: `Client ${index}`, created_by: authUser.id }).select().single();
  if (clErr) throw new Error(`User ${index} client failed: ` + clErr.message);

  const { data: seenWorkspaces } = await client.from('workspaces').select('*');
  const { data: seenClients } = await client.from('clients').select('*');

  return { index, authUser, workspaceName, seenWorkspaces, seenClients };
}

async function run() {
  const stamp = Date.now();
  const CONCURRENT_USERS = 5;

  console.log(`Firing ${CONCURRENT_USERS} full sign-up + build flows AT THE SAME TIME, not one after another...\n`);

  const results = await Promise.all(
    Array.from({ length: CONCURRENT_USERS }, (_, i) => fullUserFlow(i + 1, stamp))
  );

  let allCorrect = true;
  for (const r of results) {
    const onlySeesOwnWorkspace = r.seenWorkspaces.length === 1 && r.seenWorkspaces[0].name === r.workspaceName;
    const onlySeesOwnClient = r.seenClients.length === 1 && r.seenClients[0].name === `Client ${r.index}`;
    const ok = onlySeesOwnWorkspace && onlySeesOwnClient;
    console.log(`   ${ok ? '✅' : '❌'} User ${r.index}: saw ${r.seenWorkspaces.length} workspace(s), ${r.seenClients.length} client(s) — correct: ${ok}`);
    if (!ok) allCorrect = false;
  }

  console.log('\nCleaning up...');
  await Promise.all(results.map(r => admin.auth.admin.deleteUser(r.authUser.id)));

  console.log('\n' + '='.repeat(50));
  if (allCorrect) {
    console.log(`✅ SUCCESS — ${CONCURRENT_USERS} people, all hitting the database at the exact same time, each correctly isolated to only their own data. No mixing, no race conditions.`);
  } else {
    console.log('❌ PROBLEM — data got mixed up between simultaneous users.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n❌ TEST CRASHED:', err.message);
  process.exit(1);
});
