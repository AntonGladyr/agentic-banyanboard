/**
 * client/src/components/AppShell/AppShell.tsx — app-wide layout wrapper (TASK-006 Phase 2).
 *
 * UI/UX creative Component Inventory: a header bar carrying the app name and a `<main>` content
 * region that wraps the routed page. Provides the semantic landmarks (`<header>`, `<main>`) the
 * accessibility plan depends on (UI/UX Accessibility Requirements). The `<main>` is the routed
 * content container; pages render their own `<h1>` and manage focus on mount.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './AppShell.module.css';

interface AppShellProps {
  readonly children: ReactNode;
}

export function AppShell({ children }: AppShellProps): ReactNode {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          BanyanBoard
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
