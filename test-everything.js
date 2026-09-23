require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ALL_TABLES = [
  'workspaces', 'workspace_members', 'clients', 'connected_accounts',
  'funnel_uploads', 'data_pull_log', 'scan_results', 'outcome_checks',
  'chat_messages', 'usage_log', 'error_log', 'feedback', 'subscriptions'
];

async function createConfirmedUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('User creation failed: ' + error.message);
  return data.user;
}

async function run() {
  let passed = 0, failed = 0;
  const check = (label, ok, detail = '') => {
    console.log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
    ok ? passed++ : failed++;
  };

  console.log('1. Checking all 13 tables actually exist...');
  for (const table of ALL_TABLES) {
    const { error } = await admin.from(table).select('id').limit(1);
    check(table, !error, error?.message);
  }

  const stamp = Date.now();
  const userA = { email: `final-a-${stamp}@gmail.com`, password: 'TestPassword123!' };
  const userB = { email: `final-b-${stamp}@gmail.com`, password: 'TestPassword123!' };

  console.log('\n2. Real user (A) signs up and builds a full chain of real data...');
  const authA = await createConfirmedUser(userA.email, userA.password);
  const clientA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  await clientA.auth.signInWithPassword(userA);

  const { data: ws, error: wsErr } = await clientA.from('workspaces').insert({ name: 'Final Test WS', created_by: authA.id }).select().single();
  check('User A can create a workspace', !wsErr, wsErr?.message);

  const { error: memErr } = await clientA.from('workspace_members').insert({ workspace_id: ws.id, user_id: authA.id, role: 'owner' });
  check('User A can add themselves as a member', !memErr, memErr?.message);

  const { data: client, error: clientErr } = await clientA.from('clients').insert({ workspace_id: ws.id, name: 'Final Test Client', created_by: authA.id }).select().single();
  check('User A can create a client', !clientErr, clientErr?.message);

  const { data: upload, error: uploadErr } = await clientA.from('funnel_uploads').insert({ client_id: client.id, raw_data: { ctr: 1.0 }, uploaded_by: authA.id }).select().single();
  check('User A can upload funnel data', !uploadErr, uploadErr?.message);

  const { error: connErr } = await clientA.from('connected_accounts').insert({ client_id: client.id, provider: 'meta_ads', connected_by: authA.id });
  check('User A can add a connected account', !connErr, connErr?.message);

  const { data: msg, error: msgErr } = await clientA.from('chat_messages').insert({ client_id: client.id, sender: 'user', message: 'Test message', user_id: authA.id }).select().single();
  check('User A can send a chat message', !msgErr, msgErr?.message);

  // Simulate the backend AI writing a result (uses admin/service role, correctly)
  const { data: scan, error: scanErr } = await admin.from('scan_results').insert({ upload_id: upload.id, bottleneck_name: 'Test Bottleneck', ai_raw_output: 'test' }).select().single();
  check('Backend (service role) can write a scan result', !scanErr, scanErr?.message);

  const { error: readScanErr } = await clientA.from('scan_results').select('*').eq('id', scan.id).single();
  check('User A can read the AI result for their own client', !readScanErr, readScanErr?.message);

  const { error: fbErr } = await clientA.from('feedback').insert({ workspace_id: ws.id, user_id: authA.id, scan_result_id: scan.id, rating: 'helpful' });
  check('User A can leave feedback', !fbErr, fbErr?.message);

  console.log('\n3. A second real user (B) should see NONE of this...');
  const authB = await createConfirmedUser(userB.email, userB.password);
  const clientB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  await clientB.auth.signInWithPassword(userB);

  const { data: bSeesWorkspaces } = await clientB.from('workspaces').select('*');
  check('User B sees 0 of User A\'s workspaces', bSeesWorkspaces.length === 0, `saw ${bSeesWorkspaces.length}`);

  const { data: bSeesClients } = await clientB.from('clients').select('*');
  check('User B sees 0 of User A\'s clients', bSeesClients.length === 0, `saw ${bSeesClients.length}`);

  const { data: bSeesChats } = await clientB.from('chat_messages').select('*');
  check('User B sees 0 of User A\'s chat messages', bSeesChats.length === 0, `saw ${bSeesChats.length}`);

  console.log('\n4. A logged-OUT request should see nothing at all...');
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: anonSeesWorkspaces } = await anon.from('workspaces').select('*');
  check('Logged-out request sees 0 workspaces', (anonSeesWorkspaces || []).length === 0, `saw ${(anonSeesWorkspaces||[]).length}`);

  console.log('\n5. Cleaning up test accounts...');
  await admin.auth.admin.deleteUser(authA.id);
  await admin.auth.admin.deleteUser(authB.id);

  console.log(`\n${'='.repeat(50)}`);
  console.log(failed === 0 ? `✅ ALL ${passed} CHECKS PASSED — genuinely everything works.` : `❌ ${failed} CHECK(S) FAILED, ${passed} passed — real issues found.`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('\n❌ TEST CRASHED:', err.message);
  process.exit(1);
});
