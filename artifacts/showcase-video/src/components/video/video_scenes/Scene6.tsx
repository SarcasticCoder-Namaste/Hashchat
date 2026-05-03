import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Play, Share2 } from 'lucide-react';

const REELS = [
  { tag: '#mumbairain', hue: 'from-pink-500/40 to-purple-600/40', likes: '24.1k' },
  { tag: '#worldcup', hue: 'from-cyan-400/40 to-blue-600/40', likes: '88.4k' },
  { tag: '#climatemarch', hue: 'from-emerald-400/40 to-teal-600/40', likes: '12.7k' },
];

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1700),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[8vw] bg-transparent"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -60 }}
      transition={{ duration: 0.6 }}
    >
      {/* Left copy */}
      <div className="w-[38%] relative z-10 flex flex-col">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-full bg-white/10 border border-white/15 mb-6"
        >
          <Play className="w-4 h-4 text-white fill-white" />
          <span className="text-sm uppercase tracking-[0.2em] text-white/80 font-semibold">
            Reels
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          className="text-6xl font-black font-display mb-6 leading-tight text-white"
        >
          Watch the<br />
          <span className="text-gradient">moment unfold.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-2xl text-white/70"
        >
          Short videos, tagged by topic. Scroll a hashtag and see the world react in real time.
        </motion.p>
      </div>

      {/* Right reels stack */}
      <div className="w-[44%] h-[68vh] relative z-10 flex items-center justify-center gap-5">
        {REELS.map((reel, i) => {
          const isCenter = i === 1;
          return (
            <motion.div
              key={reel.tag}
              initial={{ opacity: 0, y: 80, scale: 0.9 }}
              animate={
                phase >= 3
                  ? { opacity: isCenter ? 1 : 0.65, y: 0, scale: isCenter ? 1 : 0.88 }
                  : { opacity: 0, y: 80, scale: 0.9 }
              }
              transition={{
                delay: 0.15 * i,
                type: 'spring',
                stiffness: 220,
                damping: 22,
              }}
              className={`relative ${
                isCenter ? 'w-[20vw] h-[64vh] z-20' : 'w-[16vw] h-[54vh] z-10'
              } rounded-3xl border border-white/15 overflow-hidden shadow-2xl bg-gradient-to-br ${reel.hue} backdrop-blur-md`}
            >
              {/* Animated shimmer to suggest video playback */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/15 to-white/0"
                animate={{ x: ['-100%', '100%'] }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: i * 0.4,
                }}
              />

              {/* Top hashtag chip */}
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm">
                <span className="text-sm font-bold text-white font-display">{reel.tag}</span>
              </div>

              {/* Center play indicator (only on focal reel) */}
              {isCenter && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <div className="w-20 h-20 rounded-full bg-white/15 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                    <Play className="w-9 h-9 text-white fill-white ml-1" />
                  </div>
                </motion.div>
              )}

              {/* Right-side action rail (only on focal reel) */}
              {isCenter && (
                <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5">
                  {[Heart, MessageCircle, Share2].map((Icon, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.1 }}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Bottom caption bar */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center gap-2 text-white/90">
                  <Heart className="w-4 h-4 fill-white" />
                  <span className="text-sm font-semibold tabular-nums">{reel.likes}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
