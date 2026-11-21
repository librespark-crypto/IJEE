"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type RouterContextValue = {
  path: string;
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
};

const RouterContext = createContext<RouterContextValue>({
  path: "/",
  push: () => {},
  replace: () => {},
  back: () => {},
});

function readHashPath(): string {
  if (typeof window === "undefined") return "/";
  const hash = window.location.hash;
  if (hash && hash.startsWith("#")) {
    return hash.slice(1) || "/";
  }
  return "/";
}

export function OfflineRouterProvider({
  initialPath,
  children,
}: {
  initialPath: string;
  children: React.ReactNode;
}) {
  const [path, setPath] = useState<string>(() => {
    const h = readHashPath();
    return h !== "/" ? h : initialPath;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash || window.location.hash === "#") {
      window.location.hash = `#${path}`;
    }
    const onHashChange = () => {
      setPath(readHashPath());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const push = (href: string) => {
    if (typeof window !== "undefined") {
      window.location.hash = `#${href}`;
    }
    setPath(href);
  };

  const replace = (href: string) => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${href}`);
    }
    setPath(href);
  };

  const back = () => {
    if (typeof window !== "undefined") {
      window.history.back();
    }
  };

  return (
    <RouterContext.Provider value={{ path, push, replace, back }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useOfflinePath(): string {
  return useContext(RouterContext).path;
}

export function useRouter() {
  const { push, replace, back } = useContext(RouterContext);
  return {
    push,
    replace,
    back,
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };
}

export function usePathname(): string {
  return useContext(RouterContext).path;
}

export function useParams(): Record<string, string> {
  const path = useContext(RouterContext).path;
  const examMatch = path.match(/^\/exam\/([^/?#]+)/);
  if (examMatch) return { attemptId: examMatch[1] };
  const analysisMatch = path.match(/^\/analysis\/([^/?#]+)/);
  if (analysisMatch) return { attemptId: analysisMatch[1] };
  return {};
}

export default function Link({
  href,
  children,
  className,
  onClick,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { push } = useContext(RouterContext);
  return (
    <a
      href={`#${href}`}
      className={className}
      onClick={(e) => {
        if (onClick) onClick(e);
        if (!e.defaultPrevented) {
          e.preventDefault();
          push(href);
        }
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
