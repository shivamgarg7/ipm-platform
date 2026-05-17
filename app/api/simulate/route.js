// app/api/simulate/route.js
export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt } = await req.json();

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'DEEPSEEK_API_KEY not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: 'LLM request failed', details: errText }, { status: res.status });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return Response.json({ content });

  } catch (err) {
    console.error('Simulate error:', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
