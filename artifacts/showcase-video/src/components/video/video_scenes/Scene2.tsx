import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-between px-[10vw] bg-transparent"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.6 }}
    >
      <div className="w-1/2 relative z-10 flex flex-col">
        <motion.h2
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-6xl font-black font-display mb-6 leading-tight text-white"
        >
          Type a hashtag.<br/>
          <span className="text-gradient">Join the world.</span>
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-2xl text-white/70"
        >
          Instant live group chats for any topic. No gatekeepers, no follows. Just raw conversation.
        </motion.p>
      </div>

      <div className="w-[35vw] h-[60vh] relative z-10 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden flex flex-col shadow-2xl">
        <div className="h-16 border-b border-white/10 flex items-center px-6">
          <motion.div 
            className="text-2xl font-bold text-white font-display"
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          >
            #taylorswift
          </motion.div>
        </div>
        <div className="flex-1 p-6 flex flex-col justify-end gap-4">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={phase >= 4 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
              transition={{ delay: i * 0.2, type: "spring", stiffness: 300, damping: 20 }}
              className="bg-white/10 p-4 rounded-2xl rounded-bl-sm w-[80%]"
            >
              <div className="w-20 h-3 bg-white/20 rounded-full mb-3" />
              <div className="w-full h-2 bg-white/40 rounded-full mb-2" />
              <div className="w-2/3 h-2 bg-white/40 rounded-full" />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}