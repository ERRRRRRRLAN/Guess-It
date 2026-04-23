const { getSessionUserFromRequest } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const sessionUser = await getSessionUserFromRequest(req);
        if (!sessionUser?.username) return res.status(401).json({ authenticated: false });
        return res.status(200).json({ authenticated: true, username: sessionUser.username });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Session check failed' });
    }
};
