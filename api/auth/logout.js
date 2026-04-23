const {
    parseCookies,
    clearSessionCookie,
    deleteSessionByToken
} = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const cookies = parseCookies(req);
        const token = cookies.guess_it_session;
        if (token) {
            try { await deleteSessionByToken(token); } catch (_) {}
        }
        clearSessionCookie(res);
        return res.status(200).json({ ok: true });
    } catch (error) {
        clearSessionCookie(res);
        return res.status(200).json({ ok: true });
    }
};
