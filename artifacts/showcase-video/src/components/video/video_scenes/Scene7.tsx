import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Bell, Clock, Languages, ShieldCheck, Sparkles } from 'lucide-react';

const FEATURES = [
  {
    Icon: BarChart3,
    title: 'Live Polls',
    body: 'Spin up a poll in any room. Watch results update in real time.',
    accent: '#ec4899',
  },
  {
    Icon: Languages,
    title: 'Auto-Translate',
    body: 'Tap any message. Read it in your language instantly.',
    accent: '#06b6d4',
  },
  {
    Icon: Clock,
    title: 'Scheduled DMs',
    body: 'Write now. Send later. Time it perfectly.',
    accent: '#8b5cf6',
  },
  {
    Icon: Bell,
    title: 'Push Anywhere',
    body: 'Get pinged the second your hashtag heats up.',
    accent: '#f59e0b',
  },
  {
    Icon: ShieldCheck,
    title: '2FA Security',
    body: 'SMS + authenticator. Your account, locked down.',
    accent: '#10b981',
  },
  {
    Icon: Sparkles,
    title: '24h Sparks',
    body: 'Drop a moment. Disappears in a day.',
    accent: '#f43f5e',
  },
];

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 800),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[8vw] bg-transparent"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-6xl font-black font-display mb-3 leading-tight text-white text-center"
      >
        Built for the way <span className="text-gradient">you actually chat.</span>
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-xl text-white/60 mb-12 text-center"
      >
        Every feature, one tap away.
      </motion.p>

      <div className="grid grid-cols-3 gap-6 w-full max-w-[78vw] relative z-10">
        {FEATURES.map((f, i) => {
          const { Icon } = f;
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 40, scale: 0.92 }}
              animate={
                phase >= 2
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0, y: 40, scale: 0.92 }
              }
              transition={{
                delay: i * 0.08,
                type: 'spring',
                stiffness: 260,
                damping: 22,
              }}
              className="relative p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden"
            >
              <div
                className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-30"
                style={{ background: f.accent }}
              />
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 relative z-10"
                style={{ background: `${f.accent}25`, border: `1px solid ${f.accent}50` }}
              >
                <Icon className="w-6 h-6" style={{ color: f.accent }} />
              </div>
              <h3 className="text-2xl font-bold font-display text-white mb-2 relative z-10">
                {f.title}
              </h3>
              <p className="text-base text-white/65 leading-snug relative z-10">{f.body}</p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
