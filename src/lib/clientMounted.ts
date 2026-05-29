/**
 * Module-level flag that tracks whether the app has mounted at least once on the client.
 * - SSR: always false (no browser, module runs in Node context — but matters for first hydration)
 * - First page load: starts false, set to true after first useEffect
 * - Subsequent client-side navigations: already true → components skip the spinner entirely
 */
export let clientHasMounted = false;

export function markClientMounted(): void {
  clientHasMounted = true;
}
