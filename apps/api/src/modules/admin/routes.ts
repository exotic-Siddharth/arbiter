import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { router as contestsRouter } from './contests.routes';
import { router as judgeRouter } from './judge.routes';
import { router as plagiarismRouter } from './plagiarism.routes';
import { router as problemsRouter } from './problems.routes';
import { router as usersRouter } from './users.routes';

/**
 * /api/admin (owner: S4 / I1). Everything below requires role ADMIN.
 * Mount order is fixed by resolution R10; sub-routers register only their own paths and
 * nobody installs a catch-all.
 */
export const router = Router();

router.use(requireAuth, requireRole('ADMIN'));
router.use('/', judgeRouter); // A2: /problems/:id/validate-reference, /problems/:id/generate-outputs, /jobs/:id, /judge
router.use('/problems', problemsRouter); // A3
router.use('/contests', contestsRouter); // A3
router.use('/plagiarism', plagiarismRouter); // A3
router.use('/users', usersRouter); // A1
