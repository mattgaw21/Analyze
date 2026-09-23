require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Uses the public/anon key on purpose — this is what a real logged-in
// user's session uses, so it actually respects the security rules,
// unlike the master key used in test-database.js.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function signUp(email, password, workspaceName) {
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) throw new Error('Sign up failed: ' + authError.message);

  // Sign in immediately so the next calls run as this real user, not anonymously
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error('Auto sign-in after signup failed: ' + signInError.message);

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name: workspaceName, created_by: authData.user.id })
    .select()
    .single();
  if (wsError) throw new Error('Workspace creation failed: ' + wsError.message);

  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: authData.user.id, role: 'owner' });
  if (memberError) throw new Error('Adding as member failed: ' + memberError.message);

  return { user: authData.user, workspace };
}

async function logIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Log in failed: ' + error.message);
  return data;
}

module.exports = { signUp, logIn, supabase };
