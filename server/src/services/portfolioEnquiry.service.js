import PortfolioEnquiry from '../models/PortfolioEnquiry.js';
import User from '../models/User.js';
import { sendPortfolioEnquiryEmail } from './email.service.js';
export async function processPortfolioEnquiryNotifications({ notify = sendPortfolioEnquiryEmail, now = new Date() } = {}) {
  // A small outbox batch, leased across workers, retries even after an API restart.
  for (let count = 0; count < 5; count += 1) {
    const enquiry = await PortfolioEnquiry.findOneAndUpdate({ $or: [{ 'notification.status': 'pending', 'notification.retryAt': { $lte: now } }, { 'notification.status': 'sending', 'notification.leaseUntil': { $lte: now } }] }, { $set: { 'notification.status': 'sending', 'notification.leaseUntil': new Date(now.getTime() + 10 * 60000) }, $inc: { 'notification.attempts': 1 } }, { new: true, sort: { createdAt: 1 } });
    if (!enquiry) break;
    const lease = { _id: enquiry._id, 'notification.status': 'sending', 'notification.leaseUntil': enquiry.notification.leaseUntil };
    try {
      const user = await User.findById(enquiry.userId).select('email accountStatus');
      const result = user?.accountStatus === 'active' ? await notify({ to: user.email, userId: user._id, enquiryId: enquiry._id }) : { skipped: true };
      if (result?.duplicate && !['sent', 'skipped'].includes(result.status)) throw new Error('The email is still being sent by another worker.');
      await PortfolioEnquiry.updateOne(lease, { $set: { 'notification.status': result?.skipped || result?.status === 'skipped' ? 'skipped' : 'sent' }, $unset: { 'notification.leaseUntil': 1 } });
    } catch {
      await PortfolioEnquiry.updateOne(lease, { $set: { 'notification.status': 'pending', 'notification.retryAt': new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** Math.min(enquiry.notification.attempts, 6))) }, $unset: { 'notification.leaseUntil': 1 } });
    }
  }
}
