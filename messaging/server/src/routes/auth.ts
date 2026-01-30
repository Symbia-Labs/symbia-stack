import { Router } from 'express';
import { buildIdentityUrl, getCurrentUser } from '../auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const response = await fetch(buildIdentityUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('set-cookie', setCookie);
    }

    const text = await response.text();
    res.status(response.status);
    if (response.headers.get('content-type')?.includes('application/json')) {
      res.type('application/json').send(text);
      return;
    }
    res.send(text);
  } catch (error) {
    console.error('Login proxy failed:', error);
    res.status(502).json({ error: 'Identity service unavailable' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const response = await fetch(buildIdentityUrl('/auth/logout'), {
      method: 'POST',
      headers: {
        'Cookie': req.headers.cookie || '',
      },
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('set-cookie', setCookie);
    }

    const text = await response.text();
    res.status(response.status);
    if (text) {
      res.send(text);
      return;
    }
    res.json({ ok: response.ok });
  } catch (error) {
    console.error('Logout proxy failed:', error);
    res.status(502).json({ error: 'Identity service unavailable' });
  }
});

router.get('/session', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        type: user.type,
        orgId: user.orgId,
        organizations: user.organizations,
        entitlements: user.entitlements,
        roles: user.roles,
        isSuperAdmin: user.isSuperAdmin,
      },
    });
  } catch (error) {
    console.error('Session lookup failed:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

export default router;
