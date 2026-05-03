import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';

export const SCENE_DURATIONS = {
  hook: 4500,
  chat: 6500,
  voice: 5500,
  reels: 5800,
  features: 7000,
  gamification: 6000,
  outro: 5000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: Scene1,
  chat: Scene2,
  voice: Scene3,
  reels: Scene6,
  features: Scene7,
  gamification: Scene4,
  outro: Scene5,
};

interface VideoTemplateProps {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
}

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: VideoTemplateProps = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="w-full h-screen overflow-hidden relative bg-[#09090b]">
      {/* Background layer */}
      <div className="absolute inset-0 z-0">
        <video
          src={`${import.meta.env.BASE_URL}videos/bg-particles.mp4`}
          className="w-full h-full object-cover opacity-40 mix-blend-screen"
          autoPlay
          muted
          loop
          playsInline
        />

        {/* Animated gradient overlays */}
        <motion.div
          className="absolute w-[80vw] h-[80vw] rounded-full blur-[100px] opacity-20 bg-[#ec4899] mix-blend-screen"
          animate={{
            x: ['-20vw', '20vw', '-20vw'],
            y: ['-20vh', '10vh', '-20vh'],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute w-[70vw] h-[70vw] rounded-full blur-[120px] opacity-20 bg-[#06b6d4] right-0 bottom-0 mix-blend-screen"
          animate={{
            x: ['10vw', '-30vw', '10vw'],
            y: ['10vh', '-20vh', '10vh'],
            scale: [1.2, 1, 1.2],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
