const fs = require('fs');
const path = require('path');

const avatars = [
  { file: 'student1.svg', bg1: '#4f46e5', bg2: '#06b6d4', text: 'AK', name: 'Aarav' },
  { file: 'student2.svg', bg1: '#ec4899', bg2: '#8b5cf6', text: 'DP', name: 'Diya' },
  { file: 'student3.svg', bg1: '#3b82f6', bg2: '#10b981', text: 'FM', name: 'Farhan' },
  { file: 'student4.svg', bg1: '#f59e0b', bg2: '#ef4444', text: 'KS', name: 'Kavya' },
  { file: 'student5.svg', bg1: '#14b8a6', bg2: '#6366f1', text: 'RN', name: 'Rohan' },
  { file: 'student6.svg', bg1: '#8b5cf6', bg2: '#ec4899', text: 'HE', name: 'Hannah' },
  { file: 'student7.svg', bg1: '#0284c7', bg2: '#22c55e', text: 'SM', name: 'Siddharth' }
];

const targetDir = path.join(__dirname, 'public', 'avatars');

avatars.forEach(a => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="grad-${a.text}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${a.bg1}"/>
      <stop offset="100%" stop-color="${a.bg2}"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.25"/>
    </filter>
  </defs>
  <circle cx="60" cy="60" r="58" fill="url(#grad-${a.text})"/>
  <!-- stylized silhouette/character badge -->
  <circle cx="60" cy="46" r="22" fill="#ffffff" fill-opacity="0.9" filter="url(#shadow)"/>
  <path d="M 28 98 C 30 76, 44 68, 60 68 C 76 68, 90 76, 92 98 Z" fill="#ffffff" fill-opacity="0.9"/>
  <circle cx="60" cy="46" r="18" fill="${a.bg1}"/>
  <text x="60" y="52" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="bold" font-size="14">${a.text}</text>
</svg>`;
  fs.writeFileSync(path.join(targetDir, a.file), svg);
});

// Logo SVG
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="50%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#logo-grad)"/>
  <!-- Graduation Cap & Portal Emblem -->
  <path d="M 32 16 L 52 26 L 32 36 L 12 26 Z" fill="#ffffff"/>
  <path d="M 20 31.5 L 20 44 C 20 48, 44 48, 44 44 L 44 31.5" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <path d="M 48 29 L 48 45" stroke="#fcd34d" stroke-width="3" stroke-linecap="round"/>
  <circle cx="48" cy="46" r="3" fill="#fcd34d"/>
</svg>`;
fs.writeFileSync(path.join(__dirname, 'public', 'logo.svg'), logoSvg);

console.log('Avatars and logo generated successfully!');
