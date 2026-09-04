"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function useScrollChapters() {
  const hero = useRef<HTMLElement>(null);
  const rig = useRef<HTMLElement>(null);
  const mine = useRef<HTMLElement>(null);
  const [coreProgress, setCoreProgress] = useState(0);
  const [rigPower, setRigPower] = useState(0);
  const [rewardProgress, setRewardProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    function progress(chapter: HTMLElement | null) {
      if (!chapter) return 0;
      const bounds = chapter.getBoundingClientRect();
      // Zero at first entry; one when the section's bottom leaves the viewport.
      return clamp((window.innerHeight - bounds.top) / Math.max(1, window.innerHeight + bounds.height));
    }
    function update() {
      frame = 0;
      const element = hero.current;
      if (element) {
        const bottom = window.scrollY + element.getBoundingClientRect().bottom;
        setCoreProgress(clamp(window.scrollY / Math.max(1, bottom)));
      }
      const rigProgress = progress(rig.current);
      // Pass through the middle build at halfway, without holding the page or animation.
      setRigPower(rigProgress <= 0.5 ? rigProgress * 4 : 2 + (rigProgress - 0.5) * 6);
      setRewardProgress(progress(mine.current));
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }

    const resize = new ResizeObserver(schedule);
    [hero.current, rig.current, mine.current].forEach(chapter => {
      if (chapter) resize.observe(chapter);
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return {
    hero, rig, mine, coreProgress, rigPower,
    reward: Math.min(3, Math.floor(rewardProgress * 4)),
    rewardPose: rewardProgress * 3,
  };
}
