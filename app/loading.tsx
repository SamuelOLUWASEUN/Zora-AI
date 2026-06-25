export default function Loading() {
  const T = { bg: "#09090b", textDim: "#52525b", fontMono: "'JetBrains Mono', monospace" };
  return (
    <div style={{ minHeight: "100dvh", backgroundColor: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", fontFamily: T.fontMono }}>
      <style>{`@keyframes dotPulse{0%,80%,100%{transform:scale(.6);opacity:.3}40%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ display: "flex", gap: "6px" }}>
        {[0,1,2].map(i => (
          <span key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: T.textDim, display: "inline-block", animation: `dotPulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
        ))}
      </div>
      <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: T.textDim }}>LOADING VAULT</div>
    </div>
  );
}
