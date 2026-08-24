export function WifiLegend() {
  return (
    <aside aria-label="RF frequency and public Wi-Fi legend" className="topolink-wifi-legend">
      <div className="topolink-wifi-legend__keys">
        <span><i data-key="pattern" />Pattern</span>
        <span><i data-key="fresnel" />Fresnel</span>
        <span><i data-key="obstacle" />Obstacle cut</span>
        <span><i data-key="wifi" />Public Wi-Fi</span>
      </div>
      <div className="topolink-spectrum"><strong>7.1 GHz</strong><i /><strong>2.4 GHz</strong></div>
      <p>higher frequency · tighter beam · lower frequency · wider beam</p>
      <div className="topolink-wifi-legend__density" aria-label="Estimated coverage density">
        <strong>Modeled hotspot density</strong>
        <span><i data-density="low" />Low</span>
        <span><i data-density="medium" />Medium</span>
        <span><i data-density="high" />High</span>
      </div>
    </aside>
  );
}
