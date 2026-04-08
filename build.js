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
fs.copyFileSync('popup.html', path.join('dist', 'popup.html'));

// Copy manifest — strip "key" field only for Chrome Web Store builds (CWS rejects it).
// Without the key, the extension ID changes and OAuth redirect URLs break.
// Usage: STRIP_KEY=1 node build.js   (for CWS upload only)
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (process.env.STRIP_KEY) {
  delete manifest.key;
}
fs.writeFileSync(path.join('dist', 'manifest.json'), JSON.stringify(manifest, null, 2));

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
