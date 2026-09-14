import User from '../models/User.js';
import PhotoStory from '../models/PhotoStory.js';
import Delivery from '../models/Delivery.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import AdminAudit from '../models/AdminAudit.js';
import { paystackRequest } from '../services/paystack.service.js';
import { PRO_PRICE_KOBO } from '../config/plans.js';

function escaped(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export async function getAdminAnalytics(req, res) {
  try {
    const [totalUsers, legacyStories, totalDeliveries, legacyAgg, deliveryAgg, activeSubscriptions, paymentAgg] = await Promise.all([
      User.countDocuments(),
      PhotoStory.countDocuments(),
      Delivery.countDocuments(),
      PhotoStory.aggregate([
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$viewsCount' },
            totalDownloads: { $sum: '$downloadsCount' },
            totalLikes: { $sum: '$likesCount' }
          }
        }
      ]),
      Delivery.aggregate([{ $group: { _id: null, totalViews: { $sum: '$viewsCount' }, totalDownloads: { $sum: '$downloadsCount' }, totalLikes: { $sum: '$likesCount' } } }]),
      Subscription.countDocuments({ status: { $in: ['active', 'canceling'] }, paidThrough: { $gt: new Date() } }),
      Payment.aggregate([
        { $match: { status: { $in: ['success', 'partially_refunded', 'refunded'] } } },
        { $group: { _id: null, collectedKobo: { $sum: '$amountKobo' }, refundedKobo: { $sum: '$refundedAmountKobo' } } }
      ])
    ]);

    const proUsers = await User.countDocuments({ plan: 'pro' });
    const first = legacyAgg[0] || { totalViews: 0, totalDownloads: 0, totalLikes: 0 };
    const second = deliveryAgg[0] || { totalViews: 0, totalDownloads: 0, totalLikes: 0 };
    const money = paymentAgg[0] || { collectedKobo: 0, refundedKobo: 0 };

    res.json({
      success: true,
      data: {
        totalUsers,
        proUsers,
        totalDeliveries: legacyStories + totalDeliveries,
        publishedDeliveries: await Delivery.countDocuments({ status: 'published' }),
        totalViews: first.totalViews + second.totalViews,
        totalDownloads: first.totalDownloads + second.totalDownloads,
        totalLikes: first.totalLikes + second.totalLikes,
        activeSubscriptions,
        monthlyRecurringRevenueKobo: activeSubscriptions * PRO_PRICE_KOBO,
        netCollectedKobo: Math.max(0, money.collectedKobo - money.refundedKobo)
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
        { name: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { email: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } }
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
    const { plan, role, reason, expiresAt } = req.body;
    const update = {};
    if (plan && !['free', 'pro'].includes(plan)) return res.status(400).json({ success: false, message: 'Choose Free or Pro.' });
    if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ success: false, message: 'Choose a valid account role.' });
    if (plan) {
      if (plan === 'free') {
        const paid = await Subscription.exists({ userId: req.params.id, status: { $in: ['active', 'canceling', 'past_due'] }, $or: [{ paidThrough: { $gt: new Date() } }, { graceEndsAt: { $gt: new Date() } }] });
        if (paid) return res.status(409).json({ success: false, message: 'This account still has paid Pro access. Cancel or resolve its subscription before removing Pro.' });
      }
      update.plan = plan;
      update.planOverride = plan === 'pro'
        ? { plan: 'pro', expiresAt: expiresAt ? new Date(expiresAt) : null, reason: String(reason || 'Support grant').slice(0, 240), grantedBy: req.admin._id }
        : null;
    }
    if (role) update.role = role;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    await AdminAudit.create({ adminId: req.admin._id, userId: user._id, action: 'account.plan_or_role_updated', resourceType: 'User', resourceId: String(user._id), details: { plan, role, reason, expiresAt } });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getAllDeliveries(req, res) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const query = search ? { $or: [
      { title: { $regex: escaped(search), $options: 'i' } },
      { clientName: { $regex: escaped(search), $options: 'i' } },
      { shootType: { $regex: escaped(search), $options: 'i' } }
    ] } : {};
    const deliveries = await Delivery.find(query)
      .populate('userId', 'name email studio.name')
      .sort({ updatedAt: -1 })
      .limit(100)
      .select('-collectionAnalysis -creativeDirection -formatConfig -access.pinDigest')
      .lean();
    res.json({ success: true, data: deliveries });
  } catch (error) {
    console.error('[admin/deliveries]', error.message);
    res.status(500).json({ success: false, message: 'We could not load the deliveries.' });
  }
}

export async function getPayments(req, res) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const status = String(req.query.status || 'all');
    const query = {};
    if (['pending', 'success', 'failed', 'refunded', 'partially_refunded', 'disputed'].includes(status)) query.status = status;
    if (search) query.reference = { $regex: escaped(search), $options: 'i' };
    const payments = await Payment.find(query)
      .populate('userId', 'name email')
      .populate('subscriptionId', 'status paidThrough')
      .sort({ createdAt: -1 })
      .limit(100)
      .select('-providerSnapshot')
      .lean();
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('[admin/payments]', error.message);
    res.status(500).json({ success: false, message: 'We could not load the payments.' });
  }
}

export async function refundPayment(req, res) {
  let reserved = false;
  let payment;
  try {
    payment = await Payment.findById(req.params.id);
    if (!payment || !['success', 'partially_refunded'].includes(payment.status)) return res.status(404).json({ success: false, message: 'A refundable payment was not found.' });
    if (payment.refundPendingAmountKobo > 0) return res.status(409).json({ success: false, message: 'A refund for this payment is already being processed.' });
    const requested = req.body.amountKobo === undefined ? payment.amountKobo - payment.refundedAmountKobo : Number(req.body.amountKobo);
    const available = payment.amountKobo - payment.refundedAmountKobo;
    if (!Number.isInteger(requested) || requested < 100 || requested > available) return res.status(400).json({ success: false, message: 'Enter a refund amount within the remaining payment balance.' });
    const reservation = await Payment.updateOne({ _id: payment._id, refundPendingAmountKobo: 0 }, { $set: { refundPendingAmountKobo: requested } });
    if (!reservation.modifiedCount) return res.status(409).json({ success: false, message: 'A refund for this payment is already being processed.' });
    reserved = true;
    const result = await paystackRequest('/refund', { method: 'POST', body: { transaction: payment.reference, amount: requested, currency: 'NGN', customer_note: String(req.body.note || 'Veylo support refund').slice(0, 240), merchant_note: `Approved by Veylo admin ${req.admin._id}` } });
    await AdminAudit.create({ adminId: req.admin._id, userId: payment.userId, action: 'payment.refund_requested', resourceType: 'Payment', resourceId: String(payment._id), details: { amountKobo: requested, paystackRefundId: result.id, note: String(req.body.note || '').slice(0, 240) } });
    res.status(202).json({ success: true, message: 'Paystack accepted the refund request.', data: { refundId: result.id, status: result.status, amountKobo: requested } });
  } catch (error) {
    if (reserved && payment && error.providerStatus && error.providerStatus < 500) await Payment.updateOne({ _id: payment._id }, { $set: { refundPendingAmountKobo: 0 } });
    console.error('[admin/refund]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not send this refund to Paystack.' });
  }
}

export async function getAllStories(req, res) {
  try {
    const { search, limit = 50 } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { clientName: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { occasion: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } }
      ];
    }

    const stories = await PhotoStory.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50)))
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
