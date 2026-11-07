import { testDatabaseUrl } from './env';
import { runMigrateDeploy } from './migrate';

/**
 * Runs once per `vitest run`, in the main process: creates database arbiter_test (if missing)
 * and applies every migration to the TEST_SCHEMA schema (default "test").
 */
export default function setup(): void {
  runMigrateDeploy(testDatabaseUrl());
}
