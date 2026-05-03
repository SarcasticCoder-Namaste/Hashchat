import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-row-reverse items-center justify-between px-[10vw] bg-transparent"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.6 }}
    >
      <div className="w-1/2 relative z-10 flex flex-col text-right items-end">
        <motion.h2
          initial={{ opacity: 0, x: 30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-6xl font-black font-display mb-6 leading-tight text-white"
        >
          Streaks &<br/>
          <span className="text-[#ec4899]">Leaderboards</span>
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, x: 20 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-2xl text-white/70 max-w-lg"
        >
          Show up, participate, and climb the ranks in your favorite topics.
        </motion.p>
      </div>

      <div className="w-[30vw] flex flex-col gap-4 relative z-10">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -50, scale: 0.9 }}
            animate={phase >= 3 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -50, scale: 0.9 }}
            transition={{ delay: i * 0.15, type: "spring", stiffness: 300, damping: 20 }}
            className={`p-6 rounded-2xl border ${i === 1 ? 'border-[#ec4899]/50 bg-[#ec4899]/10' : 'border-white/10 bg-white/5'} backdrop-blur-sm flex items-center justify-between`}
          >
            <div className="flex items-center gap-4">
              <div className={`text-2xl font-bold ${i === 1 ? 'text-[#ec4899]' : 'text-white/50'}`}>#{i}</div>
              <div className="w-12 h-12 rounded-full bg-white/20" />
              <div className="w-24 h-4 bg-white/40 rounded-full" />
            </div>
            <div className="text-xl font-bold text-white/80">{1000 - i * 150} pts</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}