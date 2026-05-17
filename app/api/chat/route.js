// app/api/chat/route.js
// Proxies profiling requests to DeepSeek API (OpenAI-compatible)
// Keeps DEEPSEEK_API_KEY safe on the server

export const runtime = 'edge'; // Vercel Edge — fast + free-tier friendly

export async function POST(req) {
  try {
    const { messages, system } = await req.json();

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'DEEPSEEK_API_KEY not configured' }, { status: 500 });
    }

    // DeepSeek uses OpenAI format: system message goes into messages array
    const fullMessages = [
      { role: 'system', content: system },
      ...messages,
    ];

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',       // DeepSeek-V3 — cheapest option
        messages: fullMessages,
        max_tokens: 1200,
        temperature: 0.7,
        response_format: { type: 'json_object' }, // Force JSON output
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('DeepSeek error:', res.status, errText);
      return Response.json({ error: 'LLM request failed', details: errText }, { status: res.status });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Return in a normalized format the frontend expects
    return Response.json({ content });

  } catch (err) {
    console.error('API route error:', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
