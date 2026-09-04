"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smootherstep = (value: number) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function useScrollChapters() {
  const hero = useRef<HTMLElement>(null);
  const rig = useRef<HTMLElement>(null);
  const mine = useRef<HTMLElement>(null);
  const [coreProgress, setCoreProgress] = useState(0);
  const [rigPower, setRigPower] = useState(0);
  const [rewardProgress, setRewardProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const chapters = [rig.current, mine.current].filter((chapter): chapter is HTMLElement => !!chapter);
    const dimensions = new Map<HTMLElement, { height: number; top: number }>();

    function measure() {
      chapters.forEach(chapter => {
        const stage = chapter.querySelector<HTMLElement>(".lp-story-stage");
        if (!stage) return;
        const height = stage.offsetHeight;
        // Tall mobile content scrolls fully into reach before its stage settles.
        const top = Math.min(0, window.innerHeight - height);
        dimensions.set(chapter, { height, top });
        chapter.style.setProperty("--stage-height", `${height}px`);
        chapter.style.setProperty("--sticky-top", `${top}px`);
        chapter.classList.toggle("is-pinned", !reduced.matches);
      });
      schedule();
    }

    function progress(chapter: HTMLElement | null) {
      if (!chapter) return 0;
      const bounds = chapter.getBoundingClientRect();
      if (reduced.matches) {
        return clamp((window.innerHeight - bounds.top) / Math.max(1, window.innerHeight + bounds.height));
      }
      const { height, top } = dimensions.get(chapter) ?? { height: window.innerHeight, top: 0 };
      return clamp((top - bounds.top) / Math.max(1, bounds.height - height));
    }
    function update() {
      frame = 0;
      const element = hero.current;
      if (element) {
        const bottom = window.scrollY + element.getBoundingClientRect().bottom;
        setCoreProgress(clamp(window.scrollY / Math.max(1, bottom)));
      }
      const rigProgress = progress(rig.current);
      // Soft acceleration/deceleration at all three builds; scene damping absorbs wheel steps.
      setRigPower(2 * smootherstep(rigProgress * 2) + 3 * smootherstep((rigProgress - 0.5) * 2));
      setRewardProgress(progress(mine.current));
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }

    const resize = new ResizeObserver(measure);
    if (hero.current) resize.observe(hero.current);
    chapters.forEach(chapter => {
      const stage = chapter.querySelector(".lp-story-stage");
      if (stage) resize.observe(stage);
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    reduced.addEventListener("change", measure);
    measure();
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      reduced.removeEventListener("change", measure);
      cancelAnimationFrame(frame);
      chapters.forEach(chapter => {
        chapter.classList.remove("is-pinned");
        chapter.style.removeProperty("--stage-height");
        chapter.style.removeProperty("--sticky-top");
      });
    };
  }, []);

  return {
    hero, rig, mine, coreProgress, rigPower,
    reward: Math.min(3, Math.floor(rewardProgress * 4)),
    rewardPose: rewardProgress * 3,
  };
}
