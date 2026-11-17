export async function onRequest({ request, env }) {
  const reply = (data, status) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...(status === 405 ? { Allow: 'POST' } : {}) } });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply({ error: 'Invalid origin' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({ error: 'JSON required' }, 415);
  let data;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Invalid request' }, 400);
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 40000) {
        await reader.cancel();
        return reply({ error: 'Message is too long' }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    data = JSON.parse(text);
  } catch {
    return reply({ error: 'Invalid request' }, 400);
  }
  const { id, name, email, message } = data || {};
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      typeof name !== 'string' || !name.trim() || name.length > 100 ||
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof message !== 'string' || !message.trim() || message.length > 5000) {
    return reply({ error: 'Please provide a valid name, email and message.' }, 400);
  }
  try {
    const saved = await env.DB.prepare('INSERT INTO enquiries (id, name, email, message) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(id, name.trim(), email.trim(), message.trim()).run();
    if (saved.meta.changes === 0) {
      const existing = await env.DB.prepare('SELECT name, email, message FROM enquiries WHERE id = ?').bind(id).first();
      if (!existing || existing.name !== name.trim() || existing.email !== email.trim() || existing.message !== message.trim()) {
        return reply({ error: 'Submission ID already used. Please submit again.' }, 409);
      }
    }
    return reply({ success: true }, 200);
  } catch (error) {
    console.error('Enquiry storage failed', error.message);
    return reply({ error: 'Unable to save your message. Please try again.' }, 503);
  }
}
