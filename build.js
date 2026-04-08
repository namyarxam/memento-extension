const esbuild = require('esbuild');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const define = {
  'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL),
  'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY),
};

esbuild.buildSync({
  entryPoints: ['src/background.js', 'src/content.js', 'src/popup.js'],
  bundle: false,
  outdir: 'dist',
  define,
  platform: 'browser',
});

// Copy static files to dist
['manifest.json', 'popup.html'].forEach(f =>
  fs.copyFileSync(f, path.join('dist', f))
);

// Copy icons
const iconsDir = 'icons';
if (fs.existsSync(iconsDir)) {
  fs.mkdirSync('dist/icons', { recursive: true });
  fs.readdirSync(iconsDir).forEach(f =>
    fs.copyFileSync(path.join(iconsDir, f), path.join('dist/icons', f))
  );
} else {
  // Icons are in root, not in icons/ subfolder
  const iconFiles = fs.readdirSync('.').filter(f => f.startsWith('icon-') && f.endsWith('.png'));
  iconFiles.forEach(f => fs.copyFileSync(f, path.join('dist', f)));
}
