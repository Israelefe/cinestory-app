import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

const footerLinks = {
  Product: [
    { label: 'AI Director', href: '/#ai-director' },
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'Themes', href: '/#themes' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'Create a story', to: '/create' }
  ],
  'Built for': [
    { label: 'Portrait photographers', href: '/#themes' },
    { label: 'Wedding studios', href: '/#themes' },
    { label: 'Birthday shoots', href: '/#themes' },
    { label: 'Media companies', href: '/#how-it-works' }
  ],
  Experience: [
    { label: 'Client premiere', href: '/#how-it-works' },
    { label: 'Photo gallery', href: '/#how-it-works' },
    { label: 'Veylo Voice', href: '/#how-it-works' },
    { label: 'WhatsApp sharing', href: '/#how-it-works' }
  ]
};

export default function Footer() {
  return (
    <footer className='border-t border-white/10 bg-[#070708] px-5 pb-8 pt-20 text-white sm:px-8 lg:pt-28'>
      <div className='mx-auto max-w-7xl'>
        <div className='grid gap-16 border-b border-white/10 pb-16 lg:grid-cols-[1.2fr_1fr]'>
          <div className='max-w-xl'>
            <Link to='/' className='flex w-fit items-center gap-3'>
              <img src='/veylo/veylo-mark.svg' alt='' className='h-12 w-12 rounded-2xl' />
              <span className='font-display text-3xl font-extrabold tracking-[-.04em]'>Veylo</span>
            </Link>
            <p className='mt-7 font-display text-4xl font-extrabold leading-[1.02] tracking-[-.04em] sm:text-5xl'>The photographs are ready.<br /><span className='text-[#ff7b69]'>Make the reveal matter.</span></p>
            <p className='mt-6 max-w-md text-sm leading-6 text-zinc-500'>Photo-first delivery for photographers and media studios. Built in Nigeria for beautiful client experiences everywhere.</p>
            <Link to='/create' className='group mt-8 inline-flex items-center gap-3 text-sm font-extrabold text-white'>
              Premiere your next shoot
              <span className='grid h-9 w-9 place-items-center rounded-full bg-[#ff5a47] transition-transform group-hover:translate-x-1'><ArrowUpRight size={15} /></span>
            </Link>
          </div>

          <div className='grid grid-cols-2 gap-10 sm:grid-cols-3'>
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <p className='text-[10px] font-black uppercase tracking-[.2em] text-zinc-600'>{title}</p>
                <div className='mt-5 space-y-3.5'>
                  {links.map((link) => link.to ? (
                    <Link key={link.label} to={link.to} className='block text-sm font-medium text-zinc-400 transition hover:text-white'>{link.label}</Link>
                  ) : (
                    <a key={link.label} href={link.href} className='block text-sm font-medium text-zinc-400 transition hover:text-white'>{link.label}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='flex flex-col gap-4 py-7 text-[10px] font-bold uppercase tracking-[.15em] text-zinc-600 sm:flex-row sm:items-center sm:justify-between'>
          <p>© {new Date().getFullYear()} Veylo. All rights reserved.</p>
          <div className='flex flex-wrap gap-5'>
            <span>Photo-only</span>
            <span>Mobile-first</span>
            <span>Don't just deliver photos. Premiere them.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
