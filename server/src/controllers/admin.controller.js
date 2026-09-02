import User from '../models/User.js';
import PhotoStory from '../models/PhotoStory.js';

export async function getAdminAnalytics(req, res) {
  try {
    const [totalUsers, totalStories, storiesAgg] = await Promise.all([
      User.countDocuments(),
      PhotoStory.countDocuments(),
      PhotoStory.aggregate([
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$viewsCount' },
            totalDownloads: { $sum: '$downloadsCount' },
            totalLikes: { $sum: '$likesCount' }
          }
        }
      ])
    ]);

    const proUsers = await User.countDocuments({ plan: { $in: ['pro', 'studio'] } });
    const stats = storiesAgg[0] || { totalViews: 0, totalDownloads: 0, totalLikes: 0 };

    res.json({
      success: true,
      data: {
        totalUsers,
        proUsers,
        totalStories,
        totalViews: stats.totalViews,
        totalDownloads: stats.totalDownloads,
        totalLikes: stats.totalLikes,
        estimatedRevenue: proUsers * 19
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getAllUsers(req, res) {
  try {
    const { search, plan } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (plan && plan !== 'all') query.plan = plan;

    const users = await User.find(query).select('-password').sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateUserPlan(req, res) {
  try {
    const { plan, role } = req.body;
    const update = {};
    if (plan) update.plan = plan;
    if (role) update.role = role;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getAllStories(req, res) {
  try {
    const { search, limit = 50 } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { clientName: { $regex: search, $options: 'i' } },
        { occasion: { $regex: search, $options: 'i' } }
      ];
    }

    const stories = await PhotoStory.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function adminDeleteStory(req, res) {
  try {
    await PhotoStory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Story permanently removed by SuperAdmin.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
