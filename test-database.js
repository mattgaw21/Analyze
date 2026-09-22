require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('1. Creating a test workspace (like BrightPath Marketing)...');
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name: 'Test Workspace' })
    .select()
    .single();
  if (wsError) throw new Error('Workspace insert failed: ' + wsError.message);
  console.log('   -> Created workspace:', workspace.id);

  console.log('2. Adding a test client (like Luna Skincare)...');
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({ workspace_id: workspace.id, name: 'Test Client' })
    .select()
    .single();
  if (clientError) throw new Error('Client insert failed: ' + clientError.message);
  console.log('   -> Created client:', client.id);

  console.log('3. Adding a test funnel upload...');
  const { data: upload, error: uploadError } = await supabase
    .from('funnel_uploads')
    .insert({ client_id: client.id, raw_data: { ctr: 1.1, roas: 1.4 } })
    .select()
    .single();
  if (uploadError) throw new Error('Upload insert failed: ' + uploadError.message);
  console.log('   -> Created upload:', upload.id);

  console.log('4. Adding a test AI scan result...');
  const { data: scan, error: scanError } = await supabase
    .from('scan_results')
    .insert({
      upload_id: upload.id,
      bottleneck_name: 'Low CTR',
      confidence: 'high',
      reasoning: 'CTR of 1.1% is well below the 2.19% benchmark.',
      fix_steps: ['Refresh ad creative', 'Test new hooks'],
      ai_raw_output: 'This is a test scan result.'
    })
    .select()
    .single();
  if (scanError) throw new Error('Scan result insert failed: ' + scanError.message);
  console.log('   -> Created scan result:', scan.id);

  console.log('\n5. Reading it all back to confirm it actually saved...');
  const { data: readBack, error: readError } = await supabase
    .from('scan_results')
    .select('*, funnel_uploads(*, clients(*, workspaces(*)))')
    .eq('id', scan.id)
    .single();
  if (readError) throw new Error('Read back failed: ' + readError.message);

  console.log('\n✅ SUCCESS — full chain works end to end:');
  console.log('   Workspace:', readBack.funnel_uploads.clients.workspaces.name);
  console.log('   Client:', readBack.funnel_uploads.clients.name);
  console.log('   Bottleneck found:', readBack.bottleneck_name);
  console.log('   Fix steps:', readBack.fix_steps);
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
