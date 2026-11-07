import type { RequestHandler } from 'express';
import { notFound } from '../lib/errors';

/** After every router: unknown routes get the standard 404 error body. */
export const notFoundHandler: RequestHandler = (req) => {
  throw notFound(`Route not found: ${req.method} ${req.path}`);
};
