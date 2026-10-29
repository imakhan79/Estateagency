import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Listings from "./pages/Listings";
import PropertyDetail from "./pages/PropertyDetail";
import SellProperty from "./pages/SellProperty";
import About from "./pages/About";
import Contact from "./pages/Contact";
import { Privacy, Terms } from "./pages/Legal";
import NotFound from "./pages/NotFound";

// The back office loads separately so website visitors never download it.
const AdminApp = lazy(() => import("./admin/AdminApp"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="admin/*" element={<Suspense fallback={null}><AdminApp /></Suspense>} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="buy" element={<Listings listingType="sale" />} />
          <Route path="rent" element={<Listings listingType="rent" />} />
          <Route path="search" element={<Listings />} />
          <Route path="property/:slug" element={<PropertyDetail />} />
          <Route path="sell" element={<SellProperty />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
