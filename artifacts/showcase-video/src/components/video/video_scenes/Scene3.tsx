import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-transparent"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.7 }}
    >
      <div className="text-center relative z-10 flex flex-col items-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-7xl font-black font-display mb-12 text-white"
        >
          Drop-in <span className="text-[#06b6d4]">Voice Rooms</span>
        </motion.h2>

        <div className="flex items-center gap-4 h-32">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="w-4 rounded-full bg-[#06b6d4]"
              initial={{ height: 20, opacity: 0 }}
              animate={phase >= 2 ? { 
                height: [20, Math.random() * 80 + 40, 20],
                opacity: 1
              } : { height: 20, opacity: 0 }}
              transition={{
                height: {
                  repeat: Infinity,
                  duration: 1 + Math.random() * 0.5,
                  ease: "easeInOut",
                  delay: Math.random() * 0.5
                },
                opacity: { duration: 0.4 }
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}