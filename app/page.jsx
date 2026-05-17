'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = typeof window !== 'undefined'
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
  : null;

// ─── System prompt builder ─────────────────────────────────────────────
const buildSystemPrompt = (mode, subjectName, relationship) => {
  const isObserver = mode === 'observer';
  const subjectRef = subjectName || 'the person';

  const observerBlock = isObserver ? `
## OBSERVER MODE ACTIVE
You are interviewing an OBSERVER about someone else: "${subjectRef}" (their ${relationship}).
- Frame ALL questions about ${subjectRef}. E.g. "How does ${subjectRef} typically react when…"
- Prioritise EXTERNALLY OBSERVABLE traits: energy, social behaviour, stress reactions, routines, conflict style.
- De-prioritise internal states. Frame them as "From what you can tell…"
- Apply confidence penalty: observer data is "moderate" at best for internal states, "high" only for observable behaviours.
- When profile is complete include "observer_bias" (see schema).
` : '';

  return `You are the Profiler Engine of the Integrated Personality Modeling Platform.

YOU MUST ALWAYS RESPOND IN VALID JSON. No markdown, no backticks, no preamble.
${observerBlock}
## Task
Estimate 10 neurochemical parameters${isObserver ? ` for ${subjectRef} via observer reports` : ''}:
PRIMARY 5: Dopamine, Serotonin, Cortisol, Testosterone, Oxytocin
COGNITIVE 5: Norepinephrine, Acetylcholine, BDNF, Thyroid, GABA

## Protocol
1. ONE question at a time. Warm, conversational.
2. High-diagnosticity signals first: ${isObserver ? 'observable energy, social behaviour, stress reactions, sleep you have noticed, conflict style' : 'sleep, hedonic capacity, rumination, hyperfocus, childhood continuity'}.
3. Disambiguate similar presentations.
4. After 8-12 questions produce a complete profile.

## JSON Schema
{
  "message": "<your message>",
  "phase": "interviewing" | "profiling_complete",
  "question_number": <int>,
  "total_expected": <8-12>,
  "partial_estimates": {
    "dopamine":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "serotonin":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "cortisol":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "testosterone":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "oxytocin":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "norepinephrine":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "acetylcholine":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "bdnf":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "thyroid":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null},
    "gaba":{"level":<0-100|null>,"confidence":"high"|"moderate"|"low"|null}
  },
  "archetype": null | {"name":"<name>","description":"<2-3 sentences>"},
  "cascades": null | [{"name":"<>","type":"positive"|"negative","description":"<>"}],
  "interventions": null | {"do":["..."],"avoid":["..."]},
  "cognitive_params": null | {"threat_precision":"low|moderate|high","reward_learning_rate":"...","punishment_learning_rate":"...","belief_volatility":"...","exploration_drive":"..."}${isObserver ? `,
  "observer_bias": null | {"bias_type":"<>","overweighted_signals":["..."],"underweighted_signals":["..."],"confidence_adjustment":"<>"}` : ''}
}

When phase="profiling_complete" fill ALL fields. During interviewing keep archetype/cascades/interventions/cognitive_params null.`;
};

// ─── Constants ─────────────────────────────────────────────────────────
const CHEMICALS = {
  dopamine:{label:'Dopamine',color:'#F59E0B',icon:'⚡',group:'primary'},
  serotonin:{label:'Serotonin',color:'#3B82F6',icon:'🌊',group:'primary'},
  cortisol:{label:'Cortisol',color:'#EF4444',icon:'🔥',group:'primary'},
  testosterone:{label:'Testosterone',color:'#8B5CF6',icon:'🛡️',group:'primary'},
  oxytocin:{label:'Oxytocin',color:'#EC4899',icon:'💗',group:'primary'},
  norepinephrine:{label:'Norepinephrine',color:'#F97316',icon:'⚙️',group:'cognitive'},
  acetylcholine:{label:'Acetylcholine',color:'#06B6D4',icon:'🧠',group:'cognitive'},
  bdnf:{label:'BDNF',color:'#10B981',icon:'🌱',group:'cognitive'},
  thyroid:{label:'Thyroid',color:'#A855F7',icon:'⏱️',group:'cognitive'},
  gaba:{label:'GABA',color:'#6366F1',icon:'🧘',group:'cognitive'},
};

const RELATIONSHIPS = [
  {value:'spouse',label:'Spouse / Partner',icon:'💍'},
  {value:'close_friend',label:'Close Friend',icon:'🤝'},
  {value:'family_member',label:'Family Member',icon:'👨‍👩‍👧'},
  {value:'colleague',label:'Colleague',icon:'💼'},
  {value:'other',label:'Other',icon:'👤'},
];

const BIAS_NOTES = {
  spouse: 'Romantic partners tend to overweight emotional/attachment signals and underweight professional behaviours. Internal-state confidence capped at moderate.',
  close_friend: 'Close friends overweight social signals, may miss private stress patterns. Best for social chemistry, weaker for internal regulation.',
  family_member: 'Family has long observation windows (childhood continuity) but may carry projection biases. Excellent for developmental signals.',
  colleague: 'Colleagues see task behaviour and stress clearly, but rarely observe personal emotional regulation or attachment.',
  other: "We'll calibrate conservatively based on available signals.",
};

