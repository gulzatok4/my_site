import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SiteShell } from "./components/SiteShell.jsx";
import { AdminPage } from "./pages/AdminPage.jsx";
import { CatalogPage } from "./pages/CatalogPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { StoreProvider } from "./store.jsx";

export function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
          <Route element={<SiteShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<CatalogPage kind="products" />} />
            <Route path="/services" element={<CatalogPage kind="services" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
