"use client";

import dynamic from "next/dynamic";

/** The 3D scene loads in the browser only, so the page text arrives first. */
export const ClayLazy = dynamic(() => import("./ClayScene"), { ssr: false });
