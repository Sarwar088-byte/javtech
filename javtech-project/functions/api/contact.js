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
  const { id, name, email, message, website } = data || {};
  if (website) return reply({ error: 'Unable to accept this submission.' }, 400);
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      typeof name !== 'string' || !name.trim() || name.length > 100 ||
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof message !== 'string' || !message.trim() || message.length > 5000) {
    return reply({ error: 'Please provide a valid name, email and message.' }, 400);
  }
  try {
    const existing = await env.DB.prepare('SELECT name, email, message FROM enquiries WHERE id = ?').bind(id).first();
    if (existing) {
      if (existing.name !== name.trim() || existing.email !== email.trim() || existing.message !== message.trim()) {
        return reply({ error: 'Submission ID already used. Please submit again.' }, 409);
      }
      return reply({ success: true }, 200);
    }
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return reply({ error: 'Unable to verify submission source.' }, 403);
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / 600);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + ':' + window));
    const clientKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const results = await env.DB.batch([
      env.DB.prepare('DELETE FROM contact_rate_limits WHERE expires_at <= ?').bind(now),
      env.DB.prepare('INSERT INTO contact_rate_limits (client_key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(client_key) DO UPDATE SET attempts = attempts + 1 WHERE attempts < 5 RETURNING attempts')
        .bind(clientKey, (window + 1) * 600)
    ]);
    if (!results[1].results.length) {
      const response = reply({ error: 'Too many messages. Please try again in ten minutes.' }, 429);
      response.headers.set('Retry-After', String((window + 1) * 600 - now));
      return response;
    }
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
