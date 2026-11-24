"use client";

import React, { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  offsetX: number;
  offsetY: number;
  connectionCount: number;
}

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Detect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Mouse tracking via ref-like object (no React re-renders)
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      active: false,
    };

    const MOUSE_RADIUS = 200;
    const CONSTELLATION_MAX_DIST = 85;

    // Calculate star count based on viewport area
    const getStarCount = () => {
      const area = width * height;
      if (width < 640) return Math.floor(area / 14000) + 50; // ~60-70 on mobile
      if (width < 1024) return Math.floor(area / 12000) + 80; // ~95-115 on tablet
      return Math.min(Math.floor(area / 9000) + 90, 150); // ~150-180 on desktop
    };

    let stars: Star[] = [];

    const initStars = () => {
      const count = getStarCount();
      stars = [];

      for (let i = 0; i < count; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        // Range 1.0px to 2.4px, with brighter prominent stars for true glassmorphism depth
        const sizeRand = Math.random();
        const size = sizeRand > 0.8 ? 2.2 + Math.random() * 0.6 : 1.0 + Math.random() * 1.0;
        // Subtle drift speeds
        const speed = prefersReducedMotion ? 0.02 : 0.14 + Math.random() * 0.18;
        const angle = Math.random() * Math.PI * 2;

        stars.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size,
          baseAlpha: 0.55 + Math.random() * 0.45,
          alpha: 0.55 + Math.random() * 0.45,
          twinkleSpeed: 0.015 + Math.random() * 0.03,
          twinkleOffset: Math.random() * Math.PI * 2,
          offsetX: 0,
          offsetY: 0,
          connectionCount: 0,
        });
      }
    };

    const handleResize = () => {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      initStars();
    };

    handleResize();

    // Mouse listeners on window for seamless tracking over elements
    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    // Pause animation when tab is not active
    let isPageVisible = true;
    const handleVisibilityChange = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(animationFrameId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let lastTime = performance.now();
    let tick = 0;

    const render = (currentTime: number) => {
      if (!isPageVisible) return;

      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      tick += delta;

      // Smooth mouse cursor easing
      if (mouse.active) {
        mouse.x += (mouse.targetX - mouse.x) * 0.12;
        mouse.y += (mouse.targetY - mouse.y) * 0.12;
      } else {
        mouse.x += (-1000 - mouse.x) * 0.08;
        mouse.y += (-1000 - mouse.y) * 0.08;
      }

      // Draw pure black background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Reset connections
      for (let i = 0; i < stars.length; i++) {
        stars[i].connectionCount = 0;
      }

      // Update positions and calculate mouse influence
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        // Drift
        s.baseX += s.vx;
        s.baseY += s.vy;

        // Wrap around boundaries smoothly
        if (s.baseX < -10) s.baseX = width + 10;
        if (s.baseX > width + 10) s.baseX = -10;
        if (s.baseY < -10) s.baseY = height + 10;
        if (s.baseY > height + 10) s.baseY = -10;

        // Magnetic mouse attraction / gentle interaction
        let targetOffsetX = 0;
        let targetOffsetY = 0;

        if (mouse.active) {
          const dx = mouse.x - s.baseX;
          const dy = mouse.y - s.baseY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < MOUSE_RADIUS && dist > 1) {
            // Soft magnetic attraction towards cursor
            const force = Math.pow(1 - dist / MOUSE_RADIUS, 1.8);
            const pullDistance = 24 * force; // Maximum gentle pull of 24px
            targetOffsetX = (dx / dist) * pullDistance;
            targetOffsetY = (dy / dist) * pullDistance;
          }
        }

        // Smooth easing towards target offset (spring-back when cursor leaves)
        s.offsetX += (targetOffsetX - s.offsetX) * 0.08;
        s.offsetY += (targetOffsetY - s.offsetY) * 0.08;

        s.x = s.baseX + s.offsetX;
        s.y = s.baseY + s.offsetY;

        // Twinkle calculation
        const twinkle = Math.sin(tick * 3 * s.twinkleSpeed * 60 + s.twinkleOffset);
        s.alpha = Math.max(0.35, Math.min(1.0, s.baseAlpha + twinkle * 0.25));
      }

      // Render subtle constellation lines between nearby stars
      ctx.lineWidth = 0.75;
      for (let i = 0; i < stars.length; i++) {
        const s1 = stars[i];

        for (let j = i + 1; j < stars.length; j++) {
          const s2 = stars[j];

          // Keep constellations sparse: maximum 2 connections per star
          if (s1.connectionCount >= 2 || s2.connectionCount >= 2) continue;

          const dx = s1.x - s2.x;
          const dy = s1.y - s2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONSTELLATION_MAX_DIST) {
            s1.connectionCount++;
            s2.connectionCount++;

            // Base distance factor
            const distFactor = 1 - dist / CONSTELLATION_MAX_DIST;
            let lineAlpha = distFactor * 0.15;

            // Highlight connections when cursor approaches nearby
            if (mouse.active) {
              const midX = (s1.x + s2.x) * 0.5;
              const midY = (s1.y + s2.y) * 0.5;
              const mouseDist = Math.hypot(mouse.x - midX, mouse.y - midY);

              if (mouseDist < MOUSE_RADIUS) {
                const mouseFactor = 1 - mouseDist / MOUSE_RADIUS;
                lineAlpha += mouseFactor * 0.22; // Boost visibility near cursor
              }
            }

            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(lineAlpha, 0.38)})`;
            ctx.stroke();
          }
        }
      }

      // Render stars with soft celestial glow for glassmorphism visibility
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        ctx.shadowBlur = s.size >= 1.6 ? 4 : 0;
        ctx.shadowColor = "rgba(255, 255, 255, 0.75)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none w-full h-full z-0"
      aria-hidden="true"
    />
  );
}