// ─── Small components ──────────────────────────────────────────────────
const BarVis = ({level,color,confidence,animate}) => (
  <div style={{position:'relative',height:8,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden'}}>
    <div style={{height:'100%',width:`${level??0}%`,background:color,opacity:confidence==='high'?1:confidence==='moderate'?0.7:0.4,borderRadius:4,transition:animate?'width 1.2s cubic-bezier(.4,0,.2,1), opacity 0.6s':'none'}}/>
    {confidence&&<div style={{position:'absolute',right:4,top:-1,fontSize:8,color:'rgba(255,255,255,0.35)',letterSpacing:1,textTransform:'uppercase'}}>{confidence}</div>}
  </div>
);

const ChemCard = ({chemKey,data,animate}) => {
  const c = CHEMICALS[chemKey];
  return (
    <div style={{padding:'10px 12px',background:data?.level!=null?'rgba(255,255,255,0.03)':'transparent',borderRadius:8,border:data?.level!=null?`1px solid ${c.color}22`:'1px solid rgba(255,255,255,0.04)',transition:'all 0.5s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <span style={{fontSize:12,color:data?.level!=null?c.color:'rgba(255,255,255,0.3)',fontWeight:500}}>{c.icon} {c.label}</span>
        {data?.level!=null&&<span style={{fontSize:13,fontWeight:700,color:c.color,fontFamily:"'JetBrains Mono',monospace"}}>{data.level}</span>}
      </div>
      <BarVis level={data?.level} color={c.color} confidence={data?.confidence} animate={animate}/>
    </div>
  );
};

const CascadeCard = ({cascade,index}) => {
  const pos = cascade.type==='positive';
  return (
    <div style={{padding:16,background:pos?'rgba(16,185,129,0.06)':'rgba(239,68,68,0.06)',border:`1px solid ${pos?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)'}`,borderRadius:10,animation:`fadeSlideUp 0.5s ${index*0.15}s both`}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <span style={{fontSize:16}}>{pos?'🔄':'⚠️'}</span>
        <span style={{fontSize:13,fontWeight:600,color:pos?'#10B981':'#EF4444'}}>{cascade.name}</span>
        <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,fontWeight:600,letterSpacing:0.5,background:pos?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',color:pos?'#10B981':'#EF4444',textTransform:'uppercase'}}>{cascade.type}</span>
      </div>
      <p style={{fontSize:12,color:'rgba(255,255,255,0.6)',lineHeight:1.6,margin:0}}>{cascade.description}</p>
    </div>
  );
};

// ─── Main app ──────────────────────────────────────────────────────────
export default function Page() {
  const [view,setView] = useState('landing');
  const [mode,setMode] = useState('self');
  const [subjectName,setSubjectName] = useState('');
  const [relationship,setRelationship] = useState('');
  const [messages,setMessages] = useState([]);
  const [input,setInput] = useState('');
  const [loading,setLoading] = useState(false);
  const [estimates,setEstimates] = useState({});
  const [profile,setProfile] = useState(null);
  const [observerBias,setObserverBias] = useState(null);
  const [progress,setProgress] = useState({current:0,total:10});
  const [animate,setAnimate] = useState(false);
  const [activeTab,setActiveTab] = useState('chemicals');
  const chatEnd = useRef(null);
  const history = useRef([]);

  // Simulator state
  const [simInput,setSimInput] = useState('');
  const [simResult,setSimResult] = useState(null);
  const [simLoading,setSimLoading] = useState(false);

  // ── Auth & persistence state ──
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // login | signup
  const [authError, setAuthError] = useState('');
  const [savedProfiles, setSavedProfiles] = useState([]);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  // Check auth on mount
  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load saved profiles when user logs in
  useEffect(() => {
    if (!user) return;
    fetch(`/api/profiles?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => setSavedProfiles(d.profiles || []))
      .catch(() => {});
  }, [user]);

  // Auto-save when profile completes
  useEffect(() => {
    if (!profile || !user || saveStatus) return;
    setSaveStatus('saving');
    fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        subject_name: mode === 'observer' ? subjectName : 'Self',
        mode,
        relationship: relationship || null,
        profile_data: profile,
        messages: history.current,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setSaveStatus('saved');
          // Refresh profile list
          fetch(`/api/profiles?user_id=${user.id}`)
            .then(r => r.json())
            .then(d => setSavedProfiles(d.profiles || []));
        } else {
          setSaveStatus('error');
        }
      })
      .catch(() => setSaveStatus('error'));
  }, [profile, user]);

  // Auth handlers
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!supabase) return;
    const fn = authMode === 'signup' ? supabase.auth.signUp : supabase.auth.signInWithPassword;
    const { error } = await fn.call(supabase.auth, { email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSavedProfiles([]);
    setView('landing');
  };

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'})},[messages]);

  // ── Call backend ──
  const callProfiler = useCallback(async (userMsg) => {
    const sys = buildSystemPrompt(mode, subjectName, relationship);
    if (userMsg) history.current.push({role:'user',content:userMsg});

    if (history.current.length === 0) {
      const start = mode==='observer'
        ? `Begin the profiling interview. You are interviewing me about my ${relationship} named ${subjectName}. Start with your first question about them.`
        : 'Begin the profiling interview. Start with your first question.';
      history.current.push({role:'user',content:start});
    }

    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ system: sys, messages: history.current }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const raw = data.content || '';
      const clean = raw.replace(/```json|```/g,'').trim();
      const parsed = JSON.parse(clean);

      history.current.push({role:'assistant',content:raw});

      if (parsed.partial_estimates) {
        setAnimate(true);
        setEstimates(parsed.partial_estimates);
        setTimeout(()=>setAnimate(false),1500);
      }
      setProgress({current:parsed.question_number||0,total:parsed.total_expected||10});

      if (parsed.phase==='profiling_complete') {
        setProfile(parsed);
        if (parsed.observer_bias) setObserverBias(parsed.observer_bias);
      }
      return parsed;
    } catch(e) {
      console.error('Profiler error:',e);
      return {message:"I had a brief hiccup — could you rephrase?",phase:'interviewing',question_number:progress.current,total_expected:progress.total};
    }
  },[progress,mode,subjectName,relationship]);

  const startInterview = async () => {
    setView('interview'); setLoading(true); history.current=[];
    setProfile(null); setSaveStatus(null); setEstimates({}); setObserverBias(null);
    const r = await callProfiler(null);
    setMessages([{role:'assistant',text:r.message}]);
    setLoading(false);
  };

  const send = async () => {
    if (!input.trim()||loading) return;
    const msg=input.trim(); setInput('');
    setMessages(p=>[...p,{role:'user',text:msg}]);
    setLoading(true);
    const r = await callProfiler(msg);
    setMessages(p=>[...p,{role:'assistant',text:r.message}]);
    setLoading(false);
  };

  const onKey = e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} };

  const runSim = async () => {
    if (!simInput.trim()||!profile) return;
    setSimLoading(true);
    const who = mode==='observer'?subjectName:'this person';
    const prompt = `You are a personality interaction simulator. Given this neurochemical profile for ${who}:
${JSON.stringify(profile.partial_estimates,null,2)}
Archetype: ${profile.archetype?.name}
Cognitive params: ${JSON.stringify(profile.cognitive_params)}
${observerBias?`Observer bias: ${JSON.stringify(observerBias)}`:''}

Scenario: "${simInput}"

Respond ONLY with JSON:
{"prediction":"<2-3 sentences>","emotional_trajectory":"<arc>","risk_factors":["..."],"strengths_activated":["..."],"recommended_approach":"<1-2 sentences>"}`;
    try {
      const res = await fetch('/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
      const data = await res.json();
      setSimResult(JSON.parse((data.content||'').replace(/```json|```/g,'').trim()));
    } catch(e){console.error(e);}
    setSimLoading(false);
  };

  const isObs = mode==='observer';
  const accent = isObs?'#06B6D4':'#F59E0B';
  const completedCount = Object.values(estimates).filter(v=>v?.level!=null).length;
  const done = profile!=null;
  const profileLabel = isObs?`${subjectName}'s Profile`:'Your Profile';

  const tabs = [
    {key:'chemicals',label:'Neurochemicals'},
    {key:'archetype',label:'Archetype'},
    {key:'cascades',label:'Cascades'},
    {key:'interventions',label:'Interventions'},
    {key:'simulator',label:'Simulator'},
  ];
  if (isObs&&done) tabs.push({key:'bias',label:'Bias Report'});

  // ═══════════════ AUTH LOADING ═══════════════
  if (authLoading) return (
    <div style={{minHeight:'100vh',background:'#0A0B0E',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{display:'flex',gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#F59E0B',animation:`dotPulse 1.2s ${i*0.2}s infinite`}}/>)}</div>
    </div>
  );

  // ═══════════════ AUTH SCREEN ═══════════════
  if (!user) return (
    <div style={{minHeight:'100vh',background:'#0A0B0E',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{maxWidth:380,width:'100%',animation:'fadeSlideUp 0.5s both'}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:20}}>
            {['⚡','🌊','🔥','💗','🧠'].map((e,i)=><span key={i} style={{fontSize:20,opacity:0.5}}>{e}</span>)}
          </div>
          <h1 style={{fontFamily:"'Instrument Serif',serif",fontSize:30,color:'#F5F3EF',marginBottom:6}}>IPM Platform</h1>
          <p style={{fontSize:12,color:'rgba(255,255,255,0.35)'}}>Sign in to save your profiles across sessions</p>
        </div>
        <div style={{display:'flex',gap:2,marginBottom:24,background:'rgba(255,255,255,0.03)',borderRadius:8,padding:3}}>
          {['login','signup'].map(m=>(
            <button key={m} onClick={()=>{setAuthMode(m);setAuthError('');}}
              style={{flex:1,padding:'8px 0',border:'none',borderRadius:6,background:authMode===m?'rgba(245,158,11,0.15)':'transparent',color:authMode===m?'#F59E0B':'rgba(255,255,255,0.35)',fontSize:12,fontWeight:600,cursor:'pointer',textTransform:'uppercase',letterSpacing:0.5}}>
              {m==='login'?'Sign In':'Sign Up'}
            </button>
          ))}
        </div>
        <div>
          <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="Email" type="email"
            style={{width:'100%',padding:'11px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#E8E6E1',fontSize:13,marginBottom:10,boxSizing:'border-box'}}/>
          <input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="Password (min 6 chars)" type="password"
            onKeyDown={e=>e.key==='Enter'&&handleAuth(e)}
            style={{width:'100%',padding:'11px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#E8E6E1',fontSize:13,marginBottom:16,boxSizing:'border-box'}}/>
          {authError&&<p style={{fontSize:11,color:'#EF4444',marginBottom:12,padding:'8px 12px',background:'rgba(239,68,68,0.08)',borderRadius:6}}>{authError}</p>}
          <button onClick={handleAuth}
            style={{width:'100%',padding:'12px 0',background:'linear-gradient(135deg,#F59E0B,#D97706)',border:'none',borderRadius:8,color:'#0A0B0E',fontSize:14,fontWeight:600,cursor:'pointer',letterSpacing:0.3}}>
            {authMode==='login'?'Sign In':'Create Account'}
          </button>
        </div>
        <p style={{fontSize:10,color:'rgba(255,255,255,0.15)',textAlign:'center',marginTop:24,letterSpacing:0.5}}>NOT CLINICAL DIAGNOSIS · TENDENCY, NOT DESTINY</p>
      </div>
    </div>
  );

  // ═══════════════ MY PROFILES ═══════════════
  if (view==='profiles') return (
    <div style={{minHeight:'100vh',background:'#0A0B0E',padding:24}}>
      <div style={{maxWidth:600,margin:'0 auto',animation:'fadeSlideUp 0.5s both'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:32}}>
          <h2 style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:'#F5F3EF'}}>Saved Profiles</h2>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setView('landing')} style={{padding:'8px 16px',background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:6,color:'#F59E0B',fontSize:12,fontWeight:600,cursor:'pointer'}}>+ New Profile</button>
            <button onClick={handleLogout} style={{padding:'8px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:6,color:'rgba(255,255,255,0.35)',fontSize:11,cursor:'pointer'}}>Sign Out</button>
          </div>
        </div>
        {savedProfiles.length===0 ? (
          <div style={{textAlign:'center',padding:'60px 20px',color:'rgba(255,255,255,0.25)'}}>
            <p style={{fontSize:40,marginBottom:16}}>🔮</p>
            <p style={{fontSize:14,marginBottom:8}}>No profiles yet</p>
            <p style={{fontSize:12}}>Start a profiling session to build your first one.</p>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {savedProfiles.map(p=>(
              <div key={p.id} style={{padding:'16px 18px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,display:'flex',alignItems:'center',gap:14}}>
                <span style={{fontSize:24}}>{p.mode==='observer'?'👁️':'🪞'}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:'#F5F3EF',marginBottom:2}}>{p.subject_name}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>
                    {p.archetype?.name||'Profile'} · {p.mode==='observer'?`observed by ${p.relationship}`:'self-report'} · {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{fontSize:10,padding:'3px 8px',borderRadius:4,background:p.mode==='observer'?'rgba(6,182,212,0.1)':'rgba(245,158,11,0.1)',color:p.mode==='observer'?'#06B6D4':'#F59E0B',fontWeight:600,textTransform:'uppercase'}}>{p.mode}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════ LANDING ═══════════════
  if (view==='landing') return (
    <div style={{minHeight:'100vh',background:'#0A0B0E',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{textAlign:'center',maxWidth:560,animation:'fadeSlideUp 0.8s both'}}>
        {/* Top bar with user info */}
        <div style={{position:'fixed',top:0,right:0,padding:'12px 20px',display:'flex',gap:10,zIndex:10}}>
          {savedProfiles.length>0&&<button onClick={()=>setView('profiles')} style={{padding:'6px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'rgba(255,255,255,0.4)',fontSize:11,cursor:'pointer'}}>📋 My Profiles ({savedProfiles.length})</button>}
          <button onClick={handleLogout} style={{padding:'6px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:6,color:'rgba(255,255,255,0.25)',fontSize:11,cursor:'pointer'}}>Sign Out</button>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:32}}>
          {['⚡','🌊','🔥','💗','🧠'].map((e,i)=><span key={i} style={{fontSize:24,animation:`pulse 2s ${i*0.3}s infinite`,opacity:0.6}}>{e}</span>)}
        </div>
        <h1 style={{fontFamily:"'Instrument Serif',serif",fontSize:42,fontWeight:400,lineHeight:1.15,marginBottom:16,color:'#F5F3EF'}}>
          Integrated Personality<br/>Modeling Platform
        </h1>
        <p style={{fontSize:14,color:'rgba(255,255,255,0.45)',lineHeight:1.7,maxWidth:440,margin:'0 auto 40px'}}>
          A dialog-native system that estimates neurochemical profiles through conversation, maps them to computational cognitive parameters, and generates personality archetypes with behavioural cascades.
        </p>
        <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginBottom:48}}>
          {['No wearables needed','Bayesian estimation','10 neurochemicals','Observer mode'].map((t,i)=>(
            <span key={i} style={{fontSize:10,padding:'5px 12px',borderRadius:20,border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)',letterSpacing:0.8,textTransform:'uppercase',animation:`fadeSlideUp 0.5s ${0.3+i*0.1}s both`}}>{t}</span>
          ))}
        </div>
        <button onClick={()=>setView('mode_select')} style={{padding:'14px 40px',background:'linear-gradient(135deg,#F59E0B,#D97706)',border:'none',borderRadius:8,color:'#0A0B0E',fontSize:14,fontWeight:600,cursor:'pointer',letterSpacing:0.5,animation:'fadeSlideUp 0.5s 0.8s both, breathe 3s 1.5s infinite',boxShadow:'0 0 40px rgba(245,158,11,0.2)'}}>
          Begin Profiling Session
        </button>
        <p style={{fontSize:10,color:'rgba(255,255,255,0.2)',marginTop:24,letterSpacing:0.5}}>NOT CLINICAL DIAGNOSIS · TENDENCY, NOT DESTINY</p>
      </div>
    </div>
  );

  // ═══════════════ MODE SELECT ═══════════════
  if (view==='mode_select') return (
    <div style={{minHeight:'100vh',background:'#0A0B0E',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{animation:'fadeSlideUp 0.5s both',textAlign:'center',maxWidth:520}}>
        <h2 style={{fontFamily:"'Instrument Serif',serif",fontSize:30,color:'#F5F3EF',marginBottom:8}}>Who are we profiling?</h2>
        <p style={{fontSize:13,color:'rgba(255,255,255,0.4)',marginBottom:40}}>Choose whether to profile yourself or someone you know well.</p>
        <div style={{display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap'}}>
          {[
            {m:'self',icon:'🪞',title:'Profile Myself',desc:'Direct self-report with highest signal quality',col:'#F59E0B'},
            {m:'observer',icon:'👁️',title:'Profile Someone Else',desc:'Observer mode with bias-adjusted scoring',col:'#06B6D4'},
          ].map(o=>(
            <button key={o.m} onClick={()=>{setMode(o.m);o.m==='self'?startInterview():setView('observer_setup');}}
              style={{width:220,padding:'28px 20px',background:`${o.col}0D`,border:`1px solid ${o.col}26`,borderRadius:14,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:12,transition:'all 0.3s'}}>
              <span style={{fontSize:36}}>{o.icon}</span>
              <span style={{fontSize:15,fontWeight:600,color:o.col}}>{o.title}</span>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.4)',lineHeight:1.5}}>{o.desc}</span>
            </button>
          ))}
        </div>
        <button onClick={()=>setView('landing')} style={{marginTop:32,background:'none',border:'none',color:'rgba(255,255,255,0.25)',fontSize:12,cursor:'pointer'}}>← Back</button>
      </div>
    </div>
  );

  // ═══════════════ OBSERVER SETUP ═══════════════
  if (view==='observer_setup') {
    const ok = subjectName.trim()&&relationship;
    return (
      <div style={{minHeight:'100vh',background:'#0A0B0E',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{animation:'fadeSlideUp 0.5s both',maxWidth:440,width:'100%'}}>
          <div style={{textAlign:'center',marginBottom:36}}>
            <span style={{fontSize:32,display:'block',marginBottom:12}}>👁️</span>
            <h2 style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:'#F5F3EF',marginBottom:8}}>Observer Mode</h2>
            <p style={{fontSize:12,color:'rgba(255,255,255,0.4)',lineHeight:1.6}}>We'll ask you questions about someone you know well. Your relationship type helps calibrate for observer bias.</p>
          </div>
          <div style={{marginBottom:24}}>
            <label style={{fontSize:11,color:'rgba(255,255,255,0.4)',letterSpacing:1,textTransform:'uppercase',display:'block',marginBottom:8}}>Their first name</label>
            <input value={subjectName} onChange={e=>setSubjectName(e.target.value)} placeholder="e.g. Alex"
              style={{width:'100%',padding:'12px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(6,182,212,0.15)',borderRadius:8,color:'#E8E6E1',fontSize:14,boxSizing:'border-box'}}/>
          </div>
          <div style={{marginBottom:32}}>
            <label style={{fontSize:11,color:'rgba(255,255,255,0.4)',letterSpacing:1,textTransform:'uppercase',display:'block',marginBottom:10}}>Your relationship</label>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {RELATIONSHIPS.map(r=>(
                <button key={r.value} onClick={()=>setRelationship(r.value)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:relationship===r.value?'rgba(6,182,212,0.1)':'rgba(255,255,255,0.02)',border:`1px solid ${relationship===r.value?'rgba(6,182,212,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:8,cursor:'pointer',transition:'all 0.2s',width:'100%'}}>
                  <span style={{fontSize:16}}>{r.icon}</span>
                  <span style={{fontSize:13,color:relationship===r.value?'#06B6D4':'rgba(255,255,255,0.5)',fontWeight:relationship===r.value?600:400}}>{r.label}</span>
                  {relationship===r.value&&<span style={{marginLeft:'auto',fontSize:14,color:'#06B6D4'}}>✓</span>}
                </button>
              ))}
            </div>
          </div>
          {relationship&&(
            <div style={{padding:14,background:'rgba(6,182,212,0.04)',border:'1px solid rgba(6,182,212,0.1)',borderRadius:8,marginBottom:24,animation:'fadeSlideUp 0.3s both'}}>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.5)',lineHeight:1.6,margin:0}}><span style={{color:'#06B6D4',fontWeight:600}}>Bias note: </span>{BIAS_NOTES[relationship]}</p>
            </div>
          )}
          <button onClick={startInterview} disabled={!ok} style={{width:'100%',padding:'13px 0',background:ok?'linear-gradient(135deg,#06B6D4,#0891B2)':'rgba(255,255,255,0.04)',border:'none',borderRadius:8,color:ok?'#0A0B0E':'rgba(255,255,255,0.15)',fontSize:14,fontWeight:600,cursor:ok?'pointer':'default',letterSpacing:0.3}}>
            Start Observer Interview
          </button>
          <button onClick={()=>setView('mode_select')} style={{display:'block',margin:'16px auto 0',background:'none',border:'none',color:'rgba(255,255,255,0.25)',fontSize:12,cursor:'pointer'}}>← Back</button>
        </div>
      </div>
    );
  }

  // ═══════════════ INTERVIEW + DASHBOARD ═══════════════
  return (
    <div style={{minHeight:'100vh',background:'#0A0B0E'}}>
      {/* Header */}
      <div style={{position:'sticky',top:0,zIndex:10,padding:'12px 20px',background:'rgba(10,11,14,0.85)',backdropFilter:'blur(20px)',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:18}}>{isObs?'👁️':'⚡'}</span>
          <span style={{fontFamily:"'Instrument Serif',serif",fontSize:16,color:'#F5F3EF'}}>IPM Platform</span>
          {isObs&&<span style={{fontSize:10,padding:'3px 8px',borderRadius:4,fontWeight:600,background:'rgba(6,182,212,0.12)',color:'#06B6D4',letterSpacing:0.3}}>OBSERVER · {subjectName}</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>{completedCount}/10 estimated</div>
          {saveStatus&&<span style={{fontSize:10,padding:'3px 8px',borderRadius:4,fontWeight:600,background:saveStatus==='saved'?'rgba(16,185,129,0.12)':saveStatus==='saving'?'rgba(245,158,11,0.12)':'rgba(239,68,68,0.12)',color:saveStatus==='saved'?'#10B981':saveStatus==='saving'?'#F59E0B':'#EF4444'}}>{saveStatus==='saved'?'✓ Saved':saveStatus==='saving'?'Saving...':'Save failed'}</span>}
          {savedProfiles.length>0&&<button onClick={()=>{setView('profiles');setProfile(null);setSaveStatus(null);setEstimates({});setMessages([]);}} style={{padding:'4px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:4,color:'rgba(255,255,255,0.3)',fontSize:10,cursor:'pointer'}}>📋 {savedProfiles.length}</button>}
          <div style={{width:80,height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${(progress.current/progress.total)*100}%`,background:done?'#10B981':accent,transition:'width 0.8s cubic-bezier(.4,0,.2,1)',borderRadius:2}}/>
          </div>
        </div>
      </div>

      <div style={{display:'flex',height:'calc(100vh - 49px)'}}>
        {/* ── Chat ── */}
        <div style={{flex:'1 1 55%',display:'flex',flexDirection:'column',borderRight:'1px solid rgba(255,255,255,0.05)'}}>
          <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:12,animation:`fadeSlideUp 0.3s ${i*0.05}s both`}}>
                <div style={{maxWidth:'80%',padding:'12px 16px',borderRadius:12,fontSize:13,lineHeight:1.65,background:m.role==='user'?`${accent}18`:'rgba(255,255,255,0.04)',border:m.role==='user'?`1px solid ${accent}33`:'1px solid rgba(255,255,255,0.06)',color:m.role==='user'?'#F5F3EF':'rgba(255,255,255,0.75)'}}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading&&<div style={{display:'flex',gap:4,padding:'12px 16px'}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:accent,animation:`dotPulse 1.2s ${i*0.2}s infinite`}}/>)}</div>}
            <div ref={chatEnd}/>
          </div>
          {!done&&(
            <div style={{padding:'12px 20px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
              <div style={{display:'flex',gap:10}}>
                <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKey} rows={1}
                  placeholder={isObs?`Describe what you've observed about ${subjectName}...`:'Share your thoughts...'}
                  style={{flex:1,padding:'10px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#E8E6E1',fontSize:13,resize:'none'}}/>
                <button onClick={send} disabled={loading||!input.trim()}
                  style={{padding:'10px 20px',background:loading||!input.trim()?'rgba(255,255,255,0.04)':accent,border:'none',borderRadius:8,color:loading||!input.trim()?'rgba(255,255,255,0.2)':'#0A0B0E',fontSize:13,fontWeight:600,cursor:loading||!input.trim()?'default':'pointer'}}>Send</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Dashboard ── */}
        <div style={{flex:'1 1 45%',overflowY:'auto',padding:20}}>
          {isObs&&<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,padding:'8px 12px',background:'rgba(6,182,212,0.04)',border:'1px solid rgba(6,182,212,0.1)',borderRadius:8}}>
            <span style={{fontSize:14}}>{RELATIONSHIPS.find(r=>r.value===relationship)?.icon}</span>
            <span style={{fontSize:12,color:'#06B6D4',fontWeight:500}}>{profileLabel}</span>
            <span style={{fontSize:10,color:'rgba(255,255,255,0.25)',marginLeft:'auto'}}>via {RELATIONSHIPS.find(r=>r.value===relationship)?.label.toLowerCase()}</span>
          </div>}

          {done&&<div style={{display:'flex',gap:2,marginBottom:20,background:'rgba(255,255,255,0.03)',borderRadius:8,padding:3,flexWrap:'wrap'}}>
            {tabs.map(t=><button key={t.key} onClick={()=>setActiveTab(t.key)} style={{flex:1,padding:'8px 4px',border:'none',borderRadius:6,minWidth:55,background:activeTab===t.key?`${accent}22`:'transparent',color:activeTab===t.key?accent:'rgba(255,255,255,0.35)',fontSize:10,fontWeight:600,cursor:'pointer',letterSpacing:0.3,textTransform:'uppercase'}}>{t.label}</button>)}
          </div>}

          {/* Chemicals */}
          {(activeTab==='chemicals'||!done)&&<div>
            <h3 style={{fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.3)',letterSpacing:1.5,textTransform:'uppercase',marginBottom:12}}>Primary Neuromodulators</h3>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {Object.entries(CHEMICALS).filter(([,v])=>v.group==='primary').map(([k])=><ChemCard key={k} chemKey={k} data={estimates[k]} animate={animate}/>)}
            </div>
            <h3 style={{fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.3)',letterSpacing:1.5,textTransform:'uppercase',margin:'16px 0 12px'}}>Cognitive Chemicals</h3>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {Object.entries(CHEMICALS).filter(([,v])=>v.group==='cognitive').map(([k])=><ChemCard key={k} chemKey={k} data={estimates[k]} animate={animate}/>)}
            </div>
            {done&&profile.cognitive_params&&<div style={{marginTop:20,padding:16,background:'rgba(255,255,255,0.02)',borderRadius:10,border:'1px solid rgba(255,255,255,0.05)'}}>
              <h3 style={{fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.3)',letterSpacing:1.5,textTransform:'uppercase',marginBottom:12}}>Computational Parameters (Layer 2)</h3>
              {Object.entries(profile.cognitive_params).map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                <span style={{fontSize:12,color:'rgba(255,255,255,0.5)',fontFamily:"'JetBrains Mono',monospace"}}>{k.replace(/_/g,' ')}</span>
                <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,fontWeight:600,background:v==='high'?'rgba(239,68,68,0.12)':v==='moderate'?'rgba(245,158,11,0.12)':'rgba(16,185,129,0.12)',color:v==='high'?'#EF4444':v==='moderate'?'#F59E0B':'#10B981'}}>{v}</span>
              </div>)}
            </div>}
          </div>}

          {/* Archetype */}
          {done&&activeTab==='archetype'&&profile.archetype&&<div style={{animation:'fadeSlideUp 0.5s both'}}>
            <div style={{padding:24,background:`linear-gradient(135deg,${accent}12,${accent}06)`,border:`1px solid ${accent}22`,borderRadius:14,textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:12}}>🔮</div>
              <h2 style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:'#F5F3EF',marginBottom:8}}>{profile.archetype.name}</h2>
              <p style={{fontSize:13,color:'rgba(255,255,255,0.55)',lineHeight:1.7,maxWidth:360,margin:'0 auto'}}>{profile.archetype.description}</p>
            </div>
            <p style={{fontSize:10,color:'rgba(255,255,255,0.2)',textAlign:'center',marginTop:16,letterSpacing:0.5}}>{isObs?`${subjectName}'s archetype · observer-derived`:'Archetype from Layer 1 neurochemical configuration'}</p>
          </div>}

          {/* Cascades */}
          {done&&activeTab==='cascades'&&profile.cascades&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
            <p style={{fontSize:11,color:'rgba(255,255,255,0.3)',letterSpacing:0.5,marginBottom:4}}>Feedback loops between {isObs?`${subjectName}'s`:'your'} chemistry and life patterns</p>
            {profile.cascades.map((c,i)=><CascadeCard key={i} cascade={c} index={i}/>)}
          </div>}

          {/* Interventions */}
          {done&&activeTab==='interventions'&&profile.interventions&&<div style={{animation:'fadeSlideUp 0.5s both'}}>
            <h3 style={{fontSize:12,fontWeight:600,color:'#10B981',marginBottom:12}}>✅ Recommended {isObs?`for ${subjectName}`:'Actions'}</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
              {profile.interventions.do.map((item,i)=><div key={i} style={{padding:'10px 14px',background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.1)',borderRadius:8,fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.5}}>{item}</div>)}
            </div>
            <h3 style={{fontSize:12,fontWeight:600,color:'#EF4444',marginBottom:12}}>🚫 What {isObs?`${subjectName} Should`:'to'} Avoid</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {profile.interventions.avoid.map((item,i)=><div key={i} style={{padding:'10px 14px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.1)',borderRadius:8,fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.5}}>{item}</div>)}
            </div>
          </div>}

          {/* Simulator */}
          {done&&activeTab==='simulator'&&<div style={{animation:'fadeSlideUp 0.5s both'}}>
            <p style={{fontSize:12,color:'rgba(255,255,255,0.45)',marginBottom:16,lineHeight:1.6}}>
              Describe a scenario to predict how {isObs?subjectName:'you'} would respond.
            </p>
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              <input value={simInput} onChange={e=>setSimInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runSim()} placeholder="Describe a scenario..."
                style={{flex:1,padding:'10px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#E8E6E1',fontSize:13}}/>
              <button onClick={runSim} disabled={simLoading||!simInput.trim()}
                style={{padding:'10px 18px',background:simLoading||!simInput.trim()?'rgba(255,255,255,0.04)':'#8B5CF6',border:'none',borderRadius:8,color:simLoading||!simInput.trim()?'rgba(255,255,255,0.2)':'#FFF',fontSize:13,fontWeight:600,cursor:simLoading||!simInput.trim()?'default':'pointer'}}>
                {simLoading?'...':'Simulate'}
              </button>
            </div>
            {simResult&&<div style={{display:'flex',flexDirection:'column',gap:12,animation:'fadeSlideUp 0.4s both'}}>
              <div style={{padding:16,background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.12)',borderRadius:10}}>
                <h4 style={{fontSize:11,color:'#8B5CF6',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:8}}>Predicted Behaviour</h4>
                <p style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.6,margin:0}}>{simResult.prediction}</p>
              </div>
              <div style={{padding:16,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10}}>
                <h4 style={{fontSize:11,color:'#F59E0B',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:8}}>Emotional Arc</h4>
                <p style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.6,margin:0}}>{simResult.emotional_trajectory}</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{padding:14,background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.1)',borderRadius:10}}>
                  <h4 style={{fontSize:10,color:'#EF4444',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:8}}>Risk Factors</h4>
                  {simResult.risk_factors?.map((r,i)=><p key={i} style={{fontSize:11,color:'rgba(255,255,255,0.5)',margin:'0 0 4px'}}>• {r}</p>)}
                </div>
                <div style={{padding:14,background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.1)',borderRadius:10}}>
                  <h4 style={{fontSize:10,color:'#10B981',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:8}}>Strengths</h4>
                  {simResult.strengths_activated?.map((s,i)=><p key={i} style={{fontSize:11,color:'rgba(255,255,255,0.5)',margin:'0 0 4px'}}>• {s}</p>)}
                </div>
              </div>
              <div style={{padding:14,background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.1)',borderRadius:10}}>
                <h4 style={{fontSize:10,color:'#F59E0B',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:6}}>Recommended Approach</h4>
                <p style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.5,margin:0}}>{simResult.recommended_approach}</p>
              </div>
            </div>}
          </div>}

          {/* Bias Report */}
          {done&&activeTab==='bias'&&isObs&&<div style={{animation:'fadeSlideUp 0.5s both'}}>
            <div style={{padding:20,background:'rgba(6,182,212,0.04)',border:'1px solid rgba(6,182,212,0.12)',borderRadius:12,marginBottom:16}}>
              <h3 style={{fontSize:13,fontWeight:600,color:'#06B6D4',marginBottom:12}}>📊 Observer Bias Analysis</h3>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.55)',lineHeight:1.7,margin:'0 0 16px'}}>{observerBias?.bias_type||'Bias analysis pending.'}</p>
              {observerBias?.overweighted_signals&&<div style={{marginBottom:14}}>
                <h4 style={{fontSize:10,color:'#F59E0B',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:6}}>Likely Overweighted</h4>
                {observerBias.overweighted_signals.map((s,i)=><span key={i} style={{display:'inline-block',fontSize:11,padding:'4px 10px',borderRadius:4,background:'rgba(245,158,11,0.1)',color:'#F59E0B',marginRight:6,marginBottom:4}}>{s}</span>)}
              </div>}
              {observerBias?.underweighted_signals&&<div style={{marginBottom:14}}>
                <h4 style={{fontSize:10,color:'#EF4444',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:6}}>Likely Underweighted</h4>
                {observerBias.underweighted_signals.map((s,i)=><span key={i} style={{display:'inline-block',fontSize:11,padding:'4px 10px',borderRadius:4,background:'rgba(239,68,68,0.1)',color:'#EF4444',marginRight:6,marginBottom:4}}>{s}</span>)}
              </div>}
              {observerBias?.confidence_adjustment&&<div style={{padding:12,background:'rgba(255,255,255,0.02)',borderRadius:8,border:'1px solid rgba(255,255,255,0.04)'}}>
                <h4 style={{fontSize:10,color:'rgba(255,255,255,0.4)',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase',marginBottom:6}}>Confidence Adjustments</h4>
                <p style={{fontSize:12,color:'rgba(255,255,255,0.5)',lineHeight:1.6,margin:0}}>{observerBias.confidence_adjustment}</p>
              </div>}
            </div>
            <div style={{padding:14,background:'rgba(255,255,255,0.02)',borderRadius:8,border:'1px solid rgba(255,255,255,0.05)'}}>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.35)',lineHeight:1.6,margin:0}}>💡 To sharpen this profile, have {subjectName} complete their own self-report session for data fusion.</p>
            </div>
          </div>}

          {!done&&activeTab!=='chemicals'&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'rgba(255,255,255,0.2)',fontSize:13}}>Complete the interview to unlock this tab</div>}
        </div>
      </div>
    </div>
  );
}
