import { Router } from 'express';
import { requireAuth } from '../auth.js';

const articles = [
  { id: 'care-conversations', title: 'Preparing for a conversation with the care team',
    summary: 'Write down your questions, ask what to expect next, and check who to contact for updates.',
    source: 'Agency for Healthcare Research and Quality', url: 'https://www.ahrq.gov/questions/index.html' },
  { id: 'hand-hygiene', title: 'Keeping hands clean during hospital visits',
    summary: 'Learn how hand hygiene helps protect patients and visitors.',
    source: 'Centers for Disease Control and Prevention', url: 'https://www.cdc.gov/clean-hands/about/index.html' },
  { id: 'caregiver-support', title: 'Support for family caregivers',
    summary: 'Find resources for organizing care and looking after yourself while supporting someone else.',
    source: 'MedlinePlus', url: 'https://medlineplus.gov/caregivers.html' },
];

export function educationRoutes() {
  const router = Router();
  router.get('/education', requireAuth, (req, res) => res.json(articles));
  return router;
}
