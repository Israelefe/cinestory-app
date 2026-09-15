import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';

export async function adminLogin(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both your username and password.' });
    }

    const normalized = String(username).trim().toLowerCase();
    let admin = await AdminUser.findOne({ username: normalized }).select('+password');

    const envUsername = String(process.env.ADMIN_USERNAME || process.env.ADMIN_INITIAL_USERNAME || '').trim().toLowerCase();
    const envPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;

    // If credentials match the server environment variables, ensure account exists and password is in sync
    if (envUsername && envPassword && normalized === envUsername && password === envPassword) {
      if (!admin) {
        admin = new AdminUser({
          username: normalized,
          name: process.env.ADMIN_NAME || 'Veylo Administrator',
          password: envPassword,
          role: 'superadmin',
          accountStatus: 'active'
        });
        await admin.save();
        console.info(`[admin] Created admin "${normalized}" from environment credentials on login.`);
      } else {
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
          admin.password = envPassword;
          admin.accountStatus = 'active';
          await admin.save();
          console.info(`[admin] Updated admin password for "${normalized}" to match environment credentials.`);
        }
      }
    }

    if (!admin || admin.accountStatus !== 'active') {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured.');
    }

    const token = jwt.sign(
      { id: String(admin._id), username: admin.username, role: admin.role, type: 'admin' },
      secret,
      { expiresIn: '14d', issuer: 'veylo-api', audience: 'veylo-admin' }
    );

    res.cookie('veylo_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    return res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
        lastLoginAt: admin.lastLoginAt
      }
    });
  } catch (error) {
    console.error('[admin/login]', error.message);
    return res.status(500).json({ success: false, message: 'Unable to sign in. Please try again.' });
  }
}

export async function getAdminMe(req, res) {
  try {
    return res.json({
      success: true,
      admin: {
        id: req.admin._id,
        username: req.admin.username,
        name: req.admin.name,
        role: req.admin.role,
        lastLoginAt: req.admin.lastLoginAt
      }
    });
  } catch (error) {
    console.error('[admin/me]', error.message);
    return res.status(500).json({ success: false, message: 'Could not load admin profile.' });
  }
}

export async function adminLogout(req, res) {
  try {
    res.clearCookie('veylo_admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    });
    return res.json({ success: true, message: 'Signed out successfully.' });
  } catch (error) {
    console.error('[admin/logout]', error.message);
    return res.status(500).json({ success: false, message: 'Error signing out.' });
  }
}
