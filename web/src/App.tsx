import { Navigate, Route, Routes } from "react-router-dom";

import { PayPage } from "./pages/PayPage";
import "./App.css";

/**
 * React SPA shell for the Consumer wallet dApp / web app.
 * Keep wallet flows client-only (no SSR) so Ready / Xverse injectors work.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PayPage />} />
      <Route path="/pay" element={<PayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
