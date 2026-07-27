export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px 80px',
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        color: '#0f172a',
        lineHeight: 1.55,
        background: 'linear-gradient(165deg, #e8eef5 0%, #f8fafc 45%, #dbe7f3 100%)',
        minHeight: '100vh',
      }}
    >
      <p style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 12, color: '#334155', fontWeight: 600 }}>
        Physical Risk Consultancy
      </p>
      <h1 style={{ fontSize: '2rem', margin: '8px 0 24px', fontWeight: 650, color: '#0b1f33' }}>
        Privacy Policy
      </h1>
      <p>
        This policy covers use of the Physical Risk Repository gateway at{' '}
        <strong>repo.physicalrisk.com</strong>, including ChatGPT Custom GPT Actions and MCP API
        integrations that submit Approved Documents into the Import Queue.
      </p>

      <h2 style={{ fontSize: '1.2rem', marginTop: 32, color: '#0b1f33' }}>What we process</h2>
      <ul>
        <li>Document metadata and file content you explicitly submit through Repository tools.</li>
        <li>API authentication keys and usage timestamps for MCP integrations.</li>
        <li>Standard server logs (IP address, time, endpoint) for security and troubleshooting.</li>
      </ul>

      <h2 style={{ fontSize: '1.2rem', marginTop: 32, color: '#0b1f33' }}>How we use it</h2>
      <p>
        Submitted documents are staged in the Import Queue for human review before any final
        repository storage. We do not use submitted content to train third-party AI models.
      </p>

      <h2 style={{ fontSize: '1.2rem', marginTop: 32, color: '#0b1f33' }}>Access control</h2>
      <p>
        MCP API keys are scoped to selected projects and tools. Keys are shown once at creation or
        rotation and stored only as irreversible hashes.
      </p>

      <h2 style={{ fontSize: '1.2rem', marginTop: 32, color: '#0b1f33' }}>Retention</h2>
      <p>
        Import staging files and audit records are retained according to the organisation&apos;s
        repository operating procedures. Disabled MCP keys stop working immediately.
      </p>

      <h2 style={{ fontSize: '1.2rem', marginTop: 32, color: '#0b1f33' }}>Contact</h2>
      <p>
        For privacy questions about the Repository gateway, contact your Physical Risk Consultancy
        administrator.
      </p>

      <p style={{ marginTop: 40, fontSize: 14, color: '#475569' }}>
        Last updated: 27 July 2026
      </p>
    </main>
  );
}
