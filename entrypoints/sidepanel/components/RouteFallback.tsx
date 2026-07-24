export default function RouteFallback() {
  return (
    <div className="ds-route-fallback" role="status" aria-live="polite">
      <span className="ds-route-fallback-dot" />
      加载中…
    </div>
  );
}
