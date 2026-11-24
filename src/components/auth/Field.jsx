export default function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
