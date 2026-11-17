import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

// Build-time only. Committed output needs no Node or network at runtime.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = resolve(process.argv[2] || join(root, 'tools/ascii-upstream'));
const source = join(upstream, 'src');
const output = join(root, 'web/vendor/ascii');
const archive = join(root, 'vendor/ascii-source');
mkdirSync(join(output, 'pieces'), { recursive: true });
mkdirSync(join(archive, 'pieces'), { recursive: true });
const notice = '// From ascii.rest by bas3line, MIT licensed. See vendor/ascii-source/LICENSE.\n';
function copyModule(name, subdir = '') {
  const input = join(source, subdir, name + '.ts');
  const ts = readFileSync(input, 'utf8');
  const js = stripTypeScriptTypes(ts, { mode: 'transform' }).replaceAll('.ts"', '.js"');
  writeFileSync(join(output, subdir, name + '.js'), notice + js);
  copyFileSync(input, join(archive, subdir, name + '.ts'));
}
copyModule('mount');
copyModule('width');
copyFileSync(join(source, 'types.ts'), join(archive, 'types.ts'));
copyFileSync(join(upstream, 'LICENSE'), join(archive, 'LICENSE'));
const scenes = readdirSync(join(source, 'pieces'))
  .filter(file => file.endsWith('.ts') && /category:\s*["']scenes["']/.test(readFileSync(join(source, 'pieces', file), 'utf8')))
  .map(file => basename(file, '.ts')).sort();
if (scenes.length !== 34) throw new Error('Expected 34 scenes; found ' + scenes.length);
for (const name of scenes) copyModule(name, 'pieces');
writeFileSync(join(output, 'manifest.js'), notice + 'export const scenes = ' + JSON.stringify(scenes, null, 2) + ';\n');
console.log('Vendored ' + scenes.length + ' scenes and renderer from ' + upstream);
