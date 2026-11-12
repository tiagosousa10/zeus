import type { ReactNode } from "react";
import gsap from "gsap";
import { Nav } from "./ModuleNav";
export { Nav } from "./ModuleNav";
Object.assign(window, { gsap });
export function Page({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <Nav />
      <main className={`app-page ${className}`}>{children}</main>
    </>
  );
}
