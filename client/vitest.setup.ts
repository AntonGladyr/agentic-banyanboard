/**
 * client/vitest.setup.ts — global test setup (TASK-006 Phase 2).
 *
 * Registers `@testing-library/jest-dom` custom matchers (e.g. `toBeInTheDocument`,
 * `toHaveAccessibleName`) and clears the DOM between tests so each component test starts from a
 * clean tree. Referenced by `vite.config.ts` → `test.setupFiles`.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
