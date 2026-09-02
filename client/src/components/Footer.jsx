import React from 'react';
import { Sparkles, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className='border-t border-white/10 bg-black/40 py-12 px-6 text-center text-xs text-gray-500 space-y-3'>
      <div className='flex items-center justify-center gap-2 text-white font-bold'>
        <Sparkles size={16} className='text-purple-400' />
        <span>CineStory AI</span>
      </div>
      <p>Transforming Photoshoots into Spotify-Style Cinematic Premieres.</p>
      <p className='text-gray-600'>&copy; {new Date().getFullYear()} CineStory AI. All rights reserved.</p>
    </footer>
  );
}
