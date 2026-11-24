import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { metaFor } from "../meta";

/* Keeps the document title and description in step with the active route. */
export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaFor(pathname);
    document.title = meta.title;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", meta.description);
  }, [pathname]);

  return null;
}
