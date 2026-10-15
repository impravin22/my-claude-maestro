/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - fixture: not part of the host repo (motion/react is not installed here)
import { useSpring } from "motion/react";
export function Springy() {
  const x = useSpring(0);
  return <i>{String(x)}</i>;
}
