export function RecoveryCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  function save() {
    const content = `ApiaryLens recovery codes\n\n${codes.join('\n')}\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    link.download = 'apiarylens-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(link.href);
    onSaved();
  }
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
    >
      <section className="card recovery-dialog">
        <span className="eyebrow">One-time setup</span>
        <h2 id="recovery-title">Save your recovery codes</h2>
        <p>
          These codes are shown only once. Store them somewhere private; each code can recover your
          account one time without an email service.
        </p>
        <ol className="recovery-list">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <button className="button primary" onClick={save}>
          Download codes and continue
        </button>
      </section>
    </div>
  );
}
