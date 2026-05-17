// app/api/profiles/[id]/route.js
import { createServerClient } from '@/lib/supabase';

export const runtime = 'edge';

// GET /api/profiles/[id]?user_id=xxx&mode=self|observer
export async function GET(req, { params }) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const mode = searchParams.get('mode') || 'self';
  const profileId = params.id;

  if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 });

  const supabase = createServerClient();
  const table = mode === 'observer' ? 'neuro_network' : 'neuro_profiles';
  const ownerCol = mode === 'observer' ? 'primary_user_id' : 'user_id';
  const fkCol = mode === 'observer' ? 'network_profile_id' : 'self_profile_id';

  // Fetch profile
  const { data: profile, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', profileId)
    .eq(ownerCol, userId)
    .single();

  if (error) return Response.json({ error: 'Profile not found' }, { status: 404 });

  // Fetch snapshots for longitudinal tracking
  const { data: snapshots } = await supabase
    .from('profile_snapshots')
    .select('estimates, archetype, source, created_at')
    .eq(fkCol, profileId)
    .order('created_at', { ascending: true });

  // Fetch conversation count
  const { count } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq(fkCol, profileId);

  return Response.json({
    profile,
    snapshots: snapshots || [],
    conversation_count: count || 0,
  });
}
