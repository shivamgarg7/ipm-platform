// app/api/profiles/route.js
import { createServerClient } from '@/lib/supabase';

export const runtime = 'edge';

// GET /api/profiles?user_id=xxx — list all profiles (self + network) for a user
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 });

  const supabase = createServerClient();

  // Fetch self-profile
  const { data: selfProfile } = await supabase
    .from('neuro_profiles')
    .select('id, estimates, archetype, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  // Fetch network profiles (observer)
  const { data: networkProfiles } = await supabase
    .from('neuro_network')
    .select('id, connection_name, relationship_type, estimates, archetype, created_at, updated_at')
    .eq('primary_user_id', userId)
    .order('updated_at', { ascending: false });

  // Normalize into a unified list for the frontend
  const profiles = [];

  if (selfProfile) {
    profiles.push({
      id: selfProfile.id,
      subject_name: 'Self',
      mode: 'self',
      relationship: null,
      archetype: selfProfile.archetype,
      created_at: selfProfile.created_at,
      updated_at: selfProfile.updated_at,
    });
  }

  for (const np of (networkProfiles || [])) {
    profiles.push({
      id: np.id,
      subject_name: np.connection_name,
      mode: 'observer',
      relationship: np.relationship_type,
      archetype: np.archetype,
      created_at: np.created_at,
      updated_at: np.updated_at,
    });
  }

  return Response.json({ profiles });
}

// POST /api/profiles — save a completed profile
export async function POST(req) {
  try {
    const body = await req.json();
    const { user_id, subject_name, mode, relationship, profile_data, messages } = body;

    if (!user_id || !profile_data) {
      return Response.json({ error: 'user_id and profile_data required' }, { status: 400 });
    }

    const supabase = createServerClient();
    let profileId;

    if (mode === 'observer') {
      // ── Insert into neuro_network ──
      const { data, error } = await supabase
        .from('neuro_network')
        .insert({
          primary_user_id: user_id,
          connection_name: subject_name || 'Unknown',
          relationship_type: relationship || 'other',
          raw_answers: messages || [],
          llm_analysis: profile_data,
          estimates: profile_data.partial_estimates,
          archetype: profile_data.archetype,
          cognitive_params: profile_data.cognitive_params,
          cascades: profile_data.cascades,
          interventions: profile_data.interventions,
          observer_bias: profile_data.observer_bias || null,
        })
        .select('id')
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      profileId = data.id;

      // Save conversation
      if (messages?.length) {
        await supabase.from('conversations').insert({
          network_profile_id: profileId,
          user_id,
          messages,
          session_type: 'observer',
        });
      }

      // Save snapshot
      await supabase.from('profile_snapshots').insert({
        network_profile_id: profileId,
        estimates: profile_data.partial_estimates,
        archetype: profile_data.archetype,
        source: 'onboarding',
      });

    } else {
      // ── Upsert into neuro_profiles (one per user) ──
      const { data, error } = await supabase
        .from('neuro_profiles')
        .upsert({
          user_id,
          raw_answers: messages || [],
          llm_analysis: profile_data,
          estimates: profile_data.partial_estimates,
          archetype: profile_data.archetype,
          cognitive_params: profile_data.cognitive_params,
          cascades: profile_data.cascades,
          interventions: profile_data.interventions,
        }, { onConflict: 'user_id' })
        .select('id')
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      profileId = data.id;

      // Save conversation
      if (messages?.length) {
        await supabase.from('conversations').insert({
          self_profile_id: profileId,
          user_id,
          messages,
          session_type: 'onboarding',
        });
      }

      // Save snapshot
      await supabase.from('profile_snapshots').insert({
        self_profile_id: profileId,
        estimates: profile_data.partial_estimates,
        archetype: profile_data.archetype,
        source: 'onboarding',
      });
    }

    return Response.json({ id: profileId, success: true });

  } catch (err) {
    console.error('Save profile error:', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/profiles — update profile after micro-checkin
export async function PATCH(req) {
  try {
    const body = await req.json();
    const { profile_id, user_id, mode, updated_estimates, updated_archetype, messages } = body;

    if (!profile_id || !user_id) {
      return Response.json({ error: 'profile_id and user_id required' }, { status: 400 });
    }

    const supabase = createServerClient();
    const table = mode === 'observer' ? 'neuro_network' : 'neuro_profiles';
    const ownerCol = mode === 'observer' ? 'primary_user_id' : 'user_id';
    const fkCol = mode === 'observer' ? 'network_profile_id' : 'self_profile_id';

    // Update estimates
    const updates = {};
    if (updated_estimates) updates.estimates = updated_estimates;
    if (updated_archetype) updates.archetype = updated_archetype;

    const { error } = await supabase
      .from(table)
      .update(updates)
      .eq('id', profile_id)
      .eq(ownerCol, user_id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Save conversation
    if (messages?.length) {
      await supabase.from('conversations').insert({
        [fkCol]: profile_id,
        user_id,
        messages,
        session_type: 'micro_checkin',
      });
    }

    // Save snapshot
    if (updated_estimates) {
      await supabase.from('profile_snapshots').insert({
        [fkCol]: profile_id,
        estimates: updated_estimates,
        archetype: updated_archetype || null,
        source: 'micro_checkin',
      });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Update error:', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
