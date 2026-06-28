import { router } from 'tinro';

export function resolveTabFromUrl(basePath: string, validTabs: readonly string[], defaultTab: string): string {
  const pathname = window.location.pathname;
  const prefix = basePath + '/';
  if (pathname.startsWith(prefix)) {
    const segment = pathname.slice(prefix.length).split('/')[0];
    if (segment && (validTabs as readonly string[]).includes(segment)) return segment;
  }
  return defaultTab;
}

export function gotoTab(basePath: string, tab: string, defaultTab: string): void {
  router.goto(tab === defaultTab ? basePath : `${basePath}/${tab}`);
}
