"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function useScrollChapters() {
  const hero = useRef<HTMLElement>(null);
  const rig = useRef<HTMLElement>(null);
  const mine = useRef<HTMLElement>(null);
  const [coreProgress, setCoreProgress] = useState(0);
  const [rigPower, setRigPower] = useState(0);
  const [reward, setReward] = useState(0);

  useEffect(() => {
    let frame = 0;
    const chapters = [rig.current, mine.current].filter((element): element is HTMLElement => !!element);
    const dimensions = new Map<HTMLElement, { stageHeight: number; top: number }>();

    function measure() {
      chapters.forEach(chapter => {
        const stage = chapter.querySelector<HTMLElement>(".lp-story-stage");
        if (!stage) return;
        const stageHeight = stage.offsetHeight;
        // A short screen can scroll past the top of a tall stage before it sticks.
        const top = Math.min(0, window.innerHeight - stageHeight);
        dimensions.set(chapter, { stageHeight, top });
        chapter.style.setProperty("--stage-height", `${stageHeight}px`);
        chapter.style.setProperty("--sticky-top", `${top}px`);
      });
      schedule();
    }
    function progress(chapter: HTMLElement | null) {
      if (!chapter) return 0;
      const { stageHeight, top } = dimensions.get(chapter) ?? { stageHeight: window.innerHeight, top: 0 };
      const bounds = chapter.getBoundingClientRect();
      return clamp((top - bounds.top) / Math.max(1, bounds.height - stageHeight));
    }
    function update() {
      frame = 0;
      const element = hero.current;
      if (element) {
        const bottom = window.scrollY + element.getBoundingClientRect().bottom;
        setCoreProgress(clamp(window.scrollY / Math.max(1, bottom)));
      }
      const rigProgress = progress(rig.current);
      // Rest on each build, with soft transitions between starter, upgraded and maximum power.
      setRigPower(2 * smoothstep((rigProgress - 0.14) / 0.26) + 3 * smoothstep((rigProgress - 0.56) / 0.28));
      setReward(Math.min(3, Math.floor(progress(mine.current) * 4)));
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
    measure();
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame);
    };
  }, []);

  return { hero, rig, mine, coreProgress, rigPower, reward };
}
