import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RouteMeta from "./components/RouteMeta";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Projects from "./pages/Projects";
import About from "./pages/About";
import Clients from "./pages/Clients";
import Contact from "./pages/Contact";
import StartProject from "./pages/StartProject";
import NotFound from "./pages/NotFound";

/* Keep old .html links working after the move to client-side routing. */
const LEGACY = {
  "/index.html": "/",
  "/services.html": "/services",
  "/work.html": "/projects",
  "/about.html": "/about",
  "/clients.html": "/who-we-help",
  "/contact.html": "/contact",
  "/start-project.html": "/start-a-project",
};

export default function App() {
  return (
    <>
      <RouteMeta />
      <Routes>
        {Object.entries(LEGACY).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="services" element={<Services />} />
          <Route path="projects" element={<Projects />} />
          <Route path="about" element={<About />} />
          <Route path="who-we-help" element={<Clients />} />
          <Route path="contact" element={<Contact />} />
          <Route path="start-a-project" element={<StartProject />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
