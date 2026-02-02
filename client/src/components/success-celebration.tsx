import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  speedX: number;
  speedY: number;
}

interface SuccessCelebrationProps {
  show: boolean;
  onComplete?: () => void;
}

export function SuccessCelebration({ show, onComplete }: SuccessCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!show) {
      setParticles([]);
      return;
    }

    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onComplete?.();
      return;
    }

    const colors = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899"];
    const newParticles: Particle[] = [];

    for (let i = 0; i < 50; i++) {
      newParticles.push({
        id: i,
        x: 50 + (Math.random() - 0.5) * 20,
        y: 50,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
        speedX: (Math.random() - 0.5) * 8,
        speedY: -8 - Math.random() * 8,
      });
    }

    setParticles(newParticles);

    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [show, onComplete]);

  if (!show && particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" role="status" aria-live="polite">
      <span className="sr-only">Project generated successfully!</span>
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute rounded-full animate-confetti"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            "--speed-x": particle.speedX,
            "--speed-y": particle.speedY,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
