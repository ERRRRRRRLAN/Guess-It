const {
    normalizeUsername,
    validateUsername,
    validatePassword,
    readJsonBody,
    findUserByUsername,
    createUser,
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
        if (!validatePassword(password)) return res.status(400).json({ error: 'Password minimal 6 karakter' });

        const existing = await findUserByUsername(username);
        if (existing) return res.status(409).json({ error: 'Username already registered' });

        const user = await createUser(username, password);
        const { token } = await createSession(user.id);
        setSessionCookie(res, token);

        return res.status(200).json({ ok: true, username: user.username });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Register failed' });
    }
};
