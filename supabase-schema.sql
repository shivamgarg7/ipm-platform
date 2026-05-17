-- ============================================================
-- IPM Platform — Unified Database Schema
-- Safe to run multiple times: drops everything first
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================


-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 1: CLEAN SLATE — drop all previous tables/objects │
-- └─────────────────────────────────────────────────────────┘

-- Drop in dependency order (children first, parents last)
DROP TABLE IF EXISTS profile_snapshots CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS neuro_network CASCADE;
DROP TABLE IF EXISTS neuro_profiles CASCADE;

-- Also drop any tables from earlier schema versions
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop old function if it exists (triggers are auto-dropped with their tables via CASCADE)
DROP FUNCTION IF EXISTS update_updated_at();

-- Ensure uuid extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 2: CORE TABLES                                    │
-- └─────────────────────────────────────────────────────────┘

-- 2a. NEURO_PROFILES — self-report profiles (one per user)
CREATE TABLE neuro_profiles (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Raw interview data
  raw_answers     JSONB DEFAULT '{}'::jsonb,

  -- Structured LLM output
  llm_analysis    JSONB DEFAULT '{}'::jsonb,

  -- Extracted fields for dashboard queries (denormalized from llm_analysis)
  estimates       JSONB DEFAULT '{}'::jsonb,     -- 10 neurochemical levels + confidence
  archetype       JSONB,                          -- {"name": "...", "description": "..."}
  cognitive_params JSONB,                         -- Layer 2 computational parameters
  cascades        JSONB,                          -- feedback loops array
  interventions   JSONB,                          -- {"do": [...], "avoid": [...]}

  created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

CREATE INDEX idx_neuro_profiles_user ON neuro_profiles(user_id);
CREATE INDEX idx_neuro_profiles_raw_answers ON neuro_profiles USING GIN (raw_answers);
CREATE INDEX idx_neuro_profiles_llm_analysis ON neuro_profiles USING GIN (llm_analysis);


-- 2b. NEURO_NETWORK — observer-reported profiles (many per user)
CREATE TABLE neuro_network (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  primary_user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Subject info
  connection_name   TEXT NOT NULL,
  relationship_type TEXT CHECK (relationship_type IN ('spouse', 'close_friend', 'family_member', 'colleague', 'other')),

  -- Raw interview data
  raw_answers       JSONB DEFAULT '{}'::jsonb,

  -- Structured LLM output
  llm_analysis      JSONB DEFAULT '{}'::jsonb,

  -- Extracted fields (same shape as neuro_profiles)
  estimates         JSONB DEFAULT '{}'::jsonb,
  archetype         JSONB,
  cognitive_params  JSONB,
  cascades          JSONB,
  interventions     JSONB,
  observer_bias     JSONB,   -- {"bias_type", "overweighted_signals", "underweighted_signals", "confidence_adjustment"}

  created_at        TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

CREATE INDEX idx_neuro_network_primary_user ON neuro_network(primary_user_id);
CREATE INDEX idx_neuro_network_connection ON neuro_network(primary_user_id, connection_name);


-- 2c. CONVERSATIONS — chat history for every profiling session
--     Enables Bayesian updates: each conversation is a new observation
CREATE TABLE conversations (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Link to either neuro_profiles or neuro_network (one will be null)
  self_profile_id     UUID REFERENCES neuro_profiles(id) ON DELETE CASCADE,
  network_profile_id  UUID REFERENCES neuro_network(id) ON DELETE CASCADE,

  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  messages      JSONB NOT NULL DEFAULT '[]'::jsonb,
  session_type  TEXT NOT NULL CHECK (session_type IN ('onboarding', 'micro_checkin', 'observer')),

  created_at    TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,

  -- At least one profile FK must be set
  CONSTRAINT conversation_has_profile CHECK (
    self_profile_id IS NOT NULL OR network_profile_id IS NOT NULL
  )
);

CREATE INDEX idx_conversations_self ON conversations(self_profile_id);
CREATE INDEX idx_conversations_network ON conversations(network_profile_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);


-- 2d. PROFILE_SNAPSHOTS — longitudinal tracking
--     Every update creates a snapshot so you can chart drift over time
CREATE TABLE profile_snapshots (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Link to either table (one will be null)
  self_profile_id     UUID REFERENCES neuro_profiles(id) ON DELETE CASCADE,
  network_profile_id  UUID REFERENCES neuro_network(id) ON DELETE CASCADE,

  estimates     JSONB NOT NULL,
  archetype     JSONB,
  source        TEXT NOT NULL CHECK (source IN ('onboarding', 'micro_checkin', 'medical_report', 'observer_fusion')),

  created_at    TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,

  CONSTRAINT snapshot_has_profile CHECK (
    self_profile_id IS NOT NULL OR network_profile_id IS NOT NULL
  )
);

CREATE INDEX idx_snapshots_self ON profile_snapshots(self_profile_id, created_at);
CREATE INDEX idx_snapshots_network ON profile_snapshots(network_profile_id, created_at);


-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 3: ROW LEVEL SECURITY                             │
-- └─────────────────────────────────────────────────────────┘

ALTER TABLE neuro_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE neuro_network ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_snapshots ENABLE ROW LEVEL SECURITY;

-- neuro_profiles: users own their row
CREATE POLICY "Users can view own profile"
  ON neuro_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON neuro_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON neuro_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
  ON neuro_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- neuro_network: users own connections they created
CREATE POLICY "Users manage their network"
  ON neuro_network FOR ALL
  USING (auth.uid() = primary_user_id);

-- conversations: users own their conversations
CREATE POLICY "Users manage own conversations"
  ON conversations FOR ALL
  USING (auth.uid() = user_id);

-- snapshots: users access via profile ownership
CREATE POLICY "Users view own self-snapshots"
  ON profile_snapshots FOR SELECT
  USING (
    self_profile_id IN (SELECT id FROM neuro_profiles WHERE user_id = auth.uid())
    OR
    network_profile_id IN (SELECT id FROM neuro_network WHERE primary_user_id = auth.uid())
  );

CREATE POLICY "Users insert own snapshots"
  ON profile_snapshots FOR INSERT
  WITH CHECK (
    self_profile_id IN (SELECT id FROM neuro_profiles WHERE user_id = auth.uid())
    OR
    network_profile_id IN (SELECT id FROM neuro_network WHERE primary_user_id = auth.uid())
  );


-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 4: AUTO-UPDATE TIMESTAMPS                         │
-- └─────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER neuro_profiles_updated_at
  BEFORE UPDATE ON neuro_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER neuro_network_updated_at
  BEFORE UPDATE ON neuro_network
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- DONE. Tables created:
--   neuro_profiles      — self-report profiles (1 per user)
--   neuro_network       — observer profiles (many per user)
--   conversations       — chat history for all sessions
--   profile_snapshots   — longitudinal estimate tracking
-- ============================================================
