import confetti from "canvas-confetti";

export function fireConfetti() {
  // Burst from middle
  confetti({
    particleCount: 90,
    spread: 70,
    origin: { x: 0.5, y: 0.6 },
    colors: ["#38BDF8", "#FBBF24", "#F87171", "#34D399", "#A78BFA"],
  });
  // Double burst from sides
  setTimeout(() => {
    confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
  }, 200);
}
