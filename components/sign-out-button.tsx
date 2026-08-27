"use client";

import { useRef } from "react";

export function SignOutButton({
  returnTo,
  children,
  className,
}: {
  returnTo: string;
  children: React.ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form action="/auth/signout" method="POST" ref={formRef} style={{ display: "none" }}>
        <input name="returnTo" type="hidden" value={returnTo} />
      </form>
      <button
        className={className}
        onClick={() => formRef.current?.submit()}
        // Matches the plain-text look of the <Link> nav items it sits beside — buttons
        // don't inherit anchor styling from the surrounding nav's CSS by default.
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
          padding: 0,
        }}
        type="button"
      >
        {children}
      </button>
    </>
  );
}
