import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="font-display text-6xl text-brand-700">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-stone-900">We could not find that page</h1>
      <p className="mt-2 text-stone-600">The property may have been sold, rented or removed.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/search" className="btn-primary">Browse properties</Link>
        <Link to="/" className="btn-secondary">Home</Link>
      </div>
    </div>
  );
}
