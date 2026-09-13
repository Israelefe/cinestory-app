import React from 'react';
import PolicyPage from '../components/PolicyPage.jsx';

const sections = [
  { id: 'purpose', title: 'Made for working photographers', paragraphs: ['Veylo is for photographers and media studios presenting and delivering their own finished client shoots. Fair use keeps the service available for normal studio work.'] },
  { id: 'everyday', title: 'Everyday studio use', paragraphs: ['Presenting completed photography and sharing it with clients is the intended use of Veylo.'], items: ['Studio portraits, birthdays, maternity, graduation, and family sessions.', 'Traditional weddings, white weddings, receptions, and owambe celebrations.', 'Finished campaigns, lookbooks, branding sessions, and corporate photography.', 'Photo Story, Editorial Page, Photo Reveal, Canvas, Chapters, or Album followed by the complete gallery.'] },
  { id: 'outside', title: 'What falls outside fair use', items: ['Unauthorised scripts or bots that bulk-create deliveries or scrape photographs.', 'Reselling one account to unrelated studios or sharing account credentials widely.', 'Using delivery hosting or personal storage for software, video archives, or unrelated files.', 'Uploading unlawful, non-consensual, or infringing content.', 'Activity that disrupts access for other photographers and their clients.'] },
  { id: 'capacity', title: 'Delivery limits', paragraphs: ['Veylo Free includes three final photo deliveries each month. Veylo Pro is ₦25,000 per month and includes unlimited final photo deliveries for the normal work of one photographer or studio, subject to this policy.', 'If you expect an unusually large delivery or sustained volume outside normal client work, contact support before uploading so the team can help you avoid delays. You do not need to contact support to subscribe to Pro.'] },
  { id: 'storage', title: 'Delivery hosting and personal storage', paragraphs: ['Veylo Pro includes 50 GB of personal image storage. Photographs hosted as part of client deliveries do not count toward that 50 GB allowance.', 'Keep independent master backups of every photograph. Veylo is a presentation and delivery service, and a delivery link or personal storage area should not be the only copy of a finished shoot.'] },
  { id: 'resolution', title: 'Questions about usage', paragraphs: ['If you are unsure whether your workflow fits this policy, tell us about your studio and the delivery volume you expect. We can discuss the practical requirement with you.'], contact: true }
];

export default function FairUsePolicy() {
  return <PolicyPage title="Fair use, in practice." description="For real client shoots, everyday studio work, and a delivery service that remains dependable." sections={sections} />;
}
