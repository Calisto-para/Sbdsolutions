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

/* Every route is a real .html file, so a refresh or a shared link always works
   on hosts without rewrite rules. These aliases redirect in-app if reached. */
const ALIASES = {
  "/index.html": "/",
  "/services": "/services.html",
  "/projects": "/projects.html",
  "/about": "/about.html",
  "/who-we-help": "/who-we-help.html",
  "/contact": "/contact.html",
  "/start-a-project": "/start-a-project.html",
  "/register": "/register.html",
  "/login": "/login.html",
  "/forgot-password": "/forgot-password.html",
  "/reset-password": "/reset-password.html",
  "/verify-email": "/verify-email.html",
  "/dashboard": "/dashboard.html",
};

export default function App() {
  return (
    <AuthProvider>
      <RouteMeta />
      <Routes>
        {Object.entries(ALIASES).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}

        <Route path="register.html" element={<Register />} />
        <Route path="login.html" element={<Login />} />
        <Route path="forgot-password.html" element={<ForgotPassword />} />
        <Route path="reset-password.html" element={<ResetPassword />} />
        <Route path="verify-email.html" element={<VerifyEmail />} />
        <Route path="dashboard.html" element={<Dashboard />} />

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="src/index.html" element={<Home />} />
          <Route path="services.html" element={<Services />} />
          <Route path="projects.html" element={<Projects />} />
          <Route path="about.html" element={<About />} />
          <Route path="who-we-help.html" element={<Clients />} />
          <Route path="contact.html" element={<Contact />} />
          <Route path="start-a-project.html" element={<StartProject />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
