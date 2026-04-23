const {
    normalizeUsername,
    validateUsername,
    validatePassword,
    readJsonBody,
    verifyPassword,
    findUserByUsername,
    createSession,
    setSessionCookie
} = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const body = await readJsonBody(req);
        const username = normalizeUsername(body?.username);
        const password = String(body?.password || '');

        if (!validateUsername(username)) return res.status(400).json({ error: 'Username tidak valid' });
        if (!validatePassword(password)) return res.status(400).json({ error: 'Password tidak valid' });

        const user = await findUserByUsername(username);
        if (!user) return res.status(401).json({ error: 'Invalid login credentials' });

        const ok = verifyPassword(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: 'Invalid login credentials' });

        const { token } = await createSession(user.id);
        setSessionCookie(res, token);
        return res.status(200).json({ ok: true, username: user.username });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Login failed' });
    }
};
