import { serverListExams } from "./lib/server-api";
import Dashboard from "./components/Dashboard";

export const revalidate = 30;

export default async function HomePage() {
  const initialExams = await serverListExams();
  return (
    <main id="main" className="container">
      <header className="page-header">
        <h1>OMR Evaluation System</h1>
        <p className="muted">Upload OMR sheets or manage answer keys.</p>
      </header>
      <Dashboard initialExams={initialExams} />
    </main>
  );
}