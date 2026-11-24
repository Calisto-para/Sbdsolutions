import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">404</p>
        <h1 className="section-title">This page has moved or <span>does not exist.</span></h1>
        <p className="lead" style={{ marginTop: 14 }}>
          The page you were looking for could not be found. Start again from the homepage or tell us what you need.
        </p>
        <div className="btn-row" style={{ marginTop: 26 }}>
          <Link className="btn btn--primary" to="/">Back to Home</Link>
          <Link className="btn btn--ghost" to="/start-a-project">Start a Project</Link>
        </div>
      </div>
    </section>
  );
}
