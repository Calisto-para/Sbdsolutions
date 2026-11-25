import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
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
import Register from "./pages/auth/Register";
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import VerifyEmail from "./pages/auth/VerifyEmail";
import Dashboard from "./pages/dashboard/Dashboard";
import Admin from "./pages/admin/Admin";

/* Old .html addresses still resolve, in-app, to the clean routes. */
const LEGACY = {
  "/index.html": "/",
  "/src/index.html": "/",
  "/services.html": "/services",
  "/projects.html": "/projects",
  "/about.html": "/about",
  "/who-we-help.html": "/who-we-help",
  "/contact.html": "/contact",
  "/start-a-project.html": "/start-a-project",
  "/register.html": "/register",
  "/login.html": "/login",
  "/forgot-password.html": "/forgot-password",
  "/reset-password.html": "/reset-password",
  "/verify-email.html": "/verify-email",
  "/dashboard.html": "/dashboard",
};

export default function App() {
  return (
    <AuthProvider>
      <RouteMeta />
      <Routes>
        {Object.entries(LEGACY).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}

        <Route path="register" element={<Register />} />
        <Route path="login" element={<Login />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="dashboard" element={<Dashboard />} />

        {/* Unlisted operator area: no page links to it. */}
        <Route path="admin" element={<Admin />} />

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
    </AuthProvider>
  );
}
